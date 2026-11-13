import { Eye, EyeOff } from 'lucide-react'
import './account-password.css'
import React, { useId, useRef, useState } from 'react'
import { useTutorial } from '../tutorial'
import type { Language } from '../i18n'
import { authClient } from './client'
import { accountCopy, accountError } from './copy'
import { inLanguage } from '../localize'
import { recoveryRedirect } from '../native/platform'

type Mode = 'login' | 'signup' | 'recover' | 'reset'

interface Props {
  readonly language: Language;
  readonly recovery?: boolean;
  readonly recoveryLinkFailed?: boolean;
  readonly onRecovered: () => void;
}

export function AccountForm({ language, recovery = false, recoveryLinkFailed = false, onRecovered }: Readonly<Props>) {
  const tutorial = useTutorial()
  const passwordId = useId()
  const [mode, setMode] = useState<Mode>(() => {
    if (recovery) return 'reset'
    return recoveryLinkFailed ? 'recover' : 'login'
  })
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [message, setMessage] = useState(() => recoveryLinkFailed ? inLanguage(language,
    'এই পাসওয়ার্ড রিসেট লিংকটি ব্যবহার করা যায়নি। নিচে ইমেইল দিয়ে নতুন লিংক চান।',
    'यह पासवर्ड रीसेट लिंक इस्तेमाल नहीं हो सका। नीचे ईमेल डालकर नया लिंक माँगें।',
    'This password reset link could not be used. Enter your email below to request a new link.') : '')
  const t = accountCopy[language]

  const getVal = (data: FormData, key: string) => {
    const val = data.get(key)
    return typeof val === 'string' ? val.trim() : ''
  }

  async function processAuth(currentMode: Mode, email: string, pass: string, data: FormData) {
    if (!authClient) return
    if (currentMode === 'recover') {
      const { error } = await authClient.auth.resetPasswordForEmail(email, { redirectTo: recoveryRedirect() })
      setMessage(error ? accountError(error.code, language) : t.sent)
    } else if (currentMode === 'reset') {
      const { error } = await authClient.auth.updateUser({ password: pass })
      if (error) setMessage(accountError(error.code, language))
      else onRecovered()
    } else if (currentMode === 'signup') {
      const { data: result, error } = await authClient.auth.signUp({
        email, password: pass,
        options: { data: { first_name: getVal(data, 'first'), last_name: getVal(data, 'last'), contact_phone: getVal(data, 'phone') } },
      })
      if (error) setMessage(accountError(error.code, language))
      else if (!result.session) setMessage(t.blocked)
    } else {
      const { error } = await authClient.auth.signInWithPassword({ email, password: pass })
      if (error) setMessage(accountError(error.code, language))
    }
  }

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authClient || inFlight.current) return
    const form = event.currentTarget
    const data = new FormData(form)
    const email = getVal(data, 'email')
    const rawPassword = data.get('password')
    const password = typeof rawPassword === 'string' ? rawPassword : ''

    inFlight.current = true
    setBusy(true); setMessage('')
    try {
      await processAuth(mode, email, password, data)
    } catch {
      setMessage(t.error)
    } finally {
      const field = form.elements.namedItem('password')
      if (field instanceof HTMLInputElement) field.value = ''
      setPasswordVisible(false)
      inFlight.current = false; setBusy(false)
    }
  }

  const PasswordIcon = passwordVisible ? EyeOff : Eye
  const passwordToggleLabel = passwordVisible
    ? inLanguage(language, 'পাসওয়ার্ড ঢাকুন', 'पासवर्ड छिपाएँ', 'Hide password')
    : inLanguage(language, 'পাসওয়ার্ড দেখুন', 'पासवर्ड दिखाएँ', 'Show password')
  const identifierPlaceholder = { bn: 'ইমেইল বা মোবাইল নম্বর', hi: 'ईमेल या मोबाइल नंबर', en: 'Email or mobile number' }[language]
  const title = { login: t.login, signup: t.signup, recover: t.recover, reset: t.save }[mode]
  function change(next: Mode) { setMode(next); setMessage(''); setPasswordVisible(false) }

  return <div className="form">
    <form key={mode} onSubmit={submit} aria-label={title}>
      {busy && <output>{inLanguage(language,'সার্ভার চালু হতে প্রায় এক মিনিট লাগতে পারে। অপেক্ষা করুন; আবার Submit করবেন না।','सर्वर शुरू होने में लगभग एक मिनट लग सकता है। प्रतीक्षा करें; दोबारा Submit न करें।','The server may take about a minute to start. Please wait; do not submit again.')}</output>}
      <fieldset disabled={busy || !authClient} style={{ border: 0, padding: 0, margin: 0 }}>
        {mode === 'signup' && <>
          <label className="field">{t.first}<input className="input" name="first" autoComplete="given-name" required maxLength={80} pattern=".*\S.*" /></label>
          <label className="field">{t.last}<input className="input" name="last" autoComplete="family-name" required maxLength={80} pattern=".*\S.*" /></label>
          <label className="field">{t.phone}<input className="input" name="phone" type="tel" autoComplete="tel" minLength={6} maxLength={25} pattern={String.raw`\+?[0-9][0-9 \(\)\-]{4,23}[0-9]`} /></label>
        </>}
        {mode !== 'reset' && <label className="field">{t.email}<input className="input" name="email" type={mode === 'recover' ? 'email' : 'text'} autoComplete="username" placeholder={identifierPlaceholder} required maxLength={254} /></label>}
        {mode !== 'recover' && <div className="field">
          <label htmlFor={passwordId}>{mode === 'reset' ? t.newPassword : t.password}</label>
          <div className="account-password">
            <input id={passwordId} className="input" name="password" type={passwordVisible ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 8} maxLength={128} />
            <button type="button" aria-controls={passwordId} aria-label={passwordToggleLabel} onClick={() => setPasswordVisible(visible => !visible)}>
              <PasswordIcon size={20} aria-hidden="true" />
            </button>
          </div>
        </div>}
        <button className="gradient" type="submit">{busy ? t.waiting : title}</button>
      </fieldset>
    </form>
    {!authClient && <p role="alert">{t.config}</p>}
    {message && <output aria-live="polite" className="status-message">{message}</output>}
    {mode !== 'reset' && <div className="options">
      <button type="button" disabled={busy} onClick={() => change(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? t.signup : t.login}</button>
      {mode === 'login' && <button type="button" disabled={busy} onClick={() => change('recover')}>{t.forgot}</button>}
    </div>}
    {tutorial && <p className="note">{t.persistent}</p>}    </div>
}
