import React, { useRef, useState } from 'react'
import type { Language } from '../i18n'
import { authClient } from './client'
import { accountCopy, accountError } from './copy'

type Mode = 'login' | 'signup' | 'recover' | 'reset'

interface Props {
  readonly language: Language;
  readonly recovery?: boolean;
  readonly onRecovered: () => void;
}

export function AccountForm({ language, recovery = false, onRecovered }: Props) {
  const [mode, setMode] = useState<Mode>(recovery ? 'reset' : 'login')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [message, setMessage] = useState('')
  const t = accountCopy[language]

  const getVal = (data: FormData, key: string) => {
    const val = data.get(key)
    return typeof val === 'string' ? val.trim() : ''
  }

  async function processAuth(currentMode: Mode, email: string, pass: string, data: FormData) {
    if (!authClient) return
    if (currentMode === 'recover') {
      const { error } = await authClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/' })
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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authClient || inFlight.current) return
    const form = event.currentTarget
    const data = new FormData(form)
    const email = getVal(data, 'email')
    const password = getVal(data, 'password')
    
    inFlight.current = true
    setBusy(true); setMessage('')
    try {
      await processAuth(mode, email, password, data)
    } catch { 
      setMessage(t.error) 
    } finally {
      const field = form.elements.namedItem('password')
      if (field instanceof HTMLInputElement) field.value = ''
      inFlight.current = false; setBusy(false)
    }
  }

  const title = { login: t.login, signup: t.signup, recover: t.recover, reset: t.save }[mode]
  function change(next: Mode) { setMode(next); setMessage('') }

  return <div className="form">
    <form key={mode} onSubmit={submit} aria-label={title}>
      <fieldset disabled={busy || !authClient} style={{ border: 0, padding: 0, margin: 0 }}>
        {mode === 'signup' && <>
          <label className="field">{t.first}<input className="input" name="first" autoComplete="given-name" required maxLength={80} pattern=".*\S.*" /></label>
          <label className="field">{t.last}<input className="input" name="last" autoComplete="family-name" required maxLength={80} pattern=".*\S.*" /></label>
          <label className="field">{t.phone}<input className="input" name="phone" type="tel" autoComplete="tel" required minLength={6} maxLength={25} pattern={String.raw`\+?[0-9][0-9 \(\)\-]{4,23}[0-9]`} /></label>
        </>}
        {mode !== 'reset' && <label className="field">{t.email}<input className="input" name="email" type="email" autoComplete="email" required maxLength={254} /></label>}
        {mode !== 'recover' && <label className="field">{mode === 'reset' ? t.newPassword : t.password}<input className="input" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 8} maxLength={128} /></label>}
        <button className="gradient" type="submit">{busy ? t.waiting : title}</button>
      </fieldset>
    </form>
    {!authClient && <p role="alert">{t.config}</p>}
    {message && <output aria-live="polite" className="status-message">{message}</output>}
    {mode !== 'reset' && <div className="options">
      <button type="button" disabled={busy} onClick={() => change(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? t.signup : t.login}</button>
      {mode === 'login' && <button type="button" disabled={busy} onClick={() => change('recover')}>{t.forgot}</button>}
    </div>}
    <p className="note">{t.persistent}</p>
  </div>
}
