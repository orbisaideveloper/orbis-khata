import { useEffect, useState } from 'react'
import { requestDriveRecovery } from '../accounting/api'
import { authClient } from '../auth/client'
import { isAccountRecovery, recoveryKeyBytes } from '../sync/account-recovery'
import { connectBackupDrive } from '../sync/drive-backup'

const changed = 'khata-drive-backup-setting'
const pref = (actor: string, key: string) => 'khata.drive-backup.' + actor + '.' + key

export function latestDriveBackupSlot(now: Date): number {
  const slot = new Date(now)
  slot.setHours(now.getHours() < 12 ? 0 : 12, 0, 0, 0)
  return slot.getTime()
}

function recordDriveBackupIssue(actor: string, issue: string) {
  localStorage.setItem(pref(actor, 'issue'), issue)
  window.dispatchEvent(new Event(changed))
}

function enabled(actor: string) {
  return localStorage.getItem(pref(actor, 'auto')) === 'on'
}

export function recordVerifiedDriveBackup(actor: string, time = Date.now(), slot = time) {
  localStorage.removeItem(pref(actor, 'issue'))
  localStorage.setItem(pref(actor, 'verified-at'), String(time))
  localStorage.setItem(pref(actor, 'completed-slot'), String(slot))
  window.dispatchEvent(new Event(changed))
}

export function useDriveAutoBackupSetting(actor: string) {
  const read = () => ({ on: enabled(actor), verifiedAt: Number(localStorage.getItem(pref(actor, 'verified-at'))), issue: localStorage.getItem(pref(actor, 'issue')) })
  const [state, setState] = useState(read)
  useEffect(() => {
    const refresh = () => setState({ on: enabled(actor), verifiedAt: Number(localStorage.getItem(pref(actor, 'verified-at'))), issue: localStorage.getItem(pref(actor, 'issue')) })
    window.addEventListener(changed, refresh)
    return () => window.removeEventListener(changed, refresh)
  }, [actor])
  const toggle = (on: boolean) => {
    localStorage.setItem(pref(actor, 'auto'), on ? 'on' : 'off')
    window.dispatchEvent(new Event(changed))
  }
  return { ...state, toggle }
}

let uploading = false

export async function withDriveBackupUpload(action: () => Promise<void>) {
  if (uploading) throw new Error('DRIVE_BACKUP_BUSY')
  uploading = true
  try {
    await action()
  } finally {
    uploading = false
  }
}

export function useForegroundDriveAutoBackup(actor: string | null | undefined) {
  useEffect(() => {
    if (!actor) return
    let disposed = false
    let retryAt = 0
    const available = () => !disposed && enabled(actor) && navigator.onLine && document.visibilityState !== 'hidden'
    const check = async () => {
      if (uploading || !available() || Date.now() < retryAt) return
      const slot = latestDriveBackupSlot(new Date())
      if (Number(localStorage.getItem(pref(actor, 'completed-slot'))) >= slot) return
      try {
        await withDriveBackupUpload(async () => {
          const session = await authClient?.auth.getSession()
          if (session?.error || session?.data.session?.user.id !== actor) throw new Error('BACKUP_NEEDS_SIGN_IN')
          const recovery = await requestDriveRecovery(actor)
          if (!isAccountRecovery(recovery)) throw new Error('BACKUP_NEEDS_RECOVERY_LINK')
          const drive = await connectBackupDrive(actor, recovery.email, true)
          await drive.accountEmail()
          const runtime = await import('./runtime')
          if (!available() || runtime.nativeLocalActor() !== actor) return
          const secret = recoveryKeyBytes(recovery.key)
          if (await drive.hasBackup()) await runtime.previewNativeFinancialBackup(await drive.latest(), actor, secret)
          if (!available() || runtime.nativeLocalActor() !== actor) return
          const archive = await runtime.exportNativeFinancialBackup(secret)
          if (!available() || runtime.nativeLocalActor() !== actor) return
          await drive.upload(archive)
          recordVerifiedDriveBackup(actor, Date.now(), slot)
        })
      } catch (error) {
        retryAt = Date.now() + 5 * 60_000
        const code = error instanceof Error ? error.message : ''
        recordDriveBackupIssue(actor, ['BACKUP_NEEDS_SIGN_IN', 'BACKUP_NEEDS_RECOVERY_LINK'].includes(code) ? code : 'BACKUP_FAILED')
      }
    }
    const wake = () => { void check() }
    const online = () => { retryAt = 0; wake() }
    const timer = window.setInterval(wake, 30_000)
    window.addEventListener('online', online)
    window.addEventListener(changed, wake)
    document.addEventListener('visibilitychange', wake)
    wake()
    return () => {
      disposed = true
      window.clearInterval(timer)
      window.removeEventListener('online', online)
      window.removeEventListener(changed, wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [actor])
}
