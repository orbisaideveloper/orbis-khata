import { describe, expect, it, vi } from 'vitest'
import { createCompanyGroupReader, createTrustedCompanyGroupGateway } from './trusted-company-group-gateway.ts'
import { proofDigest } from './trusted-voucher-gateway.ts'
import type { SyncQuery } from './postgres-voucher.ts'

const actor='11111111-1111-7111-8111-111111111111'
const credential='a'.repeat(64)
const scope={kind:'company' as const,id:'33333333-3333-7333-8333-333333333333',epoch:'epoch'}
const response={transfer:'0:510',items:510,from:'0',next:'510'}

describe('private company large-group HTTP/DB boundary',()=>{
  it('rejects malformed cursors, non-company scopes and credentials before reading SQL',async()=>{
    const begin=vi.fn()
    const read=createCompanyGroupReader(begin)
    await expect(read(actor,credential,'phone',{...scope,kind:'lottery-organization'},'0',null,null)).rejects.toThrow('SYNC_SCOPE_UNSUPPORTED')
    await expect(read(actor,credential,'phone',scope,'-1',null,null)).rejects.toThrow('SYNC_RECOVERY_FRAGMENT_CURSOR')
    await expect(read(actor,credential,'phone',scope,'9223372036854775808',null,null)).rejects.toThrow('SYNC_RECOVERY_FRAGMENT_CURSOR')
    await expect(read(actor,credential,'phone',scope,'0',1,null)).rejects.toThrow('SYNC_RECOVERY_FRAGMENT_CURSOR')
    await expect(read(actor,credential,'phone',scope,'0',0,0)).rejects.toThrow('SYNC_RECOVERY_FRAGMENT_CURSOR')
    await expect(read(actor,credential,'phone',scope,'0',1,2097152)).rejects.toThrow('SYNC_RECOVERY_FRAGMENT_CURSOR')
    await expect(read(actor,'invalid','phone',scope,'0',null,null)).rejects.toThrow('SYNC_DEVICE_PROOF_INVALID')
    expect(begin).not.toHaveBeenCalled()
  })
  it('passes only Central-verified actor, scope, hashed possession and bounded offset',async()=>{
    const query=vi.fn().mockResolvedValue([{result:response}])
    let begun=0
    const begin=<T>(fn:(q:SyncQuery)=>Promise<T>):Promise<T>=>{begun++;return fn(query)}
    const read=createTrustedCompanyGroupGateway({
      baseUrl:'https://admin.example.test',
      fetchImpl:async(_,options)=>new Headers(options?.headers).get('authorization')==='Bearer valid'
        ? Response.json({version:'orbis.customer.v1',customer:{orbisIdentityId:actor,displayId:'ORB-U-23456789'}})
        : new Response(null,{status:401}),
    },begin)
    await expect(read('invalid',credential,'phone',scope,'0',null,null)).rejects.toThrow('SYNC_SESSION_DENIED')
    expect(begun).toBe(0)
    const result=await read('valid',credential,'phone',scope,'0',1,0)
    expect(result).toEqual(response)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('sync_v2.read_trusted_company_group'),
      [actor,'phone',await proofDigest(credential),scope.id,scope.epoch,'0','1','0'])
  })
  it('rejects malformed database return values rather than claiming a successful transfer',async()=>{
    const read=createCompanyGroupReader(async fn=>fn(async()=>[{result:null}]))
    await expect(read(actor,credential,'phone',scope,'0',null,null)).rejects.toThrow('SYNC_DATABASE_RESULT_INVALID')
  })
})
