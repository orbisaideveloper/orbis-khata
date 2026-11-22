import { expect, it } from 'vitest'
import { readTicketText, parseTicket, parseVerdict, ticketFromQr } from './ticket'
const ticket = { date: '2026-11-20', slot: '8pm' as const, series: '35B', number: '00220' }

it('preserves leading zeros and enforces valid Dear series, dates and thirty-day window', () => {
  expect(parseTicket(ticket, '2026-11-21')).toEqual(ticket)
  for (const change of [{ series: '33B' }, { series: '35F' }, { number: '0220' }, { number: '2e003' }, { slot: '7pm' }, { date: '2026-02-30' }, { date: '2026-11-22' }, { date: '2026-10-22' }]) expect(() => parseTicket({ ...ticket, ...change }, '2026-11-21')).toThrow()
})
it('accepts only recognized full ticket QR text and never follows links or changes draw', () => {
  expect(ticketFromQr('35b 00220')).toEqual({ series: '35B', number: '00220' })
  expect(ticketFromQr('35B00220')).toEqual({ series: '35B', number: '00220' })
  for (const value of ['https://evil.test/35B00220', '<script>35B00220</script>', '35B00220 36B00220', '33B00220', '35F00220', '00220']) expect(ticketFromQr(value)).toBeNull()
})
it('validates same-ticket verdicts and distinguishes pending from a losing ticket', () => {
  for (const status of ['no_prize', 'pending', 'upcoming', 'not_found', 'invalid'] as const) expect(parseVerdict({ ...ticket, status, prize: null }, ticket).status).toBe(status)
  expect(parseVerdict({ ...ticket, status: 'win', prize: { tier: '5th', amount: 120 } }, ticket).prize?.amount).toBe(120)
  for (const change of [{ date: '2026-11-19' }, { slot: '6pm' }, { series: '36B' }, { number: '00221' }, { status: 'unknown' }, { prize: { tier: '5th', amount: -1 } }, { prize: null }]) expect(() => parseVerdict({ ...ticket, status: 'win', prize: { tier: '5th', amount: 120 }, ...change }, ticket)).toThrow()
  expect(() => parseVerdict({ ...ticket, status: 'pending', prize: { tier: '5th', amount: 120 } }, ticket)).toThrow()
})

it('bounds streamed bytes and preserves split UTF-8 characters', async () => {
  const encoded = new TextEncoder().encode('₹')
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoded.slice(0, 1)); controller.enqueue(encoded.slice(1)); controller.close() } })
  expect(await readTicketText(stream, 3)).toBe('₹')
  expect(await readTicketText(null, 3)).toBe('')
  await expect(readTicketText(new Response('long').body, 3)).rejects.toThrow('TICKET_BODY_TOO_LARGE')
})

it('extracts the printed Sikkim QR fields without guessing the selected draw', () => {
  expect(ticketFromQr('SK DR EMPIRE 6PM 60 201126 TKT NO: 94B 00340')).toEqual({ date: '2026-11-20', slot: '6pm', series: '94B', number: '00340' })
  for (const value of ['SK DR EMPIRE 6PM 60 311126 TKT NO: 94B 00340', 'SK DR EMPIRE 8PM 60 201126 TKT NO: 94B 00340', 'SK DR EMPIRE 6PM 60 201126 TKT NO: 94F 00340', 'SK DR EMPIRE 6PM 60 201126 TKT NO: 94B 00340 extra']) expect(ticketFromQr(value)).toBeNull()
})

it('rejects oversized QR text instead of interpreting any embedded number', () => {
  expect(ticketFromQr(' '.repeat(513) + '35B00220')).toBeNull()
})
