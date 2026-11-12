import { describe, expect, it } from 'vitest'
import { KHATA_LOCAL_SQLITE_V1, KHATA_LOCAL_SQLITE_VERSION } from './sqlite-schema'
import { createLocalSqliteRepository, ensureLocalSchema, type SqlitePort, type SqlParams } from './sqlite-repository'

const actorId = 'owner_A'
const companyId = 'company_A'
const entry = Object.freeze({
  actorId, companyId, operationId: '11111111-1111-4111-8111-111111111111', commandType: 'voucher-post',
  payloadDigest: 'a'.repeat(64), sealedRecord: new Uint8Array(32).fill(5), createdAt: '2026-11-11T05:30:00.000Z',
})
function fixture(initialVersion = 0) {
  const statements: Array<{ sql: string; params?: SqlParams }> = []
  let version = initialVersion
  let inserted = false
  let existing = { payload_digest: entry.payloadDigest, command_type: entry.commandType, created_at: entry.createdAt }
  const db: SqlitePort = {
    run: async (sql, params) => {
      statements.push({ sql, params })
      if (sql === 'PRAGMA user_version = 1') version = 1
      if (sql.startsWith('INSERT INTO local_outbox')) { const changes = inserted ? 0 : 1; inserted = true; return { changes } }
      return { changes: 1 }
    },
    get: async <T extends object>(sql: string) => {
      if (sql === 'PRAGMA user_version') return { user_version: version } as T
      if (sql === 'PRAGMA foreign_keys') return { foreign_keys: 1 } as T
      if (sql.startsWith('SELECT payload_digest')) return existing as T
      return undefined
    },
    all: async <T extends object>() => [] as T[],
    transaction: async <T>(action: () => Promise<T>) => action(),
  }
  return { db, statements, setExisting: (v: typeof existing) => { existing = v }, getVersion: () => version }
}
describe('Step 03 local SQLite foundation contract (not live)', () => {
  it('defines version one and a company-scoped encrypted outbox', () => {
    expect(KHATA_LOCAL_SQLITE_VERSION).toBe(1)
    expect(KHATA_LOCAL_SQLITE_V1.some(s => s.includes('FOREIGN KEY(actor_id,company_id)'))).toBe(true)
    expect(KHATA_LOCAL_SQLITE_V1.some(s => s.includes('OUTBOX_PAYLOAD_IMMUTABLE'))).toBe(true)
  })
  it('applies migration once', async () => {
    const f = fixture()
    await ensureLocalSchema(f.db)
    const first = f.statements.length
    expect(f.getVersion()).toBe(1)
    expect(first).toBe(KHATA_LOCAL_SQLITE_V1.length + 2)
    await ensureLocalSchema(f.db)
    expect(f.statements).toHaveLength(first + 1) // safe PRAGMA on each open
  })
  it('rejects unknown future schema versions', async () => {
    const f = fixture(3)
    await expect(ensureLocalSchema(f.db)).rejects.toThrow('LOCAL_SCHEMA_UNSUPPORTED')
  })
  it('stores only scoped operation identifiers and sealed bytes', async () => {
    const f = fixture()
    const repo = createLocalSqliteRepository(f.db)
    expect(await repo.appendEncryptedCommand(entry)).toBe('created')
    expect(f.statements[0].params?.[0]).toBe(actorId)
    expect(f.statements[0].params?.[1]).toBe(companyId)
    expect(f.statements[0].params?.[5]).toEqual(entry.sealedRecord)
    expect(await repo.appendEncryptedCommand(entry)).toBe('already-present')
  })
  it('rejects same id with changed digest', async () => {
    const f = fixture(); const repo = createLocalSqliteRepository(f.db)
    await repo.appendEncryptedCommand(entry)
    f.setExisting({ payload_digest: 'b'.repeat(64), command_type: entry.commandType, created_at: entry.createdAt })
    await expect(repo.appendEncryptedCommand(entry)).rejects.toThrow('LOCAL_IDEMPOTENCY_CONFLICT')
  })
  it('rejects malformed actor, command or unsealed payload', async () => {
    const f = fixture(); const repo = createLocalSqliteRepository(f.db)
    await expect(repo.appendEncryptedCommand({ ...entry, actorId: 'a/b' })).rejects.toThrow('LOCAL_SCOPE_INVALID')
    await expect(repo.appendEncryptedCommand({ ...entry, sealedRecord: new Uint8Array(2) })).rejects.toThrow('LOCAL_RECORD_INVALID')
    await expect(repo.appendEncryptedCommand({ ...entry, commandType: 'BAD' })).rejects.toThrow('LOCAL_RECORD_INVALID')
    expect(f.statements).toHaveLength(0)
  })
  it('rejects invalid time before recording scope', async () => {
    const f = fixture(); const repo = createLocalSqliteRepository(f.db)
    await expect(repo.registerScope(actorId, companyId, 'invalid')).rejects.toThrow('LOCAL_DATE_INVALID')
    expect(f.statements).toHaveLength(0)
  })
})
