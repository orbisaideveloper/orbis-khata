import { isAccountRecovery, recoveryKeyBytes } from '../sync/account-recovery'
import type { DriveBackupVersion } from '../sync/drive-backup'

type Bytes = Uint8Array<ArrayBuffer>
type SnapshotFacts = Readonly<{ sha256: string; journalRows: number; outboxRows: number }>
type Manifest = Readonly<{ snapshot: SnapshotFacts }>
type Preview = Readonly<{ manifest: Manifest; toRestore: number; newerLocalRows: number }>
type VersionPreview = Readonly<{ version: DriveBackupVersion; email: string; preview: Preview }>
export type BackupProgress = 'preparing' | 'uploading' | 'verifying'

interface ArchiveDrive {
  accountEmail(): Promise<string>
  history(): Promise<DriveBackupVersion[]>
  latest(version: DriveBackupVersion): Promise<Bytes>
  uploadPending(archive: Bytes): Promise<DriveBackupVersion>
}

export interface DailyLedgerDrivePorts {
  authorize(confirmCredential: boolean): Promise<() => void>
  recovery(): Promise<unknown>
  connect(email: string, silent: boolean): Promise<ArchiveDrive>
  exportArchive(key: Bytes): Promise<Bytes>
  verifyArchive(archive: Bytes, key: Bytes): Promise<Manifest>
  previewRestore(archive: Bytes, key: Bytes): Promise<Preview>
  restoreArchive(archive: Bytes, key: Bytes, guard: () => void): Promise<{ inserted: number; alreadyPresent: number }>
}

const matches = (a: Bytes, b: Bytes) => a.byteLength === b.byteLength && a.every((byte, i) => b[i] === byte)
const newVersion = (file: DriveBackupVersion) => /^[\w-]+$/u.test(file.id) && Number.isFinite(Date.parse(file.createdTime))

/** The closure holds consent metadata only. Keys and encrypted bytes are not persisted. */
export function createDailyLedgerDriveWorkflow(ports: DailyLedgerDrivePorts, available: () => boolean) {
  let staged: VersionPreview | undefined
  let busy = false

  async function session(silent: boolean, confirmCredential = false) {
    if (!available()) throw new Error('DAILY_DRIVE_UNAVAILABLE')
    const checkOwner = await ports.authorize(confirmCredential)
    const guard = () => {
      checkOwner()
      if (!available()) throw new Error('DAILY_DRIVE_UNAVAILABLE')
    }
    guard()
    const recovery = await ports.recovery()
    guard()
    if (!isAccountRecovery(recovery)) throw new Error('BACKUP_NEEDS_RECOVERY_LINK')
    const email = recovery.email.toLowerCase()
    const drive = await ports.connect(email, silent)
    guard()
    if (await drive.accountEmail() !== email) throw new Error('DRIVE_ACCOUNT_CHANGED')
    guard()
    return { email, key: recoveryKeyBytes(recovery.key), drive, guard }
  }

  async function run<T>(work: () => Promise<T>) {
    if (busy) throw new Error('DRIVE_BACKUP_BUSY')
    busy = true
    try { return await work() }
    finally { busy = false }
  }

  async function selected(drive: ArchiveDrive, id: string) {
    const file = (await drive.history()).find(row => row.id === id && newVersion(row))
    if (!file) throw new Error('DRIVE_BACKUP_NOT_FOUND')
    return file
  }

  return {
    backup(silent: boolean, progress: (stage: BackupProgress) => void) {
      return run(async () => {
        progress('preparing')
        const { drive, key, guard } = await session(silent)
        const [previous] = await drive.history()
        guard()
        let remoteDigest: string | undefined
        if (previous) {
          const before = await drive.latest(previous)
          guard()
          const candidate = await ports.previewRestore(before, key)
          if (candidate.toRestore) throw new Error('DAILY_DRIVE_RESTORE_NEEDED')
          remoteDigest = candidate.manifest.snapshot.sha256
        }
        guard()
        const archive = await ports.exportArchive(key)
        const manifest = await ports.verifyArchive(archive, key)
        guard()
        if (manifest.snapshot.sha256 === remoteDigest) return manifest
        progress('uploading')
        const uploaded = await drive.uploadPending(archive)
        guard()
        progress('verifying')
        const downloaded = await drive.latest(uploaded)
        guard()
        if (!matches(archive, downloaded)) throw new Error('DRIVE_BACKUP_UPLOAD_UNVERIFIED')
        const checked = await ports.verifyArchive(downloaded, key)
        guard()
        if (checked.snapshot.sha256 !== manifest.snapshot.sha256) throw new Error('DRIVE_BACKUP_UPLOAD_UNVERIFIED')
        return checked
      })
    },

    history() {
      return run(async () => {
        const { drive, email, guard } = await session(false)
        const files = (await drive.history()).filter(newVersion)
        guard()
        return { email, files }
      })
    },

    preview(id: string, expectedEmail: string) {
      return run(async () => {
        staged = undefined
        const { drive, key, email, guard } = await session(false)
        if (email !== expectedEmail) throw new Error('DRIVE_ACCOUNT_CHANGED')
        const version = await selected(drive, id)
        guard()
        const archive = await drive.latest(version)
        guard()
        const preview = await ports.previewRestore(archive, key)
        guard()
        staged = { version, email, preview }
        return staged
      })
    },

    cancelRestore() { staged = undefined },

    confirmRestore() {
      return run(async () => {
        const consent = staged
        staged = undefined
        if (!consent) throw new Error('DAILY_DRIVE_PREVIEW_REQUIRED')
        const { drive, email, key, guard } = await session(false, true)
        if (email !== consent.email) throw new Error('DRIVE_ACCOUNT_CHANGED')
        const version = await selected(drive, consent.version.id)
        guard()
        const archive = await drive.latest(version)
        guard()
        const current = await ports.previewRestore(archive, key)
        guard()
        if (current.manifest.snapshot.sha256 !== consent.preview.manifest.snapshot.sha256 ||
            current.toRestore !== consent.preview.toRestore || current.newerLocalRows !== consent.preview.newerLocalRows) {
          throw new Error('DAILY_DRIVE_PREVIEW_CHANGED')
        }
        return ports.restoreArchive(archive, key, guard)
      })
    },
  }
}
