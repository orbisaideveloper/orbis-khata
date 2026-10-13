import { describe, expect, it, vi } from 'vitest'
import { createCentralAccount } from './client'
const customer = { orbisIdentityId: '11111111-1111-7111-8111-111111111111', displayId: 'ORB-U-23456789' }
const response = { version: 'orbis.customer.v1', customer, session: { accessToken: 'central.access', refreshToken: 'central.refresh', expiresIn: 3600 } }
function setup(values: unknown[]) {
  const saved = new Map<string, string>(), fetchImpl = vi.fn()
  for (const value of values) fetchImpl.mockResolvedValueOnce(value instanceof Response ? value : new Response(JSON.stringify(value)))
  return { account: createCentralAccount({ baseUrl: 'https://admin.example.test', fetchImpl,
    storage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => { saved.set(key, value) }, removeItem: key => { saved.delete(key) } } }), saved, fetchImpl }
}
describe('central-only Khata customer account', () => {
  it('sends signup only to Admin and uses one permanent identity for the workspace', async () => {
    const { account, saved, fetchImpl } = setup([response])
    const observe = vi.fn();account.auth.onAuthStateChange(observe)
    const result = await account.auth.signUp({ email: '9876543210', password: ' pass word ', options: { data: { first_name: 'Ajay', last_name: 'Saha', contact_phone: '' } } })
    expect(result.error).toBeNull();expect(result.data.session?.user.id).toBe(customer.orbisIdentityId)
    expect(result.data.session?.user.app_metadata).toEqual({})
    expect(fetchImpl.mock.calls[0][0]).toBe('https://admin.example.test/api/v1/customer/signup')
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ identifier: '9876543210', password: ' pass word ', name: 'Ajay Saha' })
    expect([...saved.values()].join()).not.toContain(' pass word ')
    expect(observe).toHaveBeenCalledWith('SIGNED_IN', result.data.session)
  })
  it('restores the same central ID after login without requesting a Khata-provider token', async () => {
    const { account, fetchImpl } = setup([response, { version: 'orbis.customer.v1', customer }])
    await account.auth.signInWithPassword({ email: 'a@example.test', password: 'password' })
    expect((await account.auth.getSession()).data.session?.user.user_metadata.orbis_display_id).toBe(customer.displayId)
    expect(fetchImpl.mock.calls.every(([url]) => String(url).startsWith('https://admin.example.test/'))).toBe(true)
  })
  it('clears visible access and stored tokens even when remote logout fails', async () => {
    const { account, saved } = setup([response, new Response('{}', { status: 503 })])
    const observe = vi.fn(), subscription = account.auth.onAuthStateChange(observe)
    await account.auth.signInWithPassword({ email: 'a@example.test', password: 'password' })
    const result = await account.auth.signOut({ scope: 'local' })
    expect(result.error).not.toBeNull();expect(saved.size).toBe(0)
    expect(observe).toHaveBeenLastCalledWith('SIGNED_OUT', null)
    subscription.data.subscription.unsubscribe()
    expect((await account.auth.getUser()).data.user).toBeNull()
  })
  it('fails closed on rejected login and does not use product Auth recovery', async () => {
    const { account } = setup([new Response('{}', { status: 401 })])
    expect((await account.auth.signInWithPassword({ email: 'a@example.test', password: 'bad' })).error).not.toBeNull()
    expect((await account.auth.resetPasswordForEmail('a@example.test', { redirectTo: 'https://khata.example.test' })).error?.code).toBe('CENTRAL_ACCOUNT_UNAVAILABLE')
  })
})
