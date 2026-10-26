import { expect, it } from 'vitest'
import { dueRows, moneyRows, overviewAmount } from './overview-model'
import type { Report } from './model'
import type { ExpenseReport } from './expense-model'
import { demoRequest, resetDemo } from '../demo/store'
const report: Report = { balances: { cash: { opening: '0', closing: '400', movement: '400' }, expenses: { opening: '0', movement: '250', closing: '250' } }, ledger_balances: {}, parties: [
  { id: 'a', name: 'Customer A', kind: 'customer', receivable: '1000', payable: '0' },
  { id: 'b', name: 'Customer B', kind: 'customer', receivable: '2000', payable: '0' },
  { id: 'advance', name: 'Advance', kind: 'customer', receivable: '-500', payable: '0' },
  { id: 's', name: 'Supplier', kind: 'supplier', receivable: '0', payable: '3000' },
  { id: 'e', name: 'Rent owner', kind: 'expense', receivable: '0', payable: '0' },
], entries: [], count: 0, as_of: '2026-10-26' }
const bill = { id: 'e1', effective_date: '2026-10-01', category: 'Rent', payee: 'Rent owner', amount: '2000', due: '1000' }
const expenses: ExpenseReport = { balances: {}, categories: [], entries: [], count: 0, bills: [bill, { ...bill, id: 'e2', due: '500' }, { ...bill, id: 'paid', due: '0' }] }
it('keeps every due party and reconciles gross card totals without offsetting another party’s advance', () => {
  expect(dueRows(report, expenses, 'receivable').map(r => r.id)).toEqual(['a', 'b'])
  expect(overviewAmount(report, expenses, 'receivable')).toBe(3000n)
  const payable = dueRows(report, expenses, 'payable')
  expect(payable).toHaveLength(2); expect(payable.find(r => r.name === 'Rent owner')).toMatchObject({ amount: '1500', partyId: 'e' })
  expect(overviewAmount(report, expenses, 'payable')).toBe(4500n)
  expect(overviewAmount(report, expenses, 'cash')).toBe(400n); expect(overviewAmount(report, expenses, 'expenses')).toBe(250n)
})
it('does not truncate a long party list or assign an ambiguous expense name to a party ID', () => {
  const many = { ...report, parties: Array.from({ length: 75 }, (_, n) => ({ ...report.parties[0], id: String(n) })) }
  expect(dueRows(many, expenses, 'receivable')).toHaveLength(75)
  const ambiguous = { ...report, parties: [...report.parties, { ...report.parties[4], id: 'other' }] }
  expect(dueRows(ambiguous, expenses, 'payable').find(r => r.name === 'Rent owner')?.partyId).toBeUndefined()
})
it('includes cash receipts, expense payments and their corrections exactly once', () => {
  const trade = { id: 'v', party_id: 'a', party_name: 'Customer A', kind: 'receipt' as const, effective_date: '2026-10-10', amount_minor: '1000', debit_account: 'cash' as const, credit_account: 'receivable' as const, reference: 'R1', note: '', reversed: false }
  const payment = { id: 'p', effective_date: '2026-10-11', kind: 'payment' as const, amount: '300', category: 'Rent', payee: 'Rent owner', method: 'cash' as const, parent_id: 'e1', reverses_id: null, reference: '', note: '', reversed: true }
  const rows = moneyRows({ ...report, entries: [trade] }, { ...expenses, entries: [payment, { ...payment, id: 'reverse', kind: 'reversal', reverses_id: 'p' }] }, 'cash')
  expect(rows).toHaveLength(3); expect(rows.reduce((n, r) => n + BigInt(r.amount), 0n)).toBe(1000n)
  expect(moneyRows({ ...report, entries: [trade] }, expenses, 'bank')).toHaveLength(0)
})
it('keeps the demo cash drill-down consistent with the journal after reversing an expense', async () => {
  resetDemo()
  const company = '11111111-1111-4111-8111-111111111111', original = crypto.randomUUID()
  const charge = { id: original, company, date: '2026-10-20', kind: 'charge', amount: '500', category: 'Rent', payee: 'Landlord', method: 'cash', parent: null, reference: '', note: '' }
  await demoRequest('expense-post', charge)
  await demoRequest('expense-post', { ...charge, id: crypto.randomUUID(), kind: 'reversal', method: null, parent: original, note: 'Correction' })
  const range = { company, from: '2026-10-01', to: '2026-10-26', offset: 0 }
  const e = await demoRequest<ExpenseReport>('expense-report', range)
  const r = await demoRequest<Report>('report', { ...range, party: null })
  expect(e.entries.find(row => row.kind === 'reversal')?.method).toBe('cash')
  expect(moneyRows(r, e, 'cash').reduce((sum, row) => sum + BigInt(row.amount), 0n)).toBe(BigInt(r.balances.cash?.movement ?? '0'))
  resetDemo()
})
