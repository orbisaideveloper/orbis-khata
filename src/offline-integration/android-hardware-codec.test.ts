import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAndroidHardwareRecordCodec } from './android-hardware-codec'

const platform = vi.hoisted(() => vi.fn())
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: platform }, registerPlugin: vi.fn() }))

const bridge = { status: vi.fn(), seal: vi.fn(), unseal: vi.fn(), unlock: vi.fn() }
const scope = 'orbis:demo-account:state'
const sealed = new Uint8Array(29).fill(5)
const sealedBase64 = btoa(String.fromCharCode(...sealed))

beforeEach(() => {
  vi.resetAllMocks()
  platform.mockReturnValue('android')
  bridge.seal.mockResolvedValue({ sealedBase64, hardwareBacked: true })
})

describe('Android hardware record boundary', () => {
  it('passes scope and UTF-8 bytes through the native bridge in both directions', async () => {
    const codec = createAndroidHardwareRecordCodec(bridge)
    const plaintext = 'পরীক্ষা'
    const plaintextBase64 = btoa(String.fromCharCode(...new TextEncoder().encode(plaintext)))
    bridge.unseal.mockResolvedValue({ plaintextBase64 })
    await expect(codec.seal(plaintext, scope)).resolves.toEqual(sealed)
    expect(bridge.seal).toHaveBeenCalledExactlyOnceWith({ scope, plaintextBase64 })
    await expect(codec.unseal(sealed, scope)).resolves.toBe(plaintext)
    expect(bridge.unseal).toHaveBeenCalledExactlyOnceWith({ scope, sealedBase64 })
  })

  it('reports hardware status and requires an affirmative credential result', async () => {
    const status = { nativePlatform: 'android', keyPresent: true, hardwareBacked: true }
    bridge.status.mockResolvedValue(status)
    bridge.unlock.mockResolvedValueOnce({ unlocked: false }).mockResolvedValueOnce({ unlocked: true })
    const codec = createAndroidHardwareRecordCodec(bridge)
    await expect(codec.hardwareStatus()).resolves.toEqual(status)
    await expect(codec.verifyDeviceCredential()).resolves.toBe(false)
    await expect(codec.verifyDeviceCredential()).resolves.toBe(true)
  })

  it('rejects unsupported platform and invalid scope before contacting native code', async () => {
    const codec = createAndroidHardwareRecordCodec(bridge)
    await expect(codec.seal('demo', 'invalid scope')).rejects.toThrow('ANDROID_RECORD_SCOPE_INVALID')
    platform.mockReturnValue('web')
    await expect(codec.seal('demo', scope)).rejects.toThrow('ANDROID_HARDWARE_ONLY')
    expect(bridge.seal).not.toHaveBeenCalled()
  })

  it('rejects unprotected or malformed native responses', async () => {
    const codec = createAndroidHardwareRecordCodec(bridge)
    bridge.seal
      .mockResolvedValueOnce({ sealedBase64, hardwareBacked: false })
      .mockResolvedValueOnce({ sealedBase64: '!', hardwareBacked: true })
      .mockResolvedValueOnce({ sealedBase64: 'AA==', hardwareBacked: true })
    await expect(codec.seal('demo', scope)).rejects.toThrow('ANDROID_RECORD_HARDWARE_REQUIRED')
    await expect(codec.seal('demo', scope)).rejects.toThrow('ANDROID_RECORD_BASE64_INVALID')
    await expect(codec.seal('demo', scope)).rejects.toThrow('ANDROID_RECORD_SEAL_INVALID')
    await expect(codec.seal('', scope)).rejects.toThrow('ANDROID_RECORD_SIZE_INVALID')
    await expect(codec.unseal(new Uint8Array(28), scope)).rejects.toThrow('ANDROID_RECORD_CIPHERTEXT_INVALID')
    expect(bridge.unseal).not.toHaveBeenCalled()
  })
})
