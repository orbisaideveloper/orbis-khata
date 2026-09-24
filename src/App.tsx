import { useEffect, useRef, useState } from 'react'
import { languageOptions, readLanguage, saveLanguage, translations } from './i18n'
import type { Language, TextKey } from './i18n'
import './App.css'
import { authClient } from './auth/client'
import { useAccount } from './auth/useAccount'
import { AccountForm } from './auth/AccountForm'
import { accountCopy } from './auth/copy'
import { CompanyGate } from './auth/CompanyGate'

type View = 'welcome' | 'login' | 'workspace' | 'khata'

// UI-only guest route. This flag is NOT an authentication control; any future
// API must independently enforce AuthN/AuthZ and tenant boundaries.
const guestUiEnabled = !authClient && import.meta.env.VITE_KHATA_GUEST_UI !== 'false'


const languagePresentation: Record<Language, { title: string; pickerLabel: string }> = {
  bn: { title: 'ORBIS খাতাবই', pickerLabel: 'ভাষা নির্বাচন' },
  en: { title: 'ORBIS Khata Boi', pickerLabel: 'Choose language' },
  hi: { title: 'ORBIS खाताबही', pickerLabel: 'भाषा चुनें' },
}

function OrbitMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="9" stroke="currentColor" strokeWidth="2" />
      <ellipse cx="16" cy="16" rx="15" ry="6" transform="rotate(-36 16 16)" stroke="#9bceff" strokeWidth="1.5" />
      <circle cx="25.7" cy="8.8" r="2.4" fill="currentColor" />
    </svg>
  )
}

function App() {
  // No demo session, user, financial values, company or token is persisted.
  const [view, setView] = useState<View>('welcome')
  const [language, setLanguage] = useState<Language>(readLanguage)
  const account = useAccount()
  const signedIn = Boolean(account.session)
  const [logoutError, setLogoutError] = useState(false)
  const guestEntered = useRef(false)
  const t = (key: TextKey) => translations[language][key]

  useEffect(() => {
    document.documentElement.lang = language
    document.title = languagePresentation[language].title
  }, [language])

  useEffect(() => {
    window.history.replaceState({ khataView: 'welcome' }, '')
    function onBack(event: PopStateEvent) {
      const target = (event.state as { khataView?: View } | null)?.khataView
      // Browser history only navigates within public UI; never grants data access.
      if (target === 'login' || target === 'welcome') setView(target)
      else if ((signedIn || (guestUiEnabled && guestEntered.current)) && (target === 'workspace' || target === 'khata')) setView(target)
      else setView('welcome')
    }
    window.addEventListener('popstate', onBack)
    return () => window.removeEventListener('popstate', onBack)
  }, [signedIn])

  useEffect(() => {
    if (!authClient || account.loading) return
    window.history.replaceState({ khataView: signedIn ? 'workspace' : 'welcome' }, '')
    setView(signedIn ? 'workspace' : 'welcome')
  }, [signedIn, account.loading])

  async function logout() {
    if (!authClient) { backToWelcome(); return }
    try {
      const { error } = await authClient.auth.signOut({ scope: 'local' })
      setLogoutError(Boolean(error))
    } catch { setLogoutError(true) }
  }

  function navigate(next: View) {
    if (!signedIn && !guestUiEnabled && (next === 'workspace' || next === 'khata')) return
    if (next === 'workspace' && view === 'login') guestEntered.current = true
    if (next === 'khata' && !signedIn && !guestEntered.current) return
    window.history.pushState({ khataView: next }, '')
    setView(next)
    document.documentElement.scrollTop = 0
  }

  function backToWelcome() {
    guestEntered.current = false
    // Explicit exit clears the current UI navigation trail, not any sensitive data.
    window.history.replaceState({ khataView: 'welcome' }, '')
    setView('welcome')
    document.documentElement.scrollTop = 0
  }

  function languagePicker(light = false) {
    return (
      <select
        className={`lang${light ? ' light' : ''}`}
        aria-label={languagePresentation[language].pickerLabel}
        value={language}
        onChange={(event) => {
          const selected = event.target.value as Language
          setLanguage(selected)
          saveLanguage(selected)
        }}
      >
        {languageOptions.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
      </select>
    )
  }

  if (account.loading) return <main className="phone"><output>{accountCopy[language].network}</output></main>
  if (account.unavailable) return <main className="phone"><p role="alert">{accountCopy[language].error}</p><button type="button" onClick={() => window.location.reload()}>{accountCopy[language].retry}</button></main>
  if (account.recovery) return <main className="phone"><AccountForm key="recovery" language={language} recovery onRecovered={() => account.setRecovery(false)} /></main>

  return (
    <main className="phone">
      {view === 'welcome' && (
        <section className="scene welcome active" aria-label={t('h1a')}>
          <header className="top">
            <div className="brand"><span className="orb"><OrbitMark /></span><span>ORBIS<small>{t('brand')}</small></span></div>
            {languagePicker()}
          </header>
          <div className="headline">
            <span className="eyebrow">{t('tag')}</span>
            <h1><span>{t('h1a')}</span><br /><span>{t('h1b')}</span><br /><span style={{ color: 'white' }}>{t('h1c')}</span></h1>
            <p>{t('intro')}</p>
          </div>
          <div className="art">
            <div className="paper">
              <div className="cap">{t('paper')}</div>
              <div className="balance">—</div>
              <div className="muted">{t('noFigures')}</div>
              <div className="empty-bars" aria-hidden="true"><i /><i /><i /><i /><i /></div>
              <div className="lower"><span>{t('in')}</span><span>{t('out')}</span></div>
            </div>
            <span className="bubble one">{t('one')}</span><span className="bubble two">{t('mods')}</span>
          </div>
          <div className="actions">
            <button type="button" className="primary" onClick={() => navigate('login')}>{t('start')}</button>
            <button type="button" className="secondary" onClick={() => navigate('login')}>{t('existing')}</button>
            <p className="welcome-foot">{t('foot')}</p>
          </div>
        </section>
      )}

      {view === 'login' && (
        <section className="scene light-scene active" aria-label={t('loginTag')}>
          <header className="bar"><button type="button" className="back" onClick={() => navigate('welcome')} aria-label={t('exit')}>←</button><span className="pill">{t('loginTag')}</span>{languagePicker(true)}</header>
          <div className="login-title"><div className="login-mark">O</div><h1>{t('back')}</h1><p className="subtitle">{authClient ? accountCopy[language].persistent : t('authInfo')}</p></div>
          {authClient ? <AccountForm language={language} onRecovered={() => account.setRecovery(false)} /> : (
          <div className="form">
            <label className="field"><span>{t('email')}</span><span className="input"><span aria-hidden="true">✉</span><input autoComplete="off" disabled placeholder={t('pending')} /></span></label>
            <label className="field"><span>{t('pass')}</span><span className="input"><span aria-hidden="true">⌑</span><input type="password" autoComplete="off" disabled placeholder={t('noPass')} /></span></label>
            <div className="options"><span>{t('remember')}</span><span>{t('recover')}</span></div>
            <button type="button" className="disabled" disabled>{t('loginOff')}</button>
            <div className="divider">{t('or')}</div>
            {guestUiEnabled && <button type="button" className="gradient" onClick={() => navigate('workspace')}>{t('skip')}</button>}
            <div className="note" role="note">{t('authGuard')}</div>
          </div>
          )}
          <div className="login-footer">{authClient ? '' : t('signup')}</div>
        </section>
      )}

      {view === 'workspace' && (signedIn || guestUiEnabled) && (
        <section className="scene light-scene active" aria-label={t('choose')}>
          <header className="bar workspace-header"><div className="brand"><span className="orb"><OrbitMark /></span><span>ORBIS<small>{t('workBrand')}</small></span></div>{languagePicker(true)}</header>
          <div className="workspace-title"><span className="eyebrow l">{t('workBadge')}</span><h1>{t('hi')}</h1><p className="subtitle">{t('choose')}</p></div>
          <div className="welcome-panel"><strong>{t('panel')}</strong><p>{t('panelDesc')}</p></div>
          <div className="modules">
            <button type="button" className="module" onClick={() => navigate('khata')}><span className="ic" aria-hidden="true">📘</span><span className="copy"><strong>{t('khata')}</strong><small>{t('khataDesc')}</small></span><span className="status">{t('open')}</span></button>
            <div className="module planned"><span className="ic farm" aria-hidden="true">🌱</span><span className="copy"><strong>{t('farm')}</strong><small>{t('farmDesc')}</small></span><span className="status">{t('later')}</span></div>
            <div className="module planned"><span className="ic lot" aria-hidden="true">🎟️</span><span className="copy"><strong>{t('lot')}</strong><small>{t('lotDesc')}</small></span><span className="status">{t('soon')}</span></div>
          </div>
          <div className="settings"><h2>{t('settings')}</h2><p>{t('settingsDesc')}</p><button type="button" className="exit" onClick={() => { void logout() }}>{signedIn ? accountCopy[language].logout : t('exit')}</button>
          {signedIn && <p>{accountCopy[language].lock} — {accountCopy[language].lockInfo}</p>}
          {logoutError && <p role="alert">{accountCopy[language].error}</p>}</div>
        </section>
      )}

      {view === 'khata' && (signedIn || guestUiEnabled) && (
        <section className="scene light-scene active" aria-label={t('khata')}>
          <header className="bar"><button type="button" className="back" onClick={() => navigate('workspace')} aria-label={t('choose')}>←</button><span className="pill">{t('khata')}</span>{languagePicker(true)}</header>
          {!signedIn && <div className="khata-title"><div className="bar"><span className="eyebrow l">{t('dashboard')}</span><span className="period">{t('month')}</span></div><h1>{t('khata')}</h1><p>{t('khataHead')}</p></div>}
          <CompanyGate key={account.session?.user.id ?? 'guest'} userId={account.session?.user.id} language={language}>
          <div className="metrics">
            {(['moneyIn', 'moneyOut', 'receive', 'pay'] as const).map((key) => <div className="metric" key={key}><span className="metric-label">{t(key)}</span><strong>—</strong><small>{t('emptyValue')}</small></div>)}
          </div>
          <div className="empty"><div className="big" aria-hidden="true">📒</div><h2>{t('emptyTitle')}</h2><p>{t('emptyDesc')}</p><span className="next">{t('next')}</span></div>
          <div className="actions-row">{(['sale','purchase','receipt','payment'] as const).map((key) => <button type="button" className="action-chip" disabled key={key}>{t(key)}</button>)}</div>
          <p className="screen-foot">{t('noFake')}</p>
          </CompanyGate>
        </section>
      )}
    </main>
  )
}

export default App
