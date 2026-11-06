import { afterEach, expect, it, vi } from 'vitest'
import { isNativeApp, recoveryRedirect } from './platform'
const native = vi.hoisted(() => vi.fn(() => false))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: native } }))
afterEach(() => native.mockReturnValue(false))
it('keeps web recovery on its current origin', () => {
  expect(isNativeApp()).toBe(false)
  expect(recoveryRedirect()).toBe(window.location.origin + '/')
})
it('sends Android recovery to the real website rather than localhost', () => {
  native.mockReturnValue(true)
  expect(recoveryRedirect()).toBe('https://orbis-khata.onrender.com/')
})
