import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useResultFeed } from './useResultFeed'
import { refreshResults } from './result-feed'
import { refreshDocuments } from './document-feed'
vi.mock('./document-feed', () => ({ cachedDocuments: () => [], refreshDocuments: vi.fn(async () => []) }))
vi.mock('./result-feed', () => ({ cachedResults: () => [], refreshResults: vi.fn() }))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })
it('refreshes on opening, online, foreground and 30 seconds, then cleans up', async () => {
  vi.useFakeTimers()
  vi.mocked(refreshResults).mockResolvedValue([])
  const view = renderHook(() => useResultFeed(true))
  await act(async () => {})
  expect(view.result.current.status).toBe('ready')
  expect(refreshResults).toHaveBeenCalledTimes(1)
  await act(async () => { window.dispatchEvent(new Event('online')) })
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  await act(async () => { vi.advanceTimersByTime(30000) })
  expect(refreshResults).toHaveBeenCalledTimes(4)
  view.unmount()
  window.dispatchEvent(new Event('online'))
  vi.advanceTimersByTime(30000)
  expect(refreshResults).toHaveBeenCalledTimes(4)
})
it('coalesces overlapping attempts, aborts on unmount and preserves offline state', async () => {
  vi.mocked(refreshDocuments).mockRejectedValue(new Error('offline'))
  let reject: (reason: Error) => void = () => {}
  vi.mocked(refreshResults).mockImplementation(() => new Promise((_, fail) => { reject = fail }))
  const view = renderHook(() => useResultFeed(true))
  window.dispatchEvent(new Event('online'))
  expect(refreshResults).toHaveBeenCalledTimes(1)
  await act(async () => { reject(new Error('offline')) })
  expect(view.result.current.status).toBe('offline')
  expect(view.result.current.results).toEqual([])
  await act(async () => { window.dispatchEvent(new Event('online')) })
  const signal = vi.mocked(refreshResults).mock.calls[1][0]
  view.unmount()
  expect(signal.aborted).toBe(true)
})

it('can refresh PDF links while the legacy number feed is unavailable', async () => {
  vi.mocked(refreshResults).mockRejectedValue(new Error('unavailable'))
  const documents = [{ date: '2026-11-20', slot: '8pm', sambadUrl: 'https://sambad.com/draw.pdf' }]
  vi.mocked(refreshDocuments).mockResolvedValue(documents)
  const view = renderHook(() => useResultFeed(true))
  await act(async () => {})
  expect(view.result.current.documents).toEqual(documents)
  expect(view.result.current.status).toBe('ready')
})

it('does not download the unused winning-number feed in the compact PDF view', async () => {
  vi.mocked(refreshDocuments).mockResolvedValue([])
  const view = renderHook(() => useResultFeed())
  await act(async () => {})
  expect(refreshResults).not.toHaveBeenCalled()
  expect(view.result.current.results).toEqual([])
})

it('receives a newly published draw on the next thirty-second refresh', async () => {
  vi.useFakeTimers()
  const links = [{ date: '2026-11-21', slot: '1pm', sambadUrl: 'https://sambad.com/current.pdf' }]
  vi.mocked(refreshDocuments).mockResolvedValueOnce([]).mockResolvedValue(links)
  const view = renderHook(() => useResultFeed())
  await act(async () => {})
  expect(view.result.current.documents).toEqual([])
  await act(async () => { vi.advanceTimersByTime(30000) })
  expect(view.result.current.documents).toEqual(links)
  view.unmount()
})
