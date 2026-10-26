import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { OverviewDetails } from './OverviewDetails'
import { BookServicesContext, type BookServices } from '../books-services'
import type { Report } from './model'
import type { ExpenseReport } from './expense-model'
vi.mock('./LedgerExplorer', () => ({ LedgerExplorer: ({ initialSelection, onBack }: { initialSelection?: { name: string }; onBack?: () => void }) => <section><h3>Ledger: {initialSelection?.name}</h3><button type="button" onClick={onBack}>Back to list</button></section> }))
afterEach(cleanup)
const report: Report = { balances: { cash: { opening: '1000', movement: '100', closing: '1100' } }, ledger_balances: {}, parties: [
  { id: 'a', name: 'Customer A', kind: 'customer', receivable: '1000', payable: '0' },
  { id: 'b', name: 'Customer B', kind: 'customer', receivable: '2000', payable: '0' },
  { id: 'z', name: 'Settled customer', kind: 'customer', receivable: '0', payable: '0' },
], entries: [], count: 0, as_of: '2026-10-26' }
const expenses: ExpenseReport = { balances: {}, bills: [], categories: [{ name: 'Rent', amount: '2500' }], entries: [], count: 0 }
function mount(kind: 'receivable' | 'payable' | 'cash' | 'bank' | 'expenses', request = vi.fn(), r = report) {
  const services: BookServices = { request, saveParty: vi.fn(), saveItem: vi.fn(), deleteParty: vi.fn(), deleteItem: vi.fn(), previous: vi.fn(), expenseBill: vi.fn() }
  const back = vi.fn()
  render(<BookServicesContext.Provider value={services}><OverviewDetails company="company" language="en" from="2026-10-01" to="2026-10-26" version={0} report={r} expenses={expenses} kind={kind} title="Overview" onBack={back}/></BookServicesContext.Provider>)
  return back
}
it('lists every due party and drills into the selected ledger, then returns to the same list', () => {
  const back = mount('receivable')
  expect(screen.getByText('₹30.00')).toBeInTheDocument()
  expect(screen.queryByText('Settled customer')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Customer B/ }))
  expect(screen.getByRole('heading', { name: 'Ledger: Customer B' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Back to list' }))
  expect(screen.getByRole('button', { name: /Customer A/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Back to home/ })); expect(back).toHaveBeenCalledOnce()
})
it('opens the expense category ledger and handles a due list with no parties', () => {
  mount('expenses'); fireEvent.click(screen.getByRole('button', { name: /Rent/ }))
  expect(screen.getByText('Ledger: Rent')).toBeInTheDocument(); cleanup()
  mount('payable'); expect(screen.getByText(/No entries for this period/)).toBeInTheDocument()
})
it('loads all cash pages and opens the party behind a receipt', async () => {
  const voucher = { id: 'last', party_id: 'a', party_name: 'Customer A', kind: 'receipt' as const, effective_date: '2026-10-25', amount_minor: '100', debit_account: 'cash' as const, credit_account: 'receivable' as const, reference: 'R51', note: '', reversed: false }
  const request = vi.fn().mockResolvedValue({ ...report, entries: [voucher], count: 51 })
  mount('cash', request, { ...report, count: 51 })
  fireEvent.click(await screen.findByRole('button', { name: 'Customer A' }))
  expect(screen.getByText('Ledger: Customer A')).toBeInTheDocument()
  expect(request).toHaveBeenCalledWith('report', { company: 'company', from: '2026-10-01', to: '2026-10-26', party: null, offset: 50 })
})
it('fails closed when a later page fails, then retries instead of showing an incomplete cash ledger', async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ...report, entries: [], count: 51 })
  mount('cash', request, { ...report, count: 51 })
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  expect(await screen.findByText(/No entries for this period/)).toBeInTheDocument()
  expect(request).toHaveBeenCalledTimes(2)
})
