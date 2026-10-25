import { expect, it, vi } from 'vitest'
import { createCustomerSessionClient } from './customer-session'
import { createKhataDataClient } from '../accounting/api'
import { createKhataGateway } from '../accounting/server-gateway'

const customer = { orbisIdentityId: '11111111-1111-7111-8111-111111111111', displayId: 'ORB-U-23456789' }
const key = 'orbis.central.customer.v1'
function fixture() {
  let clock = 100000
  const saved = new Map<string, string>()
  const storage = { getItem: (k: string) => saved.get(k) ?? null,
    setItem: (k: string, value: string) => { saved.set(k, value) }, removeItem: (k: string) => { saved.delete(k) } }
  const fetchImpl = vi.fn()
  const make = () => createCustomerSessionClient({ baseUrl: 'https://admin.example', storage, fetchImpl, now: () => clock })
  return { saved, fetchImpl, make, advance: (milliseconds: number) => { clock += milliseconds } }
}
function reply(accessToken = 'access', expiresIn = 3600) {
  return Response.json({ version: 'orbis.customer.v1', customer, session: { accessToken, refreshToken: 'refresh', expiresIn } })
}
const login = { identifier: 'owner@example.test', password: 'fixture-password' }

it('reuses a live runtime token for repeated company/report requests without extra central calls', async () => {
  const f = fixture(), client = f.make()
  f.fetchImpl.mockResolvedValueOnce(reply())
  await client.authenticate('login', login)
  expect(await Promise.all([client.accessToken(), client.accessToken(), client.accessToken()])).toEqual(['access', 'access', 'access'])
  expect(f.fetchImpl).toHaveBeenCalledTimes(1)
})

it('remotely verifies stored material once on a cold runtime, then reuses it', async () => {
  const f = fixture()
  f.fetchImpl.mockResolvedValueOnce(reply()).mockResolvedValueOnce(Response.json({ version: 'orbis.customer.v1', customer }))
  await f.make().authenticate('login', login)
  const reopened = f.make()
  expect(await reopened.accessToken()).toBe('access')
  expect(await reopened.accessToken()).toBe('access')
  expect(f.fetchImpl).toHaveBeenCalledTimes(2)
  expect(f.fetchImpl.mock.calls[1][0]).toContain('/session')
})

it('coalesces refresh at the sixty-second boundary and returns the rotated token', async () => {
  const f = fixture(), client = f.make()
  f.fetchImpl.mockResolvedValueOnce(reply('old', 120)).mockResolvedValueOnce(reply('rotated'))
  await client.authenticate('login', login)
  f.advance(60000)
  expect(await Promise.all([client.accessToken(), client.accessToken()])).toEqual(['rotated', 'rotated'])
  expect(f.fetchImpl).toHaveBeenCalledTimes(2)
  expect(f.fetchImpl.mock.calls[1][0]).toContain('/refresh')
})

it('joins an in-flight verification and does not return a revoked token', async () => {
  const f = fixture(), client = f.make()
  f.fetchImpl.mockResolvedValueOnce(reply())
  await client.authenticate('login', login)
  let finish!: (value: Response) => void
  f.fetchImpl.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  const verifying = client.restore()
  const token = client.accessToken()
  const results = Promise.allSettled([verifying, token])
  finish(new Response('', { status: 401 }))
  expect((await results).map(result => result.status)).toEqual(['rejected', 'rejected'])
  expect(client.snapshot()).toBeNull()
  expect(f.saved.has(key)).toBe(false)
})

it('never uses an expired token as a fallback during a refresh outage', async () => {
  const f = fixture(), client = f.make()
  f.fetchImpl.mockResolvedValueOnce(reply('expired', 1)).mockRejectedValueOnce(new Error('offline'))
  await client.authenticate('login', login)
  f.advance(2000)
  await expect(client.accessToken()).rejects.toThrow('offline')
  expect(f.saved.has(key)).toBe(true)
})

it('returns no cached token after logout', async () => {
  const f = fixture(), client = f.make()
  f.fetchImpl.mockResolvedValueOnce(reply()).mockResolvedValueOnce(Response.json({ signedOut: true }))
  await client.authenticate('login', login)
  await client.logout()
  expect(await client.accessToken()).toBeNull()
  expect(f.fetchImpl).toHaveBeenCalledTimes(2)
})

it('uses the new session token after an explicit account switch', async () => {
  const f = fixture(), client = f.make()
  f.fetchImpl.mockResolvedValueOnce(reply('first')).mockResolvedValueOnce(reply('second'))
  await client.authenticate('login', login)
  expect(await client.accessToken()).toBe('first')
  await client.authenticate('login', { ...login, identifier: 'second@example.test' })
  expect(await client.accessToken()).toBe('second')
  expect(f.fetchImpl).toHaveBeenCalledTimes(2)
})

it('does not trust unverified stored tokens when the central service rejects them', async () => {
  const f = fixture()
  f.fetchImpl.mockResolvedValueOnce(reply()).mockResolvedValueOnce(new Response('', { status: 401 }))
  await f.make().authenticate('login', login)
  await expect(f.make().accessToken()).rejects.toMatchObject({ code: 'CUSTOMER_LOGIN_REQUIRED' })
  expect(f.saved.has(key)).toBe(false)
})

it('requires verification again after a cold restoration outage instead of trusting loaded storage', async () => {
  const f = fixture()
  f.fetchImpl.mockResolvedValueOnce(reply()).mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(Response.json({ version: 'orbis.customer.v1', customer }))
  await f.make().authenticate('login', login)
  const reopened = f.make()
  await expect(reopened.accessToken()).rejects.toThrow('offline')
  expect(await reopened.accessToken()).toBe('access')
  expect(f.fetchImpl).toHaveBeenCalledTimes(3)
})

it('still rejects a remotely revoked session at the live gateway boundary before data execution', async () => {
  const f = fixture(), client = f.make()
  f.fetchImpl.mockResolvedValueOnce(reply())
  await client.authenticate('login', login)
  const execute = vi.fn(), verify = vi.fn().mockResolvedValue(null)
  const handler = createKhataGateway({ origins: [], verify, execute })
  const request = createKhataDataClient({ url: 'https://data.example/khata', token: () => client.accessToken(),
    fetchImpl: async (url, init) => handler(new Request(String(url), init)) })
  await expect(request('companies', {})).rejects.toMatchObject({ code: 'KHATA_LOGIN_REQUIRED' })
  expect(verify).toHaveBeenCalledWith('access')
  expect(execute).not.toHaveBeenCalled()
  expect(f.fetchImpl).toHaveBeenCalledTimes(1)
})
