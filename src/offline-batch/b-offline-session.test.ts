import { describe, expect, it } from 'vitest'
import { createIsolatedOfflineSession } from './b-offline-session'
const now=1_730_000_000_000
const verified=()=>Promise.resolve({actorId:'actor-a',companyIds:['company-a'],verifiedAtMs:now-100,expiresAtMs:now+5000,revoked:false})
const start=async()=>{const s=createIsolatedOfflineSession();await s.activate(verified,now);return s}
describe('Step 05 Batch B: trusted grant lifecycle, no local credentials',()=>{
  it('online-verified grant requires device unlock before use',async()=>{
    const s=await start();expect(()=>s.authorize('actor-a','company-a',now,'read')).toThrow('OFFLINE_UNLOCK_REQUIRED')
    await s.localUnlock(async()=>true);expect(()=>s.authorize('actor-a','company-a',now,'queue')).not.toThrow()
  })
  it('wrong actor denied',async()=>{const s=await start();await s.localUnlock(async()=>true)
    expect(()=>s.authorize('actor-b','company-a',now,'read')).toThrow('OFFLINE_ACCESS_DENIED')})
  it('foreign company denied',async()=>{const s=await start();await s.localUnlock(async()=>true)
    expect(()=>s.authorize('actor-a','company-b',now,'read')).toThrow('OFFLINE_ACCESS_DENIED')})
  it('lock requires fresh device unlock',async()=>{const s=await start();await s.localUnlock(async()=>true);s.lock()
    expect(()=>s.authorize('actor-a','company-a',now,'read')).toThrow('OFFLINE_UNLOCK_REQUIRED')})
  it('logout removes all company access immediately',async()=>{const s=await start();await s.localUnlock(async()=>true);s.logout()
    expect(s.scopes()).toEqual([]);expect(()=>s.authorize('actor-a','company-a',now,'read')).toThrow()})
  it('expired scope is not allowed even after unlock',async()=>{const s=await start();await s.localUnlock(async()=>true)
    expect(()=>s.authorize('actor-a','company-a',now+5000,'queue')).toThrow('OFFLINE_GRANT_EXPIRED')})
  it('device unlock denial fails closed',async()=>{const s=await start();await expect(s.localUnlock(async()=>false)).rejects.toThrow('OFFLINE_DEVICE_UNLOCK_FAILED')
    expect(()=>s.authorize('actor-a','company-a',now,'read')).toThrow('OFFLINE_UNLOCK_REQUIRED')})
  it('central revocation denies activation',async()=>{const s=createIsolatedOfflineSession()
    await expect(s.activate(async()=>({...await verified(),revoked:true}),now)).rejects.toThrow('OFFLINE_CENTRAL_GRANT_INVALID')})
  it('central verification exception never enables access',async()=>{const s=createIsolatedOfflineSession()
    await expect(s.activate(async()=>{throw Error('NETWORK_DOWN')},now)).rejects.toThrow('NETWORK_DOWN')
    expect(()=>s.authorize('actor-a','company-a',now,'read')).toThrow()})
  it('account change invalidates previous pending device unlock',async()=>{
    const s=await start();let resolve:(x:boolean)=>void=()=>{}
    const promise=s.localUnlock(()=>new Promise<boolean>(r=>{resolve=r}))
    s.logout();resolve(true)
    await expect(promise).rejects.toThrow('OFFLINE_SESSION_SUPERSEDED')
    expect(s.scopes()).toEqual([])
  })
  it('stale network verification cannot restore logged-out account',async()=>{
    const s=createIsolatedOfflineSession();let resolve:(x:Awaited<ReturnType<typeof verified>>)=>void=()=>{}
    const pending=s.activate(()=>new Promise(r=>{resolve=r}),now)
    s.logout();resolve(await verified())
    await expect(pending).rejects.toThrow('OFFLINE_SESSION_SUPERSEDED')
    expect(s.scopes()).toEqual([])
  })
  it('rejects a duplicate company grant',async()=>{const s=createIsolatedOfflineSession()
    await expect(s.activate(async()=>({...await verified(),companyIds:['company-a','company-a']}),now)).rejects.toThrow()})
  it('scopes result cannot mutate internal grant',async()=>{const s=await start()
    const list=s.scopes() as string[];list.push('company-b')
    expect(s.scopes()).toEqual(['company-a'])})
})
