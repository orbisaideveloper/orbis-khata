export type ExpenseCommand = {
  id: string; company: string; date: string; kind: 'charge' | 'payment' | 'reversal'; amount: string;
  category: string; payee: string; method: 'cash' | 'bank' | null; parent: string | null; reference: string; note: string
}
export type ExpenseEntry = Omit<ExpenseCommand, 'company' | 'parent' | 'date'> & {
  effective_date: string; parent_id: string | null; reverses_id: string | null; reversed: boolean
}
export type ExpenseBill = { id: string; effective_date: string; category: string; payee: string; amount: string; due: string }
export type ExpenseReport = {
  balances: Record<string, { opening: string; movement: string; closing: string }>;
  categories: { name: string; amount: string }[]; bills: ExpenseBill[]; entries: ExpenseEntry[]; count: number
}
export function expenseCommand(value: unknown): ExpenseCommand | null {
  if (!value || typeof value !== 'object') return null
  const p = value as Record<string, unknown>
  const fields = ['id','company','date','kind','amount','category','payee','method','parent','reference','note']
  if (Object.keys(p).length !== fields.length || !Object.keys(p).every(key => fields.includes(key))) return null
  const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(v)
  if (!uuid(p.id) || !uuid(p.company) || typeof p.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(p.date)) return null
  const date = new Date(p.date + 'T00:00:00Z')
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== p.date) return null
  if (typeof p.amount !== 'string' || !/^\d{1,12}$/u.test(p.amount) || BigInt(p.amount) <= 0n) return null
  if (typeof p.category !== 'string' || !p.category.trim() || p.category.length > 80 || typeof p.payee !== 'string' || p.payee.length > 120 ||
    typeof p.reference !== 'string' || p.reference.length > 80 || typeof p.note !== 'string' || p.note.length > 500) return null
  if (p.kind === 'charge') { if (p.parent !== null || (p.method !== null && !['cash','bank'].includes(String(p.method)))) return null }
  else if (p.kind === 'payment') { if (!uuid(p.parent) || !['cash','bank'].includes(String(p.method))) return null }
  else if (p.kind === 'reversal') { if (!uuid(p.parent) || p.method !== null || !p.note.trim()) return null }
  else return null
  return p as ExpenseCommand
}
