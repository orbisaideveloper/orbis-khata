import type { TicketInput, TicketVerdict } from './ticket.ts'

type Prize = { tier: string; match: string; amount: number; numbers: string[] }
export type DrawJson = { date: string; slot: string; prizes: Prize[] }
const rules = [['1st', 'full', 1], ['cons', 'number', 1], ['2nd', 'number', 10], ['3rd', 'last4', 10], ['4th', 'last4', 10], ['5th', 'last4', 100]] as const
const invalid = () => new Error('INVALID_DRAW_JSON')
export function normalizeDraw(input: unknown, date: string, slot: string): DrawJson {
  const row = input as { lottery?: string; date?: string; slot?: string; status?: string; ticket_format?: string; first?: { series: string; number: string; amount: number }; prizes?: Prize[] } | null
  if (row?.lottery !== 'dear' || row.date !== date.split('-').reverse().join('-') || row.slot !== slot) throw invalid()
  if (row.status !== 'published') throw new Error('PENDING')
  if (row.ticket_format !== 'DDL5' || !Array.isArray(row.prizes) || row.prizes.length !== 6) throw invalid()
  const prizes = rules.map(([tier, match, count]) => {
    const found = row.prizes!.filter(p => p?.tier === tier)
    if (found.length !== 1) throw invalid()
    const p = found[0] as Prize & { count?: number }
    let pattern = /^\d{5}$/
    if (match === 'full') pattern = /^(?:3[4-9]|[4-9]\d)[ABCDEGHJKL] \d{5}$/
    if (match === 'last4') pattern = /^\d{4}$/
    if (p.match !== match || p.count !== count || !Number.isSafeInteger(p.amount) || p.amount <= 0 || !Array.isArray(p.numbers) || p.numbers.length !== count || new Set(p.numbers).size !== count || p.numbers.some(n => typeof n !== 'string' || !pattern.test(n))) throw invalid()
    return { tier, match, amount: p.amount, numbers: [...p.numbers] }
  })
  if (!row.first || `${row.first.series} ${row.first.number}` !== prizes[0].numbers[0] || row.first.amount !== prizes[0].amount || row.first.number !== prizes[1].numbers[0]) throw invalid()
  return { date, slot, prizes }
}
export function matchDraw(draw: DrawJson, ticket: TicketInput): TicketVerdict {
  if (draw.date !== ticket.date || draw.slot !== ticket.slot) throw invalid()
  const match = draw.prizes.find(p => p.numbers.includes(ticketCandidate(p.match, ticket)))
  return { ...ticket, status: match ? 'win' : 'no_prize', prize: match ? { tier: match.tier, amount: match.amount } : null }
}
export function storedDraw(input: unknown, date: string, slot: string): DrawJson {
  const d = input as DrawJson
  if (!d || !Array.isArray(d.prizes) || typeof d.prizes[0]?.numbers?.[0] !== 'string') throw invalid()
  const [series, number] = d.prizes[0].numbers[0].split(' ')
  if (d.date !== date || d.slot !== slot) throw invalid()
  return normalizeDraw({ lottery: 'dear', date: date.split('-').reverse().join('-'), slot, status: 'published', ticket_format: 'DDL5', first: { series, number, amount: d.prizes[0].amount }, prizes: d.prizes.map(p => ({ ...p, count: p.numbers?.length })) }, date, slot)
}

function ticketCandidate(mode: string, ticket: TicketInput): string {
  if (mode === 'full') return `${ticket.series} ${ticket.number}`
  if (mode === 'last4') return ticket.number.slice(-4)
  return ticket.number
}
