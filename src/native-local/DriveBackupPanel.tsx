import { useRef, useState } from 'react'
import { requestDriveRecovery } from '../accounting/api'
import { isAccountRecovery, recoveryKeyBytes, type AccountRecovery } from '../sync/account-recovery'
import { authClient } from '../auth/client'
import type { Language } from '../i18n'
import { inLanguage } from '../localize'
import { connectBackupDrive } from '../sync/drive-backup'
import { generateFinancialBackupKey } from '../sync/financial-backup'

export function DriveBackupPanel({ actor, language }: Readonly<{ actor: string; language: Language }>) {
  const t = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en)
  const [confirmEmail, setConfirmEmail] = useState<string>()
  const [key, setKey] = useState('')
  const [legacyKeyNeeded, setLegacyKeyNeeded] = useState(false)
  const [preview, setPreview] = useState<{ archive: Uint8Array<ArrayBuffer>; record: AccountRecovery; companies: number; entries: number }>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const pending = useRef(false)
  async function run(action: () => Promise<void>) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setMessage('')
    try {
      const session = await authClient?.auth.getSession()
      if (session?.error || session?.data.session?.user.id !== actor) {
        setMessage(t('আগে অনলাইনে ORBIS-এ সাইন ইন করুন।', 'पहले ऑनलाइन ORBIS में साइन इन करें।', 'Sign in to ORBIS online first.'))
        return
      }
      await action()
    } catch (error) {
      if (error instanceof Error && error.message === 'FINANCIAL_RESTORE_REQUIRES_EMPTY_ACCOUNT') {
        setMessage(t('রিস্টোরের জন্য খালি লোকাল খাতা লাগবে।', 'बहाली के लिए खाली स्थानीय खाता चाहिए।', 'Restore requires an empty local account.'))
      } else {
        setMessage(t('কাজটি নিশ্চিত হয়নি। Google অ্যাকাউন্ট, সংযোগ ও চাবি পরীক্ষা করুন।', 'कार्रवाई की पुष्टि नहीं हुई। Google खाता, कनेक्शन और कुंजी जाँचें।', 'Action not confirmed. Check the Google account, connection and key.'))
      }
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  async function openDrive(preferred?: string) {
    const linked = await requestDriveRecovery(actor)
    if (linked !== null && !isAccountRecovery(linked)) throw new Error('KHATA_RECOVERY_RECORD_INVALID')
    const emailHint = linked?.email || preferred
    const drive = emailHint ? await connectBackupDrive(actor, emailHint) : await connectBackupDrive(actor)
    const email = await drive.accountEmail()
    return { linked, drive, email }
  }

  async function link(record: AccountRecovery) {
    const saved = await requestDriveRecovery(actor, record)
    if (saved?.key !== record.key || saved.email !== record.email) throw new Error('KHATA_RECOVERY_LINK_CONFLICT')
  }

  function askForLegacyKey() {
    setLegacyKeyNeeded(true)
    setMessage(t('পুরোনো ব্যাকআপ খুলতে তার রিকভারি চাবি একবার দিন।', 'पुराना बैकअप खोलने के लिए उसकी रिकवरी कुंजी एक बार दें।', 'Enter the recovery key for this older backup once.'))
  }

  async function backup() {
    const local = await import('./runtime')
    const deviceKey = await local.readNativeDriveRecoveryKey(actor)
    const { linked, drive, email } = await openDrive(confirmEmail)
    const hasBackup = await drive.hasBackup()
    if (hasBackup && (!deviceKey || linked && linked.key !== deviceKey)) {
      setMessage(t('আগের ব্যাকআপ পেয়েছি। আগে ব্যাকআপ দেখুন।', 'पुराना बैकअप मिला। पहले उसका पूर्वावलोकन देखें।', 'An existing backup was found. Preview it first.'))
      setConfirmEmail(undefined)
      return
    }
    if (!linked && confirmEmail !== email) {
      setConfirmEmail(email)
      return
    }
    const code = linked?.key || deviceKey || Array.from(generateFinancialBackupKey(), byte => byte.toString(16).padStart(2, '0')).join('')
    const secret = recoveryKeyBytes(code)
    if (!linked && hasBackup) await local.previewNativeFinancialBackup(await drive.latest(), actor, secret)
    if (!linked) await link({ email, key: code })
    await local.saveNativeDriveRecoveryKey(actor, code)
    await drive.upload(await local.exportNativeFinancialBackup(secret))
    setPreview(undefined)
    setConfirmEmail(undefined)
    setLegacyKeyNeeded(false)
    setKey('')
    setMessage(t('Drive-এ ব্যাকআপ সেভ হয়েছে।', 'Drive में बैकअप सहेजा गया।', 'Backup saved to Drive.') + ' ' + email)
  }
  async function inspect() {
    const local = await import('./runtime')
    const deviceKey = await local.readNativeDriveRecoveryKey(actor)
    const { linked, drive, email } = await openDrive()
    const archive = await drive.latest()
    const code = linked?.key || key.trim().toLowerCase() || deviceKey
    if (!code) {
      askForLegacyKey()
      return
    }
    const details = await local.previewNativeFinancialBackup(archive, actor, recoveryKeyBytes(code))
    setPreview({ archive, record: { email, key: code }, ...details })
    setLegacyKeyNeeded(false)
    setKey('')
  }
  async function restore() {
    if (!preview) return
    const local = await import('./runtime')
    await link(preview.record)
    await local.restoreNativeFinancialBackup(preview.archive, actor, recoveryKeyBytes(preview.record.key))
    await local.saveNativeDriveRecoveryKey(actor, preview.record.key)
    setPreview(undefined)
    setMessage(t('হিসাব ফিরেছে। খাতায় ফিরে দেখুন।', 'खाते वापस आ गए। खाता खोलकर देखें।', 'Accounts restored. Open Khata to review them.'))
    window.dispatchEvent(new Event('khata-refresh'))
  }
  return <section className="privacy-links">
    <h2>{t('Google Drive ব্যাকআপ', 'Google Drive बैकअप', 'Google Drive backup')}</h2>
    <p>{t('প্রথমবার Google অ্যাকাউন্ট বেছে নিন। পরে একই অ্যাকাউন্ট ব্যবহার হবে।', 'पहली बार Google खाता चुनें। बाद में वही खाता इस्तेमाल होगा।', 'Choose a Google account the first time. The app will reuse that account.')}</p>
    <fieldset disabled={busy}>
      {legacyKeyNeeded && <label className="field">
        {t('পুরোনো রিকভারি চাবি', 'पुरानी रिकवरी कुंजी', 'Previous recovery key')}
        <input className="input" type="password" value={key} onChange={event => setKey(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={64}/>
      </label>}
      {confirmEmail ? <div>
        <p>{confirmEmail}</p>
        <button type="button" onClick={() => void run(backup)}>{t('নিশ্চিত করে ব্যাকআপ নিন', 'पुष्टि करके बैकअप लें', 'Confirm and back up')}</button>
        <button type="button" onClick={() => setConfirmEmail(undefined)}>{t('বাতিল', 'रद्द करें', 'Cancel')}</button>
      </div> : <button type="button" onClick={() => void run(backup)}>{t('ব্যাকআপ নিন', 'बैकअप लें', 'Back up now')}</button>}
      <button type="button" onClick={() => { setConfirmEmail(undefined); setPreview(undefined); void run(inspect) }}>{t('ব্যাকআপ দেখুন', 'बैकअप देखें', 'Preview restore')}</button>
      {preview && <div>
        <p>{t('কোম্পানি', 'कंपनियाँ', 'Companies')} {preview.companies} · {t('লেজার এন্ট্রি', 'लेजर प्रविष्टियाँ', 'Ledger entries')} {preview.entries}</p>
        <button type="button" onClick={() => void run(restore)}>{t('খালি খাতায় রিস্টোর করুন', 'खाली खाते में बहाल करें', 'Restore to empty account')}</button>
      </div>}
    </fieldset>
    {busy && <output>{t('অপেক্ষা করুন…', 'प्रतीक्षा करें…', 'Please wait…')}</output>}
    {message && <output>{message}</output>}
  </section>
}
