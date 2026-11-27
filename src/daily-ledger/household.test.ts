import { expect, it } from 'vitest'
import { billDetails, occurrenceId, postHousehold } from './household'
import { normalize, post } from './journal'
import { recurringDueDate } from './calendar'

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
    dueDate: '2027-01-31', amountMinor: '10001' })).toThrow('DAILY_COMMAND_INVALID')
})

it.each([
  [2027, 28, '28 28 28 28 28 28 28 28 28 28 28 28'],
  [2027, 29, '29 28 29 29 29 29 29 29 29 29 29 29'],
  [2027, 30, '30 28 30 30 30 30 30 30 30 30 30 30'],
  [2027, 31, '31 28 31 30 31 30 31 31 30 31 30 31'],
  [2028, 28, '28 28 28 28 28 28 28 28 28 28 28 28'],
  [2028, 29, '29 29 29 29 29 29 29 29 29 29 29 29'],
  [2028, 30, '30 29 30 30 30 30 30 30 30 30 30 30'],
  [2028, 31, '31 29 31 30 31 30 31 31 30 31 30 31'],
])('keeps all 12 occurrences for year %d and anchor %d', (year, anchorDay, expectedDays) => {
  const series = normalize({
    kind: 'billSeries', billType: 'gas', category: 'home', version: 1, id: crypto.randomUUID(),
    date: year + '-01-01', dueDate: year + '-01-' + anchorDay, anchorDay, note: '', amountMinor: '10001',
  })
  const history = [post(series)]
  const seen = new Set<string>()
  for (const [index, dueDay] of expectedDays.split(' ').entries()) {
    const month = year + '-' + String(index + 1).padStart(2, '0')
    const issue = { kind: 'billOccurrence', version: 1, id: crypto.randomUUID(), seriesId: series.id,
      date: month + '-01', note: '' } as const
    const entry = postHousehold(issue, history, issue.date)
    expect(entry.postings).toEqual([])
    expect(billDetails(issue, new Map([[series.id, series]]))?.dueDate).toBe(month + '-' + dueDay)
    expect(() => postHousehold({ ...issue, date: month + '-02', id: crypto.randomUUID() },
      [entry, ...history], month + '-02')).toThrow('DAILY_OCCURRENCE_EXISTS')
    history.unshift(entry)
    seen.add(occurrenceId(issue.seriesId, issue.date))
  }
  expect(seen.size).toBe(12)
  expect(series).toMatchObject({ anchorDay })
})

it('uses Gregorian century rules and rejects invalid months and anchor values', () => {
  expect(recurringDueDate('1900-02', 31)).toBe('1900-02-28')
  expect(recurringDueDate('2000-02', 31)).toBe('2000-02-29')
  for (const anchor of [0, 32, 1.5, Number.NaN]) {
    expect(() => recurringDueDate('2028-02', anchor)).toThrow('DAILY_RECURRING_DATE_INVALID')
  }
  expect(() => recurringDueDate('2028-13', 31)).toThrow('DAILY_RECURRING_DATE_INVALID')
})

it('validates a new short-month start and retains the immutable selection into the next year', () => {
  const terms = { kind: 'billSeries', billType: 'gas', category: 'home', version: 1, id: crypto.randomUUID(),
    date: '2027-02-01', dueDate: '2027-02-28', anchorDay: 31, note: '', amountMinor: '10001' } as const
  const series = normalize(terms)
  expect(series).toEqual(terms)
  expect(() => normalize({ ...terms, dueDate: '2027-02-27' })).toThrow('DAILY_COMMAND_INVALID')
  const issue = { kind: 'billOccurrence', version: 1, id: crypto.randomUUID(), seriesId: series.id,
    note: '', date: '2028-01-01' } as const
  expect(billDetails(issue, new Map([[series.id, series]]))?.dueDate).toBe('2028-01-31')
})
