import { describe, expect, it, vi } from 'vitest'
import { createCompanySyncHandler } from '../../supabase/functions/orbis-khata-data/company-sync.ts'
import type { SyncQuery } from '../../src/sync-v2/postgres-voucher.ts'
import { proofDigest } from '../../src/sync-v2/trusted-voucher-gateway.ts'

const principal={orbisIdentityId:'11111111-1111-7111-8111-111111111111',displayId:'ORB-U-23456789'}
const credential='a'.repeat(64)
const company='33333333-3333-7333-8333-333333333333'
const input={company,epoch:'epoch',registration:'phone',credential,cursor:'0',limit:20}

describe('default-off private company sync handler',()=>{
  it('reads feed only through trusted device/actor-scoped DB function',async()=>{
    const query=vi.fn().mockResolvedValue([{page:{next:'0',groups:[]}}])
    const begin=<T>(fn:(q:SyncQuery)=>Promise<T>):Promise<T>=>fn(query)
    const handler=createCompanySyncHandler(begin)
    const result=await handler(principal,{action:'feed',...input})
    expect(result).toEqual({next:'0',groups:[]})
    expect(query).toHaveBeenCalledWith(expect.stringContaining('sync_v2.read_trusted_feed'),[
      principal.orbisIdentityId,'phone',await proofDigest(credential),'company',company,'epoch','0','20',
    ])
  })
  it('denies arbitrary action and maps credential failures without disclosing database details',async()=>{
    const query=vi.fn().mockRejectedValue(new Error('SYNC_TRUSTED_DEVICE_DENIED'))
    const begin=<T>(fn:(q:SyncQuery)=>Promise<T>):Promise<T>=>fn(query)
    const handler=createCompanySyncHandler(begin)
    await expect(handler(principal,{action:'delete-all',...input})).rejects.toMatchObject({status:400,code:'SYNC_COMMAND_INVALID'})
    await expect(handler(principal,{action:'feed',...input})).rejects.toMatchObject({status:403,code:'SYNC_SCOPE_DENIED'})
    query.mockRejectedValueOnce(new Error('SYNC_FEED_GROUP_TOO_LARGE'))
    await expect(handler(principal,{action:'feed',...input})).rejects.toMatchObject({status:409,code:'SYNC_FEED_GROUP_TOO_LARGE'})
  })
  it('calls bounded group-recovery function, never the ordinary financial writer',async()=>{
    const query=vi.fn().mockResolvedValue([{result:{transfer:'0:510',items:510}}])
    const begin=<T>(fn:(q:SyncQuery)=>Promise<T>):Promise<T>=>fn(query)
    const handler=createCompanySyncHandler(begin)
    expect(await handler(principal,{action:'recover-group',...input,item:1,offset:0})).toEqual({transfer:'0:510',items:510})
    expect(query).toHaveBeenCalledWith(expect.stringContaining('sync_v2.read_trusted_company_group'),[
      principal.orbisIdentityId,'phone',await proofDigest(credential),company,'epoch','0','1','0',
    ])
  })
})
