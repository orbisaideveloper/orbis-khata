/**
 * Step03 Part3: isolated Android SQLCipher driver and hardware key wrapper.
 * DO NOT import from current live accounting flows. Existing Web/PWA stays online.
 * Even though the Keystore AES wrapping key is non-exportable, the SQLCipher plugin
 * API receives a passphrase in native WebView memory; keep strict CSP and never log it.
 * All current reads and writes are synthetic/test-only; no customer data migration.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import { openVerifiedAndroidSqlcipher, type NativeCipherBridge } from './native-cipher-gate'
import type { SqlitePort, SqlParams } from './sqlite-repository'

export interface KhataKeyPlugin {
  status(): Promise<{ nativePlatform: string; hardwareBacked: boolean; secretPresent: boolean }>
  getOrCreatePassphrase(): Promise<{ passphrase: string; hardwareBacked: boolean }>
}
const keys = registerPlugin<KhataKeyPlugin>('OrbisKhataKeyBridge')
const MAX_ENCRYPTED_BLOB = 1024 * 1024

/** SQL literal BLOB conversion because Capacitor Community bridge doesn't guarantee Uint8Array positional binding. */
export function toSafeNativeParams(sql: string, params: SqlParams = []): { statement: string; values: Array<string | number | null> } {
  if (typeof sql !== 'string' || sql.length > 128000 || !/^[\x20-\x7E\n\r\t]+$/u.test(sql)) throw new Error('NATIVE_SQL_INVALID')
  if (!Array.isArray(params) || params.length > 32) throw new Error('NATIVE_SQL_PARAMS_INVALID')
  // Only our fixed SQLite repository SQL statements use positional ? placeholders.
  // Reject SQL constructs that would make ? appear outside a bind placeholder.
  if (sql.includes('--') || sql.includes('/*') || sql.includes('"?"') || sql.includes("'?'") || sql.includes('`?`')) throw new Error('NATIVE_SQL_UNSUPPORTED_SYNTAX')
  const matches = sql.match(/\?/gu) ?? []
  if (matches.length !== params.length) throw new Error('NATIVE_SQL_PARAM_COUNT')
  let next = 0
  const values: Array<string | number | null> = []
  const statement = sql.replaceAll('?', () => {
    const value = params[next++]
    if (value instanceof Uint8Array) {
      if (value.byteLength < 17 || value.byteLength > MAX_ENCRYPTED_BLOB) throw new Error('NATIVE_BLOB_SIZE_INVALID')
      // hex literals are derived from bytes only, never external strings.
      return `X'${Array.from(value, n => n.toString(16).padStart(2, '0')).join('')}'`
    }
    if (value !== null && typeof value !== 'string' && (typeof value !== 'number' || !Number.isSafeInteger(value))) {
      throw new Error('NATIVE_SQL_VALUE_INVALID')
    }
    values.push(value)
    return '?'
  })
  return { statement, values }
}

/** Use SQLCipher plugin's explicit transaction API; default auto-transactions disabled. */
function wrapNativeConnection(nativeDb: SQLiteDBConnection): SqlitePort {
  let insideTransaction = false
  return {
    async run(sql, params = []) {
      const { statement, values } = toSafeNativeParams(sql, params)
      if (/^\s*(?:PRAGMA|CREATE|ALTER|DROP)\b/iu.test(statement)) {
        const r = await nativeDb.execute(statement, false)
        const changes = r.changes?.changes
        if (typeof changes !== 'number' || !Number.isSafeInteger(changes) || changes < 0) throw new Error('NATIVE_SQL_EXECUTE_FAILED')
        return { changes }
      }
      const r = await nativeDb.run(statement, values, false)
      const changes = r.changes?.changes
      if (typeof changes !== 'number' || !Number.isSafeInteger(changes) || changes < 0) throw new Error('NATIVE_SQL_RUN_FAILED')
      return { changes }
    },
    async get<T extends object>(sql: string, params: SqlParams = []) {
      const { statement, values } = toSafeNativeParams(sql, params)
      const result = await nativeDb.query(statement, values)
      return result.values?.[0] as T | undefined
    },
    async all<T extends object>(sql: string, params: SqlParams = []) {
      const { statement, values } = toSafeNativeParams(sql, params)
      const result = await nativeDb.query(statement, values)
      return (result.values ?? []) as readonly T[]
    },
    async transaction<T>(action: () => Promise<T>): Promise<T> {
      if (insideTransaction) throw new Error('NATIVE_NESTED_TRANSACTION_FORBIDDEN')
      insideTransaction = true
      let begun = false
      try {
        await nativeDb.beginTransaction()
        begun = true
        const value = await action()
        await nativeDb.commitTransaction()
        return value
      } catch (err) {
        if (begun) { try { await nativeDb.rollbackTransaction() } catch { /* preserve original */ } }
        throw err
      } finally { insideTransaction = false }
    },
  }
}

async function verifyConnectionSecret(sql: SQLiteConnection, keyPlugin: KhataKeyPlugin, name: string): Promise<void> {
  const status = await keyPlugin.status()
  if (status.nativePlatform !== 'android') throw new Error('NATIVE_NOT_ANDROID')
  // If the community plugin has a secret, the corresponding Keystore wrapper MUST exist.
  const stored = (await sql.isSecretStored()).result === true
  if (stored && !(status.secretPresent && status.hardwareBacked)) throw new Error('NATIVE_SECRET_KEY_LOST')
  if (!stored && status.secretPresent) throw new Error('NATIVE_PLUGIN_SECRET_MISSING')
  if (!stored && (await sql.isDatabase(name)).result === true) throw new Error('NATIVE_ENCRYPTED_DB_KEY_MISSING')
  const retrieved = await keyPlugin.getOrCreatePassphrase()
  if (!retrieved.hardwareBacked || retrieved.passphrase.length < 48) throw new Error('NATIVE_UNPROTECTED_SECRET')
  try {
    if (!stored) await sql.setEncryptionSecret(retrieved.passphrase)
    else if ((await sql.checkEncryptionSecret(retrieved.passphrase)).result !== true) throw new Error('NATIVE_PLUGIN_SECRET_MISMATCH')
  } finally {
    // Ephemeral secret is not retained in application code; plugin bridges may copy it.
    retrieved.passphrase = ''
  }
}

export function createAndroidSqlcipherRuntime(keyPlugin: KhataKeyPlugin = keys): NativeCipherBridge {
  const sql = new SQLiteConnection(CapacitorSQLite)
  const opened = new Map<string, SQLiteDBConnection>()
  const platform = () => Capacitor.getPlatform()
  return {
    platform,
    async isEncryptionConfigured() {
      if (platform() !== 'android') return false
      return (await sql.isInConfigEncryption()).result === true
    },
    async hasKeystoreWrappedSecret() {
      if (platform() !== 'android') return false
      const state = await keyPlugin.status()
      return state.nativePlatform === 'android' && state.hardwareBacked === true && state.secretPresent === true
    },
    async openEncrypted(name) {
      if (platform() !== 'android' || !/^orbis-khata-local-[a-z0-9_-]{1,48}$/u.test(name)) throw new Error('NATIVE_DB_NAME_INVALID')
      if ((await sql.isInConfigEncryption()).result !== true) throw new Error('NATIVE_SQLCIPHER_DISABLED')
      await verifyConnectionSecret(sql, keyPlugin, name)
      const existing = (await sql.checkConnectionsConsistency()).result && (await sql.isConnection(name, false)).result
      const db = existing ? await sql.retrieveConnection(name, false) : await sql.createConnection(name, true, 'secret', 1, false)
      try {
        await db.open()
        // Materialize a newly opened encrypted database before checking its on-disk cipher state.
        // Fail closed if the native plugin still reports that this database is not encrypted.
        await db.execute('CREATE TABLE IF NOT EXISTS step3_cipher_bootstrap (k INTEGER PRIMARY KEY)', false)
        if ((await sql.isDatabaseEncrypted(name)).result !== true) throw new Error('NATIVE_SQLCIPHER_NOT_ENCRYPTED')
        const cipher = await db.query('PRAGMA cipher_version')
        const version = cipher.values?.[0]
        if (!version || typeof version.cipher_version !== 'string' || version.cipher_version.length < 3) throw new Error('NATIVE_SQLCIPHER_VERSION_MISSING')
        opened.set(name, db)
        return wrapNativeConnection(db)
      } catch (error) {
        try { await sql.closeConnection(name, false) } catch { /* keep original */ }
        throw error
      }
    },
    async isDatabaseEncrypted(name) {
      return (await sql.isDatabaseEncrypted(name)).result === true
    },
    async close(name) {
      if (opened.has(name)) {
        await sql.closeConnection(name, false)
        opened.delete(name)
      }
    },
  }
}

/**
 * Diagnostic only, callable deliberately from an Android local test harness.
 * Ensures cipher version, schema, synthetic outbox, restart + reopen. No real finance.
 */
export async function runAndroidSyntheticCipherDiagnostic(): Promise<string[]> {
  const name = 'orbis-khata-local-smoke'
  const notes: string[] = []
  const bridge = createAndroidSqlcipherRuntime()
  if (bridge.platform() !== 'android') throw new Error('ANDROID_DEVICE_REQUIRED')
  // Provision the Keystore secret only on a truly fresh install for the known test DB.
  const sql = new SQLiteConnection(CapacitorSQLite)
  const status = await keys.status()
  if ((await sql.isSecretStored()).result !== true && status.secretPresent !== true) {
    const { passphrase, hardwareBacked } = await keys.getOrCreatePassphrase()
    if (!hardwareBacked) throw new Error('HARDWARE_KEYSTORE_REQUIRED')
    await sql.setEncryptionSecret(passphrase)
  }
  const { ensureLocalSchema, createLocalSqliteRepository } = await import('./sqlite-repository')
  const stamp = new Date().toISOString()
  const actor = 'synthetic-android-tester'
  const company = 'synthetic-company'
  let db = await openVerifiedAndroidSqlcipher(bridge, name)
  try {
    await ensureLocalSchema(db)
    await createLocalSqliteRepository(db).registerScope(actor, company, stamp)
    const data = await createLocalSqliteRepository(db).pending(actor, company)
    if (!Array.isArray(data)) throw new Error('NATIVE_DIAGNOSTIC_QUERY_FAILED')
    notes.push('SQLCIPHER_SCHEMA_AND_COMPANY_SCOPE_PASS')
  } finally { await bridge.close(name) }
  db = await openVerifiedAndroidSqlcipher(bridge, name)
  try {
    const data = await createLocalSqliteRepository(db).pending(actor, company)
    if (!Array.isArray(data)) throw new Error('NATIVE_DIAGNOSTIC_REOPEN_FAILED')
    notes.push('SQLCIPHER_CLOSE_REOPEN_PASS', 'HARDWARE_KEYSTORE_WRAPPING_PRESENT')
  } finally { await bridge.close(name) }
  return notes
}
