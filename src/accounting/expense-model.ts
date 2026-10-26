export type ExpenseCommand = {
  id: string; company: string; date: string; kind: 'charge' | 'payment' | 'reversal'; amount: string;
  category: string; payee: string; method: 'cash' | 'bank' | null; parent: string | null; reference: string; note: string
}
export type ExpenseEntry = Omit<ExpenseCommand, 'company' | 'parent' | 'date'> & {
  bill_lines?: {description:string;quantity:string;unit:string;rate:string;unit_rate?:string}[];
  effective_date: string; parent_id: string | null; reverses_id: string | null; reversed: boolean
}
export type ExpenseBill = { id: string; effective_date: string; category: string; payee: string; amount: string; due: string }
export type ExpenseReport = {
  balances: Record<string, { opening: string; movement: string; closing: string }>;
  categories: { name: string; amount: string }[]; bills: ExpenseBill[]; entries: ExpenseEntry[]; count: number
}
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(v)
function validExpenseLink(p: Record<string, unknown>) {
  const hasParent = uuid(p.parent)
  const paid = p.method === 'cash' || p.method === 'bank'
  switch (p.kind) {
    case 'charge': return p.parent === null && (p.method === null || paid)
    case 'payment': return hasParent && paid
    case 'reversal': return hasParent && p.method === null && typeof p.note === 'string' && Boolean(p.note.trim())
    default: return false
  }
}
export function expenseCommand(value: unknown): ExpenseCommand | null {
  if (!value || typeof value !== 'object') return null
  const p = value as Record<string, unknown>
  const fields = new Set(['id','company','date','kind','amount','category','payee','method','parent','reference','note'])
  if (Object.keys(p).length !== fields.size || !Object.keys(p).every(key => fields.has(key))) return null
  if (!uuid(p.id) || !uuid(p.company) || typeof p.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(p.date)) return null
  const date = new Date(p.date + 'T00:00:00Z')
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== p.date) return null
  if (typeof p.amount !== 'string' || !/^\d{1,12}$/u.test(p.amount) || BigInt(p.amount) <= 0n) return null
  if (typeof p.category !== 'string' || !p.category.trim() || p.category.length > 80 || typeof p.payee !== 'string' || p.payee.length > 120 ||
    typeof p.reference !== 'string' || p.reference.length > 80 || typeof p.note !== 'string' || p.note.length > 500) return null
  if (!validExpenseLink(p)) return null
  return p as ExpenseCommand
}
