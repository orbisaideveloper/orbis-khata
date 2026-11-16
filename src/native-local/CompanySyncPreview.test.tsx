import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CompanySyncPreview } from './CompanySyncPreview'

const { cloud, local, owner, readExport, importCompany, syncCompany } = vi.hoisted(() => ({ cloud: vi.fn(), local: vi.fn(), owner: vi.fn(), readExport: vi.fn(), importCompany: vi.fn(), syncCompany: vi.fn() }))
vi.mock('../accounting/api', () => ({ readOnlineCompanies: cloud, readOnlineCompanyExport: readExport }))
vi.mock('./runtime', () => ({ readNativeCompaniesForComparison: local, nativeLocalActor: owner, importNativeCompany: importCompany, syncNativeCompany: syncCompany }))

beforeEach(() => {
  vi.resetAllMocks()
  cloud.mockResolvedValue([{ id: 'web-1', name: 'Web store' }])
  local.mockResolvedValue([{ id: 'local-1', name: 'Phone store' }])
  owner.mockReturnValue('actor')
})
afterEach(cleanup)

function compare() {
  render(<CompanySyncPreview actor="actor" language="en" />)
  fireEvent.click(screen.getByRole('button', { name: 'View company lists' }))
}

it('shows both lists separately for the same ORBIS account', async () => {
  compare()
  expect(await screen.findByText('Web companies (1)')).toBeVisible()
  expect(screen.getByText('Companies on this phone (1)')).toBeVisible()
  expect(screen.getByText('Web store')).toBeVisible()
  expect(screen.getByText('Phone store')).toBeVisible()
  expect(cloud).toHaveBeenCalledWith('actor')
  expect(local).toHaveBeenCalledWith('actor')
})

it('never shows a partial or stale list when the account changes', async () => {
  owner.mockReturnValue('new-account')
  compare()
  expect(await screen.findByText(/Could not load both lists/u)).toBeVisible()
  expect(screen.queryByText('Web store')).toBeNull()
  expect(screen.queryByText('Phone store')).toBeNull()
})


it('previews before importing and keeps the existing phone company visible', async () => {
  const payload = {
    version: 1, actor: 'actor', company: { id: 'web-1', name: 'Web store' },
    unsupported: false, balances: { cash: '1000' }, settings: null, expenseProfiles: null,
    parties: [], entries: [], expenses: [], items: [], warehouses: [], documents: [],
    reversals: [], paymentLinks: {}, expenseBillLines: {}, fiscalCounters: {}, productionRoutes: {},
  }
  readExport.mockResolvedValue(payload)
  compare()
  fireEvent.click(await screen.findByRole('button', { name: 'Preview import' }))
  expect(await screen.findByText('₹10.00')).toBeVisible()
  expect(importCompany).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Import to this phone' }))
  expect(await screen.findByText('Company imported to this phone.')).toBeVisible()
  expect(importCompany).toHaveBeenCalledWith('actor', 'web-1', payload)
  expect(screen.getByText('Phone store')).toBeVisible()
  expect(screen.getByText('Companies on this phone (2)')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Preview import' })).toBeNull()
})


it.each([
  [undefined, /Last sync/u],
  ['KHATA_COMPANY_SYNC_CONFLICT', /No changes were saved/u],
  ['OFFLINE', /Check your connection/u],
])('reports the outcome when updating an existing company (%s)', async (reason, message) => {
  local.mockResolvedValue([{ id: 'web-1', name: 'Web store' }])
  readExport.mockResolvedValue({ source: 'web' })
  if (reason) syncCompany.mockRejectedValue(new Error(reason))
  else syncCompany.mockResolvedValue({ changed: true, syncedAt: '2026-11-16T06:00:00Z' })
  compare()
  fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }))
  expect(await screen.findByText(message)).toBeVisible()
  expect(syncCompany).toHaveBeenCalledWith('actor', 'web-1', { source: 'web' })
})
