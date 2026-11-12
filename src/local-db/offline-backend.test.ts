import { describe, expect, it } from 'vitest'
import { chooseKhataOfflineStorage, createBrowserPwaOfflineOutbox } from './offline-backend'
describe('platform selection and browser-only gate', () => {
  it('uses native SQLCipher for Android', () => expect(chooseKhataOfflineStorage('android')).toBe('native-sqlcipher'))
  it('uses encrypted IndexedDB for browser PWA', () => expect(chooseKhataOfflineStorage('web')).toBe('pwa-encrypted-indexeddb'))
  it('does not fall back to plain storage for unknown platforms', () => expect(()=>chooseKhataOfflineStorage('unknown')).toThrow('LOCAL_STORAGE_PLATFORM_UNSUPPORTED'))
  it('refuses native platform through web adapter before touching IndexedDB', async () => {
    await expect(createBrowserPwaOfflineOutbox('actor', {platform:'android',factory:null as never,cryptoProvider:null as never,vaultName:'test',queueName:'test'})).rejects.toThrow('PWA_BACKEND_ONLY')
  })
})
