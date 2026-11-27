import { expect, it } from 'vitest'
import { billDetails, occurrenceId, postHousehold } from './household'
import { normalize, post } from './journal'

it('derives a stable month key and due date across years and refuses catch-up', () => {
  const series = normalize({
    kind: 'billSeries', billType: 'gas', category: 'home', version: 1, id: crypto.randomUUID(),
    date: '2026-12-30', dueDate: '2026-12-28', note: '', amountMinor: '10001',
  })
  const issue = { kind: 'billOccurrence', version: 1, id: crypto.randomUUID(), seriesId: series.id,
    note: '', date: '2027-01-03' } as const
  const issued = postHousehold(issue, [post(series)], '2027-01-03')
  expect(issued.postings).toEqual([])
  expect(occurrenceId(series.id, '2027-01-01')).toEqual(occurrenceId(series.id, '2027-01-31'))
  expect(occurrenceId(series.id, '2027-01-01')).not.toEqual(occurrenceId(series.id, '2026-12-31'))
  expect(billDetails(issue, new Map([[series.id, series]]))).toMatchObject({ dueDate: '2027-01-28', amountMinor: '10001' })
  expect(() => postHousehold(issue, [post(series)], '2027-02-01')).toThrow('DAILY_OCCURRENCE_MONTH')
  expect(() => normalize({ ...series, kind: 'billSeries', billType: 'gas', category: 'home',
    dueDate: '2026-12-31', amountMinor: '10001' })).toThrow('DAILY_COMMAND_INVALID')
})
