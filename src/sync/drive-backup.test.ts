// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { connectBackupDrive, connectDailyLedgerBackupDrive } from './drive-backup'

const authorize = vi.hoisted(() => vi.fn())
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ authorize }) }))
const actor = '01234567-89ab-7def-8123-456789abcdef'
const fetchDrive = vi.fn<typeof fetch>()
const file = (size: string) => Response.json({ files: [{ id: 'backup-id', size }] })

beforeEach(() => {
  authorize.mockReset().mockResolvedValue({ token: 'test-token' })
  fetchDrive.mockReset()
  vi.stubGlobal('fetch', fetchDrive)
})
afterEach(() => vi.unstubAllGlobals())

it('uploads the archive to appDataFolder and downloads the latest file for that owner', async () => {
  const bytes = new Uint8Array([1, 2, 3])
  fetchDrive.mockResolvedValueOnce(Response.json({ id: 'backup-id' }))
    .mockResolvedValueOnce(new Response(bytes))
    .mockResolvedValueOnce(file('3')).mockResolvedValueOnce(new Response(bytes))
  const drive = await connectBackupDrive(actor)
  await drive.upload(bytes)
  await expect(drive.latest()).resolves.toEqual(bytes)
  const [upload, verify, list, download] = fetchDrive.mock.calls
  expect(verify[0]).toBe(download[0])
  expect(upload[0]).toBe('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart')
  expect(upload[1]?.headers).toMatchObject({ Authorization: 'Bearer test-token' })
  const payload = await new Response(upload[1]?.body).text()
  expect(payload).toContain('"parents":["appDataFolder"]')
  const query = new URL(String(list[0])).searchParams
  expect(query.get('spaces')).toBe('appDataFolder')
  expect(query.get('orderBy')).toBe('createdTime desc')
  expect(payload).toContain(query.get('q')!.split("'")[1])
  expect(download[0]).toBe('https://www.googleapis.com/drive/v3/files/backup-id?alt=media')
})

it('requires an owner and OAuth token', async () => {
  await expect(connectBackupDrive('invalid')).rejects.toThrow('DRIVE_OWNER_INVALID')
  expect(authorize).not.toHaveBeenCalled()
  authorize.mockResolvedValueOnce({ token: '' })
  await expect(connectBackupDrive(actor)).rejects.toThrow('DRIVE_AUTH_FAILED')
})

it('reports Drive rejection and missing backup', async () => {
  const drive = await connectBackupDrive(actor)
  fetchDrive.mockResolvedValueOnce(new Response(null, { status: 403 }))
    .mockResolvedValueOnce(Response.json({ files: [] }))
  await expect(drive.upload(new Uint8Array([1]))).rejects.toThrow('DRIVE_REQUEST_FAILED')
  await expect(drive.latest()).rejects.toThrow('DRIVE_BACKUP_NOT_FOUND')
})

it('rejects an invalid size, missing body, overlong or truncated download', async () => {
  const drive = await connectBackupDrive(actor)
  fetchDrive.mockResolvedValueOnce(file('40000000'))
    .mockResolvedValueOnce(file('1')).mockResolvedValueOnce(new Response(null))
    .mockResolvedValueOnce(file('1')).mockResolvedValueOnce(new Response(new Uint8Array([1, 2])))
    .mockResolvedValueOnce(file('2')).mockResolvedValueOnce(new Response(new Uint8Array([1])))
  await expect(drive.latest()).rejects.toThrow('DRIVE_BACKUP_SIZE_INVALID')
  for (let i = 0; i < 3; i++) await expect(drive.latest()).rejects.toThrow('DRIVE_BACKUP_DOWNLOAD_INVALID')
})

it('authorizes the linked account and checks the email returned by Drive', async () => {
  const email = 'user@example.com'
  const drive = await connectBackupDrive(actor, email)
  expect(authorize).toHaveBeenCalledWith({ email })
  fetchDrive.mockResolvedValueOnce(Response.json({ user: { emailAddress: 'USER@example.com' } }))
    .mockResolvedValueOnce(Response.json({ user: { emailAddress: 'other@example.com' } }))
    .mockResolvedValueOnce(Response.json({ user: {} }))
  await expect(drive.accountEmail()).resolves.toBe(email)
  await expect(drive.accountEmail()).rejects.toThrow('DRIVE_ACCOUNT_CHANGED')
  await expect(drive.accountEmail()).rejects.toThrow('DRIVE_ACCOUNT_UNAVAILABLE')
})

it('requires the newly uploaded archive to match the sent bytes', async () => {
  fetchDrive.mockResolvedValueOnce(Response.json({ id: 'backup-id' }))
    .mockResolvedValueOnce(new Response(new Uint8Array([2])))
  const drive = await connectBackupDrive(actor)
  await expect(drive.upload(new Uint8Array([1]))).rejects.toThrow('DRIVE_BACKUP_UPLOAD_UNVERIFIED')
})

it('uses a separate Daily Ledger namespace and leaves upload acknowledgement separate from media readback', async () => {
  const address = 'ledger-fixture@example.test'
  const bytes = new Uint8Array([7, 8, 9])
  const drive = await connectDailyLedgerBackupDrive(actor, address, true)
  expect(authorize).toHaveBeenCalledWith({ email: address, silent: true })
  fetchDrive.mockResolvedValueOnce(Response.json({ user: { emailAddress: address } }))
    .mockResolvedValueOnce(file('3'))
    .mockResolvedValueOnce(Response.json({ id: 'daily-new' }))
    .mockResolvedValueOnce(new Response(bytes))
  await expect(drive.accountEmail()).resolves.toBe(address)
  await drive.history()
  const receipt = await drive.uploadPending(bytes)
  expect(fetchDrive).toHaveBeenCalledTimes(3)
  expect(receipt.id).toBe('daily-new')
  const query = new URL(String(fetchDrive.mock.calls[1][0])).searchParams
  expect(query.get('q')).toMatch(/orbis-khata-daily-ledger-v1-[a-f0-9]{64}\.bin/u)
  expect(await new Response(fetchDrive.mock.calls[2][1]?.body).text()).toContain(query.get('q')!.split("'")[1])
  await expect(drive.latest(receipt)).resolves.toEqual(bytes)
  expect(fetchDrive.mock.calls[3][0]).toBe('https://www.googleapis.com/drive/v3/files/daily-new?alt=media')
  await expect(drive.uploadPending(new Uint8Array())).rejects.toThrow('DRIVE_BACKUP_SIZE_INVALID')
  expect(fetchDrive).toHaveBeenCalledTimes(4)
})
