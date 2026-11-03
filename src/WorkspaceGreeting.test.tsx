import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WorkspaceGreeting } from './WorkspaceGreeting'
import { requestAccountProfile } from './profile/common-profile'
vi.mock('./auth/client', () => ({ authClient: { auth: { getSession: vi.fn() } } }))
vi.mock('./profile/common-profile', () => ({ requestAccountProfile: vi.fn() }))
const read = vi.mocked(requestAccountProfile)
const result = (owner = 'owner') => ({ customer: { orbisIdentityId: owner, displayId: 'ORB-U-23456789' }, profile: { name: 'Ajay Saha', address: null, alternatePhone: null, dateOfBirth: null, gender: null }, contact: { email: null, phone: null } })
beforeEach(() => { read.mockReset(); read.mockResolvedValue(result()) })
afterEach(cleanup)
it.each([['en', 'Welcome,'], ['bn', 'স্বাগতম,'], ['hi', 'स्वागत है,']] as const)('greets the verified profile in %s', async (language, greeting) => {
  render(<WorkspaceGreeting userId="owner" language={language}/>);
  expect(await screen.findByRole('heading', { name: new RegExp(greeting) })).toHaveTextContent('Ajay Saha')
})
it('does not request a profile for guests', () => {
  render(<WorkspaceGreeting userId={null} language="en"/>);
  expect(screen.getByRole('heading')).toHaveTextContent('Welcome!'); expect(read).not.toHaveBeenCalled()
})
it('keeps generic welcome when the profile fails or belongs to another identity', async () => {
  read.mockRejectedValueOnce(new Error('offline'))
  const view = render(<WorkspaceGreeting userId="owner" language="en"/>);
  await waitFor(() => expect(read).toHaveBeenCalledOnce())
  read.mockResolvedValueOnce(result('owner'))
  view.rerender(<WorkspaceGreeting userId="other" language="en"/>);
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('heading')).not.toHaveTextContent('Ajay')
})
it('removes the previous name immediately on identity change and aborts outstanding reads', async () => {
  const view = render(<WorkspaceGreeting userId="owner" language="en"/>);
  await screen.findByText('Ajay Saha')
  const signal = read.mock.calls[0][2]
  read.mockImplementationOnce((_reader, _owner, nextSignal) => new Promise((_resolve, reject) => nextSignal.addEventListener('abort', () => reject(new Error('aborted')))))
  view.rerender(<WorkspaceGreeting userId="other" language="en"/>);
  expect(screen.queryByText('Ajay Saha')).not.toBeInTheDocument(); expect(signal.aborted).toBe(true)
  const pending = read.mock.calls[1][2]; view.unmount(); expect(pending.aborted).toBe(true)
})
it('times out a stalled profile lookup without removing the generic welcome', async () => {
  vi.useFakeTimers()
  read.mockImplementationOnce((_reader, _owner, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')))))
  try {
    render(<WorkspaceGreeting userId="owner" language="en"/>)
    await vi.advanceTimersByTimeAsync(10000)
    expect(read.mock.calls[0][2].aborted).toBe(true)
    expect(screen.getByRole('heading')).toHaveTextContent('Welcome!')
  } finally { cleanup(); vi.useRealTimers() }
})
