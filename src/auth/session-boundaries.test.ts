import { afterEach, expect, it, vi } from 'vitest'
import { createCustomerSessionClient } from './customer-session'
import { createCentralAccount } from './client'
import { takeRecoveryLink } from './recovery-link'
const customer = { orbisIdentityId: '11111111-1111-7111-8111-111111111111', displayId: 'ORB-U-23456789' }
const response = { version: 'orbis.customer.v1', customer, session: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600 } }
const session = { customer, accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 3600000 }
function storage(raw: string | null = null) { return { getItem: vi.fn().mockReturnValue(raw), setItem: vi.fn(), removeItem: vi.fn() } }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes }); return { promise, resolve } }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); localStorage.clear(); history.replaceState(null, '', '/') })
it('uses platform fetch and rejects late refresh or recovery completions after signout', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  for (const mode of ['refresh', 'recovery'] as const) {
    const saved = mode === 'refresh' ? JSON.stringify({ version: 1, ...session, expiresAt: 0 }) : null
    const store = storage(saved), pending = deferred<Response>()
    fetcher.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(Response.json({ signedOut: true }))
    const client = createCustomerSessionClient({ baseUrl: 'https://admin.example', storage: store })
    const result = mode === 'refresh' ? client.restore() : client.acceptRecovery('a'.repeat(64))
    await client.logout(); pending.resolve(Response.json(response))
    await expect(result).rejects.toMatchObject({ code: 'CUSTOMER_OPERATION_CANCELLED' })
    expect(client.snapshot()).toBeNull(); expect(store.setItem).not.toHaveBeenCalled()
    fetcher.mockReset()
  }
})
it('never publishes stale account recovery/restore/login results after another action', async () => {
  for (const mode of ['recovery', 'restore', 'login'] as const) {
    const account = createCentralAccount({ baseUrl: 'https://admin.example', storage: storage(), recoveryHash: mode === 'recovery' ? 'a'.repeat(64) : null })
    const pending = deferred<typeof session | null>(), observe = vi.fn()
    account.auth.onAuthStateChange(observe)
    if (mode === 'recovery') vi.spyOn(account.central, 'acceptRecovery').mockReturnValue(pending.promise as Promise<typeof session>)
    if (mode === 'restore') vi.spyOn(account.central, 'restore').mockReturnValue(pending.promise)
    if (mode === 'login') vi.spyOn(account.central, 'authenticate').mockReturnValue(pending.promise as Promise<typeof session>)
    const result = mode === 'login' ? account.auth.signInWithPassword({ email: 'a@b.co', password: 'password' }) : account.auth.getSession()
    await account.auth.signOut({ scope: 'local' }); pending.resolve(session); const finished = await result
    expect(observe).toHaveBeenCalledTimes(1); expect(observe).toHaveBeenCalledWith('SIGNED_OUT', null)
    if (mode === 'login') expect(finished.error).not.toBeNull()
    else expect(finished.data.session).toBeNull()
  }
})
it('continues password recovery after restoration until password update succeeds', async () => {
  const account = createCentralAccount({ baseUrl: 'https://admin.example', storage: storage(), recoveryHash: 'a'.repeat(64) })
  vi.spyOn(account.central, 'acceptRecovery').mockResolvedValue(session)
  vi.spyOn(account.central, 'restore').mockResolvedValue(session)
  vi.spyOn(account.central, 'updatePassword').mockResolvedValue(undefined)
  const observe = vi.fn(); account.auth.onAuthStateChange(observe)
  await account.auth.getSession(); await account.auth.getSession()
  expect(observe.mock.calls.map(call => call[0])).toEqual(['PASSWORD_RECOVERY', 'PASSWORD_RECOVERY'])
  await account.auth.updateUser({ password: 'new-password' }); await account.auth.getSession()
  expect(observe).toHaveBeenCalledTimes(2)
})
it('maps an empty adapter login result safely without inventing a user', async () => {
  const account = createCentralAccount({ baseUrl: 'https://admin.example', storage: storage() })
  vi.spyOn(account.central, 'authenticate').mockResolvedValue(null as unknown as typeof session)
  const result = await account.auth.signInWithPassword({ email: 'a@b.co', password: 'password' })
  expect(result.data).toEqual({ session: null, user: null })
})
it('removes credentials even when the query contains an invalid recovery type', () => {
  const clean = vi.fn()
  expect(() => takeRecoveryLink('https://khata.example/?orbis_recovery=1&type=signup#token_hash=' + 'a'.repeat(64), clean)).toThrow('CENTRAL_RECOVERY_LINK_INVALID')
  expect(clean).toHaveBeenCalledWith('https://khata.example/')
})
it('initializes configured browser auth and strips recovery credentials synchronously', async () => {
  vi.resetModules(); vi.stubEnv('VITE_ORBIS_CUSTOMER_API_URL', 'https://admin.example')
  history.replaceState(null, '', '/?orbis_recovery=1#token_hash=' + 'a'.repeat(64))
  const module = await import('./client')
  expect(module.authClient).not.toBeNull(); expect(location.hash).toBe(''); expect(location.search).toBe('')
})
it('fails closed for invalid browser configuration or recovery links', async () => {
  for (const [base, path] of [['http://admin.example', '/'], ['https://admin.example', '/?orbis_recovery=1#token_hash=bad']]) {
    vi.resetModules(); vi.stubEnv('VITE_ORBIS_CUSTOMER_API_URL', base); history.replaceState(null, '', path)
    expect((await import('./client')).authClient).toBeNull()
  }
})
