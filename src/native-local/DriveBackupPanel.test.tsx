import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DriveBackupPanel } from './DriveBackupPanel'

const mocks = vi.hoisted(() => ({
  hasBackup: vi.fn(), session: vi.fn(), connect: vi.fn(), owner: vi.fn(), exportBackup: vi.fn(),
  readKey: vi.fn(), saveKey: vi.fn(), preview: vi.fn(), restore: vi.fn(), upload: vi.fn(), latest: vi.fn(),
}))
vi.mock('../auth/client', () => ({ authClient: { auth: { getSession: mocks.session } } }))
vi.mock('../sync/drive-backup', () => ({ connectBackupDrive: mocks.connect }))
vi.mock('./runtime', () => ({
  readNativeDriveRecoveryKey: mocks.readKey, saveNativeDriveRecoveryKey: mocks.saveKey,
  nativeLocalActor: mocks.owner, exportNativeFinancialBackup: mocks.exportBackup,
  previewNativeFinancialBackup: mocks.preview, restoreNativeFinancialBackup: mocks.restore,
}))

const actor = '01234567-89ab-7def-8123-456789abcdef'
const archive = new Uint8Array([1, 2, 3])
const mount = () => render(<DriveBackupPanel actor={actor} language="en" />)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const enterKey = (key: string) => fireEvent.change(screen.getByLabelText('Recovery key'), { target: { value: key } })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.session.mockResolvedValue({ data: { session: { user: { id: actor } } }, error: null })
  mocks.connect.mockResolvedValue({ upload: mocks.upload, latest: mocks.latest, hasBackup: mocks.hasBackup })
  mocks.owner.mockReturnValue(actor)
  mocks.exportBackup.mockResolvedValue(archive)
  mocks.latest.mockResolvedValue(archive)
  mocks.preview.mockResolvedValue({ companies: 2, entries: 3 })
})
afterEach(cleanup)

it('generates a recovery key and uploads only the encrypted archive', async () => {
  mount()
  click('Back up now')
  await screen.findByText('Backup saved to Drive.')
  expect((screen.getByLabelText('Recovery key') as HTMLInputElement).value).toMatch(/^[0-9a-f]{64}$/u)
  expect(screen.getByLabelText('Recovery key')).toHaveAttribute('type', 'password')
  click('Show key')
  expect(screen.getByLabelText('Recovery key')).toHaveAttribute('type', 'text')
  click('Hide key')
  expect(mocks.hasBackup).toHaveBeenCalledOnce()
  expect(mocks.connect).toHaveBeenCalledWith(actor)
  expect(mocks.exportBackup).toHaveBeenCalledWith(expect.any(Uint8Array))
  expect(mocks.upload).toHaveBeenCalledExactlyOnceWith(archive)
})

it('shows a preview before restore, reports a nonempty account, and clears the key on success', async () => {
  mocks.restore.mockRejectedValueOnce(new Error('FINANCIAL_RESTORE_REQUIRES_EMPTY_ACCOUNT'))
  mount()
  enterKey('aa'.repeat(32))
  click('Preview restore')
  await screen.findByText(/Companies 2 · Ledger entries 3/u)
  expect(mocks.restore).not.toHaveBeenCalled()
  click('Restore to empty account')
  await screen.findByText('Restore requires an empty local account.')
  click('Restore to empty account')
  await screen.findByText('Accounts restored. Open Khata to review them.')
  expect(mocks.restore).toHaveBeenLastCalledWith(archive, actor, expect.any(Uint8Array))
  expect(screen.getByLabelText('Recovery key')).toHaveValue('')
  expect(screen.queryByRole('button', { name: 'Restore to empty account' })).toBeNull()
})

it('requires the current online ORBIS identity and a valid key before connecting to Drive', async () => {
  mocks.session.mockResolvedValueOnce({ data: { session: { user: { id: 'other' } } } })
  mount()
  click('Back up now')
  await screen.findByText('Sign in to ORBIS online first.')
  enterKey('invalid')
  click('Preview restore')
  await screen.findByText(/Action not confirmed/u)
  expect(mocks.connect).not.toHaveBeenCalled()
})

it('rejects account switches and invalidates a preview when the key changes', async () => {
  mocks.owner.mockReturnValue('other')
  mount()
  enterKey('aa'.repeat(32))
  click('Back up now')
  await screen.findByText(/Action not confirmed/u)
  expect(mocks.upload).not.toHaveBeenCalled()
  click('Preview restore')
  await screen.findByText(/Companies 2/u)
  enterKey('bb'.repeat(32))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Restore to empty account' })).toBeNull())
})

it('reuses the encrypted device key on another visit', async () => {
  mocks.readKey.mockResolvedValue('aa'.repeat(32))
  mount()
  click('Back up now')
  await screen.findByText('Backup saved to Drive.')
  expect(mocks.readKey).toHaveBeenCalledWith(actor)
  expect(mocks.saveKey).toHaveBeenCalledWith(actor, 'aa'.repeat(32))
  click('Preview restore')
  await screen.findByText(/Companies 2/u)
})

it('preserves an existing Drive backup when this phone has no key', async () => {
  mocks.hasBackup.mockResolvedValue(true)
  mount()
  click('Back up now')
  await screen.findByText('An existing backup was found. Enter its recovery key.')
  expect(mocks.saveKey).not.toHaveBeenCalled()
  expect(mocks.upload).not.toHaveBeenCalled()
})
