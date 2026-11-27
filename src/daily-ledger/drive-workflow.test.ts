import { expect, it, vi } from 'vitest'
import { createDailyLedgerDriveWorkflow } from './drive-workflow'

const email = 'ledger-test@example.test'
const manifest = { snapshot: { sha256: 'new-fixture', journalRows: 1, outboxRows: 1 } }
const createdTime = '2026-11-27T00:00:00Z'
const original = { id: 'older', size: '3', createdTime }
const uploaded = { id: 'newer', size: '3', createdTime }
const payload = new Uint8Array([9, 3, 1])

function fixture() {
  let active = true
  const drive = {
    accountEmail: vi.fn(async () => email),
    history: vi.fn(async () => [original]),
    latest: vi.fn(async () => payload.slice()),
    uploadPending: vi.fn(async (_archive: Uint8Array<ArrayBuffer>) => uploaded),
  }
  const ports = {
    authorize: vi.fn(async (_confirm: boolean) => () => { if (!active) throw new Error('ACTOR_CHANGED') }),
    recovery: vi.fn<() => Promise<unknown>>(async () => ({ email, key: '12'.repeat(32) })),
    connect: vi.fn(async () => drive),
    exportArchive: vi.fn(async () => payload.slice()),
    verifyArchive: vi.fn(async (_archive: Uint8Array<ArrayBuffer>) => manifest),
    previewRestore: vi.fn(async () => ({ manifest: { ...manifest, snapshot: { ...manifest.snapshot, sha256: 'old-fixture' } }, toRestore: 0, newerLocalRows: 1 })),
    restoreArchive: vi.fn(async (_archive: Uint8Array, _key: Uint8Array, guard: () => void) => {
      guard()
      return { inserted: 1, alreadyPresent: 0 }
    }),
  }
  return { drive, ports, workflow: createDailyLedgerDriveWorkflow(ports, () => true), switchActor: () => { active = false } }
}

it('does not open Drive without the linked key or accept a different Google account', async () => {
  const { ports, drive, workflow } = fixture()
  ports.recovery.mockResolvedValueOnce(null)
  await expect(workflow.backup(true, vi.fn())).rejects.toThrow('BACKUP_NEEDS_RECOVERY_LINK')
  expect(ports.connect).not.toHaveBeenCalled()
  drive.accountEmail.mockResolvedValueOnce('other@example.test')
  await expect(workflow.backup(true, vi.fn())).rejects.toThrow('DRIVE_ACCOUNT_CHANGED')
  expect(drive.uploadPending).not.toHaveBeenCalled()
})

it('requires an independently read and authenticated exact byte copy after successful upload', async () => {
  const { ports, drive, workflow } = fixture()
  const stages: string[] = []
  drive.latest.mockResolvedValueOnce(payload).mockResolvedValueOnce(new Uint8Array([9, 3, 2]))
  await expect(workflow.backup(true, stage => stages.push(stage))).rejects.toThrow('DRIVE_BACKUP_UPLOAD_UNVERIFIED')
  expect(stages).toEqual(['preparing', 'uploading', 'verifying'])
  expect(drive.latest).toHaveBeenLastCalledWith(uploaded)
  expect(ports.verifyArchive).toHaveBeenCalledTimes(1)
  await expect(workflow.backup(true, vi.fn())).resolves.toEqual(manifest)
  expect(ports.verifyArchive).toHaveBeenCalledTimes(3)
})

it('treats a repeat as verified only after authenticating the matching previously uploaded snapshot', async () => {
  const { ports, drive, workflow } = fixture()
  drive.uploadPending.mockRejectedValueOnce(new Error('ACK_LOST'))
  await expect(workflow.backup(true, vi.fn())).rejects.toThrow('ACK_LOST')
  drive.history.mockResolvedValueOnce([uploaded, original])
  ports.previewRestore.mockResolvedValueOnce({ manifest, toRestore: 0, newerLocalRows: 0 })
  await expect(workflow.backup(true, vi.fn())).resolves.toEqual(manifest)
  expect(drive.latest).toHaveBeenLastCalledWith(uploaded)
  expect(drive.uploadPending).toHaveBeenCalledTimes(1)
})

it('preserves a remote newer archive or unreadable latest archive without creating a competing upload', async () => {
  const { ports, drive, workflow } = fixture()
  ports.previewRestore.mockResolvedValueOnce({ manifest, toRestore: 1, newerLocalRows: 0 })
  await expect(workflow.backup(true, vi.fn())).rejects.toThrow('DAILY_DRIVE_RESTORE_NEEDED')
  drive.latest.mockRejectedValueOnce(new Error('DOWNLOAD_INTERRUPTED'))
  await expect(workflow.backup(true, vi.fn())).rejects.toThrow('DOWNLOAD_INTERRUPTED')
  expect(drive.uploadPending).not.toHaveBeenCalled()
})

it('requires a preview of a listed version and consumes consent before requesting the device credential', async () => {
  const { ports, workflow } = fixture()
  await expect(workflow.confirmRestore()).rejects.toThrow('DAILY_DRIVE_PREVIEW_REQUIRED')
  await expect(workflow.preview('other-domain-file', email)).rejects.toThrow('DRIVE_BACKUP_NOT_FOUND')
  expect(ports.restoreArchive).not.toHaveBeenCalled()
  await workflow.preview(original.id, email)
  workflow.cancelRestore()
  await expect(workflow.confirmRestore()).rejects.toThrow('DAILY_DRIVE_PREVIEW_REQUIRED')
  await workflow.preview(original.id, email)
  ports.authorize.mockRejectedValueOnce(new Error('ANDROID_DEVICE_CREDENTIAL_REQUIRED'))
  await expect(workflow.confirmRestore()).rejects.toThrow('ANDROID_DEVICE_CREDENTIAL_REQUIRED')
  await expect(workflow.confirmRestore()).rejects.toThrow('DAILY_DRIVE_PREVIEW_REQUIRED')
  expect(ports.restoreArchive).not.toHaveBeenCalled()
})

it('reauthorizes on confirmation and denies archive or local-history changes since preview', async () => {
  const { ports, workflow } = fixture()
  await workflow.preview(original.id, email)
  ports.previewRestore.mockResolvedValueOnce({ manifest, toRestore: 1, newerLocalRows: 0 })
  await expect(workflow.confirmRestore()).rejects.toThrow('DAILY_DRIVE_PREVIEW_CHANGED')
  expect(ports.authorize).toHaveBeenLastCalledWith(true)
  expect(ports.restoreArchive).not.toHaveBeenCalled()
  await workflow.preview(original.id, email)
  await expect(workflow.confirmRestore()).resolves.toEqual({ inserted: 1, alreadyPresent: 0 })
})

it('does not report upload verified when the active account changes during readback', async () => {
  const { drive, ports, workflow, switchActor } = fixture()
  drive.latest.mockResolvedValueOnce(payload).mockImplementationOnce(async () => { switchActor(); return payload })
  await expect(workflow.backup(true, vi.fn())).rejects.toThrow('ACTOR_CHANGED')
  expect(drive.uploadPending).toHaveBeenCalledOnce()
  expect(ports.verifyArchive).toHaveBeenCalledTimes(1)
})

it('verifies the captured snapshot while concurrent local changes remain in the ledger for the next backup', async () => {
  const { drive, ports, workflow } = fixture()
  let local = payload
  const later = new Uint8Array([9, 3, 1, 2])
  ports.exportArchive.mockImplementation(async () => local.slice())
  drive.uploadPending.mockImplementationOnce(async (archive: Uint8Array) => {
    expect(archive).toEqual(payload)
    local = later
    return uploaded
  })
  await expect(workflow.backup(false, vi.fn())).resolves.toEqual(manifest)
  expect(local).toEqual(later)
  expect(ports.verifyArchive.mock.calls.map(call => call[0])).toEqual([payload, payload])
})
