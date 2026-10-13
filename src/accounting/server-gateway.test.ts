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
  return { handle: createKhataGateway({ origins: ['https://khata.example.test'], verify, execute }), verify, execute }
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
