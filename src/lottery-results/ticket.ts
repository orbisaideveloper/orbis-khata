import { indiaDate, type DrawSlot } from './result-data.ts'

export type TicketInput = { date: string; slot: DrawSlot; series: string; number: string }
export type TicketVerdict = TicketInput & { status: 'win' | 'no_prize' | 'pending' | 'upcoming' | 'not_found' | 'invalid'; prize: { tier: string; amount: number } | null }

export function parseTicket(input: unknown, today = indiaDate()): TicketInput {
  const row = input as TicketInput | null
  if (!row || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !['1pm', '6pm', '8pm'].includes(row.slot)) throw new Error('TICKET_INVALID')
  const time = Date.parse(row.date + 'T00:00:00Z')
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== row.date) throw new Error('TICKET_INVALID')
  const days = (Date.parse(today) - time) / 86400000
  if (days < 0 || days >= 30) throw new Error('TICKET_DATE_OUTSIDE_WINDOW')
  if (typeof row.series !== 'string' || !/^(?:3[4-9]|[4-9]\d)[ABCDEGHJKL]$/.test(row.series) || typeof row.number !== 'string' || !/^\d{5}$/.test(row.number)) throw new Error('TICKET_INVALID')
  return { date: row.date, slot: row.slot, series: row.series, number: row.number }
}

export function parseVerdict(input: unknown, ticket: TicketInput): TicketVerdict {
  const value = input as TicketVerdict | null
  if (value?.date !== ticket.date || value.slot !== ticket.slot || value.series !== ticket.series || value.number !== ticket.number) throw new Error('TICKET_RESPONSE_MISMATCH')
  if (!['win', 'no_prize', 'pending', 'upcoming', 'not_found', 'invalid'].includes(value.status)) throw new Error('TICKET_RESPONSE_INVALID')
  let prize: TicketVerdict['prize'] = null
  if (value.status === 'win') {
    if (!value.prize || !['1st', 'cons', '2nd', '3rd', '4th', '5th'].includes(value.prize.tier) || !Number.isSafeInteger(value.prize.amount) || value.prize.amount <= 0) throw new Error('TICKET_RESPONSE_INVALID')
    prize = { tier: value.prize.tier, amount: value.prize.amount }
  } else if (value.prize !== null) throw new Error('TICKET_RESPONSE_INVALID')
  return { ...ticket, status: value.status, prize }
}

export function ticketFromQr(raw: string): { series: string; number: string } | null {
  // QR content is untrusted text: never navigate a URL or silently change the selected draw.
  const match = /^(\d{2}[ABCDEGHJKL])\s*(\d{5})$/.exec(raw.trim().toUpperCase())
  if (!match) return null
  const series = match[1], number = match[2]
  return /^(?:3[4-9]|[4-9]\d)[ABCDEGHJKL]$/.test(series) ? { series, number } : null
}

export async function readTicketText(body: ReadableStream<Uint8Array> | null, maximum: number): Promise<string> {
  if (!body) return ''
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let total = 0, text = ''
  try {
    while (total <= maximum) {
      const chunk = await reader.read()
      if (chunk.done) return text + decoder.decode()
      total += chunk.value.byteLength
      if (total > maximum) throw new Error('TICKET_BODY_TOO_LARGE')
      text += decoder.decode(chunk.value, { stream: true })
    }
    throw new Error('TICKET_BODY_TOO_LARGE')
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
