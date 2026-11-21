import { afterEach, expect, it, vi } from 'vitest'
import { createTicketGateway } from './ticket-gateway'
const ticket = { date: '2026-11-20', slot: '8pm', series: '35B', number: '00220' }
const makeRequest = (input = ticket, headers = {}, method = 'POST') => new Request('https://data.example/ticket', { method, headers: { origin: 'https://app.example', authorization: 'Bearer test-session', 'content-type': 'application/json', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(input) } : {}) })
afterEach(() => vi.useRealTimers())
const setup = () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-21T05:00:00Z'))
  const verify = vi.fn(async () => ({ orbisIdentityId: 'synthetic-user' }))
  const lookup = vi.fn(async () => ({ ...ticket, slot: '8pm' as const, status: 'no_prize' as const, prize: null }))
  return { verify, lookup, handler: createTicketGateway({ origins: ['https://app.example'], verify, lookup }) }
}
it('enforces origin, bearer verification, method and safe preflight before provider requests', async () => {
  const { handler, verify, lookup } = setup()
  expect((await handler(makeRequest(ticket, { origin: 'https://evil.test' }))).status).toBe(403)
  expect((await handler(makeRequest(ticket, { authorization: '' }))).status).toBe(401)
  expect((await handler(makeRequest(ticket, {}, 'GET'))).status).toBe(405)
  expect((await handler(makeRequest(ticket, {}, 'OPTIONS'))).status).toBe(204)
  lookup.mockClear(); verify.mockResolvedValueOnce(null as never)
  expect((await handler(makeRequest())).status).toBe(401)
  expect(lookup).not.toHaveBeenCalled()
})
it('returns only single-ticket verdict, rate limits verified identity and rejects invalid input', async () => {
  const { handler, lookup } = setup()
  const response = await handler(makeRequest())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ...ticket, status: 'no_prize', prize: null })
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect((await handler(makeRequest())).status).toBe(429)
  vi.advanceTimersByTime(3001)
  expect((await handler(makeRequest({ ...ticket, number: 'bad' }))).status).toBe(400)
  expect(lookup).toHaveBeenCalledOnce()
})
it('does not expose provider errors, tokens or raw datasets and rejects mismatched acknowledgement', async () => {
  const { handler, lookup } = setup()
  lookup.mockRejectedValueOnce(new Error('https://private?access-token=secret'))
  const response = await handler(makeRequest())
  expect(response.status).toBe(503)
  expect(await response.text()).toBe('{"code":"TICKET_UNAVAILABLE"}')
  vi.advanceTimersByTime(3001)
  lookup.mockResolvedValueOnce({ ...ticket, slot: '8pm', date: '2026-11-19', status: 'no_prize', prize: null })
  expect((await handler(makeRequest())).status).toBe(503)
})

it('bounds incoming payload bytes and rejects unsupported content types before lookup', async () => {
  const { handler, lookup } = setup()
  expect((await handler(makeRequest(ticket, { 'content-type': 'text/plain' }))).status).toBe(415)
  vi.advanceTimersByTime(3001)
  expect((await handler(makeRequest(ticket, { 'content-length': '5000' }))).status).toBe(413)
  vi.advanceTimersByTime(3001)
  const large = new Request('https://data.example/ticket', { method: 'POST', headers: { origin: 'https://app.example', authorization: 'Bearer fixture', 'content-type': 'application/json' }, body: 'x'.repeat(1025) })
  expect((await handler(large)).status).toBe(413)
  expect(lookup).not.toHaveBeenCalled()
})
