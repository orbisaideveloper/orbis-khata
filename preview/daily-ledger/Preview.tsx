import { useEffect, useState } from 'react'
import { today } from '../../src/accounting/model'
import DailyLedger from '../../src/daily-ledger/DailyLedger'
import { label } from '../../src/daily-ledger/copy'
import type { Language } from '../../src/i18n'
import { createSampleStore } from './sample-store'

const themes = { system: 'systemTheme', light: 'lightTheme', dark: 'darkTheme' } as const
const languages = { bn: 'বাংলা', hi: 'हिन्दी', en: 'English' } as const

export default function Preview() {
  const [store] = useState(() => createSampleStore(today()))
  const [language, setLanguage] = useState<Language>('bn')
  const [theme, setTheme] = useState<keyof typeof themes>('system')
  useEffect(() => { document.documentElement.lang = language }, [language])

  return <div className="ledger-preview" data-preview-theme={theme}>
    <main className="ledger-preview-content">
      <header className="ledger-preview-header">
        <div className="ledger-preview-brand">ORBIS <strong>Khata</strong></div>
        <div className="ledger-preview-preferences">
          <label>{label(language, 'language')}<select value={language} onChange={event => {
            const next = event.target.value
            if (next === 'bn' || next === 'hi' || next === 'en') setLanguage(next)
          }}>
            {Object.entries(languages).map(([key, name]) => <option key={key} value={key} lang={key}>{name}</option>)}
          </select></label>
          <label>{label(language, 'theme')}<select value={theme} onChange={event => {
            const next = event.target.value
            if (next === 'system' || next === 'light' || next === 'dark') setTheme(next)
          }}>
            {Object.entries(themes).map(([key, name]) => <option key={key} value={key}>{label(language, name)}</option>)}
          </select></label>
        </div>
      </header>
      <aside className="ledger-preview-notice" aria-label={label(language, 'previewLabel')}>
        <strong>{label(language, 'previewLabel')}</strong>
        <p>{label(language, 'previewDetails')}</p>
      </aside>
      <DailyLedger store={store} language={language} preview />
    </main>
  </div>
}
