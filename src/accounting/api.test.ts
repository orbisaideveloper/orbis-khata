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

it('never caches shared statements, including after revocation',async()=>{const fetchImpl=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({data:{balance:'500'}}))).mockResolvedValueOnce(new Response(JSON.stringify({code:'P0001'}),{status:422}));const call=createKhataDataClient({url:'https://khata.example.test/data',token:async()=>'central.token',fetchImpl});expect(await call('party-sharing',{action:'statement',id:'link'})).toEqual({balance:'500'});await expect(call('party-sharing',{action:'statement',id:'link'})).rejects.toThrow();expect(fetchImpl).toHaveBeenCalledTimes(2);});

it('uses a dedicated bounded relay route without changing the normal accounting endpoint',async()=>{
 const fetchImpl=vi.fn<typeof fetch>(async()=>Response.json({data:{saved:true}}))
 const client=createKhataDataClient({url:'https://khata.example.test/functions/v1/orbis-khata-data',token:async()=> 'central.token',fetchImpl})
 await client('customer-relay',{action:'list'})
 expect(fetchImpl.mock.calls[0][0]).toBe('https://khata.example.test/functions/v1/orbis-khata-data/customer-relay')
 await client('companies',{})
 expect(fetchImpl.mock.calls[1][0]).toBe('https://khata.example.test/functions/v1/orbis-khata-data')
})

it.each([
 ['size', () => Response.json({data: 'x'.repeat(2_100_000)})],
 ['json', () => new Response('private financial text, malformed')],
 ['http', () => Response.json({reason: 'ORGANIZATION_NOT_FOUND'}, {status: 403})],
 ['domain', () => Response.json({data: {lotteryError: 'LOTTERY_COMMAND_REJECTED'}})],
 ['shape', () => Response.json({data: {}})],
 ['timeout', () => { throw new DOMException('private network detail', 'TimeoutError') }],
] as const)('reports Lottery workspace %s without exposing response or request data', async (stage, reply) => {
 const client = createKhataDataClient({
  url: 'https://khata.example.test/data', token: async () => 'private-token', fetchImpl: async () => reply(),
 })
 const error = await client('lottery', {method: 'getWorkspace', payload: {organizationId: 'private-org'}}).catch((cause: unknown) => cause)
 expect(error).toMatchObject({workspaceDiagnostic: {stage}})
 const diagnostic = (error as {workspaceDiagnostic: unknown}).workspaceDiagnostic
 expect(JSON.stringify(diagnostic)).not.toMatch(/private|\.example\.test/u)
 if (stage === 'size') expect(diagnostic).toMatchObject({status: 200, decodedChars: 2_100_011})
 if (stage === 'timeout') expect(diagnostic).toMatchObject({status: null, decodedChars: null})
})

it.each([50_000, 330_000, 2_100_000, 3_000_000, 4_000_000, 6_000_000])(
 'keeps gzip transfer bytes distinct from %i decoded audit characters',
 async size => {
  const audit = 'x'.repeat(size)
  const body = JSON.stringify({data: {organization: {id: 'fixture'}, audit}})
  const stream = (bytes: Uint8Array<ArrayBuffer>) => new ReadableStream({
   start(controller) {
    controller.enqueue(bytes)
    controller.close()
   },
  })
  const gzip = stream(new TextEncoder().encode(body)).pipeThrough(new CompressionStream('gzip'))
  const compressed = await new Response(gzip).arrayBuffer()
  const fetchImpl = vi.fn(async () => new Response(
   stream(new Uint8Array(compressed)).pipeThrough(new DecompressionStream('gzip')),
   {headers: {'content-encoding': 'gzip', 'content-length': String(compressed.byteLength)}},
  ))
  const client = createKhataDataClient({url: 'https://khata.example.test/data', token: async () => 'fixture', fetchImpl})
  const result = client('lottery', {method: 'getWorkspace', payload: {organizationId: 'fixture'}})
  expect(compressed.byteLength).toBeLessThan(2_000_000)
  if (body.length <= 2_000_000) {
   const workspace = await result
   expect(workspace).toEqual({organization: {id: 'fixture'}, audit})
  } else {
   await expect(result).rejects.toMatchObject({
    message: 'KHATA_DATA_RESPONSE_INVALID',
    workspaceDiagnostic: {stage: 'size', status: 200, decodedChars: body.length,
     contentLength: compressed.byteLength, contentEncoding: 'gzip'},
   })
  }
  expect(fetchImpl).toHaveBeenCalledTimes(1)
 },
)
