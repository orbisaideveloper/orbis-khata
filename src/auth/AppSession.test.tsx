import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../App'
const state = vi.hoisted(() => ({ session: null as null | { user: { id: string } }, loading: false, recovery: false, unavailable: false, setRecovery: vi.fn() }))
const auth = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('./useAccount', () => ({ useAccount: () => state }))
vi.mock('./client', () => ({ authClient: { auth } }))
vi.mock('./CompanyGate', () => ({ CompanyGate: ({ userId }: { userId: string }) => <p>Books for {userId}</p> }))
vi.mock('./AccountForm', () => ({ AccountForm: ({ recovery, onRecovered }: { recovery?: boolean; onRecovered: () => void }) => <button onClick={onRecovered}>{recovery ? 'Finish recovery' : 'Account form'}</button> }))
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear()
  state.session = { user: { id: 'owner-a' } }; state.loading = false; state.recovery = false; state.unavailable = false
})
afterEach(cleanup)
function english() {
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'en' } })
}
it('restores the workspace and passes the authenticated owner to the books', async () => {
  const view = render(<App />); english()
  fireEvent.click(screen.getByRole('button', { name: /Khata Boi/ }))
  expect(screen.getByText('Books for owner-a')).toBeInTheDocument()
  state.session = null; view.rerender(<App />)
  expect(screen.queryByText('Books for owner-a')).toBeNull()
  act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: { khataView: 'khata' } })))
  expect(screen.queryByText('Books for owner-a')).toBeNull()
})
it.each([false, true])('shows logout failure and allows a later successful local logout (throws=%s)', async throws => {
  if (throws) auth.signOut.mockRejectedValueOnce(new Error('offline'))
  else auth.signOut.mockResolvedValueOnce({ error: { message: 'offline' } })
  auth.signOut.mockResolvedValueOnce({ error: null })
  render(<App />); english()
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' })
})
it('does not expose books while session restoration is pending or unavailable', () => {
  state.loading = true
  const view = render(<App />)
  expect(screen.getByRole('status')).toBeInTheDocument()
  expect(screen.queryByText(/Books for/)).toBeNull()
  state.loading = false; state.unavailable = true; view.rerender(<App />)
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.queryByText(/Books for/)).toBeNull()
})
it('routes recovery completion back to session state', () => {
  state.recovery = true
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Finish recovery' }))
  expect(state.setRecovery).toHaveBeenCalledWith(false)
})
it('opens the configured account form from public navigation', () => {
  state.session = null
  render(<App />); english()
  act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: { khataView: 'login' } })))
  fireEvent.click(screen.getByRole('button', { name: 'Account form' }))
  expect(state.setRecovery).toHaveBeenCalledWith(false)
})
