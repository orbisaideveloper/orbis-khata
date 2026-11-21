import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TicketSearch } from './TicketSearch'
import { checkTicket } from './ticket-client'
const qr = vi.hoisted(() => ({ decode: vi.fn(), stop: vi.fn() }))
vi.mock('@zxing/browser', () => ({ BrowserQRCodeReader: class { decodeFromConstraints = qr.decode } }))
vi.mock('./ticket-client', () => ({ checkTicket: vi.fn() }))
const ticket = { date: '2026-11-20', slot: '8pm' as const, series: '35B', number: '00220' }
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-21T05:00:00Z')); vi.clearAllMocks(); qr.decode.mockResolvedValue({ stop: qr.stop }) })
afterEach(() => { cleanup(); vi.useRealTimers() })
const view = () => render(<TicketSearch date={ticket.date} slot={ticket.slot} language="en"/>)
const fill = () => { fireEvent.change(screen.getByRole('textbox', { name: 'Ticket series' }), { target: { value: ticket.series } }); fireEvent.change(screen.getByRole('textbox', { name: 'Ticket number' }), { target: { value: ticket.number } }) }
it('checks one selected ticket explicitly and never turns a missing result into no prize', async () => {
  vi.mocked(checkTicket).mockResolvedValueOnce({ ...ticket, status: 'win', prize: { tier: '5th', amount: 120 } })
  view(); fill()
  fireEvent.click(screen.getByRole('button', { name: 'Check number' }))
  await act(async () => {})
  expect(screen.getByText('Prize match found')).toBeVisible()
  fireEvent.change(screen.getByRole('textbox', { name: 'Ticket number' }), { target: { value: '00221' } })
  expect(screen.queryByText('Prize match found')).not.toBeInTheDocument()
  vi.mocked(checkTicket).mockRejectedValueOnce(new Error('TICKET_UNAVAILABLE'))
  fireEvent.click(screen.getByRole('button', { name: 'Check number' }))
  await act(async () => {})
  expect(screen.getByText(/Could not check now/)).toBeVisible()
  expect(screen.queryByText('No prize match in this draw')).not.toBeInTheDocument()
})
it('blocks malformed tickets and cancels stale results after an edit or unmount', async () => {
  const rendered = view()
  fireEvent.click(screen.getByRole('button', { name: 'Check number' }))
  expect(checkTicket).not.toHaveBeenCalled()
  fill()
  let resolve: (value: unknown) => void = () => {}
  vi.mocked(checkTicket).mockImplementationOnce(() => new Promise(done => { resolve = done as typeof resolve }))
  fireEvent.click(screen.getByRole('button', { name: 'Check number' }))
  const signal = vi.mocked(checkTicket).mock.calls[0][1]
  fireEvent.change(screen.getByRole('textbox', { name: 'Ticket number' }), { target: { value: '00221' } })
  expect(signal.aborted).toBe(true)
  await act(async () => { resolve({ ...ticket, status: 'no_prize', prize: null }) })
  expect(screen.queryByText('No prize match in this draw')).not.toBeInTheDocument()
  rendered.unmount()
})
it('reads QR text locally, requires explicit draw confirmation and stops camera on exit', async () => {
  const rendered = view()
  fireEvent.click(screen.getByRole('button', { name: 'Scan QR' }))
  await act(async () => {})
  const callback = qr.decode.mock.calls[0][2]
  act(() => callback({ getText: () => '35B00220' }, null, { stop: qr.stop }))
  expect(screen.getByRole('textbox', { name: 'Ticket series' })).toHaveValue('35B')
  expect(screen.getByRole('textbox', { name: 'Ticket number' })).toHaveValue('00220')
  expect(checkTicket).not.toHaveBeenCalled()
  expect(qr.stop).toHaveBeenCalled()
  rendered.unmount()
})
it('handles permission denial and unrecognized QR without following embedded links', async () => {
  qr.decode.mockRejectedValueOnce(new Error('NotAllowedError'))
  view()
  fireEvent.click(screen.getByRole('button', { name: 'Scan QR' }))
  await act(async () => {})
  expect(screen.getByText(/Camera unavailable/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Scan QR' }))
  await act(async () => {})
  act(() => qr.decode.mock.calls[1][2]({ getText: () => 'https://evil.test/' }, null, { stop: qr.stop }))
  expect(screen.getByText(/Unrecognized QR format/)).toBeVisible()
  expect(checkTicket).not.toHaveBeenCalled()
})
