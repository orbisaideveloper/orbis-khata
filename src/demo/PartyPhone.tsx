import { canChooseContactPhone, chooseContactPhone } from '../contact-phone'
import { phoneHref } from '../phone';
import { useState } from 'react'
import type { Language } from '../i18n'

const copy = {
  bn: { call: 'ডায়াল করুন', pick: 'ফোনবুক থেকে নিন', failed: 'নম্বর নেওয়া যায়নি। নিজে লিখতে পারবেন।' },
  en: { call: 'Dial number', pick: 'Choose from contacts', failed: 'Could not read the number. You can type it instead.' },
  hi: { call: 'नंबर डायल करें', pick: 'संपर्क से चुनें', failed: 'नंबर नहीं मिला। आप खुद लिख सकते हैं।' },
}
export function PartyPhone({ language, label, initial }: Readonly<{ language: Language; label: string; initial: string }>) {
  const [phone, setPhone] = useState(initial), [error, setError] = useState('')
  const t = copy[language]
  async function choose() {
    try {
      const number = await chooseContactPhone()
      if (number) { setPhone(number); setError('') }
    } catch {
      setError(t.failed)
    }
  }
  return <div><label>{label}<input type="tel" name="phone" autoComplete="tel" maxLength={30} value={phone} onChange={e => setPhone(e.target.value)}/></label><div className="books-buttons">{phoneHref(phone) && <a href={phoneHref(phone)}>{t.call}</a>}{canChooseContactPhone() && <button type="button" onClick={() => { void choose() }}>{t.pick}</button>}</div>{error && <output role="alert">{error}</output>}</div>
}
