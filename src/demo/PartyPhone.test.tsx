import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PartyPhone } from './PartyPhone'
import { phoneHref } from '../phone'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('opens the dialer only for a valid number and preserves the displayed contact', () => {
  render(<PartyPhone language="en" label="Phone" initial="+91 (98765) 43210"/>)
  expect(screen.getByRole('link', { name: 'Dial number' })).toHaveAttribute('href', 'tel:+919876543210')
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '' } })
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  expect(phoneHref('javascript:alert(1)')).toBeUndefined()
  expect(phoneHref('------')).toBeUndefined()
})
it('requests only the selected contact number after a user action and handles cancellation', async () => {
  const select = vi.fn().mockResolvedValue([{ tel: ['9876543210'] }])
  vi.stubGlobal('navigator', { contacts: { select } })
  render(<PartyPhone language="en" label="Phone" initial=""/>)
  expect(select).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Choose from contacts' }))
  await waitFor(() => expect(screen.getByLabelText('Phone')).toHaveValue('9876543210'))
  expect(select).toHaveBeenCalledWith(['tel'], { multiple: false })
  select.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))
  fireEvent.click(screen.getByRole('button', { name: 'Choose from contacts' }))
  await waitFor(() => expect(select).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('keeps manual entry available when contacts permission fails', async () => {
  vi.stubGlobal('navigator', { contacts: { select: vi.fn().mockRejectedValue(new Error('Denied')) } })
  render(<PartyPhone language="bn" label="ফোন নম্বর" initial=""/>)
  fireEvent.click(screen.getByRole('button', { name: 'ফোনবুক থেকে নিন' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('নিজে লিখতে পারবেন')
  expect(screen.getByLabelText('ফোন নম্বর')).toBeEnabled()
})
