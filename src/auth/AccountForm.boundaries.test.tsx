import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AccountForm } from './AccountForm'
const fixture = vi.hoisted(() => ({ client: null as null | { auth: { signUp: ReturnType<typeof vi.fn>; signInWithPassword: ReturnType<typeof vi.fn>; resetPasswordForEmail: ReturnType<typeof vi.fn>; updateUser: ReturnType<typeof vi.fn> } } }))
vi.mock('./client', () => ({ get authClient() { return fixture.client } }))
beforeEach(() => { fixture.client = { auth: { signUp: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn() } } })
afterEach(cleanup)
it('reports recovery/signup failures, thrown login errors and successful login accurately', async () => {
  const auth = fixture.client!.auth
  auth.resetPasswordForEmail.mockResolvedValue({ error: { code: 'CENTRAL_ACCOUNT_UNAVAILABLE' } })
  let view = render(<AccountForm language="en" onRecovered={vi.fn()} />)
  fireEvent.click(screen.getByText('Forgot password?')); fireEvent.submit(screen.getByRole('form'))
  await screen.findByRole('status'); expect(auth.resetPasswordForEmail).toHaveBeenCalledOnce(); view.unmount()
  auth.signUp.mockResolvedValue({ data: { session: null }, error: { code: 'weak_password' } })
  view = render(<AccountForm language="en" onRecovered={vi.fn()} />)
  fireEvent.click(screen.getByText('Create account')); fireEvent.submit(screen.getByRole('form'))
  await screen.findByRole('status'); expect(auth.signUp).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Log in' })); expect(screen.queryByRole('status')).toBeNull()
  auth.signInWithPassword.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ error: null })
  fireEvent.submit(screen.getByRole('form')); await screen.findByRole('status')
  fireEvent.submit(screen.getByRole('form')); await screen.findByRole('button', { name: 'Log in' })
  expect(auth.signInWithPassword).toHaveBeenCalledTimes(2); expect(screen.queryByRole('status')).toBeNull()
})
it.each(['bn', 'hi'] as const)('renders regional contact labels in %s', language => {
  render(<AccountForm language={language} onRecovered={vi.fn()} />)
  expect(screen.getByPlaceholderText(language === 'bn' ? 'ইমেইল বা মোবাইল নম্বর' : 'ईमेल या मोबाइल नंबर')).toBeInTheDocument()
})
it('does not submit unconfigured auth or auth removed while the form is being read', async () => {
  fixture.client = null
  const first = render(<AccountForm language="en" onRecovered={vi.fn()} />)
  fireEvent.submit(screen.getByRole('form')); expect(screen.getByRole('alert')).toBeInTheDocument(); first.unmount()
  const auth = { signUp: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn() }
  fixture.client = { auth }
  render(<AccountForm language="en" onRecovered={vi.fn()} />)
  const Original = FormData
  const intercept = vi.spyOn(window, 'FormData').mockImplementation(function(form?: HTMLFormElement) { fixture.client = null; return new Original(form) })
  try { fireEvent.submit(screen.getByRole('form')); expect(auth.signInWithPassword).not.toHaveBeenCalled() }
  finally { intercept.mockRestore() }
})
