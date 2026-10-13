import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { createCustomerSessionClient, type CentralSession } from './customer-session'
import { takeRecoveryLink } from './recovery-link'

class CentralAccountError extends Error { readonly code = 'CENTRAL_ACCOUNT_UNAVAILABLE' }

type Listener = (event: AuthChangeEvent, session: Session | null) => void
export function createCentralAccount(options: Parameters<typeof createCustomerSessionClient>[0] & { recoveryHash?: string | null }) {
  const central = createCustomerSessionClient(options)
  const listeners = new Set<Listener>()
  let current: Session | null = null
  let revision = 0
  let recoveryHash = options.recoveryHash ?? null
  let recoveryOperation: Promise<Session | null> | null = null
  let recovering = false
  const wrap = (value: CentralSession | null): Session | null => {
    if (!value) return null
    // This is a UI identity, not a Supabase product token or a permission claim.
    const user: User = { id: value.customer.orbisIdentityId, aud: 'authenticated', created_at: '',
      app_metadata: {}, user_metadata: { orbis_display_id: value.customer.displayId } }
    return { access_token: value.accessToken, refresh_token: value.refreshToken,
      expires_in: Math.max(0, Math.floor((value.expiresAt - Date.now()) / 1000)), expires_at: Math.floor(value.expiresAt / 1000),
      token_type: 'bearer', user }
  }
  const publish = (event: AuthChangeEvent, next: Session | null) => {
    current = next
    for (const listener of listeners) listener(event, next)
  }
  const restore = async () => {
    const expected = revision
    if (recoveryHash) {
      if (!recoveryOperation) {
        const hash = recoveryHash
        recoveryOperation = central.acceptRecovery(hash).then(value => {
          if (expected !== revision) return current
          recovering = true
          publish('PASSWORD_RECOVERY', wrap(value))
          return current
        }).finally(() => { recoveryHash = null; recoveryOperation = null })
      }
      return recoveryOperation
    }
    const next = wrap(await central.restore())
    if (expected !== revision) return current
    current = next
    if (recovering && next) publish('PASSWORD_RECOVERY', next)
    return current
  }
  const failure = () => ({ data: { session: null, user: null }, error: new CentralAccountError('CENTRAL_ACCOUNT_UNAVAILABLE') })
  const login = async (mode: 'login' | 'signup', identifier: string, password: string, name?: string) => {
    const expected = ++revision
    recovering = false; recoveryHash = null
    try {
      const next = wrap(await central.authenticate(mode, { identifier, password, ...(name ? { name } : {}) }))
      if (expected !== revision) return failure()
      publish('SIGNED_IN', next)
      return { data: { session: next, user: next?.user ?? null }, error: null }
    } catch { return failure() }
  }
  return {
    central,
    auth: {
      async getSession() {
        try { return { data: { session: await restore() }, error: null } }
        catch { return { data: { session: null }, error: new CentralAccountError('CENTRAL_ACCOUNT_UNAVAILABLE') } }
      },
      async getUser() {
        const session = await this.getSession()
        return { data: { user: session.data.session?.user ?? null }, error: session.error }
      },
      onAuthStateChange(callback: Listener) {
        listeners.add(callback)
        return { data: { subscription: { unsubscribe: () => { listeners.delete(callback) } } } }
      },
      signInWithPassword(input: { email: string; password: string }) { return login('login', input.email, input.password) },
      signUp(input: { email: string; password: string; options: { data: { first_name: string; last_name: string; contact_phone: string } } }) {
        return login('signup', input.email, input.password, [input.options.data.first_name, input.options.data.last_name].filter(Boolean).join(' '))
      },
      async signOut(_options: { scope: 'local' }) {
        ++revision; recovering = false; recoveryHash = null
        // Remove visible/private workspace access before waiting for the network.
        publish('SIGNED_OUT', null)
        try { await central.logout(); return { error: null } }
        catch { return { error: new Error('CENTRAL_SIGNOUT_REVOKE_UNAVAILABLE') } }
      },
      async resetPasswordForEmail(email: string, input: { redirectTo: string }) {
        try { await central.requestRecovery(email, input.redirectTo); return { error: null } }
        catch { return { error: new CentralAccountError('CENTRAL_ACCOUNT_UNAVAILABLE') } }
      },
      async updateUser(input: { password: string }) {
        try { await central.updatePassword(input.password); recovering = false; return { error: null } }
        catch { return { error: new CentralAccountError('CENTRAL_ACCOUNT_UNAVAILABLE') } }
      },
    },
  }
}
function configured() {
  const baseUrl = import.meta.env.VITE_ORBIS_CUSTOMER_API_URL as string | undefined
  if (!baseUrl) return null
  try {
    const recoveryHash = takeRecoveryLink(window.location.href, clean => window.history.replaceState(null, '', clean))
    return createCentralAccount({ baseUrl, storage: window.localStorage, recoveryHash })
  }
  catch { return null }
}
export const authClient = configured()
