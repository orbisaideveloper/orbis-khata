import { expect, it, vi } from 'vitest'
import { createTicketLookup } from './ticket-provider'
import { normalizeDraw } from './draw-json'
import { drawFixture } from './draw.fixture'
const ticket = { date: '2026-11-20', slot: '8pm' as const, series: '35B', number: '00220' }
it('matches multiple tickets against the same private full draw without a per-ticket provider endpoint', async () => {
  const draw = normalizeDraw(drawFixture(), ticket.date, ticket.slot)
  const load = vi.fn(async () => ({ draw, pdf: null }))
  const lookup = createTicketLookup(load)
  expect((await lookup(ticket)).prize?.tier).toBe('1st')
  expect((await lookup({ ...ticket, series: '36B' })).prize?.tier).toBe('cons')
  expect((await lookup({ ...ticket, number: '99999' })).status).toBe('no_prize')
  expect(load.mock.calls).toHaveLength(3)
})
it('does not use a different date or slot, and preserves unavailable results', async () => {
  const draw = normalizeDraw(drawFixture(), ticket.date, ticket.slot)
  const lookup = createTicketLookup(async () => ({ draw, pdf: null }))
  await expect(lookup({ ...ticket, date: '2026-11-21' })).rejects.toThrow('INVALID_DRAW_JSON')
  expect((await createTicketLookup(async () => { throw new Error('DRAW_PENDING') })(ticket)).status).toBe('pending')
})
