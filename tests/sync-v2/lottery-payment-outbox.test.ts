import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { fixtureFeedCodec } from '../../scripts/sync-v2-local-storage-fixture.mjs'
import { commandDigest } from '../../src/sync-v2/command'
import { openIndexedDbLocalFeedStorage } from '../../src/sync-v2/local-feed-storage'
import type { PaymentCommand } from '../../src/sync-v2/lottery-payment-command'
import { createLotteryPaymentOutbox } from '../../src/sync-v2/lottery-payment-outbox'

const actor = 'actor-a'
const registration = 'registration-a'
const scope = { kind: 'lottery-organization', id: 'org-a', epoch: 'v1' } as const
function payment(): PaymentCommand {
  return {
    protocolVersion: 2, schemaVersion: 1, commandType: 'lottery-payment', actorId: actor,
    deviceRegistrationId: registration, scope, baseRevision: null, children: {}, dependsOn: [],
    createdAt: '2026-11-24T00:00:00Z', clientSequence: '1', operationId: crypto.randomUUID(), entityId: crypto.randomUUID(),
    payload: { organizationId: scope.id, partyId: 'party-a', occurredAt: '2026-11-24',
      direction: 'RECEIPT', totalAmountPaise: '100', methodSplit: { cashPaise: '100' } },
  }
}
const projection = {
  cursor: async () => ({ epoch: scope.epoch, sequence: '99' }),
  apply: vi.fn(),
  appliedOperation: async () => null,
}

describe('Lottery payment outbox', () => {
  it('keeps both concurrent inserts and refuses a different organization or registration', async () => {
    const factory = new IDBFactory()
    const [left, right, codec] = await Promise.all([
      openIndexedDbLocalFeedStorage(factory, 'pending'), openIndexedDbLocalFeedStorage(factory, 'pending'), fixtureFeedCodec(),
    ])
    try {
      const a = createLotteryPaymentOutbox(actor, scope, registration, left, codec, projection)
      const b = createLotteryPaymentOutbox(actor, scope, registration, right, codec, projection)
      const first = payment()
      const second = payment()
      await Promise.all([a.enqueue(first), b.enqueue(second)])
      expect(new Set(await a.pending())).toEqual(new Set([first.operationId, second.operationId]))
      const invalid = { ...payment(), deviceRegistrationId: 'other-device' }
      await expect(a.enqueue(invalid)).rejects.toThrow('SYNC_OUTBOX_SCOPE_INVALID')
      const otherScope = { ...scope, id: 'other-org' }
      const wrong = { ...payment(), scope: otherScope, payload: { ...first.payload as object, organizationId: otherScope.id } }
      await expect(b.enqueue(wrong)).rejects.toThrow('SYNC_OUTBOX_SCOPE_INVALID')
      const other = createLotteryPaymentOutbox(actor, otherScope, registration, right, codec, projection)
      expect(await other.pending()).toEqual([])
    } finally { left.close(); right.close() }
  })

  it('rejects a mismatched receipt and cannot infer reconciliation from a newer snapshot cursor', async () => {
    const store = await openIndexedDbLocalFeedStorage(new IDBFactory(), 'receipt')
    try {
      const outbox = createLotteryPaymentOutbox(actor, scope, registration, store, await fixtureFeedCodec(), projection)
      const command = payment()
      await outbox.enqueue(command)
      const receipt = { digest: await commandDigest(command), sequence: '17', result: { payment: { id: command.entityId } } }
      const feed = vi.fn()
      await expect(outbox.resume(command.operationId, { feed,
        submit: async () => ({ ...receipt, result: { payment: { id: 'other' } } }),
      })).rejects.toThrow('SYNC_OUTBOX_RECEIPT_INVALID')
      expect(await outbox.status(command.operationId)).toBe('pending')
      const posted = await outbox.resume(command.operationId, { feed, submit: async () => receipt })
      expect(posted.state).toBe('posted-awaiting-ledger')
      expect(await outbox.pending()).toEqual([command.operationId])
      expect(feed).not.toHaveBeenCalled()
    } finally { store.close() }
  })
  it('recovers a wide committed group without resending the payment', async () => {
    const store = await openIndexedDbLocalFeedStorage(new IDBFactory(), 'wide-group')
    try {
      const command = payment()
      let cursor = '3'
      const recover = vi.fn(async () => { cursor = '10' })
      const outbox = createLotteryPaymentOutbox(actor, scope, registration, store, await fixtureFeedCodec(), {
        cursor: async () => ({ epoch: scope.epoch, sequence: cursor }),
        apply: vi.fn(),
        appliedOperation: async seq => seq === cursor && cursor === '10' ? command.operationId : null,
        recoverGroup: recover,
      })
      await outbox.enqueue(command)
      const submit = vi.fn(async () => ({
        digest: await commandDigest(command), sequence: '10', result: { payment: { id: command.entityId } },
      }))
      const manifest = { version: 1, purpose: 'group' as const, scopeKind: scope.kind, scopeId: scope.id,
        epoch: scope.epoch, from: '3', next: '10', items: 7, bytes: 2_000_000, transfer: '3:10' }
      const read = vi.fn()
      const recoverGroup = vi.fn(async () => ({ manifest, read }))
      const completed = await outbox.resume(command.operationId, {
        submit,
        feed: async () => { throw Object.assign(new Error('page too large'), { code: 'SYNC_FEED_PAGE_TOO_LARGE' }) },
        recoverGroup,
      })
      expect(completed.state).toBe('reconciled')
      expect(recoverGroup).toHaveBeenCalledExactlyOnceWith('3')
      expect(recover).toHaveBeenCalledExactlyOnceWith(manifest, read)
      expect(submit).toHaveBeenCalledTimes(1)
    } finally { store.close() }
  })

})
