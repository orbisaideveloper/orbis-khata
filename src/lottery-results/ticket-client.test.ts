import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { checkTicket } from './ticket-client'
const auth = vi.hoisted(() => ({ accessToken: vi.fn(async () => 'central-test-token') }))
vi.mock('../auth/client', () => ({ authClient: { central: auth } }))
const ticket = { date: '2026-11-20', slot: '8pm' as const, series: '35B', number: '00220' }
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-21T05:00:00Z')); vi.stubEnv('VITE_KHATA_DATA_URL', 'https://data.example/functions/v1/orbis-khata-data'); auth.accessToken.mockResolvedValue('central-test-token') })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })
it('sends only the selected ticket to its authenticated sibling service, never a provider credential', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ ...ticket, status: 'no_prize', prize: null }))
  vi.stubGlobal('fetch', fetchImpl)
  expect((await checkTicket(ticket, new AbortController().signal)).status).toBe('no_prize')
  expect(fetchImpl.mock.calls[0][0]).toBe('https://data.example/functions/v1/orbis-lottery-ticket')
  expect(fetchImpl.mock.calls[0][1]?.body).toBe(JSON.stringify(ticket))
  expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('access-token=')
})
it('fails closed on login, unavailable service, rate limit and wrong-ticket responses', async () => {
  for (const [response, reason] of [[new Response('', { status: 429 }), 'TICKET_BUSY'], [new Response('', { status: 401 }), 'TICKET_LOGIN_REQUIRED'], [new Response('', { status: 404 }), 'TICKET_UNAVAILABLE'], [new Response('x'.repeat(4097)), 'TICKET_RESPONSE_INVALID'], [Response.json({ ...ticket, date: '2026-11-19', status: 'no_prize', prize: null }), 'TICKET_RESPONSE_MISMATCH']] as const) {
    vi.stubGlobal('fetch', vi.fn(async () => response))
    await expect(checkTicket(ticket, new AbortController().signal)).rejects.toThrow(reason)
  }
  auth.accessToken.mockResolvedValueOnce(null as never)
  await expect(checkTicket(ticket, new AbortController().signal)).rejects.toThrow('TICKET_LOGIN_REQUIRED')
  vi.stubEnv('VITE_KHATA_DATA_URL', 'http://data.example/other')
  await expect(checkTicket(ticket, new AbortController().signal)).rejects.toThrow('TICKET_NOT_CONFIGURED')
})
