import { afterEach, expect, it, vi } from 'vitest'
import { createCentralVerifier, createKhataGateway, khataOperation } from './server-gateway'
const id = '11111111-1111-4111-8111-111111111111'
const principal = { orbisIdentityId: '11111111-1111-7111-8111-111111111111', displayId: 'ORB-U-23456789' }
const envelope = (operation: string, input: unknown) => ({ version: 'orbis.khata.data.v1', operation, input })
const report = { company: id, from: '2026-01-01', to: '2026-01-31', party: null, offset: 0 }
const post = { id, company: id, party: id, kind: 'receipt', date: '2026-01-01', amount: '100', method: 'cash', reference: '', note: '', reverses: null }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('rejects malformed request envelopes and unknown operations before execution', () => {
  for (const value of [false, 3, { extra: 1 }, { ...envelope('companies', {}), extra: 1 }, { ...envelope('companies', {}), version: 'wrong' }, envelope('companies', null), envelope('companies', []), envelope('companies', { extra: true }), envelope('unknown', {})]) expect(khataOperation(value)).toBeNull()
})
it('validates every create/report/post field without trusting owner supplied input', () => {
  for (const row of [{ id: 'bad', name: 'Shop' }, { id, name: 1 }, { id, name: '' }, { id, name: 'x'.repeat(121) }, { id, name: 'Shop', extra: true }]) expect(khataOperation(envelope('create', { table: 'khata_companies', row }))).toBeNull()
  for (const input of [{ table: 'other', row: { id, name: 'Shop' } }, { table: 'khata_parties', row: { id, name: 'Party', company_id: 'bad', kind: 'both' } }, { table: 'khata_parties', row: { id, name: 'Party', company_id: id, kind: 'other' } }, { table: 'khata_parties', row: null }, { table: 'khata_companies', row: { id, name: 'Shop' }, extra: true }]) expect(khataOperation(envelope('create', input))).toBeNull()
  for (const change of [{ extra: 1 }, { company: 'bad' }, { from: 3 }, { from: 'bad' }, { from: '2026-99-01' }, { from: '2026-02-01' }, { to: 'bad' }, { party: 'bad' }, { offset: '0' }, { offset: 0.5 }]) expect(khataOperation(envelope('report', { ...report, ...change }))).toBeNull()
  expect(khataOperation(envelope('report', { ...report, party: id }))).not.toBeNull()
  for (const change of [{ extra: 1 }, { id: 'bad' }, { company: 'bad' }, { kind: 'unknown' }, { date: 'bad' }, { amount: 100 }, { method: 'other' }, { reference: 3 }, { reference: 'x'.repeat(81) }, { note: 3 }, { note: 'x'.repeat(501) }, { reverses: 'bad' }]) expect(khataOperation(envelope('post', { ...post, ...change }))).toBeNull()
  expect(khataOperation(envelope('post', { ...post, kind: 'reversal', reverses: id }))).not.toBeNull()
})
it.each(['http://admin.example', 'https://admin.example/path', 'https://u@admin.example', 'https://:p@admin.example', 'https://admin.example/?x=1', 'https://admin.example/#x'])('rejects unsafe verifier URL %s', baseUrl => {
  expect(() => createCentralVerifier({ baseUrl })).toThrow('CENTRAL_ENDPOINT_INVALID')
})
it('uses platform fetch, service-only verification headers and bounded provider responses', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ version: 'orbis.customer.v1', customer: principal })).mockResolvedValueOnce(new Response('{}', { status: 403 })).mockResolvedValueOnce(new Response('{}', { status: 500 })).mockResolvedValueOnce(new Response('x'.repeat(65537)))
  vi.stubGlobal('fetch', fetcher)
  const verify = createCentralVerifier({ baseUrl: 'https://admin.example', verificationKey: 'server-only' })
  await expect(verify('token')).resolves.toEqual(principal)
  expect(fetcher.mock.calls[0][0]).toBe('https://admin.example/api/v1/service/customer/session')
  expect(fetcher.mock.calls[0][1].headers['x-orbis-verification-key']).toBe('server-only')
  await expect(verify('token')).resolves.toBeNull()
  await expect(verify('token')).rejects.toThrow('CENTRAL_UNAVAILABLE')
  await expect(verify('token')).rejects.toThrow('CENTRAL_RESPONSE_INVALID')
})
it('rejects each malformed identity envelope from the central service', async () => {
  for (const body of [null, {}, { version: 'bad' }, { version: 'orbis.customer.v1', customer: null }, { version: 'orbis.customer.v1', customer: {} }, { version: 'orbis.customer.v1', customer: { ...principal, displayId: 3 } }, { version: 'orbis.customer.v1', customer: { ...principal, displayId: 'bad' } }]) {
    const verify = createCentralVerifier({ baseUrl: 'https://admin.example', fetchImpl: vi.fn().mockResolvedValue(Response.json(body)) })
    await expect(verify('token')).rejects.toThrow('CENTRAL_RESPONSE_INVALID')
  }
})
it('bounds inputs, rejects missing authorization and failed principals without database access', async () => {
  const verify = vi.fn().mockResolvedValue(null), execute = vi.fn()
  const handle = createKhataGateway({ origins: [], verify, execute })
  const request = (body: string, token?: string) => new Request('https://gateway.example', { method: 'POST', headers: token ? { authorization: 'Bearer ' + token } : {}, body })
  expect((await handle(request('{}'))).status).toBe(401)
  expect((await handle(request('x'.repeat(16385), 'token'))).status).toBe(413)
  expect((await handle(request('broken', 'token'))).status).toBe(400)
  const body = JSON.stringify(envelope('companies', {}))
  expect((await handle(request(body, 'token'))).status).toBe(401)
  verify.mockResolvedValue({ ...principal, orbisIdentityId: id })
  expect((await handle(request(body, 'token'))).status).toBe(401)
  expect(execute).not.toHaveBeenCalled()
})
it('returns only permitted database error codes and conceals every other failure', async () => {
  for (const [error, status, code] of [[{ code: 'P0001', detail: 'private' }, 422, 'P0001'], [{ code: 3 }, 503, 'KHATA_DATA_UNAVAILABLE'], [{ code: 'XXXXX' }, 503, 'KHATA_DATA_UNAVAILABLE'], [null, 503, 'KHATA_DATA_UNAVAILABLE']] as const) {
    const execute = vi.fn().mockRejectedValue(error)
    const handle = createKhataGateway({ origins: [], verify: vi.fn().mockResolvedValue(principal), execute })
    const response = await handle(new Request('https://gateway.example', { method: 'POST', headers: { authorization: 'Bearer token' }, body: JSON.stringify(envelope('companies', {})) }))
    expect(response.status).toBe(status); expect(await response.json()).toEqual({ code })
  }
})
