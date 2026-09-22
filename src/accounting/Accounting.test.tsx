import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Accounting } from './Accounting'
import type { Command, Report } from './model'
const api = vi.hoisted(() => ({ companies: vi.fn(), report: vi.fn(), createRecord: vi.fn(), post: vi.fn(), rejected: vi.fn() }))
vi.mock('./api', () => api)
const base: Report = {
  balances: { receivable: { opening: '0', closing: '-20000', movement: '-20000' }, sales: { opening: '0', closing: '-100000', movement: '-100000' }, cash: { opening: '0', closing: '120000', movement: '120000' } },
  ledger_balances: { receivable: { opening: '0', closing: '-20000' } },
  parties: [{ id: 'p', name: 'Customer One', kind: 'customer', receivable: '-20000', payable: '0' }, { id: 's', name: 'Supplier Two', kind: 'supplier', receivable: '0', payable: '0' }],
  entries: [], count: 0, as_of: '',
}
beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear()
  api.companies.mockResolvedValue([{ id: 'c', name: 'Shop' }, { id: 'other', name: 'Other shop' }])
  api.report.mockResolvedValue(structuredClone(base)); api.post.mockResolvedValue(undefined)
})
afterEach(cleanup)
async function startReceipt() {
  render(<Accounting userId="u" language="en" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Receive money' }))
  const form = screen.getByLabelText('Amount (INR)').closest('form')!
  fireEvent.change(within(form).getByLabelText('Party'), { target: { value: 'p' } })
  fireEvent.change(within(form).getByLabelText('Amount (INR)'), { target: { value: '1200' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Review entry' }))
}
it('shows actual customer advances, not invented receivables', async () => {
  render(<Accounting userId="u" language="en" />)
  const label = await screen.findByText('Customer advances')
  expect(label.textContent).toContain('₹200.00')
  expect(screen.getByText('Customer dues', { selector: '.books-metric > span' }).parentElement?.textContent).toContain('₹0.00')
})
it('requires confirmation; retries identical payload after an uncertain failure', async () => {
  api.post.mockRejectedValueOnce(new Error('connection')).mockResolvedValueOnce(undefined)
  await startReceipt()
  expect(api.post).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Company')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  await screen.findByText('Saved successfully.')
  expect(api.post).toHaveBeenCalledTimes(2)
  expect(api.post.mock.calls[0][0]).toEqual(api.post.mock.calls[1][0])
  expect(api.post.mock.calls[0][0]).toMatchObject({ company: 'c', party: 'p', kind: 'receipt', amount: '120000', method: 'cash' })
  expect(sessionStorage.getItem('khata-pending-v1:u')).toBeNull()
})
it('cancelled confirmation never posts', async () => {
  await startReceipt(); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(api.post).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.getByLabelText('Company')).not.toBeDisabled())
})
it('restores pending payload after reload, only for its owner and company', async () => {
  const command: Command = { id: 'retry-id', company: 'other', party: 'p', kind: 'receipt', date: '2026-09-21', amount: '120000', method: 'bank', reference: '', note: '', reverses: null }
  sessionStorage.setItem('khata-pending-v1:u', JSON.stringify(command))
  render(<Accounting userId="u" language="en" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  await screen.findByText('Saved successfully.')
  expect(api.post).toHaveBeenCalledWith(command)
  expect(screen.getByLabelText('Company')).toHaveValue('other')
})
it('does not load a different users pending voucher', async () => {
  sessionStorage.setItem('khata-pending-v1:someone-else', JSON.stringify({ id: 'x', company: 'other', party: 'p', kind: 'sale', amount: '100' }))
  render(<Accounting userId="u" language="en" />)
  await screen.findByText('ORBIS / Shop')
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
})
it('does not treat a failed report refresh as a failed save', async () => {
  await startReceipt()
  api.report.mockRejectedValueOnce(new Error('network'))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }))
  await screen.findByText('Saved successfully.')
  await screen.findByRole('alert')
  expect(api.post).toHaveBeenCalledTimes(1)
  expect(sessionStorage.getItem('khata-pending-v1:u')).toBeNull()
})
it('hides stale company values while the next company loads', async () => {
  render(<Accounting userId="u" language="en" />)
  await screen.findByText('Customer advances')
  api.report.mockReturnValueOnce(new Promise(() => {}))
  fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'other' } })
  expect(screen.queryByText('Customer advances')).toBeNull()
})
it('allows correction after a definite database rejection without retrying a new ID automatically', async () => {
  api.rejected.mockReturnValue(true); api.post.mockRejectedValueOnce({ code: 'P0001' })
  await startReceipt(); fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }))
  await screen.findByText(/This entry was rejected/)
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  expect(screen.getByLabelText('Amount (INR)')).toHaveValue('1200.00')
  expect(sessionStorage.getItem('khata-pending-v1:u')).toBeNull()
})

it.each([
  ['Sale', 'sale', 'p'], ['Purchase', 'purchase', 's'], ['Pay money', 'payment', 's'],
])('reviews %s with the eligible party and exact paise before posting', async (label, kind, party) => {
  render(<Accounting userId="u" language="en" />)
  fireEvent.click(await screen.findByRole('button', { name: label }))
  const form = screen.getByLabelText('Amount (INR)').closest('form')!
  const field = within(form).getByLabelText('Party')
  expect(within(field).queryByRole('option', { name: party === 'p' ? 'Supplier Two' : 'Customer One' })).toBeNull()
  fireEvent.change(field, { target: { value: party } })
  fireEvent.change(within(form).getByLabelText('Amount (INR)'), { target: { value: '1234.56' } })
  fireEvent.change(within(form).getByLabelText('Bill / reference'), { target: { value: ' B-42 ' } })
  fireEvent.change(within(form).getByLabelText('Note / reversal reason'), { target: { value: ' settlement ' } })
  if (kind === 'payment') fireEvent.change(within(form).getByLabelText('Paid into / from'), { target: { value: 'bank' } })
  fireEvent.submit(form)
  expect(api.post).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }))
  await screen.findByText('Saved successfully.')
  expect(api.post).toHaveBeenCalledWith(expect.objectContaining({ company: 'c', party, kind, amount: '123456', reference: 'B-42', note: 'settlement', method: kind === 'payment' ? 'bank' : 'cash' }))
})
it('rejects invalid amounts and allows abandoning an unsaved form', async () => {
  render(<Accounting userId="u" language="en" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Sale' }))
  const form = screen.getByLabelText('Amount (INR)').closest('form')!
  fireEvent.change(within(form).getByLabelText('Amount (INR)'), { target: { value: '1.001' } })
  fireEvent.submit(form)
  expect(screen.getByRole('alert')).toHaveTextContent('valid positive amount')
  expect(api.post).not.toHaveBeenCalled()
  fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByLabelText('Amount (INR)')).toBeNull()
})
it('keeps date, party and pagination filters within the selected company', async () => {
  api.report.mockResolvedValue({ ...base, count: 51 })
  render(<Accounting userId="u" language="en" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
  await waitFor(() => expect(api.report.mock.lastCall?.[4]).toBe(50))
  fireEvent.click(await screen.findByRole('button', { name: 'Previous' }))
  await waitFor(() => expect(api.report.mock.lastCall?.[4]).toBe(0))
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } })
  await screen.findByText('Customer advances')
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-01-31' } })
  fireEvent.click(await screen.findByRole('button', { name: /Customer One/ }))
  await waitFor(() => expect(api.report).toHaveBeenLastCalledWith('c', '2026-01-01', '2026-01-31', 'p', 0))
  fireEvent.change(await screen.findByLabelText('Party'), { target: { value: 's' } })
  await waitFor(() => expect(api.report.mock.lastCall?.[3]).toBe('s'))
  await screen.findByText('Customer advances')
  const calls = api.report.mock.calls.length
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-02-01' } })
  expect(await screen.findByRole('alert')).toHaveTextContent('valid date range')
  expect(api.report).toHaveBeenCalledTimes(calls)
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } })
  fireEvent.click(await screen.findByRole('button', { name: 'Refresh' }))
  await screen.findByText('Customer advances')
  expect(api.report.mock.lastCall?.[0]).toBe('c')
})
it('retries party creation with the same identity and refreshes only these books', async () => {
  api.createRecord.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ id: 'new', name: 'Trader' })
  render(<Accounting userId="u" language="en" />)
  fireEvent.click(await screen.findByRole('button', { name: /Add party/ }))
  fireEvent.change(screen.getByLabelText('Party name'), { target: { value: ' Trader ' } })
  fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'both' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(screen.queryByLabelText('Party name')).toBeNull())
  expect(api.createRecord.mock.calls[0]).toEqual(api.createRecord.mock.calls[1])
  expect(api.createRecord).toHaveBeenCalledWith('khata_parties', expect.objectContaining({ company_id: 'c', name: 'Trader', kind: 'both' }))
  expect(api.report).toHaveBeenCalledTimes(2)
  fireEvent.click(await screen.findByRole('button', { name: /Add party/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByLabelText('Party name')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /New company/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByLabelText('Company name')).toBeNull()
})
it('blocks posting when recovery storage fails and warns before leaving a pending review', async () => {
  await startReceipt()
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  const storage = vi.spyOn(Object.getPrototypeOf(sessionStorage), 'setItem').mockImplementation(() => { throw new Error('quota') })
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }))
    expect(storage).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent('Browser storage is unavailable')
    expect(api.post).not.toHaveBeenCalled()
  } finally { storage.mockRestore() }
})
it.each(['{broken', '{"kind":"sale"}'])('ignores malformed pending data: %s', async raw => {
  sessionStorage.setItem('khata-pending-v1:u', raw)
  render(<Accounting userId="u" language="en" />)
  expect(await screen.findByRole('button', { name: 'Receive money' })).toBeEnabled()
  expect(screen.getByLabelText('Company')).toBeEnabled()
})
it('reviews a correction with the original amount and voucher identity', async () => {
  api.report.mockResolvedValue({ ...base, entries: [{ id: 'original', party_id: 'p', party_name: 'Customer One', kind: 'sale', effective_date: '2026-01-01', amount_minor: '10000', debit_account: 'receivable', credit_account: 'sales', reference: 'B-1', note: 'original bill', reversed: false }], count: 1 })
  render(<Accounting userId="u" language="en" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Reverse' }))
  expect(screen.queryByLabelText('Amount (INR)')).toBeNull()
  fireEvent.change(screen.getByLabelText('Note / reversal reason'), { target: { value: 'Wrong date' } })
  fireEvent.click(screen.getByRole('button', { name: 'Review entry' }))
  expect(api.post).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }))
  await screen.findByText('Saved successfully.')
  expect(api.post).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reversal', reverses: 'original', amount: '10000', party: 'p', note: 'Wrong date' }))
})
