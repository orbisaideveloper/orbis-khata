import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCustomerSessionClient, CustomerSessionError } from './customer-session'
const id = '11111111-1111-7111-8111-111111111111'
const customer = { orbisIdentityId: id, displayId: 'ORB-U-23456789' }
const response = { version: 'orbis.customer.v1', customer, session: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600 } }
function fixture(values: unknown[] = []) {
  const saved = new Map<string, string>()
  const storage = { getItem: vi.fn((key: string) => saved.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { saved.set(key, value) }), removeItem: vi.fn((key: string) => { saved.delete(key) }) }
  const fetchImpl = vi.fn()
  for (const value of values) fetchImpl.mockResolvedValueOnce(value instanceof Response ? value : Response.json(value))
  const client = createCustomerSessionClient({ baseUrl: 'https://admin.example', storage, fetchImpl, now: () => 100000 })
  return { client, storage, saved, fetchImpl }
}
afterEach(() => vi.unstubAllGlobals())
describe('shared central customer session', () => {
  it('stores a persistent central session but never the signup password', async () => {
    const { client, saved, fetchImpl } = fixture([response])
    const result = await client.authenticate('signup', { identifier: '+919876543210', name: 'অজয়', password: 'private-password' })
    expect(result.customer.orbisIdentityId).toBe(id);expect(result.expiresAt).toBe(3700000)
    expect([...saved.values()].join()).not.toContain('private-password')
    expect(client.snapshot()).toBe(result)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://admin.example/api/v1/customer/signup')
    expect(fetchImpl.mock.calls[0][1].credentials).toBe('omit')
  })
  it('restores saved sessions with remote verification and coalesces concurrent calls', async () => {
    const { client, saved, fetchImpl } = fixture([response, { version: 'orbis.customer.v1', customer }])
    await client.authenticate('login', { identifier: 'a@b.co', password: 'p' })
    const reopened = createCustomerSessionClient({ baseUrl: 'https://admin.example', storage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => { saved.set(key, value) }, removeItem: key => { saved.delete(key) } }, fetchImpl, now: () => 200000 })
    const first = reopened.restore(), second = reopened.restore()
    expect(first).toBe(second);expect((await first)?.customer).toEqual(customer)
    expect(fetchImpl.mock.calls[1][1].headers.authorization).toBe('Bearer access')
  })
  it('refreshes expiring sessions while preserving the same central ID', async () => {
    const { client, fetchImpl } = fixture([{ ...response, session: { ...response.session, expiresIn: 1 } }, response, { version: 'orbis.customer.v1', customer }])
    await client.authenticate('login', { identifier: 'a@b.co', password: 'p' })
    expect((await client.restore())?.accessToken).toBe('access')
    expect(fetchImpl.mock.calls[1][0]).toContain('/refresh')
    expect(await client.accessToken()).toBe('access')
  })
  it('returns no session when none is saved, and clears malformed cache', async () => {
    const { client, saved } = fixture()
    expect(await client.restore()).toBeNull();expect(await client.accessToken()).toBeNull()
    for (const value of ['broken', 'x'.repeat(20001), JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, expiresAt: 'bad' }), JSON.stringify({ version: 1, expiresAt: 200000 })]) {
      saved.set('orbis.central.customer.v1', value)
      expect(await client.restore()).toBeNull();expect(saved.size).toBe(0)
    }
  })
  it('retains refresh material during an outage and clears it on a revoked session', async () => {
    const { client, saved, fetchImpl } = fixture([response])
    await client.authenticate('login', { identifier: 'a@b.co', password: 'p' })
    fetchImpl.mockRejectedValueOnce(new Error('offline'))
    await expect(client.restore()).rejects.toThrow('offline');expect(saved.size).toBe(1)
    fetchImpl.mockResolvedValueOnce(new Response('', { status: 401 }))
    await expect(client.restore()).rejects.toMatchObject({ code: 'CUSTOMER_LOGIN_REQUIRED' });expect(saved.size).toBe(0)
  })
  it('prevents a late response from restoring a signed-out session', async () => {
    const { client, fetchImpl } = fixture([response])
    await client.authenticate('login', { identifier: 'a@b.co', password: 'p' })
    let resolve!: (value: Response) => void
    fetchImpl.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done })).mockResolvedValueOnce(Response.json({ signedOut: true }))
    const pending = client.restore()
    await client.logout()
    resolve(Response.json({ version: 'orbis.customer.v1', customer }))
    await expect(pending).rejects.toMatchObject({ code: 'CUSTOMER_OPERATION_CANCELLED' });expect(client.snapshot()).toBeNull()
  })
  it('cancels a late signup when logout occurs while it is pending', async () => {
    const { client, fetchImpl } = fixture()
    let resolve!: (value: Response) => void
    fetchImpl.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
    const pending = client.authenticate('signup', { name: 'x', identifier: 'a@b.co', password: 'password' })
    await client.logout();resolve(Response.json(response))
    await expect(pending).rejects.toMatchObject({ code: 'CUSTOMER_OPERATION_CANCELLED' })
  })
  it('never accepts a different identity during verification or refresh', async () => {
    const mismatch = { ...customer, orbisIdentityId: '22222222-2222-7222-8222-222222222222' }
    const verified = fixture([response, { version: 'orbis.customer.v1', customer: mismatch }])
    await verified.client.authenticate('login', { identifier: 'a@b.co', password: 'p' })
    await expect(verified.client.restore()).rejects.toMatchObject({ code: 'CUSTOMER_IDENTITY_MISMATCH' })
    const refreshed = fixture([{ ...response, session: { ...response.session, expiresIn: 1 } }, { ...response, customer: mismatch }])
    await refreshed.client.authenticate('login', { identifier: 'a@b.co', password: 'p' })
    await expect(refreshed.client.restore()).rejects.toMatchObject({ code: 'CUSTOMER_IDENTITY_MISMATCH' })
  })
  it('signs out local and remotely restored sessions without deleting product profiles', async () => {
    const { client, saved, storage, fetchImpl } = fixture([response, { signedOut: true }, { signedOut: true }])
    await client.authenticate('login', { identifier: 'a@b.co', password: 'p' })
    const raw = saved.get('orbis.central.customer.v1')!
    saved.set('product.profile', 'keep')
    await client.logout();expect(saved.get('product.profile')).toBe('keep')
    storage.setItem('orbis.central.customer.v1', raw)
    await client.logout();expect(fetchImpl).toHaveBeenCalledTimes(3)
    await client.logout();expect(fetchImpl).toHaveBeenCalledTimes(3)
    saved.set('orbis.central.customer.v1', 'broken');await client.logout()
  })
  it.each(['http://admin.example', 'https://name:password@admin.example', 'https://admin.example/path', 'https://admin.example/?x=1', 'https://admin.example/#x'])('rejects unsafe endpoint %s', baseUrl => {
    expect(() => createCustomerSessionClient({ baseUrl, storage: fixture().storage })).toThrow(CustomerSessionError)
  })
  it.each([null, {}, { ...response, version: 'wrong' }, { ...response, session: null }, { ...response, customer: null },
    { ...response, customer: { ...customer, orbisIdentityId: 'bad' } }, { ...response, customer: { ...customer, displayId: 'bad' } },
    { ...response, session: { ...response.session, accessToken: '' } }, { ...response, session: { ...response.session, accessToken: 'x'.repeat(8193) } },
    { ...response, session: { ...response.session, refreshToken: '' } }, { ...response, session: { ...response.session, refreshToken: 'x'.repeat(8193) } },
    { ...response, session: { ...response.session, expiresIn: 0 } }, { ...response, session: { ...response.session, expiresIn: 86401 } },
  ])('rejects malformed responses', async value => {
    await expect(fixture([value]).client.authenticate('login', { identifier: 'a@b.co', password: 'p' })).rejects.toMatchObject({ code: 'CUSTOMER_RESPONSE_INVALID' })
  })
  it('rejects large bodies and generic HTTP failures without leaking remote content', async () => {
    await expect(fixture([new Response('x'.repeat(65537))]).client.authenticate('login', { identifier: 'a@b.co', password: 'p' })).rejects.toMatchObject({ code: 'CUSTOMER_RESPONSE_INVALID' })
    await expect(fixture([new Response('private remote text', { status: 503 })]).client.authenticate('login', { identifier: 'a@b.co', password: 'p' })).rejects.toMatchObject({ code: 'CUSTOMER_SERVICE_UNAVAILABLE' })
  })
})
