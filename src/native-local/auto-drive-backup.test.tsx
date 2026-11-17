import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { latestDriveBackupSlot, useDriveAutoBackupSetting, useForegroundDriveAutoBackup } from './auto-drive-backup'

const fake = vi.hoisted(() => ({
  actor: '01234567-89ab-7def-8123-456789abcdef',
  connect: vi.fn(),
  upload: vi.fn(),
  archive: new Uint8Array([1, 2, 3]),
}))
vi.mock('../auth/client', () => ({
  authClient: { auth: { getSession: async () => ({ data: { session: { user: { id: fake.actor } } } }) } },
}))
vi.mock('../accounting/api', () => ({
  requestDriveRecovery: async () => ({ email: 'test@example.com', key: 'ab'.repeat(32) }),
}))
vi.mock('../sync/drive-backup', () => ({ connectBackupDrive: fake.connect }))
vi.mock('./runtime', () => ({
  nativeLocalActor: () => fake.actor,
  exportNativeFinancialBackup: async () => fake.archive,
}))

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
  fake.connect.mockReset()
  fake.upload.mockReset()
})

it('uses local midnight and noon and collapses missed slots to the latest one', () => {
  expect(latestDriveBackupSlot(new Date(2026, 10, 17, 9))).toBe(new Date(2026, 10, 17, 0).getTime())
  expect(latestDriveBackupSlot(new Date(2026, 10, 20, 17))).toBe(new Date(2026, 10, 20, 12).getTime())
})

it('waits offline, catches up on reconnect, and uploads the missed slot only once', async () => {
  let online = false
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
  fake.connect.mockResolvedValue({ accountEmail: async () => 'test@example.com', upload: fake.upload })
  const { result } = renderHook(() => {
    useForegroundDriveAutoBackup(fake.actor)
    return useDriveAutoBackupSetting(fake.actor)
  })
  expect(result.current.on).toBe(false)
  act(() => result.current.toggle(true))
  expect(fake.upload).not.toHaveBeenCalled()
  online = true
  act(() => window.dispatchEvent(new Event('online')))
  await waitFor(() => expect(result.current.verifiedAt).toBeGreaterThan(0))
  expect(fake.connect).toHaveBeenCalledWith(fake.actor, 'test@example.com', true)
  expect(fake.upload).toHaveBeenCalledExactlyOnceWith(fake.archive)
  act(() => window.dispatchEvent(new Event('online')))
  expect(fake.connect).toHaveBeenCalledTimes(1)
})
