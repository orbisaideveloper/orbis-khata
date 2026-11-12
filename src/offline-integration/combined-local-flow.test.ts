import { describe, expect, it } from 'vitest'
import { createCombinedLocalFlow, type CombinedStore } from './combined-local-flow'
import { type QueueItem } from '../sync/outbox-state'
import { type SyncNetwork } from '../offline-batch/sync-coordinator'
const NOW = 1_780_000_000_000
const UUID = '90fd78c8-9696-4f41-b327-83990f08fc01'
const raw = { id:'voucher-1', company:'company-a', party:'party-a', kind:'sale', date:'2026-11-12',
  amount:'50000', method:'cash', reference:'test-only', note:'synthetic', reverses:null }
const make = (opts: { unlock?: boolean; network?: boolean; expiry?: number } = {}) => {
  const rows: QueueItem[] = []
  const store: CombinedStore = {
    async append(item) {
      const previous = rows.find(r => r.envelope.operationId === item.envelope.operationId)
      if (previous) {
        if (JSON.stringify(previous.envelope) !== JSON.stringify(item.envelope)) throw Error('IDEMPOTENCY_CONFLICT')
        return 'already-present'
      }
      rows.push(item); return 'created'
    },
    async pending(actor,company) { return rows.filter(r => r.state === 'queued' && r.envelope.actorId === actor && r.envelope.companyId === company) },
    async persistAttempt(_actor,_company,next) { const index = rows.findIndex(r => r.envelope.operationId === next.envelope.operationId); rows[index] = next },
    async cursor() { return 0 },
    async commitFeedPage() { /* fixture has no accepted event */ },
  }
  const network: SyncNetwork = { async send(e) { return {protocolVersion:1,operationId:e.operationId,companyId:e.companyId,
    disposition:'accepted',serverCursor:'1',reason:null} }, async pull(company,fromCursor) {
      return {companyId:company,fromCursor,nextCursor:fromCursor,events:[]}
    } }
  const flow = createCombinedLocalFlow({ store, network,
    verifyOnlineGrant: async () => ({actorId:'actor-a',companyIds:['company-a'],verifiedAtMs:NOW-1000,
      expiresAtMs:opts.expiry ?? NOW+10_000,revoked:false}),
    verifyOnlineSession: async () => opts.network !== false,
    verifyDeviceCredential: async () => opts.unlock !== false,
    nowMs: () => NOW })
  const args = { actorId:'actor-a',companyId:'company-a',rawCommand:raw,operationId:UUID,baseVersion:null,
    createdAt:'2026-11-12T00:00:00Z' }
  return {flow,rows,args}
}
describe('Step 4–6 complete local integration boundary', () => {
  it('requires verified central grant and OS credential before saving', async () => {
    const {flow,args,rows}=make()
    await expect(flow.queueAccounting(args)).rejects.toThrow()
    await flow.activate()
    await expect(flow.queueAccounting(args)).rejects.toThrow('OFFLINE_UNLOCK_REQUIRED')
    await flow.unlock()
    expect((await flow.queueAccounting(args)).status).toBe('created')
    expect(rows).toHaveLength(1)
    expect((await flow.queueAccounting(args)).status).toBe('already-present')
    expect(rows).toHaveLength(1)
    flow.lock()
    await expect(flow.queueAccounting(args)).rejects.toThrow('OFFLINE_UNLOCK_REQUIRED')
  })
  it('logout/revocation of local grant denies the old company', async () => {
    const {flow,args}=make()
    await flow.activate(); await flow.unlock(); flow.logout()
    await expect(flow.queueAccounting(args)).rejects.toThrow()
  })
  it('refuses cross-company posting before touching the durable outbox', async () => {
    const {flow,args,rows}=make()
    await flow.activate();await flow.unlock()
    await expect(flow.queueAccounting({...args,companyId:'company-b'})).rejects.toThrow()
    await expect(flow.queueAccounting({...args,rawCommand:{...raw,company:'company-b'}})).rejects.toThrow()
    expect(rows).toHaveLength(0)
  })
  it('does not sync without a reverified online session', async () => {
    const {flow,args,rows}=make({network:false})
    await flow.activate();await flow.unlock();await flow.queueAccounting(args)
    await expect(flow.sync('actor-a','company-a')).rejects.toThrow('SYNC_ONLINE_AUTH_REQUIRED')
    expect(rows[0].state).toBe('queued')
  })
  it('keeps numeric money in paise and rejects malformed reversal', async () => {
    const {flow,args,rows}=make()
    await flow.activate(); await flow.unlock()
    await expect(flow.queueAccounting({...args,rawCommand:{...raw,kind:'reversal'}})).rejects.toThrow('ACCOUNTING_REVERSAL_TARGET_REQUIRED')
    await flow.queueAccounting(args)
    expect(rows[0].envelope.payload).toMatchObject({amount:'50000',kind:'sale',company:'company-a'})
  })
  it('honors expiry without granting a recurring 15-day bypass', async () => {
    const {flow,args}=make({expiry:NOW-1})
    await expect(flow.activate()).rejects.toThrow('LOCAL_FLOW_GRANT_INVALID')
    await expect(flow.queueAccounting(args)).rejects.toThrow()
  })
  it('records server receipt only after a trusted online session check', async () => {
    const {flow,args,rows}=make()
    await flow.activate();await flow.unlock();await flow.queueAccounting(args)
    const result=await flow.sync('actor-a','company-a')
    expect(result).toMatchObject({accepted:1,processed:1,imported:0})
    expect(rows[0].state).toBe('synced')
  })
  it('a failed OS credential never unlocks the grant', async () => {
    const {flow,args}=make({unlock:false});await flow.activate()
    await expect(flow.unlock()).rejects.toThrow('LOCAL_FLOW_UNLOCK_FAILED')
    await expect(flow.queueAccounting(args)).rejects.toThrow('OFFLINE_UNLOCK_REQUIRED')
  })
})
