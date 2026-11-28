import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { requestDriveRecovery } from '../accounting/api'
import { authClient } from '../auth/client'
import { connectDailyLedgerBackupDrive } from '../sync/drive-backup'
import * as native from '../native-local/runtime'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AndroidLedgerDrive from './AndroidLedgerDrive'
import { createDailyLedgerDriveWorkflow } from './drive-workflow'
import type { Session } from '@supabase/supabase-js'

const owner = '01234567-89ab-7def-8123-456789abcdef'
const email = 'ledger-simulator@example.test'
const stubs = vi.hoisted(() => ({
  backup: vi.fn(),
  history: vi.fn(),
  preview: vi.fn(),
  confirmRestore: vi.fn(),
  cancelRestore: vi.fn(),
}))
vi.mock('./drive-workflow', async importOriginal => {
  const real = await importOriginal<typeof import('./drive-workflow')>()
  return { createDailyLedgerDriveWorkflow: vi.fn(real.createDailyLedgerDriveWorkflow) }
})
vi.mock('../accounting/api', () => ({ requestDriveRecovery: vi.fn() }))
vi.mock('../auth/client', () => ({ authClient: { auth: { getSession: vi.fn() } } }))
vi.mock('../sync/drive-backup', () => ({ connectDailyLedgerBackupDrive: vi.fn() }))
vi.mock('../native-local/runtime', () => ({
  authorizeNativeDailyLedgerRecovery: vi.fn(),
  exportNativeDailyLedgerBackup: vi.fn(),
  verifyNativeDailyLedgerBackup: vi.fn(),
  previewNativeDailyLedgerRestore: vi.fn(),
  restoreNativeDailyLedgerBackup: vi.fn(),
}))
vi.mock('../native-local/auto-drive-backup', () => ({
  latestDriveBackupSlot: () => 100,
  withDriveBackupUpload: (action: () => Promise<void>) => action(),
}))

beforeEach(() => {
  localStorage.clear()
  vi.resetAllMocks()
  vi.mocked(createDailyLedgerDriveWorkflow).mockReturnValue(stubs)
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

it('checks the current Central actor before opening Drive, and reauthorizes on restore', async () => {
  const actual = await vi.importActual<typeof import('./drive-workflow')>('./drive-workflow')
  vi.mocked(createDailyLedgerDriveWorkflow).mockImplementation(actual.createDailyLedgerDriveWorkflow)
  const session = (id: string) => ({ data: { session: { user: { id } } as Session }, error: null })
  vi.mocked(authClient!.auth.getSession).mockResolvedValueOnce(session('other-owner')).mockResolvedValue(session(owner))
  const archive = new Uint8Array([1, 2, 3])
  const key = new Uint8Array(32).fill(42)
  const file = { id: 'remote-1', size: '3', createdTime: '2026-11-28T00:00:00Z' }
  const manifest = { version: 1, scope: { orbisIdentityId: owner, scopeId: owner, scopeKind: 'personal_ledger' },
    snapshot: { bytes: 3, sha256: 'a'.repeat(64), journalRows: 1, outboxRows: 1 } } as const
  const recovery = vi.mocked(requestDriveRecovery)
  recovery.mockResolvedValue({ email, key: '2a'.repeat(32) })
  vi.mocked(native.authorizeNativeDailyLedgerRecovery).mockResolvedValue(() => {})
  vi.mocked(native.exportNativeDailyLedgerBackup).mockResolvedValue(archive)
  vi.mocked(native.verifyNativeDailyLedgerBackup).mockResolvedValue(manifest)
  vi.mocked(native.previewNativeDailyLedgerRestore).mockResolvedValue({ manifest, toRestore: 1, newerLocalRows: 0 })
  vi.mocked(native.restoreNativeDailyLedgerBackup).mockResolvedValue({ inserted: 1, alreadyPresent: 0 })
  const drive = {
    accountEmail: vi.fn(async () => email),
    hasBackup: vi.fn(async () => true),
    history: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([file]),
    uploadPending: vi.fn(async () => file),
    latest: vi.fn(async () => archive.slice()),
  }
  vi.mocked(connectDailyLedgerBackupDrive).mockResolvedValue(drive)

  const restored = vi.fn()
  open(restored)
  const backup = screen.getByRole('button', { name: 'Back up now' })
  fireEvent.click(backup)
  expect(await screen.findByText('Failed to verify', { exact: true })).toBeVisible()
  expect(recovery).not.toHaveBeenCalled()
  expect(drive.uploadPending).not.toHaveBeenCalled()
  fireEvent.click(backup)
  expect(await screen.findByText('Verified', { exact: true })).toBeVisible()
  expect(connectDailyLedgerBackupDrive).toHaveBeenCalledWith(owner, email, false)
  expect(drive.uploadPending).toHaveBeenCalledExactlyOnceWith(archive)
  expect(drive.latest).toHaveBeenCalledExactlyOnceWith(file)
  expect(native.verifyNativeDailyLedgerBackup).toHaveBeenCalledTimes(2)
  expect(native.verifyNativeDailyLedgerBackup).toHaveBeenLastCalledWith(owner, archive, key)
  fireEvent.click(screen.getByRole('button', { name: 'Backup history' }))
  fireEvent.click(await screen.findByRole('button', { name: /2026/u }))
  const confirm = await screen.findByRole('button', { name: 'Confirm restore' })
  expect(native.restoreNativeDailyLedgerBackup).not.toHaveBeenCalled()
  fireEvent.click(confirm)
  await vi.waitFor(() => expect(restored).toHaveBeenCalledOnce())
  expect(native.authorizeNativeDailyLedgerRecovery).toHaveBeenLastCalledWith(owner, true)
  expect(native.restoreNativeDailyLedgerBackup).toHaveBeenCalledExactlyOnceWith(owner, archive, key, expect.any(Function))
})

it('honors foreground-only scheduling and does not upload the same completed slot twice', async () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  try {
    stubs.backup.mockResolvedValue(undefined)
    open()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Automatic backup' }))
    expect(stubs.backup).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    fireEvent(document, new Event('visibilitychange'))
    expect(await screen.findByText('Verified', { exact: true })).toBeVisible()
    expect(stubs.backup).toHaveBeenCalledExactlyOnceWith(true, expect.any(Function))
    fireEvent(window, new Event('online'))
    expect(stubs.backup).toHaveBeenCalledTimes(1)
  } finally { visibility.mockRestore() }
})
