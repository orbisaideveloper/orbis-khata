import { expect, it } from 'vitest'
import { drawFixture } from './draw.fixture'
import { matchDraw, normalizeDraw, storedDraw } from './draw-json'
const ticket = { date: '2026-11-20', slot: '8pm' as const, series: '35B', number: '00220' }
it('prioritizes full first prize, consolation, full five digits and last four while preserving zeros', () => {
  const draw = normalizeDraw(drawFixture(), ticket.date, ticket.slot)
  for (const [series, number, tier] of [['35B', '00220', '1st'], ['36B', '00220', 'cons'], ['36B', '01000', '2nd'], ['36B', '92000', '3rd'], ['36B', '93000', '4th'], ['36B', '94000', '5th']]) expect(matchDraw(draw, { ...ticket, series, number }).prize?.tier).toBe(tier)
  expect(matchDraw(draw, { ...ticket, number: '99999' }).status).toBe('no_prize')
  expect(storedDraw(draw, ticket.date, ticket.slot)).toEqual(draw)
})
it('rejects incomplete, duplicate, numeric or wrong-draw JSON before any no-prize verdict', () => {
  const mutations = [(p: ReturnType<typeof drawFixture>) => { p.date = '21-11-2026' }, (p: ReturnType<typeof drawFixture>) => { p.prizes.pop() }, (p: ReturnType<typeof drawFixture>) => { p.prizes[5].numbers.pop() }, (p: ReturnType<typeof drawFixture>) => { p.prizes[5].numbers[0] = p.prizes[5].numbers[1] }, (p: ReturnType<typeof drawFixture>) => { p.first.number = '99999' }]
  for (const mutate of mutations) { const p = drawFixture(); mutate(p); expect(() => normalizeDraw(p, ticket.date, ticket.slot)).toThrow('INVALID_DRAW_JSON') }
  const p = drawFixture(); p.status = 'pending'; expect(() => normalizeDraw(p, ticket.date, ticket.slot)).toThrow('PENDING')
  expect(() => storedDraw({}, ticket.date, ticket.slot)).toThrow()
})
