import { beforeEach, expect, it, vi } from 'vitest'
import { canChooseContactPhone, chooseContactPhone } from './contact-phone'

const { pickPhone, platform } = vi.hoisted(() => ({ pickPhone: vi.fn(), platform: vi.fn() }))
vi.mock('@capacitor/core', () => ({
  get Capacitor() { return { getPlatform: platform } },
  registerPlugin: () => ({ pickPhone }),
}))

beforeEach(() => {
  pickPhone.mockReset()
  platform.mockReturnValue('android')
})

it('uses the native Android picker without a WebView Contacts API', async () => {
  expect(canChooseContactPhone()).toBe(true)
  pickPhone.mockResolvedValue({ number: '+91 9876543210' })
  await expect(chooseContactPhone()).resolves.toBe('+91 9876543210')
  expect(pickPhone).toHaveBeenCalledOnce()
})

it('preserves cancellation and reports native picker failures to the form', async () => {
  pickPhone.mockResolvedValueOnce({})
  await expect(chooseContactPhone()).resolves.toBeUndefined()
  pickPhone.mockRejectedValueOnce(new Error('CONTACT_NUMBER_UNAVAILABLE'))
  await expect(chooseContactPhone()).rejects.toThrow('CONTACT_NUMBER_UNAVAILABLE')
})
