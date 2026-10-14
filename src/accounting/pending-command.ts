import type { Command } from './model'

function text(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length <= limit
}
function identifier(value: unknown): value is string {
  return text(value, 128) && /^[\w-]+$/u.test(value)
}
function day(value: unknown): value is string {
  if (!text(value, 10) || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Storage is untrusted: rebuild the bounded command and discard extra fields. */
export function pendingCommand(value: unknown): Command | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const c = value as Record<string, unknown>
  if (![c.id, c.company, c.party].every(identifier) || !day(c.date)) return null
  if (!text(c.amount, 12) || !/^\d{1,12}$/u.test(c.amount) || BigInt(c.amount) <= 0n) return null
  if (typeof c.kind !== 'string' || !['sale', 'purchase', 'receipt', 'payment', 'reversal'].includes(String(c.kind))) return null
  if (c.method !== 'cash' && c.method !== 'bank') return null
  if (!text(c.reference, 80) || !text(c.note, 500)) return null
  if (c.reverses !== null && !identifier(c.reverses)) return null
  return {
    id: c.id as string, company: c.company as string, party: c.party as string,
    kind: c.kind as Command['kind'], date: c.date, amount: c.amount,
    method: c.method, reference: c.reference, note: c.note, reverses: c.reverses,
  }
}
