import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAccount } from './useAccount'

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), unsubscribe: vi.fn() }))
vi.mock('./client', () => ({ authClient: { auth } }))
let notify: (event: string, session: unknown) => void
beforeEach(() => {
  vi.resetAllMocks()
  auth.onAuthStateChange.mockImplementation(callback => {
    notify = callback
    return { data: { subscription: { unsubscribe: auth.unsubscribe } } }
  })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
it('restores the saved session without asking for another password', async () => {
  const session = { user: { id: 'owner-a' } }
  auth.getSession.mockResolvedValue({ data: { session }, error: null })
  const { result, unmount } = renderHook(useAccount)
  await waitFor(() => expect(result.current.session).toEqual(session))
  expect(result.current.loading).toBe(false)
  unmount()
  expect(auth.unsubscribe).toHaveBeenCalledOnce()
})
it('does not overwrite logout with a stale session restoration', async () => {
  let finish!: (value: unknown) => void
  auth.getSession.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const { result } = renderHook(useAccount)
  act(() => notify('SIGNED_OUT', null))
  await act(async () => finish({ data: { session: { user: { id: 'stale' } } }, error: null }))
  expect(result.current.session).toBeNull()
})
it('opens recovery mode and clears it on logout', async () => {
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  const { result } = renderHook(useAccount)
  await waitFor(() => expect(result.current.loading).toBe(false))
  act(() => notify('PASSWORD_RECOVERY', { user: { id: 'a' } }))
  expect(result.current.recovery).toBe(true)
  act(() => notify('SIGNED_OUT', null))
  expect(result.current.recovery).toBe(false)
  expect(result.current.session).toBeNull()
})
it('reports session failures without inventing an authenticated user', async () => {
  auth.getSession.mockRejectedValue(new Error('offline'))
  const { result } = renderHook(useAccount)
  await waitFor(() => expect(result.current.unavailable).toBe(true))
  expect(result.current.session).toBeNull()
})
it('keeps a successfully restored session usable after the loading deadline', async () => {
  vi.useFakeTimers()
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'a' } } }, error: null })
  const { result } = renderHook(useAccount)
  await act(async () => { await Promise.resolve() })
  act(() => vi.advanceTimersByTime(16000))
  expect(result.current.unavailable).toBe(false)
  expect(result.current.session?.user.id).toBe('a')
})
it('provides a retry state when restoration stalls', async () => {
  vi.useFakeTimers()
  auth.getSession.mockReturnValue(new Promise(() => {}))
  const { result } = renderHook(useAccount)
  act(() => vi.advanceTimersByTime(16000))
  expect(result.current.loading).toBe(false)
  expect(result.current.unavailable).toBe(true)
})

it('ignores late session notifications and restoration failures after unmount', async () => {
  let reject!: (error: Error) => void
  auth.getSession.mockReturnValue(new Promise((_yes, no) => { reject = no }))
  const { unmount } = renderHook(useAccount); unmount()
  await act(async () => { notify('SIGNED_IN', { user: { id: 'stale' } }); reject(new Error('offline')) })
  expect(auth.unsubscribe).toHaveBeenCalledOnce()
})
it('does not mark an observed live session unavailable when earlier restoration fails', async () => {
  let reject!: (error: Error) => void
  auth.getSession.mockReturnValue(new Promise((_yes, no) => { reject = no }))
  const { result } = renderHook(useAccount)
  act(() => notify('SIGNED_IN', { user: { id: 'current' } }))
  await act(async () => reject(new Error('offline')))
  expect(result.current.unavailable).toBe(false); expect(result.current.session?.user.id).toBe('current')
})
it('ignores an already queued loading deadline after observation or disposal', async () => {
  let deadline!: () => void
  vi.spyOn(window, 'setTimeout').mockImplementation((handler: TimerHandler) => { deadline = handler as () => void; return 123 })
  vi.spyOn(window, 'clearTimeout').mockImplementation(() => {})
  auth.getSession.mockReturnValue(new Promise(() => {}))
  const { result, unmount } = renderHook(useAccount)
  act(() => notify('SIGNED_IN', { user: { id: 'current' } })); act(() => deadline())
  expect(result.current.unavailable).toBe(false); unmount(); act(() => deadline())
})
