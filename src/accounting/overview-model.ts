import { balance, type Report } from './model'
import type { ExpenseReport } from './expense-model'
import type { LedgerEntity } from './LedgerExplorer'
export type OverviewKind = 'receivable' | 'payable' | 'cash' | 'bank' | 'expenses'
export type OverviewRow = LedgerEntity & { amount: string }
export function dueRows(report: Report, expenses: ExpenseReport, kind: 'receivable' | 'payable'): OverviewRow[] {
  const rows: OverviewRow[] = report.parties.filter(p => p.kind !== 'expense' && BigInt(p[kind]) > 0n).map(p => ({ id: p.id, name: p.name, type: 'party', amount: p[kind] }))
  if (kind === 'receivable') return rows
  const payees = new Map<string, OverviewRow>()
  for (const bill of expenses.bills) {
    if (BigInt(bill.due) <= 0n) continue
    const name = bill.payee || bill.category, key = JSON.stringify([bill.payee, bill.payee ? '' : bill.category])
    const previous = payees.get(key)
    if (previous) { previous.amount = String(BigInt(previous.amount) + BigInt(bill.due)); continue }
    const matching = report.parties.filter(p => p.kind === 'expense' && p.name === bill.payee)
    payees.set(key, { id: 'expense-payee:' + key, name, type: 'expense', amount: bill.due,
      ...(bill.payee ? { payee: bill.payee } : { category: bill.category }),
      ...(matching.length === 1 ? { partyId: matching[0].id } : {}),
    })
  }
  return [...rows, ...payees.values()].sort((a, b) => a.name.localeCompare(b.name))
}
export function overviewAmount(report: Report, expenses: ExpenseReport, kind: OverviewKind): bigint {
  if (kind === 'receivable' || kind === 'payable') return dueRows(report, expenses, kind).reduce((sum, row) => sum + BigInt(row.amount), 0n)
  return balance(report, kind, kind === 'expenses' ? 'movement' : 'closing')
}
export type MoneyRow = { id: string; date: string; name: string; amount: string; reference: string; kind: string; ledger: LedgerEntity }
export function moneyRows(report: Report, expenses: ExpenseReport, account: 'cash' | 'bank'): MoneyRow[] {
  const trades = report.entries.filter(v => v.debit_account === account || v.credit_account === account).map(v => ({
    id: 'trade:' + v.id, date: v.effective_date, name: v.party_name,
    amount: String(BigInt(v.amount_minor) * (v.debit_account === account ? 1n : -1n)), reference: v.reference, kind: v.kind,
    ledger: { id: v.party_id, name: v.party_name, type: 'party' as const },
  }))
  const costs = expenses.entries.filter(e => e.method === account).map(e => ({
    id: 'expense:' + e.id, date: e.effective_date, name: e.payee || e.category,
    amount: String(BigInt(e.amount) * (e.kind === 'reversal' ? 1n : -1n)), reference: e.reference, kind: e.kind,
    ledger: { id: 'expense-payee:' + e.payee + ':' + e.category, name: e.payee || e.category, type: 'expense' as const, ...(e.payee ? { payee: e.payee } : { category: e.category }) },
  }))
  return [...trades, ...costs].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}
