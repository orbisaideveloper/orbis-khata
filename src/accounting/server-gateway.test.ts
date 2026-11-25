import { describe, expect, it, vi } from 'vitest'
import { createKhataGateway, createCentralVerifier, khataOperation } from './server-gateway'
const principal = { orbisIdentityId: '11111111-1111-7111-8111-111111111111', displayId: 'ORB-U-23456789' }
const uuid = '22222222-2222-4222-8222-222222222222'
const envelope = (operation: string, input: unknown) => ({ version: 'orbis.khata.data.v1', operation, input })
function request(body: unknown = envelope('companies', {}), extras: RequestInit = {}) {
  return new Request('https://gateway.example.test', { method: 'POST', headers: { authorization: 'Bearer central.access', origin: 'https://khata.example.test' }, body: JSON.stringify(body), ...extras })
}
function gateway(accepted = true) {
  const verify = vi.fn().mockResolvedValue(accepted ? principal : null), execute = vi.fn().mockResolvedValue([{ name: 'own company' }])
  return { handle: createKhataGateway({admit:async()=>({allowed:true,retryAfter:0}), origins: ['https://khata.example.test'], verify, execute }), verify, execute }
}
describe('product-owned Khata gateway', () => {
  it('derives ownership from the verified central session', async () => {
    const { handle, execute } = gateway()
    expect((await handle(request())).status).toBe(200)
    expect(execute).toHaveBeenCalledWith(principal, { operation: 'companies', input: {} })
  })
  it('rejects a revoked session without database access', async () => {
    const { handle, execute } = gateway(false)
    expect((await handle(request())).status).toBe(401);expect(execute).not.toHaveBeenCalled()
  })
  it.each([envelope('companies', { owner_id: uuid }), envelope('create', { table: 'khata_companies', row: { id: uuid, name: 'Own', owner_id: uuid } }),
    envelope('sql', { query: 'delete from ledger' }), envelope('create', { table: 'auth.users', row: { id: uuid, name: 'Owner' } })])('blocks forged ownership, arbitrary SQL and unapproved tables', async body => {
    const { handle, execute } = gateway();expect((await handle(request(body))).status).toBe(400);expect(execute).not.toHaveBeenCalled()
  })
  it('handles preflight and rejects unapproved origins/methods before token verification', async () => {
    const { handle, verify } = gateway()
    expect((await handle(new Request('https://gateway.example.test', { method: 'OPTIONS', headers: { origin: 'https://khata.example.test' } }))).status).toBe(204)
    expect((await handle(request(undefined, { headers: { origin: 'https://evil.test', authorization: 'Bearer token' } }))).status).toBe(403)
    expect((await handle(new Request('https://gateway.example.test'))).status).toBe(405);expect(verify).not.toHaveBeenCalled()
  })
  it('does not echo database or credential details', async () => {
    const { handle, execute } = gateway();execute.mockRejectedValue(new Error('secret database connection password'))
    const response = await handle(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain('secret')
  })
  it('accepts only bounded accounting operations', () => {
    const report = { company: uuid, from: '2026-01-01', to: '2026-01-31', party: null, offset: 0 }
    const post = { id: uuid, company: uuid, party: uuid, kind: 'receipt', date: '2026-01-01', amount: '12500', method: 'cash', reference: '', note: '', reverses: null }
    for (const value of [envelope('companies', {}), envelope('report', report), envelope('post', post), envelope('create', { table: 'khata_companies', row: { id: uuid, name: 'Shop' } }), envelope('create', { table: 'khata_parties', row: { id: uuid, name: 'Party', company_id: uuid, kind: 'customer' } })]) expect(khataOperation(value)).not.toBeNull()
    for (const value of [null, [], {}, envelope('post', { ...post, amount: '0' }), envelope('post', { ...post, amount: '12.50' }), envelope('report', { ...report, offset: -1 }), envelope('report', { ...report, from: '2026-02-30' }), envelope('post', { ...post, party: 'someone-else' })]) expect(khataOperation(value)).toBeNull()
  })
  it('verifies each token remotely and validates the returned identity', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ version: 'orbis.customer.v1', customer: principal }))).mockResolvedValueOnce(new Response('{}', { status: 401 })).mockResolvedValueOnce(new Response(JSON.stringify({ version: 'orbis.customer.v1', customer: { ...principal, orbisIdentityId: uuid } })))
    const verify = createCentralVerifier({ baseUrl: 'https://admin.example.test', fetchImpl })
    expect(await verify('central.token')).toEqual(principal);expect(await verify('revoked.token')).toBeNull()
    await expect(verify('wrong.identity')).rejects.toThrow('CENTRAL_RESPONSE_INVALID')
  })
})

describe('shared gateway admission',()=>{
 it('returns a retry hint and never posts while identity quota is exhausted',async()=>{
  const execute=vi.fn(),admit=vi.fn().mockResolvedValue({allowed:false,retryAfter:12});
  const handle=createKhataGateway({origins:['https://khata.example.test'],verify:async()=>principal,admit,execute});
  const response=await handle(request());expect(response.status).toBe(429);expect(response.headers.get('retry-after')).toBe('12');expect(await response.json()).toEqual({code:'KHATA_RATE_LIMITED'});expect(execute).not.toHaveBeenCalled();expect(admit).toHaveBeenCalledWith(principal);
 });
 it('fails closed when quota storage is unavailable and releases the ingress slot',async()=>{
  const execute=vi.fn(),admit=vi.fn().mockRejectedValueOnce(new Error('private quota database')).mockResolvedValue({allowed:true,retryAfter:0});
  const handle=createKhataGateway({maximumConcurrent:1,origins:['https://khata.example.test'],verify:async()=>principal,admit,execute});
  const response=await handle(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain('private');expect(execute).not.toHaveBeenCalled();expect((await handle(request())).status).toBe(200);
 });
 it('preserves central authentication rate-limit responses',async()=>{
  const verify=createCentralVerifier({baseUrl:'https://admin.example.test',fetchImpl:async()=>new Response('{}',{status:429,headers:{'retry-after':'15'}})});
  await expect(verify('token')).rejects.toMatchObject({status:429,code:'KHATA_RATE_LIMITED',retryAfter:15});
 });
});

it('exports Lottery only for the verified identity and rejects caller-supplied owners', async () => {
  const { handle, execute } = gateway()
  expect((await handle(request(envelope('lottery-export', {})))).status).toBe(200)
  expect(execute).toHaveBeenCalledWith(principal, { operation: 'lottery-export', input: {} })
  execute.mockClear()
  expect((await handle(request(envelope('lottery-export', { actor: uuid })))).status).toBe(400)
  expect(execute).not.toHaveBeenCalled()
})

it('validates bounded seller recovery scopes and rejects supplied owners and invalid dates',async()=>{
 const input={organizationId:uuid,partyId:uuid,occurredAt:'2026-11-16',saleId:uuid};
 const {handle,execute}=gateway();
 expect((await handle(request(envelope('lottery-seller-recovery',input)))).status).toBe(200);
 expect(execute).toHaveBeenCalledWith(principal,{operation:'lottery-seller-recovery',input});
 for(const invalid of [{...input,owner:uuid},{...input,occurredAt:'2026-02-30'},{...input,partyId:'invalid'},{...input,saleId:'invalid'}]) expect(khataOperation(envelope('lottery-seller-recovery',invalid))).toBeNull();
});

it('dedicated relay path accepts bounded statements but rejects unrelated financial operations',async()=>{
 const {handle,execute}=gateway()
 const body=envelope('customer-relay',{action:'list'})
 const headers={authorization:'Bearer central.access',origin:'https://khata.example.test'}
 expect((await handle(new Request('https://gateway.example.test/customer-relay',{method:'POST',headers,body:JSON.stringify(body)}))).status).toBe(200)
 expect(execute).toHaveBeenCalledWith(principal,{operation:'customer-relay',input:{action:'list'}})
 execute.mockClear()
 expect((await handle(new Request('https://gateway.example.test/customer-relay',{method:'POST',headers,body:JSON.stringify(envelope('companies',{}))}))).status).toBe(400)
 expect(execute).not.toHaveBeenCalled()
})

describe('default-off company Sync v2 read-only ingress',()=>{
  const company='33333333-3333-7333-8333-333333333333'
  const valid={action:'feed',company,epoch:'epoch-1',registration:'phone-1',
    credential:'a'.repeat(64),cursor:'0',limit:200}
  it('validates bounded company feed/recovery and rejects arbitrary owner and malformed cursor',()=>{
    for(const input of [valid,{...valid,action:'recover-group',limit:undefined,item:1,offset:0},
      {...valid,action:'recover-group',limit:undefined,item:undefined,offset:undefined}]) {
      const cleaned=Object.fromEntries(Object.entries(input).filter(([,v])=>v!==undefined))
      expect(khataOperation(envelope('company-sync',cleaned))).not.toBeNull()
    }
    for(const input of [{...valid,owner:principal.orbisIdentityId},{...valid,company:'other'},
      {...valid,limit:501},{...valid,cursor:'-1'},{...valid,credential:'forged'},
      {...valid,action:'recover-group',limit:undefined,item:1,offset:undefined}]) {
      const cleaned=Object.fromEntries(Object.entries(input).filter(([,v])=>v!==undefined))
      expect(khataOperation(envelope('company-sync',cleaned))).toBeNull()
    }
  })
  it('returns 404 without the flag and never calls legacy accounting execute',async()=>{
    const {handle,execute,verify}=gateway()
    expect((await handle(request(envelope('company-sync',valid)))).status).toBe(404)
    expect(execute).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
  })
  it('authorizes Central actor and enforces admission before calling the private sync handler',async()=>{
    const companySync=vi.fn().mockResolvedValue({from:'0',next:'0',groups:[]})
    const execute=vi.fn(),admit=vi.fn().mockResolvedValue({allowed:true,retryAfter:0})
    const verify=vi.fn().mockResolvedValue(principal)
    const handle=createKhataGateway({origins:['https://khata.example.test'],verify,execute,admit,companySync})
    expect((await handle(request(envelope('company-sync',valid)))).status).toBe(200)
    expect(companySync).toHaveBeenCalledWith(principal,valid)
    expect(execute).not.toHaveBeenCalled()
    verify.mockResolvedValueOnce(null)
    expect((await handle(request(envelope('company-sync',valid)))).status).toBe(401)
    expect(companySync).toHaveBeenCalledTimes(1)
  })
})
