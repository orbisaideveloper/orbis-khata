/** Real Android platform-backed envelope codec and local device credential gate.
 * Not enabled in the live UI without server-verified offline grants.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import type { NativeRecordCodec } from './native-transactional-sync-store'

type OfflineBridge = {
  status(): Promise<{ nativePlatform: string; keyPresent: boolean; hardwareBacked: boolean }>
  seal(input: { scope: string; plaintextBase64: string }): Promise<{ sealedBase64: string; hardwareBacked: boolean }>
  unseal(input: { scope: string; sealedBase64: string }): Promise<{ plaintextBase64: string }>
  unlock(): Promise<{ unlocked: boolean }>
}
const bridge = registerPlugin<OfflineBridge>('OrbisKhataOfflineBridge')
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const b64 = (bytes: Uint8Array): string => {
  let result = ''
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(result)
}
const decode = (text: string): Uint8Array => {
  if (typeof text !== 'string' || text.length > 1_400_000 || !/^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/u.test(text)) {
    throw Error('ANDROID_RECORD_BASE64_INVALID')
  }
  return Uint8Array.from(atob(text), x => x.charCodeAt(0))
}
const assertAndroid = () => { if (Capacitor.getPlatform() !== 'android') throw Error('ANDROID_HARDWARE_ONLY') }
const assertScope = (scope: string) => {
  if (!/^[A-Za-z0-9_.:-]{1,512}$/u.test(scope)) throw Error('ANDROID_RECORD_SCOPE_INVALID')
}
export function createAndroidHardwareRecordCodec(plugin: OfflineBridge = bridge): NativeRecordCodec & {
  hardwareStatus(): ReturnType<OfflineBridge['status']>
  verifyDeviceCredential(): Promise<boolean>
} {
  return {
    async hardwareStatus() { assertAndroid(); return plugin.status() },
    async seal(plaintext, scope) {
      assertAndroid(); assertScope(scope)
      const bytes = encoder.encode(plaintext)
      if (bytes.byteLength < 1 || bytes.byteLength > 1024 * 1024) throw Error('ANDROID_RECORD_SIZE_INVALID')
      const value = await plugin.seal({ scope, plaintextBase64: b64(bytes) })
      if (!value.hardwareBacked) throw Error('ANDROID_RECORD_HARDWARE_REQUIRED')
      const ciphertext = decode(value.sealedBase64)
      if (ciphertext.byteLength < 29) throw Error('ANDROID_RECORD_SEAL_INVALID')
      return ciphertext
    },
    async unseal(ciphertext, scope) {
      assertAndroid(); assertScope(scope)
      if (!(ciphertext instanceof Uint8Array) || ciphertext.byteLength < 29 || ciphertext.byteLength > 1024 * 1024 + 28) {
        throw Error('ANDROID_RECORD_CIPHERTEXT_INVALID')
      }
      const value = await plugin.unseal({ scope, sealedBase64: b64(ciphertext) })
      return decoder.decode(decode(value.plaintextBase64))
    },
    async verifyDeviceCredential() { assertAndroid(); return (await plugin.unlock()).unlocked === true },
  }
}
