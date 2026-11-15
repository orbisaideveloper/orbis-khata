import { useState } from 'react'
import { readOnlineCompanies } from '../accounting/api'
import type { Company } from '../accounting/model'
import type { Language } from '../i18n'
import { inLanguage } from '../localize'

type CompanyComparison = { online: Company[]; local: Company[] }

export function CompanySyncPreview({ actor, language }: Readonly<{ actor: string; language: Language }>) {
  const [comparison, setComparison] = useState<CompanyComparison>()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const t = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en)

  async function compare() {
    setBusy(true)
    setFailed(false)
    setComparison(undefined)
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

  return <section className="privacy-links">
    <h2>{t('কোম্পানির তালিকা মিলিয়ে দেখুন', 'कंपनियों की सूचियाँ देखें', 'Compare company lists')}</h2>
    <p>{t('ওয়েব ও এই ফোনে থাকা সক্রিয় কোম্পানিগুলো দেখুন।', 'वेब और इस फ़ोन की सक्रिय कंपनियाँ देखें।', 'View active companies on the web and on this phone.')}</p>
    <button type="button" disabled={busy} onClick={() => void compare()}>
      {t('তালিকা দেখুন', 'सूचियाँ देखें', 'View company lists')}
    </button>
    {busy && <output>{t('তালিকা আনা হচ্ছে…', 'सूचियाँ लोड हो रही हैं…', 'Loading company lists…')}</output>}
    {failed && <output>{t('তালিকা আনা যায়নি। অনলাইনে একই ORBIS অ্যাকাউন্টে সাইন ইন করে চেষ্টা করুন।', 'सूचियाँ नहीं मिल सकीं। उसी ORBIS खाते में ऑनलाइन साइन इन करके फिर कोशिश करें।', 'Could not load both lists. Sign in online with the same ORBIS account and try again.')}</output>}
    {comparison && [
      { title: t('ওয়েবের কোম্পানি', 'वेब की कंपनियाँ', 'Web companies'), rows: comparison.online },
      { title: t('এই ফোনের কোম্পানি', 'इस फ़ोन की कंपनियाँ', 'Companies on this phone'), rows: comparison.local },
    ].map(({ title, rows }) => <div key={title}>
      <h3>{title} ({rows.length})</h3>
      {rows.length > 0 && <ul>{rows.map(row => <li key={row.id}>{row.name}</li>)}</ul>}
    </div>)}
  </section>
}
