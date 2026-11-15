import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CompanySyncPreview } from './CompanySyncPreview'

const { cloud, local, owner } = vi.hoisted(() => ({ cloud: vi.fn(), local: vi.fn(), owner: vi.fn() }))
vi.mock('../accounting/api', () => ({ readOnlineCompanies: cloud }))
vi.mock('./runtime', () => ({ readNativeCompaniesForComparison: local, nativeLocalActor: owner }))

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
