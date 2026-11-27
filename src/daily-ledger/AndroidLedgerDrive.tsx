import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { requestDriveRecovery } from '../accounting/api'
import { authClient } from '../auth/client'
import type { Language } from '../i18n'
import { inLanguage } from '../localize'
import { latestDriveBackupSlot, withDriveBackupUpload } from '../native-local/auto-drive-backup'
import * as native from '../native-local/runtime'
import { connectDailyLedgerBackupDrive } from '../sync/drive-backup'
import { createDailyLedgerDriveWorkflow, type BackupProgress } from './drive-workflow'

type Status = 'PENDING' | 'FAILED' | 'VERIFIED'
type Saved = Readonly<{ status: Status; verifiedAt: number; completedSlot: number }>
const initial: Saved = { status: 'PENDING', verifiedAt: 0, completedSlot: 0 }
const foreground = () => navigator.onLine && document.visibilityState !== 'hidden'

function readState(key: string): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as Saved | null
    if (saved && ['PENDING', 'FAILED', 'VERIFIED'].includes(saved.status) &&
        Number.isSafeInteger(saved.verifiedAt) && saved.verifiedAt >= 0 &&
        Number.isSafeInteger(saved.completedSlot) && saved.completedSlot >= 0 &&
        (saved.status !== 'VERIFIED' || saved.verifiedAt > 0)) return saved
  } catch { /* An unreadable preference is never proof of a successful backup. */ }
  return initial
}

function nativeWorkflow(owner: string, available: () => boolean) {
  return createDailyLedgerDriveWorkflow({
    async authorize(confirmCredential) {
      const session = await authClient?.auth.getSession()
      if (session?.error || session?.data.session?.user.id !== owner) throw new Error('BACKUP_NEEDS_SIGN_IN')
      return native.authorizeNativeDailyLedgerRecovery(owner, confirmCredential)
    },
    recovery: () => requestDriveRecovery(owner),
    connect: (email, silent) => connectDailyLedgerBackupDrive(owner, email, silent),
    exportArchive: key => native.exportNativeDailyLedgerBackup(owner, key),
    verifyArchive: (archive, key) => native.verifyNativeDailyLedgerBackup(owner, archive, key),
    previewRestore: (archive, key) => native.previewNativeDailyLedgerRestore(owner, archive, key),
    restoreArchive: (archive, key, guard) => native.restoreNativeDailyLedgerBackup(owner, archive, key, guard),
  }, available)
}

export default function AndroidLedgerDrive({ owner, language, onRestored }: Readonly<{
  owner: string; language: Language; onRestored(): void
}>) {
  const t = useCallback((bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en), [language])
  const prefs = 'khata.daily-ledger.drive.' + owner
  const savedKey = prefs + '.backup'
  const autoKey = prefs + '.auto'
  const [state, setState] = useState(() => readState(savedKey))
  const [auto, setAuto] = useState(() => {
    try { return localStorage.getItem(autoKey) === 'on' } catch { return false }
  })
  const [progress, setProgress] = useState<BackupProgress>()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [lifecycle] = useState(() => {
    let active = false
    return { start: () => { active = true }, stop: () => { active = false }, live: () => active }
  })
  const running = useRef(false)
  const retryAt = useRef(0)
  const workflow = useMemo(() => nativeWorkflow(owner, () => lifecycle.live() && foreground()), [owner, lifecycle])
  const [history, setHistory] = useState<Awaited<ReturnType<typeof workflow.history>>>()
  const [staged, setStaged] = useState<Awaited<ReturnType<typeof workflow.preview>>>()

  useEffect(() => {
    lifecycle.start()
    return () => { lifecycle.stop() }
  }, [lifecycle])

  const run = useCallback(async (action: () => Promise<void>) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setMessage('')
    try { await action() }
    catch (error) {
      if (!lifecycle.live()) return
      const code = error instanceof Error ? error.message : ''
      if (code === 'BACKUP_NEEDS_RECOVERY_LINK') {
        setMessage(t('প্রথমে Khata Backup-এ বিদ্যমান recovery সংযোগ নিশ্চিত করুন।', 'पहले Khata Backup में मौजूदा रिकवरी लिंक की पुष्टि करें।', 'Confirm the existing recovery link in Khata Backup first.'))
      } else if (code === 'DAILY_DRIVE_RESTORE_NEEDED') {
        setMessage(t('Drive-এ নতুন হিসাব আছে। আগে তার প্রিভিউ দেখুন।', 'Drive में नए रिकॉर्ड हैं। पहले उनका पूर्वावलोकन देखें।', 'Drive has newer records. Preview them before backing up.'))
      } else if (code === 'ANDROID_DEVICE_CREDENTIAL_REQUIRED') {
        setMessage(t('ডিভাইসের সুরক্ষিত স্ক্রিন লক দিয়ে যাচাই করুন।', 'डिवाइस के सुरक्षित स्क्रीन लॉक से पुष्टि करें।', 'Verify with the secure device screen lock.'))
      } else if (code === 'DAILY_BACKUP_HISTORY_CONFLICT' || code === 'DAILY_DRIVE_PREVIEW_CHANGED') {
        setMessage(t('হিসাবের কপি আলাদা বা বদলে গেছে। আবার প্রিভিউ দেখুন।', 'रिकॉर्ड की कॉपी अलग है या बदल गई है। फिर से पूर्वावलोकन देखें।', 'The copies differ or have changed. Open a fresh preview.'))
      } else {
        setMessage(t('কাজটি নিশ্চিত হয়নি। সংযোগ ও অ্যাকাউন্ট পরীক্ষা করে আবার চেষ্টা করুন।', 'कार्रवाई की पुष्टि नहीं हुई। कनेक्शन और खाता जाँचकर फिर प्रयास करें।', 'Not verified. Check your connection and account, then try again.'))
      }
    } finally {
      running.current = false
      if (lifecycle.live()) { setBusy(false); setProgress(undefined) }
    }
  }, [lifecycle, t])

  const backup = useCallback(async (silent: boolean, slot: number) => {
    const previous = readState(savedKey)
    const persist = (value: Saved) => {
      localStorage.setItem(savedKey, JSON.stringify(value))
      if (lifecycle.live()) setState(value)
    }
    persist({ ...previous, status: 'PENDING' })
    try {
      await withDriveBackupUpload(async () => { await workflow.backup(silent, stage => { if (lifecycle.live()) setProgress(stage) }) })
      if (lifecycle.live()) persist({ status: 'VERIFIED', completedSlot: slot, verifiedAt: Date.now() })
    } catch (error) {
      if (lifecycle.live()) persist({ ...previous, status: 'FAILED' })
      retryAt.current = Date.now() + 5 * 60_000
      throw error
    }
  }, [lifecycle, savedKey, workflow])

  useEffect(() => {
    if (!auto) return
    const wake = () => {
      if (running.current || !foreground() || Date.now() < retryAt.current) return
      const slot = latestDriveBackupSlot(new Date())
      if (readState(savedKey).completedSlot < slot) void run(() => backup(true, slot))
    }
    const online = () => { retryAt.current = 0; wake() }
    const timer = window.setInterval(wake, 30_000)
    window.addEventListener('online', online)
    document.addEventListener('visibilitychange', wake)
    wake()
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [auto, backup, run, savedKey])

  const claims = {
    PENDING: t('অপেক্ষমাণ', 'लंबित', 'Pending'),
    FAILED: t('যাচাই হয়নি', 'सत्यापित नहीं', 'Failed to verify'),
    VERIFIED: t('যাচাইকৃত', 'सत्यापित', 'Verified'),
  }
  const progressText = {
    preparing: t('ব্যাকআপ প্রস্তুত হচ্ছে', 'बैकअप तैयार हो रहा है', 'Preparing backup'),
    uploading: t('এনক্রিপ্ট করা কপি আপলোড হচ্ছে', 'एन्क्रिप्टेड कॉपी अपलोड हो रही है', 'Uploading encrypted copy'),
    verifying: t('Drive থেকে কপি পড়ে যাচাই হচ্ছে', 'Drive से कॉपी पढ़कर जाँची जा रही है', 'Verifying the copy read back from Drive'),
  }
  const date = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' })
  return <details className="daily-panel">
    <summary>{t('দৈনিক হিসাব · Google Drive ব্যাকআপ', 'दैनिक हिसाब · Google Drive बैकअप', 'Daily Ledger · Google Drive backup')}</summary>
    <p>{t('শুধু দৈনিক হিসাব খোলা ও অনলাইনে থাকলে দুপুর ১২টা ও রাত ১২টার ব্যাকআপের চেষ্টা হবে।', 'दैनिक हिसाब खुला और ऑनलाइन होने पर ही दोपहर और रात 12 बजे के बैकअप का प्रयास होगा।', 'Noon and midnight backups are attempted only while Daily Ledger is open and online.')}</p>
    <output>{progress ? progressText[progress] : claims[state.status]}</output>
    {state.verifiedAt > 0 && <p>{t('এই ডিভাইসে সর্বশেষ যাচাইকৃত ব্যাকআপ', 'इस डिवाइस पर आखिरी सत्यापित बैकअप', 'Last verified backup on this device')} · {date.format(state.verifiedAt)}</p>}
    <fieldset disabled={busy}>
      <label><input type="checkbox" checked={auto} onChange={event => {
        const value = event.target.checked
        try {
          localStorage.setItem(autoKey, value ? 'on' : 'off')
          setAuto(value)
        } catch {
          setMessage(t('অটো ব্যাকআপ সেটিং সেভ হয়নি।', 'ऑटो बैकअप सेटिंग नहीं सहेजी गई।', 'Automatic backup setting was not saved.'))
        }
      }} />{t('অটো ব্যাকআপ', 'ऑटो बैकअप', 'Automatic backup')}</label>
      <button type="button" onClick={() => void run(() => backup(false, latestDriveBackupSlot(new Date())))}>
        {t('এখনই ব্যাকআপ নিন', 'अभी बैकअप लें', 'Back up now')}
      </button>
      <button type="button" onClick={() => void run(async () => { workflow.cancelRestore(); setStaged(undefined); setHistory(await workflow.history()) })}>
        {t('ব্যাকআপ ইতিহাস', 'बैकअप का इतिहास', 'Backup history')}
      </button>
      {history && <ul className="daily-history">{history.files.map(file => <li key={file.id}>
        <button type="button" onClick={() => void run(async () => {
          setStaged(undefined)
          setStaged(await workflow.preview(file.id, history.email))
        })}>{date.format(new Date(file.createdTime))}</button>
      </li>)}</ul>}
      {staged && <div>
        <p>{staged.email} · {date.format(new Date(staged.version.createdTime))}</p>
        <p>{t('ফেরত আসবে', 'वापस आएँगे', 'Records to restore')} · {staged.preview.toRestore}</p>
        <p>{t('ডিভাইসের পরের রেকর্ড অক্ষত থাকবে', 'डिवाइस के नए रिकॉर्ड सुरक्षित रहेंगे', 'Newer records on the device will be kept')} · {staged.preview.newerLocalRows}</p>
        <button type="button" onClick={() => void run(async () => {
          setStaged(undefined)
          await workflow.confirmRestore()
          onRestored()
        })}>{t('নিশ্চিত করে ফিরিয়ে আনুন', 'पुष्टि करके वापस लाएँ', 'Confirm restore')}</button>
        <button type="button" onClick={() => { workflow.cancelRestore(); setStaged(undefined) }}>{t('বাতিল', 'रद्द करें', 'Cancel')}</button>
      </div>}
    </fieldset>
    {message && <output>{message}</output>}
  </details>
}
