import { expect, it } from 'vitest'
import { liveDraw } from './live-draw'
it.each([
  ['2026-11-22T07:19:59Z', '1pm'],
  ['2026-11-22T07:20:00Z', '1pm'],
  ['2026-11-22T12:19:59Z', '1pm'],
  ['2026-11-22T12:20:00Z', '6pm'],
  ['2026-11-22T14:19:59Z', '6pm'],
  ['2026-11-22T14:20:00Z', '8pm'],
])('switches live draw independently at IST ten-minute boundaries: %s', (time, slot) => {
  expect(liveDraw(new Date(time))).toEqual({ date: '2026-11-22', slot })
})
it('uses the Indian date across midnight', () => {
  expect(liveDraw(new Date('2026-11-22T18:30:00Z'))).toEqual({ date: '2026-11-23', slot: '1pm' })
})
