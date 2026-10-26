import { phoneHref } from '../phone';
import { useState } from 'react'
import type { Language } from '../i18n'

const copy = {
  bn: { call: 'ডায়াল করুন', pick: 'ফোনবুক থেকে নিন', failed: 'নম্বর নেওয়া যায়নি। নিজে লিখতে পারবেন।' },
  en: { call: 'Dial number', pick: 'Choose from contacts', failed: 'Could not read the number. You can type it instead.' },
  hi: { call: 'नंबर डायल करें', pick: 'संपर्क से चुनें', failed: 'नंबर नहीं मिला। आप खुद लिख सकते हैं।' },
}
type ContactNavigator = Navigator & { contacts?: { select: (fields: string[], options: { multiple: boolean }) => Promise<{ tel?: string[] }[]> } }
export function PartyPhone({ language, label, initial }: Readonly<{ language: Language; label: string; initial: string }>) {
  const [phone, setPhone] = useState(initial), [error, setError] = useState('')
  const t = copy[language], contacts = (navigator as ContactNavigator).contacts
  async function choose() {
    try {
      const selected = await contacts?.select(['tel'], { multiple: false })
      const number = selected?.[0]?.tel?.[0]
      if (number) { setPhone(number.slice(0, 30)); setError('') }
    } catch (e) {
      if (!(typeof e === 'object' && e !== null && 'name' in e && e.name === 'AbortError')) setError(t.failed)
    }
  }
  return <div><label>{label}<input type="tel" name="phone" autoComplete="tel" maxLength={30} value={phone} onChange={e => setPhone(e.target.value)}/></label><div className="books-buttons">{phoneHref(phone) && <a href={phoneHref(phone)}>{t.call}</a>}{contacts && <button type="button" onClick={() => { void choose() }}>{t.pick}</button>}</div>{error && <output role="alert">{error}</output>}</div>
}
