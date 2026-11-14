import { useRef, useState } from 'react'
import { authClient } from '../auth/client'
import type { Language } from '../i18n'
import { inLanguage } from '../localize'
import { connectBackupDrive } from '../sync/drive-backup'
import { generateFinancialBackupKey } from '../sync/financial-backup'

export function DriveBackupPanel({ actor, language }: Readonly<{ actor: string; language: Language }>) {
  const t = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en)
  const [key, setKey] = useState('')
  const [preview, setPreview] = useState<{ archive: Uint8Array<ArrayBuffer>; companies: number; entries: number }>()
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
  function recoveryKey() {
    const code = key.trim()
    if (!/^[a-f0-9]{64}$/iu.test(code)) throw new Error('FINANCIAL_BACKUP_KEY_INVALID')
    return Uint8Array.from(code.match(/../gu)!, pair => Number.parseInt(pair, 16))
  }
  async function backup() {
    const secret = recoveryKey()
    const local = await import('./runtime')
    const drive = await connectBackupDrive(actor)
    if (local.nativeLocalActor() !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    await drive.upload(await local.exportNativeFinancialBackup(secret))
    setMessage(t('Drive-এ ব্যাকআপ সেভ হয়েছে।', 'Drive में बैकअप सहेजा गया।', 'Backup saved to Drive.'))
  }
  async function inspect() {
    const secret = recoveryKey()
    const drive = await connectBackupDrive(actor)
    const archive = await drive.latest()
    const local = await import('./runtime')
    const details = await local.previewNativeFinancialBackup(archive, actor, secret)
    setPreview({ archive, ...details })
  }
  async function restore() {
    if (!preview) return
    const local = await import('./runtime')
    await local.restoreNativeFinancialBackup(preview.archive, actor, recoveryKey())
    setPreview(undefined)
    setKey('')
    setMessage(t('হিসাব ফিরেছে। খাতায় ফিরে দেখুন।', 'खाते वापस आ गए। खाता खोलकर देखें।', 'Accounts restored. Open Khata to review them.'))
    window.dispatchEvent(new Event('khata-refresh'))
  }
  return <section className="privacy-links">
    <h2>{t('Google Drive ব্যাকআপ', 'Google Drive बैकअप', 'Google Drive backup')}</h2>
    <p>{t('রিকভারি চাবি আলাদা নিরাপদ জায়গায় রাখুন। রিস্টোরের সময় একই Google অ্যাকাউন্ট লাগবে।', 'रिकवरी कुंजी अलग सुरक्षित जगह रखें। बहाली में वही Google खाता चाहिए।', 'Keep your recovery key somewhere safe. Use the same Google account to restore.')}</p>
    <fieldset disabled={busy}>
      <label className="field">{t('রিকভারি চাবি', 'रिकवरी कुंजी', 'Recovery key')}<input className="input" value={key} onChange={event => { setKey(event.target.value); setPreview(undefined) }} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={64}/></label>
      <button type="button" onClick={() => {
        setKey(Array.from(generateFinancialBackupKey(), byte => byte.toString(16).padStart(2, '0')).join(''))
        setPreview(undefined)
      }}>{t('নতুন চাবি তৈরি', 'नई कुंजी बनाएँ', 'Generate key')}</button>
      <button type="button" onClick={() => void run(backup)}>{t('ব্যাকআপ নিন', 'बैकअप लें', 'Back up now')}</button>
      <button type="button" onClick={() => { setPreview(undefined); void run(inspect) }}>{t('ব্যাকআপ দেখুন', 'बैकअप देखें', 'Preview restore')}</button>
      {preview && <div>
        <p>{t('কোম্পানি', 'कंपनियाँ', 'Companies')} {preview.companies} · {t('লেজার এন্ট্রি', 'लेजर प्रविष्टियाँ', 'Ledger entries')} {preview.entries}</p>
        <button type="button" onClick={() => void run(restore)}>{t('খালি খাতায় রিস্টোর করুন', 'खाली खाते में बहाल करें', 'Restore to empty account')}</button>
      </div>}
    </fieldset>
    {busy && <output>{t('অপেক্ষা করুন…', 'प्रतीक्षा करें…', 'Please wait…')}</output>}
    {message && <output role="status">{message}</output>}
  </section>
}
