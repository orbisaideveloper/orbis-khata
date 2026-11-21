import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ResultSheet } from './ResultSheet'
import { recoverDocument } from './ticket-client'
vi.mock('./ticket-client', () => ({ recoverDocument: vi.fn() }))
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-21T12:00:00Z')); vi.clearAllMocks() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
it('recovers an absent selected PDF, opens the validated link on click and stops further polling', async () => {
  vi.mocked(recoverDocument).mockResolvedValueOnce(null).mockResolvedValue({ date: '2026-11-21', slot: '6pm', sambadUrl: 'https://sambad.com/draw.pdf' })
  const popup = { opener: {}, close: vi.fn(), location: { href: 'about:blank' } }
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
  render(<ResultSheet date="2026-11-21" slot="6pm" language="en"/>)
  await act(async () => {})
  expect(recoverDocument).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Sambad PDF' }))
  await act(async () => {})
  expect(popup.opener).toBeNull()
  expect(popup.location.href).toBe('https://sambad.com/draw.pdf')
  expect(screen.getByRole('link', { name: 'Lottery Sambad PDF for this draw' })).toHaveAttribute('href', 'https://sambad.com/draw.pdf')
  await act(async () => { vi.advanceTimersByTime(60000) })
  expect(recoverDocument).toHaveBeenCalledTimes(2)
})
it('cancels stale draw recovery on navigation and never starts another collection for a known link', async () => {
  vi.mocked(recoverDocument).mockImplementationOnce(() => new Promise(() => {}))
  const view = render(<ResultSheet date="2026-11-21" slot="6pm" language="en"/>)
  const signal = vi.mocked(recoverDocument).mock.calls[0][2]
  view.unmount()
  expect(signal.aborted).toBe(true)
  vi.clearAllMocks()
  render(<ResultSheet date="2026-11-21" slot="6pm" language="en" document={{ date: '2026-11-21', slot: '6pm', sambadUrl: 'https://sambad.com/existing.pdf' }}/>)
  await act(async () => { vi.advanceTimersByTime(60000) })
  expect(recoverDocument).not.toHaveBeenCalled()
})
