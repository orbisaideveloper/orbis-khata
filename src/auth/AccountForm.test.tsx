import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountForm } from './AccountForm'

const auth = vi.hoisted(() => ({ signUp: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn() }))
vi.mock('./client', () => ({ authClient: { auth } }))
afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('account flows', () => {
  it('signs up with unverified contact metadata and no OTP step', async () => {
    auth.signUp.mockResolvedValue({ data: { session: { user: { id: 'a' } } }, error: null })
    render(<AccountForm language="en" onRecovered={() => {}} />)
    fireEvent.click(screen.getByText('Create account'))
    fill('First name', 'Ajay'); fill('Last name', 'Das'); fill('Phone number', '+919876543210')
    fill('Email', 'ajay@example.com'); fill('Password', 'password123')
    fireEvent.submit(screen.getByRole('form', { name: 'Create account' }))
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledWith({ email: 'ajay@example.com', password: 'password123', options: { data: { first_name: 'Ajay', last_name: 'Das', contact_phone: '+919876543210' } } }))
    await waitFor(() => expect(screen.getByLabelText('Password')).toHaveValue(''))
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('prevents duplicate requests and reports incorrect credentials', async () => {
    let finish!: (value: unknown) => void
    auth.signInWithPassword.mockReturnValue(new Promise(resolve => { finish = resolve }))
    render(<AccountForm language="en" onRecovered={() => {}} />)
    fill('Email', 'ajay@example.com'); fill('Password', 'wrong')
    const form = screen.getByRole('form', { name: 'Log in' })
    fireEvent.submit(form); fireEvent.submit(form)
    expect(auth.signInWithPassword).toHaveBeenCalledTimes(1)
    finish({ error: { code: 'invalid_credentials' } })
    await screen.findByText('Email or password is incorrect.')
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })
  it('does not claim signup succeeded when confirmation is still enabled', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null })
    render(<AccountForm language="en" onRecovered={() => {}} />)
    fireEvent.click(screen.getByText('Create account'))
    fireEvent.submit(screen.getByRole('form', { name: 'Create account' }))
    await screen.findByText(/Signup did not open a session/)
  })
  it('requests recovery without disclosing whether the account exists', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null })
    render(<AccountForm language="en" onRecovered={() => {}} />)
    fireEvent.click(screen.getByText('Forgot password?'))
    fill('Email', 'ajay@example.com')
    fireEvent.submit(screen.getByRole('form', { name: 'Send recovery link' }))
    await screen.findByText(/If recovery is available/)
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('ajay@example.com', { redirectTo: window.location.origin + '/' })
  })
  it('finishes recovery only after password update succeeds', async () => {
    auth.updateUser.mockResolvedValueOnce({ error: { code: 'weak_password' } }).mockResolvedValueOnce({ error: null })
    const done = vi.fn()
    render(<AccountForm language="en" recovery onRecovered={done} />)
    fill('New password', 'password123')
    fireEvent.submit(screen.getByRole('form'))

    const status = await screen.findByRole('status')
    expect(status).not.toBeNull()

    expect(done).not.toHaveBeenCalled()
    fill('New password', 'better-password123')
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(done).toHaveBeenCalledOnce())
  })
})
