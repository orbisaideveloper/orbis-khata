import { syncWebLottery } from './lottery-sync'
import { syncWebCompany } from './company-sync'
import { useState } from 'react'
import { readOnlineCompanies, readOnlineCompanyExport } from '../accounting/api'
import { money, type Company } from '../accounting/model'
import type { Language } from '../i18n'
import { CompanySyncConflict, parseCompanyExport } from '../sync/company-transfer'
import { inLanguage } from '../localize'

const diagnosticCodes: Readonly<Partial<Record<string, string>>> = {
  ANDROID_LOCAL_ACTOR_CHANGED: 'ACTOR_MISMATCH',
  KHATA_COMPANY_EXPORT_INVALID: 'INVALID_EXPORT',
  KHATA_COMPANY_EXPORT_UNSUPPORTED: 'UNSUPPORTED_EXPORT',
  KHATA_COMPANY_LEDGER_MISMATCH: 'FINANCIAL_BALANCE_MISMATCH',
  KHATA_COMPANY_IMPORT_CONFLICT: 'RECORD_ID_CONFLICT',
}

function syncDiagnostic(error: unknown): string {
  if (error instanceof CompanySyncConflict) return error.reason
  if (error instanceof Error && Object.hasOwn(diagnosticCodes, error.message)) return diagnosticCodes[error.message] ?? ''
  return ''
}

type CompanyComparison = { online: Company[]; local: Company[] }

export function CompanySyncPreview({ actor, language }: Readonly<{ actor: string; language: Language }>) {
  const [comparison, setComparison] = useState<CompanyComparison>()
  const [preview, setPreview] = useState<ReturnType<typeof parseCompanyExport>>()
  const [notice, setNotice] = useState('')
  const [pairingTicket, setPairingTicket] = useState('')
  const syncV2 = import.meta.env.VITE_KHATA_SYNC_V2_LOTTERY_PAYMENT === 'enabled'
  const [diagnostic, setDiagnostic] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const t = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en)

  async function pullLottery() {
    setBusy(true)
    setNotice('')
    try {
      const result = await syncWebLottery(actor)
      setNotice(result.changed
        ? t('লটারির ওয়েব হিসাব এই ফোনে এসেছে।', 'लॉटरी का वेब हिसाब इस फ़ोन पर आ गया।', 'Lottery web accounts imported to this phone.')
        : t('লটারির হিসাব মিলে গেছে।', 'लॉटरी का हिसाब मिल गया।', 'Lottery accounts match.'))
    } catch {
      setNotice(t('লটারি সিঙ্ক থেমেছে। ফোনের অসম্পূর্ণ হিসাব ও সংযোগ পরীক্ষা করুন।', 'लॉटरी सिंक रुका। फ़ोन के अधूरे हिसाब और कनेक्शन जाँचें।', 'Lottery sync stopped. Check pending phone records and the connection.'))
    } finally {
      setBusy(false)
    }
  }

  async function pairV2() {
    if (!/^[a-f0-9]{64}$/u.test(pairingTicket)) {
      setNotice(t('ভুল পেয়ারিং টিকিট।', 'अमान्य पेयरिंग टिकट।', 'Invalid pairing ticket.'))
      return
    }
    setBusy(true)
    setNotice('')
    try {
      const runtime = await import('./runtime')
      const connected = await runtime.enrollNativeLotteryV2(actor, pairingTicket)
      setPairingTicket('')
      setNotice(t('নিরাপদ লটারি সিঙ্ক ডিভাইস যুক্ত হয়েছে।', 'सुरक्षित लॉटरी सिंक डिवाइस जुड़ा।', 'Secure Lottery sync device enrolled.') + ' · ' + connected.organization)
    } catch {
      setNotice(t('পেয়ারিং থেমেছে। পুরোনো হিসাব থাকলে আগে নিরাপদ মাইগ্রেশন দরকার।', 'पेयरिंग रुकी। पुराने डेटा के लिए सुरक्षित माइग्रेशन जरूरी है।', 'Enrollment stopped. Existing records require reviewed migration.'))
    } finally { setBusy(false) }
  }

  async function syncV2Pending() {
    setBusy(true)
    setNotice('')
    try {
      const runtime = await import('./runtime')
      const result = await runtime.syncNativeLotteryV2Pending(actor)
      setNotice(result.organizations === 0
        ? t('এখনো কোনো নিরাপদ ডিভাইস যুক্ত হয়নি।', 'अभी कोई सुरक्षित डिवाइस जुड़ा नहीं है।', 'No secure sync device is enrolled.')
        : t('নিরাপদ লটারি সিঙ্ক সম্পন্ন।', 'सुरक्षित लॉटरी सिंक पूर्ण।', 'Secure Lottery synchronization completed.') + ' · ' + result.organizations)
      window.dispatchEvent(new Event('khata-lottery-synced'))
    } catch {
      setNotice(t('সিঙ্ক অসম্পূর্ণ। কোনো অফলাইন হিসাব মুছে যায়নি।', 'सिंक अधूरा। ऑफलाइन डेटा नहीं मिटाया गया।', 'Sync incomplete. Offline records were preserved.'))
    } finally { setBusy(false) }
  }

  async function compare() {
    setBusy(true)
    setFailed(false)
    setComparison(undefined)
    setPreview(undefined)
    setNotice('')
    setDiagnostic('')
    try {
      const runtime = await import('./runtime')
      const [online, local] = await Promise.all([
        readOnlineCompanies(actor),
        runtime.readNativeCompaniesForComparison(actor),
      ])
      if (runtime.nativeLocalActor() !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
      setComparison({ online, local })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function transfer(company: string, confirm: boolean) {
    setBusy(true)
    setNotice('')
    setDiagnostic('')
    try {
      const runtime = await import('./runtime')
      if (confirm && preview?.company.id === company) {
        await runtime.importNativeCompany(actor, company, preview)
        setNotice(t('হিসাব ফোনে যোগ হয়েছে।', 'खाता इस फ़ोन में जुड़ गया।', 'Company imported to this phone.'))
        setPreview(undefined)
        setComparison(current => current && { ...current, local: [...current.local, preview.company] })
        window.dispatchEvent(new Event('khata-refresh'))
      } else {
        setPreview(undefined)
        const payload = await readOnlineCompanyExport(actor, company)
        if (runtime.nativeLocalActor() !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
        setPreview(parseCompanyExport(payload, company, actor))
      }
    } catch {
      setPreview(undefined)
      setNotice(t('স্থানান্তর করা যায়নি। আংশিক হিসাব যোগ করা হয়নি।', 'स्थानांतरण नहीं हो सका। अधूरा खाता नहीं जोड़ा गया।', 'Unable to import this company. No partial import was made.'))
    } finally {
      setBusy(false)
    }
  }

  async function sync(company: string) {
    setBusy(true)
    setNotice('')
    setDiagnostic('')
    setPreview(undefined)
    try {
      const result = await syncWebCompany(actor, company)
      const time = new Date(result.syncedAt).toLocaleString(language)
      setNotice(t('শেষ সিঙ্ক', 'पिछला सिंक', 'Last sync') + ' · ' + time)
    } catch (error) {
      setDiagnostic(syncDiagnostic(error))
      setNotice(error instanceof Error && error.message === 'KHATA_COMPANY_SYNC_CONFLICT'
        ? t('ফোন ও ওয়েবের হিসাব আলাদা। কোনো পরিবর্তন সেভ হয়নি।', 'फ़ोन और वेब के खाते अलग हैं। कोई बदलाव सहेजा नहीं गया।', 'Phone and web records differ. No changes were saved.')
        : t('সিঙ্ক করা যায়নি। ইন্টারনেট ও সাইন ইন দেখে আবার চেষ্টা করুন।', 'सिंक नहीं हुआ। इंटरनेट और साइन इन जाँचकर फिर कोशिश करें।', 'Sync failed. Check your connection and sign-in and try again.'))
    } finally {
      setBusy(false)
    }
  }

  return <section className="privacy-links">
    <h2>{t('কোম্পানির তালিকা মিলিয়ে দেখুন', 'कंपनियों की सूचियाँ देखें', 'Compare company lists')}</h2>
    {!syncV2 && <button type="button" disabled={busy} onClick={() => void pullLottery()}>
      {t('ওয়েব থেকে লটারি সিঙ্ক করুন', 'वेब से लॉटरी सिंक करें', 'Sync Lottery from web')}
    </button>}
    {syncV2 && <div>
      <label htmlFor="khata-v2-pair-ticket">{t('নিরাপদ ডিভাইস পেয়ারিং টিকিট', 'सुरक्षित डिवाइस पेयरिंग टिकट', 'Secure device pairing ticket')}</label>
      <input id="khata-v2-pair-ticket" type="password" autoComplete="off" value={pairingTicket}
        onChange={event => setPairingTicket(event.target.value)} maxLength={64}/>
      <button type="button" disabled={busy || pairingTicket.length !== 64} onClick={() => void pairV2()}>
        {t('সিঙ্ক ডিভাইস যুক্ত করুন', 'सिंक डिवाइस जोड़ें', 'Enroll sync device')}
      </button>
      <button type="button" disabled={busy} onClick={() => void syncV2Pending()}>
        {t('নিরাপদ সিঙ্ক চালান', 'सुरक्षित सिंक चलाएँ', 'Run secure sync')}
      </button>
    </div>}
    <p>{t('ওয়েব ও এই ফোনে থাকা সক্রিয় কোম্পানিগুলো দেখুন।', 'वेब और इस फ़ोन की सक्रिय कंपनियाँ देखें।', 'View active companies on the web and on this phone.')}</p>
    <button type="button" disabled={busy} onClick={() => void compare()}>
      {t('তালিকা দেখুন', 'सूचियाँ देखें', 'View company lists')}
    </button>
    {busy && <output>{t('তালিকা আনা হচ্ছে…', 'सूचियाँ लोड हो रही हैं…', 'Loading company lists…')}</output>}
    {failed && <output>{t('তালিকা আনা যায়নি। অনলাইনে একই ORBIS অ্যাকাউন্টে সাইন ইন করে চেষ্টা করুন।', 'सूचियाँ नहीं मिल सकीं। उसी ORBIS खाते में ऑनलाइन साइन इन करके फिर कोशिश करें।', 'Could not load both lists. Sign in online with the same ORBIS account and try again.')}</output>}
    {comparison && <div className="account-company-lists">{[
      { title: t('ওয়েবের কোম্পানি', 'वेब की कंपनियाँ', 'Web companies'), rows: comparison.online, online: true },
      { title: t('এই ফোনের কোম্পানি', 'इस फ़ोन की कंपनियाँ', 'Companies on this phone'), rows: comparison.local, online: false },
    ].map(({ title, rows, online }) => <div key={title}>
      <h3>{title} ({rows.length})</h3>
      {rows.length > 0 && <ul>{rows.map(row => <li key={row.id}>{row.name} {online && (comparison.local.some(local => local.id === row.id)
        ? <button type="button" disabled={busy} onClick={() => void sync(row.id)}>
          {t('এখন সিঙ্ক করুন', 'अभी सिंक करें', 'Sync now')}
        </button>
        : <button type="button" disabled={busy} onClick={() => void transfer(row.id, false)}>
          {t('স্থানান্তর দেখুন', 'स्थानांतरण देखें', 'Preview import')}
        </button>)}</li>)}</ul>}
    </div>)}</div>}
    {preview && <div>
      <h3>{preview.company.name}</h3>
      <p>{t('স্টক ও বিলের নথি', 'स्टॉक और बिल दस्तावेज़', 'Stock and bill documents')} {preview.documents.length} · {t('লেজার এন্ট্রি', 'लेजर प्रविष्टियाँ', 'Ledger entries')} {preview.entries.length} · {t('খরচের এন্ট্রি', 'खर्च प्रविष्टियाँ', 'Expense entries')} {preview.expenses.length}</p>
      <dl>
        <dt>{t('নগদ', 'नकद', 'Cash')}</dt><dd>{money(preview.balances.cash ?? '0')}</dd>
        <dt>{t('ব্যাংক', 'बैंक', 'Bank')}</dt><dd>{money(preview.balances.bank ?? '0')}</dd>
        <dt>{t('পাওনা', 'लेना है', 'To receive')}</dt><dd>{money(preview.balances.receivable ?? '0')}</dd>
        <dt>{t('দেনা', 'देना है', 'To pay')}</dt><dd>{money(-BigInt(preview.balances.payable ?? '0'))}</dd>
      </dl>
      <button type="button" disabled={busy} onClick={() => void transfer(preview.company.id, true)}>
        {t('এই ফোনে হিসাব যোগ করুন', 'इस फ़ोन में खाता जोड़ें', 'Import to this phone')}
      </button>
      <button type="button" disabled={busy} onClick={() => setPreview(undefined)}>
        {t('বাতিল', 'रद्द करें', 'Cancel')}
      </button>
    </div>}
    {notice && <output>{notice}{diagnostic && <small> · {diagnostic}</small>}</output>}
  </section>
}
