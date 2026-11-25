import { afterEach, expect, it, vi } from 'vitest'
import { createKhataDataClient } from './api'
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); localStorage.clear() })
it.each(['http://data.example', 'https://u@data.example', 'https://:p@data.example', 'https://data.example/?x=1', 'https://data.example/#x'])('rejects unsafe data URL %s', url => {
  expect(() => createKhataDataClient({ url, token: async () => 'token' })).toThrow('KHATA_DATA_ENDPOINT_INVALID')
})
it('rejects oversized responses and preserves only string database error codes', async () => {
  const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('x'.repeat(2000001))).mockResolvedValueOnce(Response.json({ code: 'P0001' }, { status: 422 })).mockResolvedValueOnce(Response.json({ code: 3 }, { status: 500 }))
  const request = createKhataDataClient({ url: 'https://data.example', token: async () => 'token', fetchImpl })
  await expect(request('companies', {})).rejects.toThrow('KHATA_DATA_RESPONSE_INVALID')
  await expect(request('companies', {})).rejects.toMatchObject({ code: 'P0001' })
  await expect(request('companies', {})).rejects.toMatchObject({ code: undefined })
})
it('routes all product operations to its own gateway and strips client-supplied ownership', async () => {
  vi.resetModules(); vi.stubEnv('VITE_KHATA_DATA_URL', 'https://data.example/khata')
  const accessToken = vi.fn().mockResolvedValue('central.token')
  vi.doMock('../auth/client', () => ({ authClient: { central: { accessToken } } }))
  const fetcher = vi.fn().mockImplementation(async () => Response.json({ data: [] })); vi.stubGlobal('fetch', fetcher)
  const api = await import('./api')
  await api.companies('ignored-owner')
  await api.createRecord('khata_companies', { id: 'c', name: 'Shop', owner_id: 'forged' })
  await api.report('c', '2026-01-01', '2026-01-31', '', 0)
  await api.report('c', '2026-01-01', '2026-01-31', 'p', 50)
  await api.post({ id: 'v', company: 'c', party: 'p', kind: 'sale', date: '2026-01-01', amount: '100', method: 'cash', reference: '', note: '', reverses: null })
  expect(fetcher.mock.calls.map(call => JSON.parse(call[1].body).operation)).toEqual(['companies', 'create', 'report', 'report', 'post'])
  expect(JSON.parse(fetcher.mock.calls[1][1].body).input.row).toEqual({ id: 'c', name: 'Shop' })
  expect(JSON.parse(fetcher.mock.calls[2][1].body).input.party).toBeNull()
  expect(JSON.parse(fetcher.mock.calls[3][1].body).input.party).toBe('p')
  expect(fetcher.mock.calls.every(call => call[0] === 'https://data.example/khata')).toBe(true)
  expect(accessToken).toHaveBeenCalledTimes(5)
  vi.doUnmock('../auth/client')
})
it('does not issue gateway requests when either its endpoint or account is unconfigured', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  vi.resetModules(); vi.stubEnv('VITE_KHATA_DATA_URL', '')
  await expect((await import('./api')).companies('u')).rejects.toThrow('KHATA_DATA_NOT_CONFIGURED')
  vi.resetModules(); vi.stubEnv('VITE_KHATA_DATA_URL', 'https://data.example')
  vi.doMock('../auth/client', () => ({ authClient: null }))
  await expect((await import('./api')).companies('u')).rejects.toThrow('KHATA_DATA_NOT_CONFIGURED')
  expect(fetcher).not.toHaveBeenCalled(); vi.doUnmock('../auth/client')
})

it('reads cloud companies with the matching ORBIS session only', async () => {
  vi.resetModules()
  vi.stubEnv('VITE_KHATA_DATA_URL', 'https://data.example/khata')
  const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'actor' }, access_token: 'bound.token' } } })
  vi.doMock('../auth/client', () => ({ authClient: { auth: { getSession } } }))
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ data: [{ id: 'cloud-company', name: 'Cloud' }] }))
    .mockResolvedValueOnce(Response.json({ data: [{ id: 'invalid' }] }))
  vi.stubGlobal('fetch', fetcher)
  try {
    const { readOnlineCompanies } = await import('./api')
    await expect(readOnlineCompanies('different')).rejects.toThrow('AUTH_REQUIRED')
    expect(fetcher).not.toHaveBeenCalled()
    await expect(readOnlineCompanies('actor')).resolves.toEqual([{ id: 'cloud-company', name: 'Cloud' }])
    expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { authorization: 'Bearer bound.token' } })
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ operation: 'companies', input: {} })
    await expect(readOnlineCompanies('actor')).rejects.toThrow('KHATA_COMPANY_LIST_INVALID')
  } finally {
    vi.doUnmock('../auth/client')
  }
})

it('routes enrolled Sync v2 over the verified online Central session even on Android local-first', async () => {
  vi.resetModules()
  vi.stubEnv('VITE_KHATA_DATA_URL', 'https://data.example/khata')
  vi.doMock('../native-local/route', () => ({ androidLocalFirst: () => true }))
  const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'actor' }, access_token: 'verified.central.token' } } })
  vi.doMock('../auth/client', () => ({ authClient: { auth: { getSession } } }))
  const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { from: '0', next: '1', groups: [] } }))
  vi.stubGlobal('fetch', fetcher)
  try {
    const api = await import('./api')
    await expect(api.requestOnlineLotterySync('wrong-actor', { action: 'feed' })).rejects.toThrow('AUTH_REQUIRED')
    expect(fetcher).not.toHaveBeenCalled()
    const input = { action: 'feed', organization: 'org', epoch: 'v1', registration: 'device', credential: 'private-proof', cursor: '0', limit: 250 }
    await expect(api.requestOnlineLotterySync('actor', input)).resolves.toMatchObject({ from: '0', next: '1' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { authorization: 'Bearer verified.central.token' } })
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ version: 'orbis.khata.data.v1', operation: 'lottery-sync', input })
    expect(fetcher.mock.calls[0][0]).toBe('https://data.example/khata')
  } finally {
    vi.doUnmock('../native-local/route')
    vi.doUnmock('../auth/client')
  }
})

it('refuses unsupported v2 requests and offline/unverified identity without local fallback', async () => {
  vi.resetModules()
  vi.stubEnv('VITE_KHATA_DATA_URL', 'https://data.example/khata')
  vi.doMock('../native-local/route', () => ({ androidLocalFirst: () => true }))
  const getSession = vi.fn().mockResolvedValue({ data: { session: null } })
  vi.doMock('../auth/client', () => ({ authClient: { auth: { getSession } } }))
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  try {
    const api = await import('./api')
    await expect(api.requestOnlineLotterySync('actor', { action: 'unknown-financial-post' }))
      .rejects.toThrow('SYNC_ACTION_UNSUPPORTED')
    await expect(api.requestOnlineLotterySync('actor', { action: 'payment' })).rejects.toThrow('AUTH_REQUIRED')
    expect(fetcher).not.toHaveBeenCalled()
  } finally {
    vi.doUnmock('../native-local/route')
    vi.doUnmock('../auth/client')
  }
})

it('connects the existing Lottery v2 transport to the verified online gateway without using legacy lottery posting', async () => {
  vi.resetModules()
  vi.stubEnv('VITE_KHATA_DATA_URL', 'https://data.example/khata')
  vi.doMock('../native-local/route', () => ({ androidLocalFirst: () => true }))
  const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'actor' }, access_token: 'bound.token' } } })
  vi.doMock('../auth/client', () => ({ authClient: { auth: { getSession } } }))
  const response = { scopeKind: 'lottery-organization', scopeId: 'org', epoch: 'v1', from: '0', next: '1', groups: [] }
  const fetcher = vi.fn().mockResolvedValue(Response.json({ data: response }))
  vi.stubGlobal('fetch', fetcher)
  try {
    const { requestOnlineLotterySync } = await import('./api')
    const { createLotteryPaymentTransport } = await import('../sync-v2/lottery-payment-outbox')
    const binding = { scope: { kind: 'lottery-organization' as const, id: 'org', epoch: 'v1' }, registration: 'reg', credential: 'private-proof' }
    const transport = createLotteryPaymentTransport(
      <T>(_operation: string, input: unknown) => requestOnlineLotterySync<T>('actor', input), binding)
    expect(await transport.feed('0')).toEqual(response)
    const payload = JSON.parse(fetcher.mock.calls[0][1].body)
    expect(payload).toEqual({ version: 'orbis.khata.data.v1', operation: 'lottery-sync', input: {
      action: 'feed', credential: 'private-proof', organization: 'org', epoch: 'v1', registration: 'reg', cursor: '0', limit: 250,
    } })
    expect(fetcher).toHaveBeenCalledTimes(1)
  } finally {
    vi.doUnmock('../native-local/route')
    vi.doUnmock('../auth/client')
  }
})
