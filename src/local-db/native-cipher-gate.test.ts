import { describe, expect, it, vi } from 'vitest'
import { openVerifiedAndroidSqlcipher, type NativeCipherBridge } from './native-cipher-gate'
const make = (overrides: Partial<NativeCipherBridge> = {}) => {
  const b: NativeCipherBridge = {
    platform: () => 'android',
    isEncryptionConfigured: vi.fn(async () => true),
    hasKeystoreWrappedSecret: vi.fn(async () => true),
    openEncrypted: vi.fn(async () => ({}) as never),
    isDatabaseEncrypted: vi.fn(async () => true),
    close: vi.fn(async () => {}),
    ...overrides,
  }
  return b
}
describe('native sqlcipher gate (mocked only; not hardware proof)', () => {
  it('refuses web, even when a bridge is injected', async () => {
    const b=make({ platform: ()=>'web' })
    await expect(openVerifiedAndroidSqlcipher(b,'orbis-khata-local-test')).rejects.toThrow('NATIVE_ANDROID_ONLY')
    expect(b.openEncrypted).not.toHaveBeenCalled()
  })
  it('rejects unsafe file names before touching a plugin', async () => {
    await expect(openVerifiedAndroidSqlcipher(make(),'../../finance')).rejects.toThrow('NATIVE_DB_NAME_INVALID')
  })
  it('refuses native sqlite without SQLCipher config', async () => {
    const b=make({ isEncryptionConfigured:async()=>false })
    await expect(openVerifiedAndroidSqlcipher(b,'orbis-khata-local-test')).rejects.toThrow('NATIVE_SQLCIPHER_DISABLED')
    expect(b.openEncrypted).not.toHaveBeenCalled()
  })
  it('refuses a missing native secure secret', async () => {
    const b=make({ hasKeystoreWrappedSecret:async()=>false })
    await expect(openVerifiedAndroidSqlcipher(b,'orbis-khata-local-test')).rejects.toThrow('NATIVE_KEYSTORE_SECRET_MISSING')
    expect(b.openEncrypted).not.toHaveBeenCalled()
  })
  it('closes a plaintext connection and fails', async () => {
    const b=make({ isDatabaseEncrypted:async()=>false })
    await expect(openVerifiedAndroidSqlcipher(b,'orbis-khata-local-test')).rejects.toThrow('NATIVE_DB_NOT_ENCRYPTED')
    expect(b.close).toHaveBeenCalledOnce()
  })
  it('propagates bridge verification errors and closes', async () => {
    const b=make({ isDatabaseEncrypted:async()=>{ throw Error('probe failed') } })
    await expect(openVerifiedAndroidSqlcipher(b,'orbis-khata-local-test')).rejects.toThrow('probe failed')
    expect(b.close).toHaveBeenCalledOnce()
  })
  it('returns a port only after all native probes succeed', async () => {
    const b=make()
    await expect(openVerifiedAndroidSqlcipher(b,'orbis-khata-local-test')).resolves.toEqual({})
    expect(b.close).not.toHaveBeenCalled()
  })
})
