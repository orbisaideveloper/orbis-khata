import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { resolveKhataView } from './navigation-policy'
const state = vi.hoisted(() => ({ account: { session: null as null | { user: { id: string; user_metadata: Record<string, string> } }, loading: false, recovery: false, unavailable: false, setRecovery: vi.fn() }, auth: { signOut: vi.fn() } }))
vi.mock('./auth/client', () => ({ authClient: { auth: state.auth } }))
vi.mock('./auth/useAccount', () => ({ useAccount: () => state.account }))
vi.mock('./auth/AccountForm', () => ({ AccountForm: ({ onRecovered }: { onRecovered: () => void }) => <button type="button" onClick={onRecovered}>Finish recovery</button> }))
vi.mock('./auth/CompanyGate', () => ({ CompanyGate: () => <p>Authorized books</p> }))
beforeEach(() => { state.account = { session: null, loading: false, recovery: false, unavailable: false, setRecovery: vi.fn() }; localStorage.clear(); vi.resetAllMocks() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('moves from public welcome to the authenticated workspace when login completes', () => {
 const view = render(<App />)
 state.account.session = { user: { id: 'u', user_metadata: { orbis_display_id: 'ORB-U-23456789' } } }
 view.rerender(<App />)
 expect(screen.getByText('ORB-U-23456789')).toBeInTheDocument()
})
it('applies the same private-view policy to requested routes and browser history', () => {
 expect(resolveKhataView('welcome', false, false, false)).toBe('welcome')
 expect(resolveKhataView('login', false, false, false)).toBe('login')
 for (const next of ['workspace', 'khata']) {
  expect(resolveKhataView(next, false, false, false)).toBe('welcome')
  expect(resolveKhataView(next, false, true, false)).toBe('welcome')
  expect(resolveKhataView(next, false, true, true)).toBe(next)
  expect(resolveKhataView(next, true, false, false)).toBe(next)
 }
 expect(resolveKhataView('unknown', true, false, false)).toBe('welcome')
})
it('initializes an already restored account directly in its workspace', () => {
  state.account.session = { user: { id: 'u', user_metadata: { orbis_display_id: 'ORB-U-23456789' } } }
  render(<App />); expect(screen.getByText('ORB-U-23456789')).toBeInTheDocument()
})
it('ends recovery only when the account form reports completion', () => {
  state.account.recovery = true; render(<App />)
  fireEvent.click(screen.getByText('Finish recovery')); expect(state.account.setRecovery).toHaveBeenCalledWith(false)
})
it('retries unavailable sessions by reloading the page', () => {
  state.account.unavailable = true; render(<App />)
  const reload = vi.fn(); vi.stubGlobal('window', { location: { reload } })
  try { fireEvent.click(screen.getByRole('button')); expect(reload).toHaveBeenCalledOnce() }
  finally { vi.unstubAllGlobals() }
})
