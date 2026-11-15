import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DriveBackupPanel } from './DriveBackupPanel'

const mocks = vi.hoisted(() => ({
  recovery: vi.fn(), email: vi.fn(), hasBackup: vi.fn(), session: vi.fn(), connect: vi.fn(),
  exportBackup: vi.fn(), readKey: vi.fn(), saveKey: vi.fn(), preview: vi.fn(), restore: vi.fn(),
  upload: vi.fn(), latest: vi.fn(),
}))
vi.mock('../auth/client', () => ({ authClient: { auth: { getSession: mocks.session } } }))
vi.mock('../accounting/api', () => ({ requestDriveRecovery: mocks.recovery }))
vi.mock('../sync/drive-backup', () => ({ connectBackupDrive: mocks.connect }))
vi.mock('./runtime', () => ({
  readNativeDriveRecoveryKey: mocks.readKey, saveNativeDriveRecoveryKey: mocks.saveKey,
  exportNativeFinancialBackup: mocks.exportBackup, previewNativeFinancialBackup: mocks.preview,
  restoreNativeFinancialBackup: mocks.restore,
}))

const actor = '01234567-89ab-7def-8123-456789abcdef'
const email = 'user@example.com'
const record = { email, key: 'aa'.repeat(32) }
const archive = new Uint8Array([1, 2, 3])
const mount = () => render(<DriveBackupPanel actor={actor} language="en" />)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.session.mockResolvedValue({ data: { session: { user: { id: actor } } }, error: null })
  mocks.recovery.mockImplementation(async (_actor, saved) => saved ?? null)
  mocks.connect.mockResolvedValue({ upload: mocks.upload, latest: mocks.latest, hasBackup: mocks.hasBackup, accountEmail: mocks.email })
  mocks.email.mockResolvedValue(email)
  mocks.readKey.mockResolvedValue(null)
  mocks.exportBackup.mockResolvedValue(archive)
  mocks.latest.mockResolvedValue(archive)
  mocks.preview.mockResolvedValue({ companies: 2, entries: 3 })
})
afterEach(cleanup)

it('confirms the first Drive account and links a generated key without showing it', async () => {
  mount()
  click('Back up now')
  await screen.findByText(email)
  expect(mocks.connect).toHaveBeenNthCalledWith(1, actor)
  expect(mocks.upload).not.toHaveBeenCalled()
  click('Confirm and back up')
  await screen.findByText(/Backup saved to Drive/u)
  expect(mocks.connect).toHaveBeenNthCalledWith(2, actor, email)
  expect(mocks.recovery).toHaveBeenLastCalledWith(actor, { email, key: expect.stringMatching(/^[0-9a-f]{64}$/u) })
  expect(mocks.upload).toHaveBeenCalledExactlyOnceWith(archive)
  expect(screen.queryByLabelText(/recovery key/iu)).toBeNull()
})

it('reuses a linked account and key for another backup', async () => {
  mocks.recovery.mockResolvedValue(record)
  mocks.hasBackup.mockResolvedValue(true)
  mocks.readKey.mockResolvedValue(record.key)
  mount()
  click('Back up now')
  await screen.findByText(/Backup saved to Drive/u)
  expect(mocks.connect).toHaveBeenCalledWith(actor, email)
  expect(mocks.recovery).toHaveBeenCalledExactlyOnceWith(actor)
  expect(mocks.saveKey).toHaveBeenCalledWith(actor, record.key)
  expect(screen.queryByRole('button', { name: 'Confirm and back up' })).toBeNull()
})

it('restores from a linked account on a clean device after preview and confirmation', async () => {
  mocks.recovery.mockResolvedValue(record)
  mocks.restore.mockRejectedValueOnce(new Error('FINANCIAL_RESTORE_REQUIRES_EMPTY_ACCOUNT'))
  mount()
  click('Preview restore')
  await screen.findByText(/Companies 2 · Ledger entries 3/u)
  expect(mocks.connect).toHaveBeenCalledWith(actor, email)
  expect(mocks.restore).not.toHaveBeenCalled()
  click('Restore to empty account')
  await screen.findByText('Restore requires an empty local account.')
  click('Restore to empty account')
  await screen.findByText('Accounts restored. Open Khata to review them.')
  expect(mocks.restore).toHaveBeenLastCalledWith(archive, actor, new Uint8Array(32).fill(0xaa))
  expect(screen.queryByLabelText(/recovery key/iu)).toBeNull()
})

it('keeps an existing backup and asks for the old key only when previewing a legacy archive', async () => {
  mocks.hasBackup.mockResolvedValue(true)
  mount()
  click('Back up now')
  await screen.findByText('An existing backup was found. Preview it first.')
  expect(mocks.upload).not.toHaveBeenCalled()
  click('Preview restore')
  const key = await screen.findByLabelText('Previous recovery key')
  expect(key).toHaveAttribute('type', 'password')
  fireEvent.change(key, { target: { value: record.key } })
  click('Preview restore')
  await screen.findByText(/Companies 2/u)
  click('Restore to empty account')
  await screen.findByText('Accounts restored. Open Khata to review them.')
  expect(mocks.recovery).toHaveBeenLastCalledWith(actor, record)
})

it('stops before Drive when the ORBIS session is unavailable', async () => {
  mocks.session.mockResolvedValueOnce({ data: { session: { user: { id: 'other' } } } })
  mount()
  click('Back up now')
  await screen.findByText('Sign in to ORBIS online first.')
  expect(mocks.recovery).not.toHaveBeenCalled()
  expect(mocks.connect).not.toHaveBeenCalled()
})

it('stops an upload when a concurrent setup links a different account', async () => {
  mocks.recovery.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(record)
  mount()
  click('Back up now')
  await screen.findByText(email)
  click('Confirm and back up')
  await screen.findByText(/Action not confirmed/u)
  expect(mocks.upload).not.toHaveBeenCalled()
})
