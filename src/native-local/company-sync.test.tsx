import { act, cleanup, fireEvent, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { syncWebCompany, useNativeCompanySync } from './company-sync'

const api = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), list: vi.fn() }))
vi.mock('../accounting/api', () => ({ readOnlineCompanyExport: api.read }))
vi.mock('./runtime', () => ({ syncNativeCompany: api.save, readNativeSyncCompanies: api.list }))

const result = { changed: true, syncedAt: '2026-11-16T06:00:00Z' }
beforeEach(() => {
  vi.resetAllMocks()
  api.read.mockResolvedValue({ from: 'web' })
  api.save.mockResolvedValue(result)
  api.list.mockResolvedValue([{ id: 'company', name: 'Test store' }])
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

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
