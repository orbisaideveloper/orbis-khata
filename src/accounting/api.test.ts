import { describe, expect, it, vi } from 'vitest'
import { createKhataDataClient, rejected } from './api'
describe('Khata central data boundary', () => {
  it('sends only the authenticated central token to the product-owned gateway', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'company', name: 'Shop' }] })))
    const call = createKhataDataClient({ url: 'https://khata.example.test/data', token: async () => 'central.access', fetchImpl })
    expect(await call('companies', {})).toEqual([{ id: 'company', name: 'Shop' }])
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { authorization: 'Bearer central.access' } })
  })
  it('does not send requests when no account is authenticated', async () => {
    const fetchImpl = vi.fn(), call = createKhataDataClient({ url: 'https://khata.example.test/data', token: async () => null, fetchImpl })
    await expect(call('companies', {})).rejects.toThrow('AUTH_REQUIRED');expect(fetchImpl).not.toHaveBeenCalled()
  })
  it.each(['http://host.test', 'https://name:pass@host.test', 'https://host.test?q=token', 'https://host.test#token'])('rejects unsafe gateway endpoints', url => {
    expect(() => createKhataDataClient({ url, token: async () => null })).toThrow('KHATA_DATA_ENDPOINT_INVALID')
  })
  it('distinguishes definite database rejection from an uncertain network result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'P0001' }), { status: 422 }))
    const call = createKhataDataClient({ url: 'https://khata.example.test/data', token: async () => 'token', fetchImpl })
    try { await call('post', {}) } catch (error) { expect(rejected(error)).toBe(true) }
    expect(rejected(new Error('network'))).toBe(false)
  })
})
it('coalesces only simultaneous identical reads and re-fetches after writes and completed requests',async()=>{
 let resolve!:(value:Response)=>void;const fetchImpl=vi.fn().mockImplementationOnce(()=>new Promise<Response>(r=>{resolve=r;})).mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({data:'fresh'}))));
 const client=createKhataDataClient({url:'https://khata.example.test/data',token:async()=>'token',fetchImpl});const first=client('report',{company:'a'}),second=client('report',{company:'a'});await vi.waitFor(()=>expect(fetchImpl).toHaveBeenCalledTimes(1));resolve(new Response(JSON.stringify({data:'initial'})));expect(await Promise.all([first,second])).toEqual(['initial','initial']);expect(await client('report',{company:'a'})).toBe('fresh');await client('party-save',{company:'a'});await client('report',{company:'a'});expect(fetchImpl).toHaveBeenCalledTimes(4);
});
it('reuses short-lived masters only in memory and invalidates before/after writes and explicit refresh',async()=>{let version=0;const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({data:{version:++version}})));const call=createKhataDataClient({url:'https://khata.example.test/data',token:async()=>'token',fetchImpl});const first=await call<{version:number}>('masters',{company:'a'});first.version=99;expect(await call('masters',{company:'a'})).toEqual({version:1});expect(fetchImpl).toHaveBeenCalledTimes(1);call.invalidate();expect(await call('masters',{company:'a'})).toEqual({version:2});await call('party-save',{company:'a'});expect(await call('masters',{company:'a'})).toEqual({version:4});});
