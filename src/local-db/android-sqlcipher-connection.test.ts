import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAndroidSqlcipherRuntime, runAndroidSyntheticCipherDiagnostic } from './android-sqlcipher-runtime'

const native = vi.hoisted(() => ({
  open: vi.fn(),
  execute: vi.fn(),
  query: vi.fn(),
  run: vi.fn(),
  beginTransaction: vi.fn(),
  commitTransaction: vi.fn(),
  rollbackTransaction: vi.fn(),
}))

const plugin = vi.hoisted(() => ({
  isInConfigEncryption: vi.fn(),
  isSecretStored: vi.fn(),
  isDatabase: vi.fn(),
  isDatabaseEncrypted: vi.fn(),
  checkEncryptionSecret: vi.fn(),
  setEncryptionSecret: vi.fn(),
  checkConnectionsConsistency: vi.fn(),
  isConnection: vi.fn(),
  retrieveConnection: vi.fn(),
  createConnection: vi.fn(),
  closeConnection: vi.fn(),
}))

const getPlatform = vi.hoisted(() => vi.fn())
const key = vi.hoisted(() => ({ status: vi.fn(), getOrCreatePassphrase: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform }, registerPlugin: () => key }))
vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    constructor() { Object.assign(this, plugin) }
  },
}))

const name = 'orbis-khata-local-primary'

beforeEach(() => {
  vi.resetAllMocks()
  getPlatform.mockReturnValue('android')
  plugin.isInConfigEncryption.mockResolvedValue({ result: true })
  plugin.isSecretStored.mockResolvedValue({ result: true })
  plugin.checkEncryptionSecret.mockResolvedValue({ result: true })
  plugin.isDatabaseEncrypted.mockResolvedValue({ result: true })
  plugin.checkConnectionsConsistency.mockResolvedValue({ result: true })
  plugin.isConnection.mockResolvedValue({ result: false })
  plugin.createConnection.mockResolvedValue(native)
  native.execute.mockResolvedValue({ changes: { changes: 0 } })
  native.query.mockResolvedValue({ values: [{ cipher_version: '4.6.1' }] })
  key.status.mockResolvedValue({ nativePlatform: 'android', hardwareBacked: true, secretPresent: true })
  key.getOrCreatePassphrase.mockImplementation(async () => ({ passphrase: 'a'.repeat(48), hardwareBacked: true }))
})

describe('SQLCipher connection lifecycle', () => {
  it('opens and verifies the cipher, binds query values, and closes only once', async () => {
    const bridge = createAndroidSqlcipherRuntime(key)
    await expect(bridge.isEncryptionConfigured()).resolves.toBe(true)
    await expect(bridge.hasKeystoreWrappedSecret()).resolves.toBe(true)
    const port = await bridge.openEncrypted(name)
    expect(plugin.createConnection).toHaveBeenCalledWith(name, true, 'secret', 1, false)
    expect(native.query).toHaveBeenCalledWith('PRAGMA cipher_version')
    native.query.mockResolvedValueOnce({ values: [{ id: 'demo' }] }).mockResolvedValueOnce({})
    await expect(port.get('SELECT id FROM demo WHERE id=?', ['demo'])).resolves.toEqual({ id: 'demo' })
    expect(native.query).toHaveBeenLastCalledWith('SELECT id FROM demo WHERE id=?', ['demo'])
    await expect(port.all('SELECT id FROM demo')).resolves.toEqual([])
    await bridge.close(name)
    await bridge.close(name)
    expect(plugin.closeConnection).toHaveBeenCalledExactlyOnceWith(name, false)
  })

  it('uses one explicit transaction, rolls back a failed write, and can retry', async () => {
    const port = await createAndroidSqlcipherRuntime(key).openEncrypted(name)
    native.run.mockResolvedValueOnce({ changes: { changes: -1 } }).mockResolvedValueOnce({ changes: { changes: 1 } })
    const write = () => port.run('INSERT INTO demo VALUES (?)', ['demo'])
    await expect(port.transaction(write)).rejects.toThrow('NATIVE_SQL_RUN_FAILED')
    expect(native.rollbackTransaction).toHaveBeenCalledOnce()
    expect(native.commitTransaction).not.toHaveBeenCalled()
    await expect(port.transaction(write)).resolves.toEqual({ changes: 1 })
    expect(native.run).toHaveBeenLastCalledWith('INSERT INTO demo VALUES (?)', ['demo'], false)
    expect(native.commitTransaction).toHaveBeenCalledOnce()
    await expect(port.transaction(() => port.transaction(write))).rejects.toThrow('NATIVE_NESTED_TRANSACTION_FORBIDDEN')
  })

  it('rejects an existing database with no key before provisioning anything', async () => {
    plugin.isSecretStored.mockResolvedValue({ result: false })
    plugin.isDatabase.mockResolvedValue({ result: true })
    key.status.mockResolvedValue({ nativePlatform: 'android', hardwareBacked: true, secretPresent: false })
    await expect(createAndroidSqlcipherRuntime(key).openEncrypted(name)).rejects.toThrow('NATIVE_ENCRYPTED_DB_KEY_MISSING')
    expect(key.getOrCreatePassphrase).not.toHaveBeenCalled()
    expect(plugin.createConnection).not.toHaveBeenCalled()
  })

  it('closes a connection if verification shows the database is unencrypted', async () => {
    plugin.isDatabaseEncrypted.mockResolvedValue({ result: false })
    await expect(createAndroidSqlcipherRuntime(key).openEncrypted(name)).rejects.toThrow('NATIVE_SQLCIPHER_NOT_ENCRYPTED')
    expect(plugin.closeConnection).toHaveBeenCalledExactlyOnceWith(name, false)
  })

  it('closes and reopens the synthetic diagnostic database', async () => {
    native.run.mockResolvedValue({ changes: { changes: 1 } })
    const pragmaResults: Record<string, object[]> = {
      'PRAGMA cipher_version': [{ cipher_version: '4.6.1' }],
      'PRAGMA foreign_keys': [{ foreign_keys: 1 }],
      'PRAGMA user_version': [{ user_version: 1 }],
    }
    native.query.mockImplementation(async (sql: string) => ({ values: pragmaResults[sql] ?? [] }))
    await expect(runAndroidSyntheticCipherDiagnostic()).resolves.toEqual([
      'SQLCIPHER_SCHEMA_AND_COMPANY_SCOPE_PASS',
      'SQLCIPHER_CLOSE_REOPEN_PASS',
      'HARDWARE_KEYSTORE_WRAPPING_PRESENT',
    ])
    expect(plugin.closeConnection).toHaveBeenCalledTimes(2)
  })

  it('does not access Android SQLite or keystore on web', async () => {
    getPlatform.mockReturnValue('web')
    const bridge = createAndroidSqlcipherRuntime(key)
    await expect(bridge.isEncryptionConfigured()).resolves.toBe(false)
    await expect(bridge.hasKeystoreWrappedSecret()).resolves.toBe(false)
    await expect(bridge.openEncrypted(name)).rejects.toThrow('NATIVE_DB_NAME_INVALID')
    expect(plugin.isInConfigEncryption).not.toHaveBeenCalled()
    expect(key.status).not.toHaveBeenCalled()
  })
})
