import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { LANGUAGE_KEY, languageOptions, readLanguage, translations } from './i18n'

// Legacy UI remains testable even when local real-auth environment is configured.
vi.mock('./auth/client', () => {
  vi.stubEnv('VITE_KHATA_GUEST_UI', 'true')
  return { authClient: null }
})

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
  document.documentElement.lang = 'en'
})
afterEach(() => cleanup())

function setLanguage(next: 'bn' | 'hi' | 'en') {
  const labels = { bn: 'ভাষা নির্বাচন', hi: 'भाषा चुनें', en: 'Choose language' }
  fireEvent.change(screen.getByRole('combobox', { name: labels[document.documentElement.lang as keyof typeof labels] || labels.bn }), {
    target: { value: next },
  })
}
function openKhata() {
  fireEvent.click(screen.getByRole('button', { name: /শুরু করুন/ }))
  fireEvent.click(screen.getByRole('button', { name: /লগইন ছাড়া অ্যাপ খুলুন/ }))
  fireEvent.click(screen.getByRole('button', { name: /খাতাবই.*খুলুন/ }))
}

describe('owner-approved final UI: Welcome → Login → Workspace → Khata Boi', () => {
  it('keeps approved three-line welcome, orbit, layout and no fabricated money', () => {
    render(<App />)
    const title = screen.getByRole('heading', { level: 1 })
    expect(title).toHaveTextContent('আপনার ব্যবসা।আপনার হিসাব।এক জায়গায়।')
    expect(title.querySelectorAll('br')).toHaveLength(2)
    expect(document.querySelector('.welcome .orb svg')).not.toBeNull()
    expect(document.querySelector('.paper .balance')).toHaveTextContent('—')
    expect(screen.queryByText(/₹24,650|24650|Demo user|ডেমো ব্যবহারকারী/)).not.toBeInTheDocument()
    expect(screen.getByText('প্রতিষ্ঠান তৈরি হলে আপনার বাস্তব হিসাব এখানে দেখাবে')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('bn')
  })
  it('keeps the approved login form visible but disables credential collection', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /শুরু করুন/ }))
    expect(screen.getByRole('heading', { name: /আবার স্বাগতম/ })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('লগইন চালুর পর')).toBeDisabled()
    expect(screen.getByPlaceholderText('এখন পাসওয়ার্ড দেবেন না')).toBeDisabled()
    expect(screen.getByRole('button', { name: /বাস্তব লগইন/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /লগইন ছাড়া অ্যাপ খুলুন/ })).toBeEnabled()
    expect(screen.queryByText('ডেমো মনে রাখুন')).not.toBeInTheDocument()
  })
  it('opens guest-only workspace, keeps approved module order without demo profile', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /শুরু করুন/ }))
    fireEvent.click(screen.getByRole('button', { name: /লগইন ছাড়া অ্যাপ খুলুন/ }))
    expect(screen.getByRole('heading', { name: 'স্বাগতম! 👋' })).toBeInTheDocument()
    const titles = [...document.querySelectorAll('.module strong')].map((node) => node.textContent)
    expect(titles).toEqual(['খাতাবই', 'ফার্মিং', 'লটারি'])
    expect(screen.queryByText('DU')).not.toBeInTheDocument()
    expect(screen.queryByText(/ডেমো সেশন/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ওয়েলকামে ফিরুন' })).toBeInTheDocument()
  })
  it('renders the approved Khata dashboard shell with four empty values and disabled financial actions', () => {
    render(<App />)
    openKhata()
    expect(screen.getByRole('heading', { name: 'খাতাবই' })).toBeInTheDocument()
    expect([...document.querySelectorAll('.metric strong')].map((node) => node.textContent)).toEqual(['—', '—', '—', '—'])
    expect(screen.getByText('হিসাব শুরু করার জন্য প্রস্তুত')).toBeInTheDocument()
    expect(screen.getAllByText('এখনও তথ্য নেই')).toHaveLength(4)
    for (const name of ['বিক্রি', 'ক্রয়', 'টাকা গ্রহণ', 'পেমেন্ট']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })
  it('works in English across all four screens and keeps language after unmount', () => {
    const first = render(<App />)
    setLanguage('en')
    expect(screen.getByRole('heading', { name: /Your business/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Get started/ }))
    expect(screen.getByRole('button', { name: /Open app without signing in/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Open app without signing in/ }))
    expect(screen.getByText('Choose your module')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Khata Boi.*Open/ }))
    expect(screen.getByRole('heading', { name: 'Khata Boi' })).toBeInTheDocument()
    first.unmount()
    render(<App />)
    expect(screen.getByRole('heading', { name: /Your business/ })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Choose language' })).toHaveValue('en')
    expect(window.localStorage.getItem('orbis-khata-demo-session-v1')).toBeNull()
  })
  it('switches to Hindi while keeping the current screen', () => {
    render(<App />)
    setLanguage('hi')
    expect(screen.getByRole('heading', { name: /आपका कारोबार/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /शुरू करें/ }))
    fireEvent.click(screen.getByRole('button', { name: /बिना लॉगिन ऐप खोलें/ }))
    expect(screen.getByText('अपना मॉड्यूल चुनें')).toBeInTheDocument()
    expect(screen.getByText('फार्मिंग')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /खाताबही.*खोलें/ }))
    expect(screen.getByRole('heading', { name: 'खाताबही' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'बिक्री' })).toBeDisabled()
  })
  it('keeps localized page titles and language picker labels consistent', () => {
    render(<App />)
    expect(document.title).toBe('ORBIS খাতাবই')
    expect(screen.getByRole('combobox', { name: 'ভাষা নির্বাচন' })).toHaveValue('bn')
    setLanguage('en')
    expect(document.title).toBe('ORBIS Khata Boi')
    expect(screen.getByRole('combobox', { name: 'Choose language' })).toHaveValue('en')
    setLanguage('hi')
    expect(document.title).toBe('ORBIS खाताबही')
    expect(screen.getByRole('combobox', { name: 'भाषा चुनें' })).toHaveValue('hi')
  })

  it('keeps language persistent but does not persist guest UI navigation', () => {
    const first = render(<App />)
    setLanguage('en')
    fireEvent.click(screen.getByRole('button', { name: /Get started/ }))
    fireEvent.click(screen.getByRole('button', { name: /Open app without signing in/ }))
    first.unmount()
    render(<App />)
    expect(screen.getByRole('heading', { name: /Your business/ })).toBeInTheDocument()
    expect(window.localStorage.getItem(LANGUAGE_KEY)).toBe('en')
  })
  it('supports back navigation and explicit return to Welcome', () => {
    render(<App />)
    openKhata()
    fireEvent(window, new PopStateEvent('popstate', { state: { khataView: 'workspace' } }))
    expect(screen.getByText('আপনার মডিউল বেছে নিন')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ওয়েলকামে ফিরুন' }))
    expect(screen.getByRole('heading', { name: /আপনার ব্যবসা/ })).toBeInTheDocument()
  })
  it('has equal non-empty translation keys and gracefully handles storage denial', () => {
    expect(languageOptions.map((x) => x.code)).toEqual(['bn', 'en', 'hi'])
    const expected = Object.keys(translations.bn).sort()
    for (const { code } of languageOptions) {
      expect(Object.keys(translations[code]).sort()).toEqual(expected)
      expect(Object.values(translations[code]).every((v) => v.trim().length > 0)).toBe(true)
    }
    window.localStorage.setItem(LANGUAGE_KEY, 'invalid')
    expect(readLanguage()).toBe('bn')
  })

  it('covers alternative sign-in, login back, and Khata back navigation', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'আগেই অ্যাকাউন্ট আছে? লগইন' }))
    expect(screen.getByRole('heading', { name: /আবার স্বাগতম/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ওয়েলকামে ফিরুন' }))
    expect(screen.getByRole('heading', { name: /আপনার ব্যবসা/ })).toBeInTheDocument()
    openKhata()
    fireEvent.click(screen.getByRole('button', { name: 'আপনার মডিউল বেছে নিন' }))
    expect(screen.getByText('আপনার মডিউল বেছে নিন')).toBeInTheDocument()
  })

  it('rejects unauthorized history targets and permits guest history after entry', () => {
    render(<App />)
    fireEvent(window, new PopStateEvent('popstate', { state: { khataView: 'khata' } }))
    expect(screen.getByRole('heading', { name: /আপনার ব্যবসা/ })).toBeInTheDocument()
    fireEvent(window, new PopStateEvent('popstate', { state: { khataView: 'login' } }))
    expect(screen.getByRole('heading', { name: /আবার স্বাগতম/ })).toBeInTheDocument()
    fireEvent(window, new PopStateEvent('popstate', { state: { khataView: 'welcome' } }))
    openKhata()
    fireEvent(window, new PopStateEvent('popstate', { state: { khataView: 'khata' } }))
    expect(screen.getByRole('heading', { name: 'খাতাবই' })).toBeInTheDocument()
    fireEvent(window, new PopStateEvent('popstate', { state: null }))
    expect(screen.getByRole('heading', { name: /আপনার ব্যবসা/ })).toBeInTheDocument()
  })

  it('changes language on Khata and blocks old history after explicit exit', () => {
    render(<App />)
    openKhata()
    setLanguage('en')
    expect(screen.getByRole('heading', { name: 'Khata Boi' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose your module' }))
    expect(screen.getByText('Choose your module')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to welcome' }))
    fireEvent(window, new PopStateEvent('popstate', { state: { khataView: 'khata' } }))
    expect(screen.getByRole('heading', { name: /Your business/ })).toBeInTheDocument()
  })
})
