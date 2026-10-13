import { describe, expect, it, vi } from 'vitest'
import { createCentralAccount } from './client'
import { createCustomerSessionClient } from './customer-session'
import { takeRecoveryLink } from './recovery-link'

const customer = { orbisIdentityId: '11111111-1111-7111-8111-111111111111', displayId: 'ORB-U-23456789' }
const session = { version: 'orbis.customer.v1', customer, session: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600 } }
const hash = 'a'.repeat(64)
function setup(values: unknown[], recoveryHash?: string) {
  const saved = new Map<string, string>(), fetchImpl = vi.fn()
  for (const value of values) fetchImpl.mockResolvedValueOnce(value instanceof Response ? value : Response.json(value))
  const options = { baseUrl: 'https://admin.example', recoveryHash, fetchImpl,
    storage: { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value) }, removeItem: (key: string) => { saved.delete(key) } } }
  return { account: createCentralAccount(options), options, fetchImpl, saved }
}
describe('central password recovery', () => {
  it('removes token hashes and fragment credentials before verification', () => {
    const clean = vi.fn()
    expect(takeRecoveryLink('https://khata.example/?orbis_recovery=1&token_hash=' + hash + '&keep=yes', clean)).toBe(hash)
    expect(clean).toHaveBeenCalledWith('https://khata.example/?keep=yes')
    expect(takeRecoveryLink('https://khata.example/', clean)).toBeNull()
    expect(takeRecoveryLink('https://khata.example/?orbis_recovery=1#token_hash=' + hash + '&type=recovery', clean)).toBe(hash)
    expect(clean).toHaveBeenLastCalledWith('https://khata.example/')
  })
  it.each(['', 'short', hash + '&token_hash=' + hash, hash + '#access_token=private'])('cleans malformed links and refuses them', value => {
    const clean = vi.fn()
    expect(() => takeRecoveryLink('https://khata.example/?orbis_recovery=1&token_hash=' + value, clean)).toThrow()
    expect(clean).toHaveBeenCalledWith('https://khata.example/')
  })
  it('sends email recovery only to Admin without creating a product session', async () => {
    const { account, saved, fetchImpl } = setup([{ accepted: true }])
    expect((await account.auth.resetPasswordForEmail('a@b.co', { redirectTo: 'https://khata.example/' })).error).toBeNull()
    expect(fetchImpl.mock.calls[0][0]).toBe('https://admin.example/api/v1/customer/recover')
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ email: 'a@b.co', redirectTo: 'https://khata.example/' })
    expect(saved.size).toBe(0)
  })
  it('coalesces recovery, publishes its verified central identity, and updates password with a bearer', async () => {
    const { account, saved, fetchImpl } = setup([session, { version: 'orbis.customer.v1', customer }, { passwordUpdated: true }], hash)
    const listener = vi.fn(); account.auth.onAuthStateChange(listener)
    const [first, second] = await Promise.all([account.auth.getSession(), account.auth.getSession()])
    expect(first.data.session?.user.id).toBe(customer.orbisIdentityId)
    expect(second.data.session?.user.id).toBe(customer.orbisIdentityId)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('PASSWORD_RECOVERY', first.data.session)
    expect((await account.auth.updateUser({ password: ' new password ' })).error).toBeNull()
    expect(fetchImpl.mock.calls[2][0]).toBe('https://admin.example/api/v1/customer/password')
    expect(fetchImpl.mock.calls[2][1].headers.authorization).toBe('Bearer access')
    expect([...saved.values()].join()).not.toContain(' new password ')
    expect([...saved.values()].join()).not.toContain(hash)
  })
  it('does not resurrect a recovery session after local logout', async () => {
    const { account, saved, fetchImpl } = setup([], hash)
    let resolve!: (response: Response) => void
    fetchImpl.mockReturnValueOnce(new Promise<Response>(done => { resolve = done }))
    const listener = vi.fn();account.auth.onAuthStateChange(listener)
    const pending = account.auth.getSession()
    await account.auth.signOut({ scope: 'local' })
    resolve(Response.json(session))
    expect((await pending).error).not.toBeNull()
    expect(saved.size).toBe(0)
    expect(listener).toHaveBeenCalledWith('SIGNED_OUT', null)
    expect(listener.mock.calls.some(([event]) => event === 'PASSWORD_RECOVERY')).toBe(false)
  })
  it('refuses password changes without a remotely verified session', async () => {
    const { account, fetchImpl } = setup([])
    expect((await account.auth.updateUser({ password: 'password' })).error).not.toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('fails closed on expired recovery links', async () => {
    const { account, saved } = setup([new Response('{}', { status: 401 })], hash)
    expect((await account.auth.getSession()).error).not.toBeNull()
    expect(saved.size).toBe(0)
  })
  it('rejects unconfirmed password update responses', async () => {
    const { options } = setup([session, { version: 'orbis.customer.v1', customer }, {}])
    const client = createCustomerSessionClient(options)
    await client.authenticate('login', { identifier: 'a@b.co', password: 'p' })
    await expect(client.updatePassword('password')).rejects.toMatchObject({ code: 'CUSTOMER_RESPONSE_INVALID' })
  })
})
