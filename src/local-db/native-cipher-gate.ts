/**
 * Step 03 Part 2 — fail-closed boundary for a future native SQLCipher port.
 * This is NOT a SQLCipher implementation. Only a trusted Android Capacitor
 * plugin, installed + verified in a native build, may implement NativeCipherBridge.
 * Plain SQLite, web fallback, JS-stored passphrases and live finance are forbidden.
 */
import type { SqlitePort } from './sqlite-repository'
export type NativeCipherBridge = {
  platform: () => string
  isEncryptionConfigured: () => Promise<boolean>
  hasKeystoreWrappedSecret: () => Promise<boolean>
  openEncrypted: (name: string) => Promise<SqlitePort>
  isDatabaseEncrypted: (name: string) => Promise<boolean>
  close: (name: string) => Promise<void>
}
const databaseName = /^orbis-khata-local-[a-z0-9_-]{1,48}$/u
export async function openVerifiedAndroidSqlcipher(bridge: NativeCipherBridge, name: string): Promise<SqlitePort> {
  if (!databaseName.test(name)) throw new Error('NATIVE_DB_NAME_INVALID')
  if (bridge.platform() !== 'android') throw new Error('NATIVE_ANDROID_ONLY')
  if (!(await bridge.isEncryptionConfigured())) throw new Error('NATIVE_SQLCIPHER_DISABLED')
  if (!(await bridge.hasKeystoreWrappedSecret())) throw new Error('NATIVE_KEYSTORE_SECRET_MISSING')
  let opened = false
  try {
    const db = await bridge.openEncrypted(name)
    opened = true
    if (!(await bridge.isDatabaseEncrypted(name))) throw new Error('NATIVE_DB_NOT_ENCRYPTED')
    // The bridge implementation and actual SQLCipher device verification remain release gates.
    return db
  } catch (error) {
    if (opened) { try { await bridge.close(name) } catch { /* original failure is authoritative */ } }
    throw error
  }
}
