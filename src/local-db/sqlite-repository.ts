/** Step 03 / Part 1: injected SQLite port, no driver or live-app integration. */
import { KHATA_LOCAL_SQLITE_V1, KHATA_LOCAL_SQLITE_VERSION } from './sqlite-schema'

type SqlValue = string | number | Uint8Array | null
export type SqlParams = readonly SqlValue[]
export interface SqlitePort {
  run(sql: string, params?: SqlParams): Promise<{ changes: number }>
  get<T extends object>(sql: string, params?: SqlParams): Promise<T | undefined>
  all<T extends object>(sql: string, params?: SqlParams): Promise<readonly T[]>
  transaction<T>(action: () => Promise<T>): Promise<T>
}
export type EncryptedPending = Readonly<{
  actorId: string
  companyId: string
  operationId: string
  commandType: string
  payloadDigest: string
  sealedRecord: Uint8Array
  createdAt: string
}>

type Existing = { payload_digest: string; command_type: string; created_at: string }
export type PendingRow = Readonly<{ operation_id: string; command_type: string; sealed_record: Uint8Array; created_at: string; attempts: number }>
const opaque = (v: string) => typeof v === 'string' && /^[\w-]{1,128}$/u.test(v)
const uuid = (v: string) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(v)
const instant = (v: string) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(v) && !Number.isNaN(Date.parse(v))
function scope(actorId: string, companyId: string) {
  if (!opaque(actorId) || !opaque(companyId)) throw new Error('LOCAL_SCOPE_INVALID')
}
/** Caller must open an already SQLCipher-encrypted SQLite connection in Part 2. */
export async function ensureLocalSchema(db: SqlitePort): Promise<void> {
  // Foreign keys are OFF by default in some SQLite builds; enforce before transactions.
  await db.run('PRAGMA foreign_keys = ON')
  const enabled = await db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')
  if (enabled?.foreign_keys !== 1) throw new Error('LOCAL_FOREIGN_KEYS_DISABLED')
  const current = await db.get<{ user_version: number }>('PRAGMA user_version')
  if (!current || !Number.isSafeInteger(current.user_version) || current.user_version < 0 || current.user_version > KHATA_LOCAL_SQLITE_VERSION) {
    throw new Error('LOCAL_SCHEMA_UNSUPPORTED')
  }
  if (current.user_version === KHATA_LOCAL_SQLITE_VERSION) return
  await db.transaction(async () => {
    await KHATA_LOCAL_SQLITE_V1.reduce(async (previous, sql) => {
      await previous
      await db.run(sql)
    }, Promise.resolve())
    await db.run('PRAGMA user_version = 1')
  })
}

export function createLocalSqliteRepository(db: SqlitePort) {
  return {
    /** Scope registration is NOT proof of server identity; Part 2/5 must authorize it. */
    async registerScope(actorId: string, companyId: string, createdAt: string): Promise<void> {
      scope(actorId, companyId)
      if (!instant(createdAt)) throw new Error('LOCAL_DATE_INVALID')
      await db.transaction(async () => {
        await db.run('INSERT INTO local_accounts(actor_id,created_at) VALUES(?,?) ON CONFLICT(actor_id) DO NOTHING', [actorId, createdAt])
        await db.run('INSERT INTO local_companies(actor_id,company_id,created_at) VALUES(?,?,?) ON CONFLICT(actor_id,company_id) DO NOTHING', [actorId, companyId, createdAt])
      })
    },
    async appendEncryptedCommand(input: EncryptedPending): Promise<'created' | 'already-present'> {
      scope(input.actorId, input.companyId)
      if (!uuid(input.operationId) || typeof input.commandType !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/u.test(input.commandType) ||
          !/^[0-9a-f]{64}$/u.test(input.payloadDigest) || !(input.sealedRecord instanceof Uint8Array) ||
          input.sealedRecord.byteLength < 17 || !instant(input.createdAt)) throw new Error('LOCAL_RECORD_INVALID')
      return db.transaction(async () => {
        const inserted = await db.run(`INSERT INTO local_outbox(actor_id,company_id,operation_id,command_type,payload_digest,sealed_record,created_at)
          VALUES(?,?,?,?,?,?,?) ON CONFLICT(actor_id,company_id,operation_id) DO NOTHING`,
        [input.actorId, input.companyId, input.operationId, input.commandType, input.payloadDigest, input.sealedRecord, input.createdAt])
        if (inserted.changes === 1) return 'created'
        const old = await db.get<Existing>(`SELECT payload_digest,command_type,created_at FROM local_outbox
          WHERE actor_id=? AND company_id=? AND operation_id=?`, [input.actorId, input.companyId, input.operationId])
        if (!old) throw new Error('LOCAL_INSERT_UNCERTAIN')
        if (old.payload_digest !== input.payloadDigest || old.command_type !== input.commandType || old.created_at !== input.createdAt) {
          throw new Error('LOCAL_IDEMPOTENCY_CONFLICT')
        }
        return 'already-present'
      })
    },
    async pending(actorId: string, companyId: string): Promise<readonly PendingRow[]> {
      scope(actorId, companyId)
      return db.all<PendingRow>(`SELECT operation_id,command_type,sealed_record,created_at,attempts FROM local_outbox
        WHERE actor_id=? AND company_id=? AND state='queued' ORDER BY created_at,operation_id`, [actorId, companyId])
    },
  }
}
