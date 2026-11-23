import { useRef, useState } from 'react'
import { money } from '../accounting/model'
import { requestDriveRecovery } from '../accounting/api'
import { isAccountRecovery, recoveryKeyBytes, type AccountRecovery } from '../sync/account-recovery'
import { authClient } from '../auth/client'
import type { Language } from '../i18n'
import { inLanguage } from '../localize'
import { connectBackupDrive, type DriveBackupVersion } from '../sync/drive-backup'
import { recordVerifiedDriveBackup, useDriveAutoBackupSetting, withDriveBackupUpload } from './auto-drive-backup'
import { generateFinancialBackupKey } from '../sync/financial-backup'

export function DriveBackupPanel({ actor, language }: Readonly<{ actor: string; language: Language }>) {
  const t = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en)
  const autoBackup = useDriveAutoBackupSetting(actor)
  const [copy, setCopy] = useState<Awaited<ReturnType<typeof import('./runtime').openNativeFinancialBackupCopy>>>()
  const [selected, setSelected] = useState<string[]>([])
  const [versions, setVersions] = useState<{ email: string; files: DriveBackupVersion[] }>()
  const [confirmEmail, setConfirmEmail] = useState<string>()
  const [key, setKey] = useState('')
  const [legacySelection, setLegacySelection] = useState<{ version: DriveBackupVersion; email: string }>()
  const [legacyKeyNeeded, setLegacyKeyNeeded] = useState(false)
  const [preview, setPreview] = useState<{ archive: Uint8Array<ArrayBuffer>; record: AccountRecovery; companies: number; entries: number; version?: DriveBackupVersion }>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const pending = useRef(false)
  async function run(action: () => Promise<void>) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setMessage('')
    setCopy(undefined)
    try {
      const session = await authClient?.auth.getSession()
      if (session?.error || session?.data.session?.user.id !== actor) {
        setMessage(t('আগে অনলাইনে ORBIS-এ সাইন ইন করুন।', 'पहले ऑनलाइन ORBIS में साइन इन करें।', 'Sign in to ORBIS online first.'))
        return
      }
      await action()
    } catch (error) {
      if (error instanceof Error && error.message === 'FINANCIAL_RESTORE_SELECTION_CONFLICT') {
        setMessage(t('বাছাই করা হিসাব আর নিরাপদে যোগ করা যাচ্ছে না। কপি আবার খুলুন।', 'चुना गया हिसाब अब सुरक्षित रूप से नहीं जोड़ा जा सकता। कॉपी फिर से खोलें।', 'The selection can no longer be restored safely. Reopen the recovered copy.'))
      } else if (error instanceof Error && error.message === 'FINANCIAL_RESTORE_COMPANY_CONFLICT') {
        setMessage(t('একই কোম্পানির হিসাব দুই কপিতে আলাদা। পুরোনো হিসাব আলাদা করে খুলে দেখুন।', 'एक ही कंपनी का हिसाब दोनों कॉपियों में अलग है। पुरानी कॉपी अलग से देखें।', 'The same company differs between copies. Open the recovered copy to review it.'))
      } else if (error instanceof Error && error.message === 'FINANCIAL_RESTORE_PENDING_CHANGES') {
        setMessage(t('ফোনে অসম্পূর্ণ পরিবর্তন আছে। রিস্টোর থামানো হয়েছে।', 'फ़ोन पर कुछ बदलाव अभी बाकी हैं। बहाली रोक दी गई है।', 'Pending changes on this phone prevented restore.'))
      } else if (error instanceof Error && error.message === 'FINANCIAL_RESTORE_DELETED_MASTER_CONFLICT') {
        setMessage(t('এই ব্যাকআপে পরে মোছা পার্টি বা আইটেম আছে। চলতি খাতায় কোনো পরিবর্তন হয়নি।', 'इस बैकअप में बाद में हटाई गई पार्टी या आइटम हैं। मौजूदा खाते में कोई बदलाव नहीं हुआ।', 'This backup contains a party or item deleted later. Your current books were not changed.'))
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
    if (hasBackup && !linked && !deviceKey) {
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
    if (hasBackup) await local.previewNativeFinancialBackup(await drive.latest(), actor, secret)
    if (!linked) await link({ email, key: code })
    await local.saveNativeDriveRecoveryKey(actor, code)
    await drive.upload(await local.exportNativeFinancialBackup(secret))
    recordVerifiedDriveBackup(actor)
    setPreview(undefined)
    setVersions(undefined)
    setConfirmEmail(undefined)
    setLegacyKeyNeeded(false)
    setKey('')
    setMessage(t('Drive-এ ব্যাকআপ সেভ হয়েছে।', 'Drive में बैकअप सहेजा गया।', 'Backup saved to Drive.') + ' ' + email)
  }
  async function history() {
    setVersions(undefined)
    const { drive, email } = await openDrive()
    const files = await drive.history()
    setVersions({ email, files: files.filter(file => Number.isFinite(Date.parse(file.createdTime))) })
  }

  async function inspect(version?: DriveBackupVersion, expectedEmail?: string) {
    const local = await import('./runtime')
    const deviceKey = await local.readNativeDriveRecoveryKey(actor)
    const { linked, drive, email } = await openDrive()
    if (expectedEmail && expectedEmail !== email) throw new Error('DRIVE_ACCOUNT_CHANGED')
    const archive = version ? await drive.latest(version) : await drive.latest()
    const code = linked?.key || key.trim().toLowerCase() || deviceKey
    if (!code) {
      setLegacySelection(version ? { version, email } : undefined)
      askForLegacyKey()
      return
    }
    const details = await local.previewNativeFinancialBackup(archive, actor, recoveryKeyBytes(code))
    setPreview({ archive, record: { email, key: code }, version, ...details })
    setLegacySelection(undefined)
    setLegacyKeyNeeded(false)
    setKey('')
  }
  async function linkPreview() {
    if (!preview) return
    const local = await import('./runtime')
    const { linked, drive, email } = await openDrive(preview.record.email)
    if (email !== preview.record.email || (linked && linked.key !== preview.record.key)) throw new Error('KHATA_RECOVERY_LINK_CONFLICT')
    await local.previewNativeFinancialBackup(await drive.latest(), actor, recoveryKeyBytes(preview.record.key))
    await link(preview.record)
    await local.saveNativeDriveRecoveryKey(actor, preview.record.key)
    setMessage(t('ব্যাকআপ সংযোগ প্রস্তুত। এখন ব্যাকআপ নিন বা অটো ব্যাকআপ চালু করুন।', 'बैकअप कनेक्शन तैयार है। अब बैकअप लें या ऑटो बैकअप चालू करें।', 'Backup recovery linked. Back up now or enable auto backup.'))
  }

  async function openCopy() {
    if (!preview) return
    const local = await import('./runtime')
    setSelected([])
    setCopy(await local.openNativeFinancialBackupCopy(preview.archive, actor, recoveryKeyBytes(preview.record.key)))
  }

  function toggleSelectedPosting(id: string, checked: boolean) {
    setSelected(previous => checked ? [...previous, id] : previous.filter(posting => posting !== id))
  }

  async function restoreSelection() {
    if (!preview || !selected.length) return
    const local = await import('./runtime')
    await local.restoreNativeBackupSelection(preview.archive, actor, recoveryKeyBytes(preview.record.key), selected)
    setSelected([])
    setMessage(t('বাছাই করা হিসাব যোগ হয়েছে।', 'चुना गया हिसाब जोड़ दिया गया।', 'Selected records were restored.'))
    window.dispatchEvent(new Event('khata-refresh'))
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
      <label>
        <input type="checkbox" checked={autoBackup.on} onChange={event => autoBackup.toggle(event.target.checked)}/>
        {t('অটো ব্যাকআপ · দুপুর ১২টা ও রাত ১২টা', 'ऑटो बैकअप · दोपहर 12 बजे और रात 12 बजे', 'Auto backup · noon and midnight')}
      </label>
      {autoBackup.on && <p>{t('নির্ধারিত সময় মিস হলে অ্যাপ খোলা ও ইন্টারনেট চালু হলেই ব্যাকআপের চেষ্টা হবে।', 'समय छूटने पर ऐप खुला और इंटरनेट चालू होने पर बैकअप की कोशिश होगी।', 'If a scheduled time is missed, backup will retry when the app is open and online.')}</p>}
      {autoBackup.on && autoBackup.issue && <output>{autoBackup.issue === 'BACKUP_NEEDS_RECOVERY_LINK'
        ? t('অটো ব্যাকআপের জন্য আগের ব্যাকআপ দেখে অ্যাকাউন্টের সংযোগ নিশ্চিত করুন।', 'ऑटो बैकअप के लिए पुराने बैकअप का पूर्वावलोकन करके खाता जोड़ें।', 'Preview your existing backup and confirm its recovery link to enable automatic uploads.')
        : t('অটো ব্যাকআপ অপেক্ষায় আছে। অনলাইনে সাইন ইন ও Google Drive সংযোগ পরীক্ষা করুন। আবার চেষ্টা হবে।', 'ऑटो बैकअप रुका है। ऑनलाइन साइन इन और Google Drive कनेक्शन जाँचें। फिर कोशिश होगी।', 'Automatic backup is waiting. Check online sign-in and Google Drive access. It will retry.')}</output>}
      {autoBackup.verifiedAt > 0 && <p>{t('শেষ সফল ব্যাকআপ', 'आखिरी सफल बैकअप', 'Last verified backup')} · {new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(autoBackup.verifiedAt)}</p>}
      {legacyKeyNeeded && <label className="field">
        {t('পুরোনো রিকভারি চাবি', 'पुरानी रिकवरी कुंजी', 'Previous recovery key')}
        <input className="input" type="password" value={key} onChange={event => setKey(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={64}/>
      </label>}
      {confirmEmail ? <div>
        <p>{confirmEmail}</p>
        <button type="button" onClick={() => void run(() => withDriveBackupUpload(backup))}>{t('নিশ্চিত করে ব্যাকআপ নিন', 'पुष्टि करके बैकअप लें', 'Confirm and back up')}</button>
        <button type="button" onClick={() => setConfirmEmail(undefined)}>{t('বাতিল', 'रद्द करें', 'Cancel')}</button>
      </div> : <button type="button" onClick={() => void run(() => withDriveBackupUpload(backup))}>{t('ব্যাকআপ নিন', 'बैकअप लें', 'Back up now')}</button>}
      <button type="button" onClick={() => { setConfirmEmail(undefined); setPreview(undefined); void run(() => inspect(legacySelection?.version, legacySelection?.email)) }}>{t('ব্যাকআপ দেখুন', 'बैकअप देखें', 'Preview Backup')}</button>
      <button type="button" onClick={() => { setPreview(undefined); void run(history) }}>{t('ব্যাকআপ ইতিহাস', 'बैकअप इतिहास', 'Backup History')}</button>
      {versions && <div>
        <p>{versions.email}</p>
        {versions.files.length === 0 ? <p>{t('কোনো ব্যাকআপ পাওয়া যায়নি।', 'कोई बैकअप नहीं मिला।', 'No backup found.')}</p> :
          <ul>{versions.files.map(file => <li key={file.id}>
            <button type="button" onClick={() => { setPreview(undefined); void run(() => inspect(file, versions.email)) }}>
              {new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(file.createdTime))}
              {' · '}{new Intl.NumberFormat(language, { style: 'unit', unit: 'kilobyte', maximumFractionDigits: 1 }).format(Number(file.size) / 1000)}
            </button>
          </li>)}</ul>}
      </div>}
      {preview && <div>
        <p>{preview.record.email} · {new Intl.NumberFormat(language, { style: 'unit', unit: 'kilobyte', maximumFractionDigits: 1 }).format(preview.archive.byteLength / 1000)}</p>
        {preview.version && <p>{new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(preview.version.createdTime))}</p>}
        <p>{t('কোম্পানি', 'कंपनियाँ', 'Companies')} {preview.companies} · {t('লেজার এন্ট্রি', 'लेजर प्रविष्टियाँ', 'Ledger entries')} {preview.entries}</p>
        <button type="button" onClick={() => void run(() => withDriveBackupUpload(linkPreview))}>{t('এই অ্যাকাউন্টে ব্যাকআপ সংযোগ নিশ্চিত করুন', 'इस खाते का बैकअप कनेक्शन पुष्ट करें', 'Confirm backup recovery link')}</button>
        <button type="button" onClick={() => void run(openCopy)}>{t('রিকভার করা কপি দেখুন', 'रिकवरी कॉपी देखें', 'Open recovered copy')}</button>
        <button type="button" onClick={() => void run(restore)}>{t('হিসাব ফিরিয়ে আনুন', 'हिसाब वापस लाएँ', 'Restore data')}</button>
      </div>}
    </fieldset>
    {copy && <section aria-label={t('রিকভার করা কপি', 'रिकवरी कॉपी', 'Recovered copy')}>
      <h3>{t('রিকভার করা কপি', 'रिकवरी कॉपी', 'Recovered copy')}</h3>
      <button type="button" onClick={() => setCopy(undefined)}>{t('বন্ধ করুন', 'बंद करें', 'Close copy')}</button>
      {copy.map(company => <details key={company.id}>
        <summary>{company.name} · {company.entries.length} {t('লেজার এন্ট্রি', 'लेजर प्रविष्टियाँ', 'ledger entries')}</summary>
        <ul>{company.entries.map(row => <li key={row.id}>
          <label>
            {company.selectable?.includes(row.id) && <input type="checkbox" checked={selected.includes(row.id)}
              onChange={event => toggleSelectedPosting(row.id, event.target.checked)}/>}
            {row.effective_date} · {row.party_name} · {money(row.amount_minor)}
          </label>
        </li>)}</ul>
      </details>)}
      {selected.length > 0 && <button type="button" onClick={() => void run(restoreSelection)}>
        {t('বাছাই করা হিসাব যোগ করুন', 'चुना हुआ हिसाब जोड़ें', 'Restore selected records')} ({selected.length})
      </button>}
    </section>}
    {busy && <output>{t('অপেক্ষা করুন…', 'प्रतीक्षा करें…', 'Please wait…')}</output>}
    {message && <output>{message}</output>}
  </section>
}
