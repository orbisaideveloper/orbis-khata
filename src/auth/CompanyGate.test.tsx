import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CompanyGate } from './CompanyGate'
const api = vi.hoisted(() => ({ companies: vi.fn(), report: vi.fn(), createRecord: vi.fn(), post: vi.fn() }))
vi.mock('../accounting/api', () => api)
beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear()
  api.report.mockResolvedValue({ balances: {}, ledger_balances: {}, parties: [], entries: [], count: 0 })
})
afterEach(cleanup)
it('keeps unauthenticated preview separate from real books', () => {
  render(<CompanyGate language="en">Preview</CompanyGate>)
  expect(screen.getByText('Preview')).toBeInTheDocument(); expect(api.companies).not.toHaveBeenCalled()
})
it('loads owner companies and switches the report scope', async () => {
  api.companies.mockResolvedValue([{ id: 'a', name: 'Shop A' }, { id: 'b', name: 'Shop B' }])
  render(<CompanyGate userId="owner-a" language="en">Preview</CompanyGate>)
  await screen.findByText('ORBIS / Shop A')
  expect(api.companies).toHaveBeenCalledWith('owner-a')
  fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'b' } })
  await screen.findByText('ORBIS / Shop B')
  expect(api.report.mock.lastCall?.[0]).toBe('b')
  expect(screen.queryByText('Preview')).toBeNull()
})
it('creates another company with a stable client id and the current owner', async () => {
  api.companies.mockResolvedValue([{ id: 'a', name: 'Shop A' }])
  api.createRecord.mockResolvedValue({ id: 'b', name: 'Shop B' })
  render(<CompanyGate userId="owner-a" language="en">Preview</CompanyGate>)
  fireEvent.click(await screen.findByRole('button', { name: /New company/ }))
  fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Shop B' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create' }))
  await screen.findByText('ORBIS / Shop B')
  expect(api.createRecord).toHaveBeenCalledWith('khata_companies', { id: expect.any(String), name: 'Shop B', owner_id: 'owner-a' })
})
it('blocks books on load failure and supports retry', async () => {
  api.companies.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
  render(<CompanyGate userId="owner-a" language="en">Preview</CompanyGate>)
  await screen.findByRole('status'); expect(api.report).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByLabelText('Company name')
})
