/** Shared protocol client. Integrate in product adapters; it grants no owner rights. */
export type CentralCustomer = { orbisIdentityId: string; displayId: string }
export type CentralSession = { customer: CentralCustomer; accessToken: string; refreshToken: string; expiresAt: number }
export type CustomerStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export class CustomerSessionError extends Error {
  readonly code: string
  constructor(code: string) { super(code); this.code = code }
}
const storageKey = 'orbis.central.customer.v1'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
function customer(value: unknown): CentralCustomer {
  if (!value || typeof value !== 'object' || !('orbisIdentityId' in value) || !('displayId' in value) ||
      typeof value.orbisIdentityId !== 'string' || !uuid.test(value.orbisIdentityId) ||
      typeof value.displayId !== 'string' || !/^ORB-U-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/u.test(value.displayId)) {
    throw new CustomerSessionError('CUSTOMER_RESPONSE_INVALID')
  }
  return { orbisIdentityId: value.orbisIdentityId, displayId: value.displayId }
}
function session(value: unknown, now: number): CentralSession {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 'orbis.customer.v1' ||
      !('session' in value) || !value.session || typeof value.session !== 'object' || !('customer' in value)) {
    throw new CustomerSessionError('CUSTOMER_RESPONSE_INVALID')
  }
  const tokens = value.session
  if (!('accessToken' in tokens) || !('refreshToken' in tokens) || !('expiresIn' in tokens) ||
      typeof tokens.accessToken !== 'string' || !tokens.accessToken || tokens.accessToken.length > 8192 ||
      typeof tokens.refreshToken !== 'string' || !tokens.refreshToken || tokens.refreshToken.length > 8192 ||
      typeof tokens.expiresIn !== 'number' || !Number.isFinite(tokens.expiresIn) || tokens.expiresIn <= 0 || tokens.expiresIn > 86400) {
    throw new CustomerSessionError('CUSTOMER_RESPONSE_INVALID')
  }
  return { customer: customer(value.customer), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: now + tokens.expiresIn * 1000 }
}
export function createCustomerSessionClient(options: {
  baseUrl: string; storage: CustomerStorage; fetchImpl?: typeof fetch; now?: () => number
}) {
  const endpoint = new URL(options.baseUrl)
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    throw new CustomerSessionError('CUSTOMER_ENDPOINT_INVALID')
  }
  const now = options.now ?? Date.now
  let current: CentralSession | null = null
  let verified = false
  let revision = 0
  let restoring: Promise<CentralSession | null> | null = null
  const call = async (path: string, body?: unknown, token?: string) => {
    const response = await (options.fetchImpl ?? fetch)(endpoint.origin + '/api/v1/customer/' + path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'omit', redirect: 'error',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new CustomerSessionError(response.status === 401 ? 'CUSTOMER_LOGIN_REQUIRED' : 'CUSTOMER_SERVICE_UNAVAILABLE')
    const text = await response.text()
    if (text.length > 65536) throw new CustomerSessionError('CUSTOMER_RESPONSE_INVALID')
    return JSON.parse(text) as unknown
  }
  const clear = () => { current = null; verified = false; options.storage.removeItem(storageKey) }
  const save = (next: CentralSession, expected: number) => {
    if (revision !== expected) throw new CustomerSessionError('CUSTOMER_OPERATION_CANCELLED')
    if (current && next.customer.orbisIdentityId !== current.customer.orbisIdentityId) throw new CustomerSessionError('CUSTOMER_IDENTITY_MISMATCH')
    // Only central session material is stored. Passwords and product profiles are never persisted here.
    options.storage.setItem(storageKey, JSON.stringify({ version: 1, ...next }))
    current = next
    verified = true
    return next
  }
  const readStored = (raw: string): CentralSession => {
        if (raw.length > 20000) throw new CustomerSessionError('CUSTOMER_RESPONSE_INVALID')
        const stored = JSON.parse(raw) as CentralSession & { version: unknown }
        if (stored.version !== 1 || !Number.isFinite(stored.expiresAt)) throw new CustomerSessionError('CUSTOMER_RESPONSE_INVALID')
        const recovered = session({ version: 'orbis.customer.v1', customer: stored.customer, session: {
          accessToken: stored.accessToken, refreshToken: stored.refreshToken, expiresIn: 1,
        } }, now())
        recovered.expiresAt = stored.expiresAt
        return recovered
  }
  const restoreOnce = async (): Promise<CentralSession | null> => {
    const expected = revision
    if (!current) {
      const raw = options.storage.getItem(storageKey)
      if (!raw) return null
      try { current = readStored(raw)
      } catch { clear(); return null }
    }
    const active = current
    try {
      if (active.expiresAt <= now() + 60000) {
        return save(session(await call('refresh', { refreshToken: active.refreshToken }), now()), expected)
      }
      const result = await call('session', undefined, active.accessToken)
      if (revision !== expected) throw new CustomerSessionError('CUSTOMER_OPERATION_CANCELLED')
      if (!result || typeof result !== 'object' || !('version' in result) || result.version !== 'orbis.customer.v1' || !('customer' in result) ||
          customer(result.customer).orbisIdentityId !== active.customer.orbisIdentityId) throw new CustomerSessionError('CUSTOMER_IDENTITY_MISMATCH')
      verified = true
      return current
    } catch (error) {
      if (revision === expected) verified = false
      // Preserve refresh material on network errors; reauthentication is not forced by an outage.
      if (error instanceof CustomerSessionError && error.code === 'CUSTOMER_LOGIN_REQUIRED' && revision === expected) clear()
      throw error
    }
  }
  return {
    snapshot: () => current,
    restore() {
      restoring ??= restoreOnce().finally(() => { restoring = null })
      return restoring
    },
    async authenticate(mode: 'login' | 'signup', input: { identifier: string; password: string; name?: string }) {
      const expected = ++revision
      const next = session(await call(mode, input), now())
      // Explicit account switch is allowed; old product profiles are not deleted.
      if (revision !== expected) throw new CustomerSessionError('CUSTOMER_OPERATION_CANCELLED')
      current = null
      return save(next, expected)
    },
    async requestRecovery(email: string, redirectTo: string) {
      await call('recover', { email, redirectTo })
    },
    async acceptRecovery(tokenHash: string) {
      const expected = ++revision
      const next = session(await call('recovery', { tokenHash }), now())
      if (revision !== expected) throw new CustomerSessionError('CUSTOMER_OPERATION_CANCELLED')
      current = null
      return save(next, expected)
    },
    async updatePassword(password: string) {
      const token = (await this.restore())?.accessToken ?? null
      if (!token) throw new CustomerSessionError('CUSTOMER_LOGIN_REQUIRED')
      const result = await call('password', { password }, token)
      if (!result || typeof result !== 'object' || !('passwordUpdated' in result) || result.passwordUpdated !== true) {
        throw new CustomerSessionError('CUSTOMER_RESPONSE_INVALID')
      }
    },
    async accessToken() {
      // Join a pending verification/refresh before using any in-memory token.
      if (restoring) return (await restoring)?.accessToken ?? null
      // Product gateways verify the live central session on every data request.
      // Reuse only this runtime's session; cold starts still verify stored material.
      if (verified && current && current.expiresAt > now() + 60000) return current.accessToken
      return (await this.restore())?.accessToken ?? null
    },
    async logout() {
      let token = current?.accessToken
      if (!token) {
        try {
          const raw = options.storage.getItem(storageKey)
          const saved = raw && raw.length <= 20000 ? JSON.parse(raw) as CentralSession : null
          if (saved && typeof saved.accessToken === 'string' && saved.accessToken.length <= 8192) token = saved.accessToken
        } catch { /* Local signout still removes malformed session material. */ }
      }
      ++revision; clear()
      if (token) await call('logout', {}, token)
    },
  }
}
