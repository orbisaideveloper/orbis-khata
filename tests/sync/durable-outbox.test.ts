import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { queueNew } from '../../src/sync/outbox-state'
import { createDurableEncryptedOutbox, type SealedQueuePort, type StoredQueueRow } from '../../src/sync/durable-outbox'
const provider = webcrypto as unknown as Crypto
const makeKey = () => webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
const base = {
  protocolVersion: 1,
  operationId: '11111111-1111-4111-8111-111111111111',
  actorId: 'user_1', companyId: 'company_1', commandType: 'voucher-post',
  baseVersion: null, createdAt: '2026-11-10T09:15:00.000Z',
  payload: { amountMinor: '100', privateReference: 'sensitive accounting text' },
} as const
function fakePort() {
  const rows = new Map<string, StoredQueueRow>()
  const port: SealedQueuePort = {
    async add(row) { if (rows.has(row.id)) return false; rows.set(row.id, row); return true },
    async get(id) { return rows.get(id) ?? null },
    async list(scope) { return [...rows.values()].filter(row => row.scope === scope) },
  }
  return { rows, port }
}
describe('future encrypted persistent queue contract (isolated port)', () => {
  it('never writes plaintext financial payload to the storage port', async () => {
    const { rows, port } = fakePort()
    const store = createDurableEncryptedOutbox(port, await makeKey() as CryptoKey, provider)
    const item = queueNew(base)
    expect(await store.append(item)).toBe('created')
    expect(JSON.stringify([...rows.values()])).not.toContain('sensitive accounting text')
    expect(await store.load('user_1', 'company_1', base.operationId)).toEqual(item)
  })
  it('preserves same-ID retry and rejects conflicting payloads without overwrite', async () => {
    const { rows, port } = fakePort()
    const store = createDurableEncryptedOutbox(port, await makeKey() as CryptoKey, provider)
    expect(await store.append(queueNew(base))).toBe('created')
    const first = JSON.stringify([...rows.values()])
    expect(await store.append(queueNew(base))).toBe('already-present')
    expect(JSON.stringify([...rows.values()])).toBe(first)
    await expect(store.append(queueNew({ ...base, payload: { amountMinor: '200' } }))).rejects.toThrow('IDEMPOTENCY_CONFLICT')
    expect(JSON.stringify([...rows.values()])).toBe(first)
  })
  it('enforces exact actor/company isolation', async () => {
    const { port } = fakePort()
    const store = createDurableEncryptedOutbox(port, await makeKey() as CryptoKey, provider)
    await store.append(queueNew(base))
    expect(await store.load('user_2', 'company_1', base.operationId)).toBeNull()
    expect(await store.load('user_1', 'company_2', base.operationId)).toBeNull()
    expect(await store.list('user_2', 'company_1')).toEqual([])
  })
  it('rejects corrupted stored scope and ciphertext', async () => {
    const { rows, port } = fakePort()
    const store = createDurableEncryptedOutbox(port, await makeKey() as CryptoKey, provider)
    await store.append(queueNew(base))
    const [id, row] = [...rows.entries()][0]
    rows.set(id, { ...row, scope: 'wrong' })
    await expect(store.load('user_1', 'company_1', base.operationId)).rejects.toThrow('OUTBOX_ROW_SCOPE_MISMATCH')
    rows.set(id, { ...row, sealed: { ...row.sealed, ciphertext: 'AAAA' } })
    await expect(store.load('user_1', 'company_1', base.operationId)).rejects.toThrow()
  })
  it('lists only the requested company with deterministic timestamps', async () => {
    const { port } = fakePort()
    const store = createDurableEncryptedOutbox(port, await makeKey() as CryptoKey, provider)
    await store.append(queueNew({ ...base, operationId: '22222222-2222-4222-8222-222222222222', createdAt: '2026-11-10T10:15:00.000Z' }))
    await store.append(queueNew(base))
    await store.append(queueNew({ ...base, companyId: 'company_2', operationId: '33333333-3333-4333-8333-333333333333' }))
    const list = await store.list('user_1', 'company_1')
    expect(list.map(item => item.envelope.operationId)).toEqual([base.operationId, '22222222-2222-4222-8222-222222222222'])
    expect(await store.list('user_1', 'company_2')).toHaveLength(1)
  })
})
