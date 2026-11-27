import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AndroidLedgerDrive from './AndroidLedgerDrive'

const owner = '01234567-89ab-7def-8123-456789abcdef'
const email = 'ledger-simulator@example.test'
const stubs = vi.hoisted(() => ({
  backup: vi.fn(),
  history: vi.fn(),
  preview: vi.fn(),
  confirmRestore: vi.fn(),
  cancelRestore: vi.fn(),
}))
vi.mock('./drive-workflow', () => ({ createDailyLedgerDriveWorkflow: () => stubs }))
vi.mock('../native-local/runtime', () => ({}))
vi.mock('../native-local/auto-drive-backup', () => ({
  latestDriveBackupSlot: () => 100,
  withDriveBackupUpload: (action: () => Promise<void>) => action(),
}))

beforeEach(() => {
  localStorage.clear()
  vi.resetAllMocks()
})
afterEach(cleanup)
function open(onRestored = vi.fn()) {
  const view = render(<AndroidLedgerDrive owner={owner} language="en" onRestored={onRestored} />)
  screen.getByText('Daily Ledger · Google Drive backup').closest('details')!.open = true
  return view
}

it('persists only verified timestamps and retains older verified evidence after a failed retry', async () => {
  stubs.backup.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('DRIVE_BACKUP_UPLOAD_UNVERIFIED'))
  const view = open()
  fireEvent.click(screen.getByRole('button', { name: 'Back up now' }))
  expect(await screen.findByText('Verified', { exact: true })).toBeVisible()
  const last = screen.getByText(/Last verified backup on this device/u).textContent
  fireEvent.click(screen.getByRole('button', { name: 'Back up now' }))
  expect(await screen.findByText('Failed to verify', { exact: true })).toBeVisible()
  expect(screen.getByText(/Last verified backup on this device/u).textContent).toBe(last)
  view.unmount()
  open()
  expect(screen.getByText('Failed to verify', { exact: true })).toBeVisible()
  expect(screen.getByText(/Last verified backup on this device/u).textContent).toBe(last)
  const saved = JSON.parse(localStorage.getItem('khata.daily-ledger.drive.' + owner + '.backup')!)
  expect(Object.keys(saved).sort()).toEqual(['completedSlot', 'status', 'verifiedAt'])
})

it('offers explicit confirmation after a preview and refreshes only after restore', async () => {
  const file = { id: 'remote-1', size: '10', createdTime: '2026-11-28T00:00:00Z' }
  stubs.history.mockResolvedValue({ email, files: [file] })
  stubs.preview.mockResolvedValue({ email, version: file, preview: { toRestore: 2, newerLocalRows: 0 } })
  stubs.confirmRestore.mockResolvedValue({ inserted: 2, alreadyPresent: 0 })
  const onRestored = vi.fn()
  open(onRestored)
  expect(screen.queryByRole('button', { name: 'Confirm restore' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Backup history' }))
  fireEvent.click(await screen.findByRole('button', { name: /2026/u }))
  expect(await screen.findByText(/Records to restore/u)).toHaveTextContent('2')
  expect(stubs.preview).toHaveBeenCalledWith(file.id, email)
  expect(stubs.confirmRestore).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }))
  await vi.waitFor(() => expect(onRestored).toHaveBeenCalledOnce())
  expect(stubs.confirmRestore).toHaveBeenCalledOnce()
})
