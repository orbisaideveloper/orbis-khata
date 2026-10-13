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
