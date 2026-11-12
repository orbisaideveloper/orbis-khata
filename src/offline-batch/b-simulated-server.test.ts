import { describe, expect, it } from 'vitest'
import { createSimulatedKhataServer } from './b-simulated-server'
import { syncCompanyOnce, type FeedPage, type SyncStore } from './sync-coordinator'
import { queueNew, type QueueItem } from '../sync/outbox-state'
import { SYNC_PROTOCOL_VERSION, type SyncEnvelope } from '../sync/protocol'
import type { VerifiedOfflineGrant } from './offline-authority'
const now = 1_730_000_000_000
const UUID = ['90fd78c8-9696-4f41-b327-83990f08fc01','90fd78c8-9696-4f41-b327-83990f08fc02',
  '90fd78c8-9696-4f41-b327-83990f08fc03','90fd78c8-9696-4f41-b327-83990f08fc04']
const grant = (actor: string, company = 'company-a'): VerifiedOfflineGrant => ({ actorId: actor,
  allowedCompanyIds: [company], verifiedOnline: true, localUnlockVerified: true, revoked: false,
  validFromMs: now - 100, validUntilMs: now + 10_000 })
const cmd = (id: string, actor: string, company: string, entityId: string,
  action: 'put' | 'delete' = 'put', baseVersion: string | null = null): SyncEnvelope => ({
  protocolVersion: SYNC_PROTOCOL_VERSION, operationId: id, actorId: actor,
  companyId: company, commandType: 'fixture-voucher', baseVersion,
  createdAt: '2026-11-12T00:00:00Z', payload: { entityId, action, ...(action === 'put' ? { amountPaise: 1250 } : {}) },
})
function device() {
  const disk = { rows: [] as QueueItem[], cursor: 0, events: [] as FeedPage['events'][number][] }
  const makePort = (): SyncStore => ({
    async pending(actorId, companyId) { return disk.rows.filter(x => x.state === 'queued' && x.envelope.actorId === actorId && x.envelope.companyId === companyId) },
    async persistAttempt(actorId, companyId, item) {
      const i = disk.rows.findIndex(x => x.envelope.actorId === actorId && x.envelope.companyId === companyId && x.envelope.operationId === item.envelope.operationId)
      if (i < 0) throw Error('TEST_DURABLE_ROW_MISSING')
      disk.rows[i] = structuredClone(item)
    },
    async cursor() { return disk.cursor },
    async commitFeedPage(_actorId, _companyId, page) {
      if (page.fromCursor !== disk.cursor) throw Error('TEST_CURSOR_CHANGED')
      // Models a single transaction boundary, not physical disk durability.
      const events = [...disk.events, ...structuredClone(page.events)]
      disk.events = events; disk.cursor = page.nextCursor
    },
  })
  return { disk, makePort, queue: (e: SyncEnvelope) => disk.rows.push(queueNew(e)) }
}
describe('Step 04 Batch B: simulated server + actual coordinator integration (NO LIVE SERVER)', () => {
  it('two authorized devices catch up with one ordered feed', async () => {
    const server = createSimulatedKhataServer(), a = device(), b = device()
    a.queue(cmd(UUID[0], 'actor-a', 'company-a', 'voucher-1'))
    const first = await syncCompanyOnce({ grant: grant('actor-a'), actorId: 'actor-a', companyId: 'company-a', nowMs: now,
      store: a.makePort(), network: server.forIdentity('actor-a', ['company-a']), onlineSessionVerified: true })
    expect(first).toMatchObject({ accepted: 1, imported: 1, nextCursor: 1 }); expect(a.disk.rows[0].state).toBe('synced')
    const follow = await syncCompanyOnce({ grant: grant('actor-b'), actorId: 'actor-b', companyId: 'company-a', nowMs: now,
      store: b.makePort(), network: server.forIdentity('actor-b', ['company-a']), onlineSessionVerified: true })
    expect(follow).toMatchObject({ processed: 0, imported: 1, nextCursor: 1 })
    expect(b.disk.events).toEqual(a.disk.events)
    expect(server.sequence('company-a')).toBe(1)
  })
  it('timeout after server acceptance retries same ID without duplicate event', async () => {
    const server = createSimulatedKhataServer(), d = device(); const e = cmd(UUID[0], 'actor-a', 'company-a', 'voucher-1')
    d.queue(e)
    const endpoint = server.forIdentity('actor-a', ['company-a'])
    let first = true
    const unreliable = { ...endpoint, send: async (x: SyncEnvelope) => {
      const outcome = await endpoint.send(x)
      if (first) { first = false; throw Error('SYNTHETIC_TIMEOUT_AFTER_COMMIT') }
      return outcome
    } }
    const args = { grant: grant('actor-a'), actorId: 'actor-a', companyId: 'company-a', nowMs: now,
      network: unreliable, onlineSessionVerified: true }
    expect((await syncCompanyOnce({ ...args, store: d.makePort() })).uncertain).toBe(1)
    expect(d.disk.rows[0].state).toBe('queued'); expect(server.sequence('company-a')).toBe(1)
    // Reconstruct store object: synthetic close/reopen. No real disk involved.
    expect((await syncCompanyOnce({ ...args, store: d.makePort() })).accepted).toBe(1)
    expect(d.disk.rows[0].envelope.operationId).toBe(UUID[0]); expect(d.disk.rows[0].attempts).toBe(2)
    expect(server.sequence('company-a')).toBe(1)
  })
  it('same operation ID with changed payload is rejected, preserving first event', async () => {
    const s = createSimulatedKhataServer(), api = s.forIdentity('actor-a',['company-a'])
    const original = cmd(UUID[0],'actor-a','company-a','voucher-1')
    expect((await api.send(original) as {disposition:string}).disposition).toBe('accepted')
    const modified = {...original, payload:{ entityId:'voucher-1', action:'put', amountPaise:9999 }}
    expect((await api.send(modified) as {disposition:string}).disposition).toBe('rejected')
    expect(s.sequence('company-a')).toBe(1)
  })
  it('optimistic revision conflict is not acknowledged as success', async () => {
    const s=createSimulatedKhataServer();const api=s.forIdentity('actor-a',['company-a'])
    await api.send(cmd(UUID[0],'actor-a','company-a','voucher-1'))
    const stale=await api.send(cmd(UUID[1],'actor-a','company-a','voucher-1')) as {disposition:string,reason:string}
    expect(stale.disposition).toBe('conflict'); expect(stale.reason).toBe('BASE_VERSION_MISMATCH')
    expect(s.sequence('company-a')).toBe(1)
    const updated=await api.send(cmd(UUID[2],'actor-a','company-a','voucher-1','put','v-1')) as {disposition:string}
    expect(updated.disposition).toBe('accepted');expect(s.sequence('company-a')).toBe(2)
  })
  it('tombstone makes a contiguous, company-scoped feed entry', async () => {
    const s=createSimulatedKhataServer();const api=s.forIdentity('actor-a',['company-a'])
    await api.send(cmd(UUID[0],'actor-a','company-a','voucher-1'))
    await api.send(cmd(UUID[1],'actor-a','company-a','voucher-1','delete','v-1'))
    const page=await api.pull('company-a',0) as FeedPage
    expect(page.events.map(x=>x.tombstone)).toEqual([false,true]); expect(page.nextCursor).toBe(2)
  })
  it('one company cannot read or write another company', async () => {
    const s=createSimulatedKhataServer();const api=s.forIdentity('actor-a',['company-a'])
    const r=await api.send(cmd(UUID[0],'actor-a','company-b','voucher-1')) as {disposition:string}
    expect(r.disposition).toBe('rejected'); expect(s.sequence('company-b')).toBe(0)
    await expect(api.pull('company-b',0)).rejects.toThrow('SIMULATED_FEED_SCOPE_DENIED')
  })
  it('one actor may not spoof another', async () => {
    const s=createSimulatedKhataServer(), api=s.forIdentity('actor-a',['company-a'])
    const r=await api.send(cmd(UUID[0],'actor-b','company-a','voucher-1')) as {disposition:string}
    expect(r.disposition).toBe('rejected'); expect(s.sequence('company-a')).toBe(0)
  })
  it('server refuses an impossible future cursor', async () => {
    const api=createSimulatedKhataServer().forIdentity('actor-a',['company-a'])
    await expect(api.pull('company-a',999)).rejects.toThrow('SIMULATED_CURSOR_AHEAD')
  })
})
