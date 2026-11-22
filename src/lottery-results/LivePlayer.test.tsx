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

it('keeps the same iframe through stale status, failures and the next draw, then reopens cached video', async () => {
  vi.useRealTimers(); vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-22T12:19:00Z'))
  lookup.mockResolvedValue({ ...metadata, checkedAt: new Date().toISOString() })
  render(<LiveDraw language="en"/>)
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: /Watch live draw/ }))
  const iframe = screen.getByTitle('Draw broadcast')
  lookup.mockRejectedValue(new Error('network'))
  await act(async () => { await vi.advanceTimersByTimeAsync(120000) })
  expect(screen.getByTitle('Draw broadcast')).toBe(iframe)
  expect(screen.getByText('2026-11-22 · 6PM IST')).toBeVisible()
  window.dispatchEvent(new Event('orbis-native-back', { cancelable: true }))
  await act(async () => {})
  expect(screen.queryByTitle('Draw broadcast')).not.toBeInTheDocument()
})

it('discovers a pending video without reloading and keeps its identity after a failed poll', async () => {
  vi.useRealTimers(); vi.useFakeTimers(); vi.setSystemTime(new Date(metadata.checkedAt))
  lookup.mockResolvedValueOnce(null).mockResolvedValueOnce(metadata).mockRejectedValue(new Error('network'))
  render(<LiveDraw language="en"/>)
  await act(async () => {})
  expect(screen.getByRole('button', { name: /Watch live draw/ })).toBeDisabled()
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  expect(screen.getByRole('button', { name: /Watch live draw/ })).toBeEnabled()
  await act(async () => { await vi.advanceTimersByTimeAsync(300000) })
  expect(screen.getByText('Video available · Current status unverified')).toBeVisible()
  for (let i = 0; i < 2; i++) {
    fireEvent.click(screen.getByRole('button', { name: /Watch live draw/ }))
    expect(screen.getByTitle('Draw broadcast')).toHaveAttribute('allowFullScreen')
    expect(screen.getByRole('link', { name: 'Open on YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abcdefghijk')
    fireEvent.click(screen.getByRole('button', { name: 'Close broadcast' }))
  }
})
