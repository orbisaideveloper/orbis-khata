import { expect, it, vi } from 'vitest'
import { createTicketLookup } from './ticket-provider'
const ticket = { date: '2026-11-20', slot: '8pm' as const, series: '35B', number: '00220' }
const payload = { success: true, data: { lottery: 'dear', date: '20-11-2026', slot: '8pm', ticket: { series: '35B', number: '00220' }, status: 'win', prize: { tier: '5th', amount: 120 } } }

it('uses fixed HTTPS API, coalesces requests, caches immutable single-ticket verdicts and expires', async () => {
  let now = 10000
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(payload))
  const lookup = createTicketLookup({ token: () => 'server-only-fixture', fetchImpl, now: () => now })
  const [first, second] = await Promise.all([lookup(ticket), lookup(ticket)])
  expect(fetchImpl).toHaveBeenCalledOnce()
  expect(first).toEqual(second)
  expect(JSON.stringify(first)).not.toContain('server-only-fixture')
  first.prize!.amount = 9
  expect((await lookup(ticket)).prize!.amount).toBe(120)
  expect(fetchImpl.mock.calls[0][0]).toContain('https://api.sambad.com/v2/ticket/check?')
  now += 61000
  await lookup(ticket)
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})
it('refuses wrong-draw, malformed, oversized and unavailable responses without caching failure', async () => {
  for (const response of [Response.json({ ...payload, data: { ...payload.data, date: '19-11-2026' } }), Response.json({ success: false }), new Response('x'.repeat(32769)), new Response('', { status: 401 }), new Response('', { status: 429 }), new Response('not-json')]) {
    const fetchImpl = vi.fn(async () => response)
    const lookup = createTicketLookup({ token: () => 'fixture', fetchImpl })
    await expect(lookup(ticket)).rejects.toThrow()
  }
})
it('stops excess distinct requests, missing tokens and rechecks pending results quickly', async () => {
  let now = 10000
  const fetchImpl = vi.fn(async () => Response.json({ ...payload, data: { ...payload.data, status: 'pending', prize: null } }))
  const lookup = createTicketLookup({ token: () => 'fixture', fetchImpl, now: () => now })
  await lookup(ticket)
  await expect(lookup({ ...ticket, number: '00221' })).rejects.toThrow('TICKET_BUSY')
  now += 6000
  await lookup(ticket)
  expect(fetchImpl).toHaveBeenCalledTimes(2)
  await expect(createTicketLookup({ token: () => '', fetchImpl })(ticket)).rejects.toThrow('TICKET_NOT_CONFIGURED')
})
