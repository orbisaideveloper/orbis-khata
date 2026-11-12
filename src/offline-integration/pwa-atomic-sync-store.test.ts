// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createPwaCryptoVault } from '../local-db/pwa-crypto-vault'
import { createSimulatedKhataServer } from '../offline-batch/b-simulated-server'
import { syncCompanyOnce } from '../offline-batch/sync-coordinator'
import { createIndexedDbQueuePort } from '../sync/indexeddb-port'
import { queueNew } from '../sync/outbox-state'
import { createPwaAtomicSyncStore } from './pwa-atomic-sync-store'

const vaultName = 'atomic-fixture-vault'
const actorId = 'actor-a'
const companyId = 'company-a'
const id = '90fd78c8-9696-4f41-b327-83990f08fc01'
const item = queueNew({
  protocolVersion: 1, actorId, companyId, operationId: id, commandType: 'fixture-voucher',
  baseVersion: null, createdAt: '2026-11-12T00:00:00Z',
  payload: { entityId: 'demo-voucher', action: 'put', amountPaise: 5000 },
})

async function setup() {
  const factory = new IDBFactory()
  const vault = createPwaCryptoVault(factory, crypto, vaultName)
  const key = await vault.keyForAccount(actorId)
  const args = { factory, provider: crypto, key, databaseName: 'atomic-fixture' }
  return { args, factory, vault, store: createPwaAtomicSyncStore(args) }
}

describe('encrypted PWA queue and feed', () => {
  it('preserves receipts and feed across reopen, and rejects a duplicate feed without moving the cursor', async () => {
    const { args, store } = await setup()
    await expect(store.append(item)).resolves.toBe('created')
    await expect(store.append(item)).resolves.toBe('already-present')
    const changed = queueNew({ ...item.envelope, payload: { ...item.envelope.payload, amountPaise: 9000 } })
    await expect(store.append(changed)).rejects.toThrow('IDEMPOTENCY_CONFLICT')
    await expect(store.pending(actorId, 'company-b')).resolves.toEqual([])
    await expect(store.cursor(actorId, companyId)).resolves.toBe(0)

    const server = createSimulatedKhataServer()
    await expect(syncCompanyOnce({
      grant: { actorId, allowedCompanyIds: [companyId], verifiedOnline: true, localUnlockVerified: true,
        revoked: false, validFromMs: 1000, validUntilMs: 9000 },
      actorId, companyId, nowMs: 2000, store, network: server.forIdentity(actorId, [companyId]),
      onlineSessionVerified: true,
    })).resolves.toMatchObject({ accepted: 1, imported: 1, nextCursor: 1 })

    const reopened = createPwaAtomicSyncStore(args)
    const feed = await reopened.readFeed(actorId, companyId)
    expect(feed).toHaveLength(1)
    expect(feed[0].change.amountPaise).toBe(5000)
    await expect(reopened.pending(actorId, companyId)).resolves.toEqual([])
    await expect(reopened.commitFeedPage(actorId, companyId, {
      companyId, fromCursor: 1, nextCursor: 2, events: [{ ...feed[0], serverSeq: 2 }],
    })).rejects.toThrow()
    await expect(reopened.cursor(actorId, companyId)).resolves.toBe(1)
    await expect(reopened.readFeed(actorId, companyId)).resolves.toEqual(feed)
  })

  it('rejects invalid queue transitions without changing the pending item', async () => {
    const { store } = await setup()
    await expect(store.append({ ...item, attempts: 1 })).rejects.toThrow('ATOMIC_SYNC_APPEND_INVALID')
    await expect(store.persistAttempt(actorId, companyId, item)).rejects.toThrow('ATOMIC_SYNC_RECEIPT_ROW_MISSING')
    await store.append(item)
    await expect(store.persistAttempt(actorId, 'company-b', item)).rejects.toThrow('ATOMIC_SYNC_RECEIPT_SCOPE')
    await expect(store.persistAttempt(actorId, companyId, item)).rejects.toThrow('ATOMIC_SYNC_RECEIPT_TRANSITION_INVALID')
    await expect(store.pending(actorId, companyId)).resolves.toEqual([item])
  })

  it('reloads an account key, isolates another account, and preserves encrypted queue bytes', async () => {
    const { args, factory, vault } = await setup()
    const sameKey = await createPwaCryptoVault(factory, crypto, vaultName).keyForAccount(actorId)
    const otherKey = await vault.keyForAccount('actor-b')
    expect(sameKey.extractable).toBe(false)
    const bytes = new TextEncoder().encode('synthetic memo')
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, args.key, bytes)
    await expect(crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sameKey, cipher)).resolves.toEqual(bytes.buffer)
    await expect(crypto.subtle.decrypt({ name: 'AES-GCM', iv }, otherKey, cipher)).rejects.toThrow()
    const { createBrowserPwaOfflineOutbox } = await import('../local-db/offline-backend')
    const options = { platform: 'web', factory, cryptoProvider: crypto, vaultName, queueName: 'queue-fixture' }
    const outbox = await createBrowserPwaOfflineOutbox(actorId, options)
    await expect(outbox.append(item)).resolves.toBe('created')
    const raw = await createIndexedDbQueuePort(factory, options.queueName).get(JSON.stringify([actorId, companyId, id]))
    expect(raw).toBeDefined()
    expect(JSON.stringify(raw)).not.toContain('demo-voucher')
    const reopened = await createBrowserPwaOfflineOutbox(actorId, options)
    await expect(reopened.list(actorId, companyId)).resolves.toEqual([item])
    await expect(reopened.list(actorId, 'company-b')).resolves.toEqual([])
  })
})
