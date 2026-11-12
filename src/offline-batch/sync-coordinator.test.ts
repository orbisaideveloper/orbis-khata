import { describe, expect, it } from 'vitest'
import { queueNew, type QueueItem } from '../sync/outbox-state'
import { SYNC_PROTOCOL_VERSION, type SyncEnvelope } from '../sync/protocol'
import { parseContiguousFeed, syncCompanyOnce, type FeedPage, type SyncNetwork, type SyncStore } from './sync-coordinator'
import type { VerifiedOfflineGrant } from './offline-authority'
const now = 1_700_000_000_000
const grant: VerifiedOfflineGrant = {
  actorId: 'actor-1', allowedCompanyIds: ['company-a'], verifiedOnline: true,
  localUnlockVerified: true, revoked: false, validFromMs: now - 100,
  validUntilMs: now + 100000,
}
const op: SyncEnvelope = {
  protocolVersion: SYNC_PROTOCOL_VERSION,
  actorId: 'actor-1', companyId: 'company-a', operationId: 'f0a3b093-cad1-480a-8b2a-48a0c7490984',
  commandType: 'create-sale', baseVersion: null, createdAt: '2026-11-12T00:00:00Z', payload: { amount: 1000 },
}
const event = (n: number, companyId = 'company-a') => ({
  eventId: 'evt-' + n, companyId, serverSeq: n, entityType: 'voucher', entityId: 'v-' + n,
  tombstone: false, change: { state: 'synthetic' },
})
const page = (fromCursor: number, events = [event(fromCursor + 1)]): FeedPage => ({
  companyId: 'company-a', fromCursor, nextCursor: fromCursor + events.length, events,
})
const receipt = (over: Record<string, unknown> = {}) => ({
  protocolVersion: SYNC_PROTOCOL_VERSION, operationId: op.operationId,
  companyId: op.companyId, disposition: 'accepted', serverCursor: 'cursor-1', reason: null, ...over,
})
function env(init: { pending?: readonly QueueItem[]; response?: unknown; throws?: boolean; commitFail?: boolean; persistFail?: boolean } = {}) {
  const calls = { writes: [] as QueueItem[], pages: [] as FeedPage[], sendIds: [] as string[], pulls: 0 }
  const store: SyncStore = {
    async pending() { return init.pending ?? [queueNew(op)] },
    async persistAttempt(_actor, _company, item) { if (init.persistFail) throw Error('DISK_WRITE_FAIL'); calls.writes.push(item) },
    async cursor() { return 3 },
    async commitFeedPage(_actor, _company, value) { if (init.commitFail) throw Error('TRANSACTION_ABORT'); calls.pages.push(value) },
  }
  const network: SyncNetwork = {
    async send(item) { calls.sendIds.push(item.operationId); if (init.throws) throw Error('timeout'); return init.response ?? receipt() },
    async pull() { calls.pulls++; return page(3) },
  }
  const run = () => syncCompanyOnce({ grant, actorId: op.actorId, companyId: op.companyId,
    nowMs: now, onlineSessionVerified: true, store, network })
  return { calls, store, network, run }
}
describe('Step04 safe sync contracts and retries (synthetic, no live network)', () => {
  it('accepts matching receipt and commits contiguous page', async () => {
    const { run, calls } = env()
    expect(await run()).toEqual({ processed: 1, accepted: 1, conflict: 0, rejected: 0, uncertain: 0, imported: 1, nextCursor: 4 })
    expect(calls.writes[0].state).toBe('synced'); expect(calls.pages[0].events[0].serverSeq).toBe(4)
  })
  it('timeout retains same operation id queued', async () => {
    const { run, calls } = env({ throws: true }); expect((await run()).uncertain).toBe(1)
    expect(calls.sendIds).toEqual([op.operationId]); expect(calls.writes[0].state).toBe('queued'); expect(calls.pulls).toBe(0)
  })
  it('foreign receipt is never acknowledged', async () => {
    const { run, calls } = env({ response: receipt({ companyId: 'company-b' }) }); expect((await run()).uncertain).toBe(1)
    expect(calls.writes[0].state).toBe('queued')
  })
  it('operation-id mismatch remains queued', async () => {
    const { run } = env({ response: receipt({ operationId: '7c71fe35-8680-4f75-8a36-1753f09ef0ab' }) }); expect((await run()).uncertain).toBe(1)
  })
  it('conflict is never silently marked synced', async () => {
    const { run, calls } = env({ response: receipt({ disposition: 'conflict', reason: 'STALE_BASE', serverCursor: null }) })
    expect((await run()).conflict).toBe(1); expect(calls.writes[0].state).toBe('conflict')
  })
  it('explicit rejected stays rejected', async () => {
    const { run, calls } = env({ response: receipt({ disposition: 'rejected', reason: 'FORBIDDEN', serverCursor: null }) })
    expect((await run()).rejected).toBe(1); expect(calls.writes[0].state).toBe('rejected')
  })
  it('persist failure aborts before feed progression', async () => {
    const { run, calls } = env({ persistFail: true }); await expect(run()).rejects.toThrow('DISK_WRITE_FAIL'); expect(calls.pulls).toBe(0)
  })
  it('feed transaction error is never success', async () => {
    const { run } = env({ commitFail: true }); await expect(run()).rejects.toThrow('TRANSACTION_ABORT')
  })
  it('wrong actor entry never sent', async () => {
    const { run, calls } = env({ pending: [queueNew({ ...op, actorId: 'actor-2' })] })
    await expect(run()).rejects.toThrow('SYNC_STORE_SCOPE_OR_DUPLICATE'); expect(calls.sendIds).toEqual([])
  })
  it('duplicate operation entries never sent', async () => {
    const row = queueNew(op); const { run, calls } = env({ pending: [row, row] })
    await expect(run()).rejects.toThrow('SYNC_STORE_SCOPE_OR_DUPLICATE'); expect(calls.sendIds).toHaveLength(0)
  })
  it('requires real online authentication before networking', async () => {
    const { store, network } = env(); await expect(syncCompanyOnce({ grant, actorId: op.actorId,
      companyId: op.companyId, nowMs: now, onlineSessionVerified: false, store, network })).rejects.toThrow('SYNC_ONLINE_AUTH_REQUIRED')
  })
  it('does not allow another company grant to send', async () => {
    const { store, network } = env(); await expect(syncCompanyOnce({ grant, actorId: op.actorId,
      companyId: 'company-b', nowMs: now, onlineSessionVerified: true, store, network })).rejects.toThrow('OFFLINE_ACCESS_DENIED')
  })
  it('no queued commands still imports feed', async () => {
    const { run } = env({ pending: [] }); expect((await run()).imported).toBe(1)
  })
  it('accepts strictly contiguous page', () => expect(parseContiguousFeed(page(3, [event(4),event(5)]), 'company-a', 3).nextCursor).toBe(5))
  it('rejects gap', () => expect(() => parseContiguousFeed(page(3, [event(5)]), 'company-a', 3)).toThrow())
  it('rejects stale page fromCursor', () => expect(() => parseContiguousFeed(page(2), 'company-a', 3)).toThrow())
  it('rejects cross-company feed event', () => expect(() => parseContiguousFeed(page(3, [event(4, 'company-b')]), 'company-a', 3)).toThrow())
  it('rejects duplicate event IDs', () => expect(() => parseContiguousFeed(page(3,[event(4),{...event(5),eventId:'evt-4'}]),'company-a',3)).toThrow())
  it('rejects cursor mismatch', () => expect(() => parseContiguousFeed({...page(3),nextCursor:99},'company-a',3)).toThrow())
  it('accepts no change feed with identical cursor', () => expect(parseContiguousFeed(page(3,[]),'company-a',3).nextCursor).toBe(3))
})
