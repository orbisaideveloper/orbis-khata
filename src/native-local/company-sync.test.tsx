import { act, cleanup, fireEvent, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { syncWebCompany, useNativeCompanySync } from './company-sync'

const api = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), list: vi.fn(), syncV2: vi.fn(), legacyLottery: vi.fn() }))
vi.mock('../accounting/api', () => ({ readOnlineCompanyExport: api.read }))
vi.mock('./runtime', () => ({ syncNativeCompany: api.save, readNativeSyncCompanies: api.list,
  syncNativeLotteryV2Pending: api.syncV2, readNativeLotterySyncState: api.legacyLottery }))

const result = { changed: true, syncedAt: '2026-11-16T06:00:00Z' }
beforeEach(() => {
  vi.resetAllMocks()
  api.read.mockResolvedValue({ from: 'web' })
  api.save.mockResolvedValue(result)
  api.list.mockResolvedValue([{ id: 'company', name: 'Test store' }])
  api.syncV2.mockResolvedValue({ organizations: 1, pending: 0 })
  api.legacyLottery.mockResolvedValue({ linked: false })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers() })

it('shares one active transfer per company and refreshes only after a change', async () => {
  const refreshed = vi.fn()
  window.addEventListener('khata-company-synced', refreshed)
  try {
    const first = syncWebCompany('owner', 'company')
    expect(syncWebCompany('owner', 'company')).toBe(first)
    await expect(first).resolves.toEqual(result)
    expect(api.read).toHaveBeenCalledOnce()
    expect(api.save).toHaveBeenCalledWith('owner', 'company', { from: 'web' })
    expect(refreshed).toHaveBeenCalledOnce()
    api.save.mockResolvedValue({ ...result, changed: false })
    await syncWebCompany('owner', 'company')
    expect(refreshed).toHaveBeenCalledOnce()
  } finally {
    window.removeEventListener('khata-company-synced', refreshed)
  }
})

it('reports a conflict and retries when the connection returns', async () => {
  api.save.mockRejectedValueOnce(new Error('KHATA_COMPANY_SYNC_CONFLICT'))
  const hook = renderHook(() => useNativeCompanySync('owner'))
  await waitFor(() => expect(hook.result.current).toBe('Test store'))
  fireEvent(window, new Event('online'))
  await waitFor(() => expect(hook.result.current).toBeUndefined())
  expect(api.save).toHaveBeenCalledTimes(2)
  hook.unmount()
  fireEvent(window, new Event('online'))
  expect(api.list).toHaveBeenCalledTimes(2)
})

it('waits for a visible online session and ignores an unavailable runtime', async () => {
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  const hook = renderHook(({ actor }: { actor: string | null }) => useNativeCompanySync(actor), { initialProps: { actor: null as string | null } })
  hook.rerender({ actor: 'owner' })
  expect(api.list).not.toHaveBeenCalled()
  online.mockReturnValue(true)
  fireEvent(window, new Event('online'))
  expect(api.list).not.toHaveBeenCalled()
  visibility.mockReturnValue('visible')
  api.list.mockRejectedValueOnce(new Error('locked'))
  await act(async () => { fireEvent(document, new Event('visibilitychange')) })
  await waitFor(() => expect(api.list).toHaveBeenCalledOnce())
  expect(api.save).not.toHaveBeenCalled()
})

it('finishes one company before starting the next', async () => {
  api.list.mockResolvedValue([{ id: 'first', name: 'First' }, { id: 'second', name: 'Second' }])
  let finishFirst!: (value: typeof result) => void
  const first = new Promise<typeof result>(resolve => { finishFirst = resolve })
  api.save.mockReturnValueOnce(first)
  renderHook(() => useNativeCompanySync('owner'))
  await waitFor(() => expect(api.save).toHaveBeenCalledOnce())
  expect(api.read).toHaveBeenCalledExactlyOnceWith('owner', 'first')
  finishFirst(result)
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2))
  expect(api.read).toHaveBeenLastCalledWith('owner', 'second')
})

it('retries every 120 seconds only while visible and shares the automatic pull with Sync now', async () => {
  vi.useFakeTimers()
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  renderHook(() => useNativeCompanySync('owner'))
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
  expect(api.read).not.toHaveBeenCalled()

  let finish!: (value: typeof result) => void
  api.save.mockReturnValueOnce(new Promise<typeof result>(resolve => { finish = resolve }))
  visibility.mockReturnValue('visible')
  await act(async () => { fireEvent(document, new Event('visibilitychange')) })
  await act(async () => {
    const manual = syncWebCompany('owner', 'company')
    expect(api.read).toHaveBeenCalledOnce()
    finish(result)
    await manual
  })
  await act(async () => { await vi.advanceTimersByTimeAsync(119_999) })
  expect(api.read).toHaveBeenCalledOnce()
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(api.read).toHaveBeenCalledTimes(2)
})

it('runs the flagged v2 Lottery sync after the company pull and never falls back to legacy', async () => {
  vi.stubEnv('VITE_KHATA_SYNC_V2_LOTTERY_PAYMENT', 'enabled')
  const onSynced = vi.fn()
  window.addEventListener('khata-lottery-synced', onSynced)
  try {
    renderHook(() => useNativeCompanySync('owner'))
    await waitFor(() => expect(api.syncV2).toHaveBeenCalledExactlyOnceWith('owner'))
    expect(api.save).toHaveBeenCalledExactlyOnceWith('owner', 'company', { from: 'web' })
    expect(api.legacyLottery).not.toHaveBeenCalled()
    expect(onSynced).toHaveBeenCalledOnce()
  } finally {
    window.removeEventListener('khata-lottery-synced', onSynced)
  }
})

it('reports a flagged v2 failure rather than silently switching to legacy Lottery', async () => {
  vi.stubEnv('VITE_KHATA_SYNC_V2_LOTTERY_PAYMENT', 'enabled')
  api.syncV2.mockRejectedValue(new Error('SYNC_FEED_SCOPE_OR_CURSOR'))
  const hook = renderHook(() => useNativeCompanySync('owner'))
  await waitFor(() => expect(hook.result.current).toBe('Lottery secure sync'))
  expect(api.syncV2).toHaveBeenCalledOnce()
  expect(api.legacyLottery).not.toHaveBeenCalled()
})
