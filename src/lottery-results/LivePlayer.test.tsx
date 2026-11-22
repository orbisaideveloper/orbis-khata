import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LiveDraw } from './LiveDraw'
const lookup = vi.hoisted(() => vi.fn())
vi.mock('./live-client', async importOriginal => ({ ...await importOriginal<typeof import('./live-client')>(), getLiveVideo: lookup }))
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-22T07:32:00Z')); lookup.mockReset() })
afterEach(() => { cleanup(); vi.useRealTimers() })
const metadata = { date: '2026-11-22', slot: '1pm', videoId: 'abcdefghijk', status: 'live', checkedAt: '2026-11-22T07:32:00Z', actualStart: '2026-11-22T07:31:00Z', scheduledStart: null }
it('opens only verified metadata in a modal and removes the player on close', async () => {
  lookup.mockResolvedValue(metadata)
  const view = render(<LiveDraw language="en"/>)
  await act(async () => {})
  expect(screen.getByText('Broadcast is live')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /Watch live draw/ }))
  const player = screen.getByTitle('Draw broadcast')
  expect(player).toHaveAttribute('src', 'https://www.youtube.com/embed/abcdefghijk?playsinline=1')
  fireEvent.click(screen.getByRole('button', { name: 'Close broadcast' }))
  expect(screen.queryByTitle('Draw broadcast')).not.toBeInTheDocument()
  view.unmount()
})
it('does not enable a historical or expired video or call it live', async () => {
  lookup.mockResolvedValue({ ...metadata, date: '2026-11-21' })
  render(<LiveDraw language="en"/>)
  await act(async () => {})
  expect(screen.getByRole('button', { name: /Watch live draw/ })).toBeDisabled()
  expect(screen.queryByText('Broadcast is live')).not.toBeInTheDocument()
})

it('aborts an in-flight metadata request when the page closes', async () => {
  lookup.mockImplementation(() => new Promise(() => {}))
  const view = render(<LiveDraw language="en"/>)
  await act(async () => {})
  const signal = lookup.mock.calls[0][1]
  view.unmount()
  expect(signal.aborted).toBe(true)
})
