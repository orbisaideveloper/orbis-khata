/**
 * Step 04+06 native SQLCipher transactional sync storage adapter.
 * IMPORTANT: `db` MUST come from openVerifiedAndroidSqlcipher on Android,
 * and `codec` MUST be a hardware-backed envelope cipher (see device bridge).
 * These requirements are not established by accepting an arbitrary SqlitePort.
 * Not wired to the production accounting API until release acceptance.
 */
import { createLocalSqliteRepository, type SqlitePort } from '../local-db/sqlite-repository'
import { parseSyncEnvelope } from '../sync/protocol'
import { parseContiguousFeed, type FeedEvent, type FeedPage, type SyncStore } from '../offline-batch/sync-coordinator'
import type { QueueItem } from '../sync/outbox-state'

export interface NativeRecordCodec {
  seal(plaintext: string, scope: string): Promise<Uint8Array>
  unseal(ciphertext: Uint8Array, scope: string): Promise<string>
}
const encoder = new TextEncoder()
const validId = (x: unknown): x is string => typeof x === 'string' && /^[\w-]{1,128}$/u.test(x)
const validCursor = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0
const hexBytes = (x: string): Uint8Array => {
  if (typeof x !== 'string' || x.length < 34 || x.length > 2_000_000 || x.length % 2 !== 0 || !/^[0-9a-f]+$/iu.test(x)) {
    throw new Error('NATIVE_SYNC_BLOB_INVALID')
  }
  const a = new Uint8Array(x.length / 2)
  for (let i = 0; i < a.length; i++) a[i] = Number.parseInt(x.slice(i * 2, i * 2 + 2), 16)
  return a
}
const requireScope = (actor: string, company: string): void => {
  if (!validId(actor) || !validId(company)) throw new Error('NATIVE_SYNC_SCOPE_INVALID')
}
const recordScope = (actor: string, company: string, kind: string, id: string) =>
  `orbis:${kind}:${actor}:${company}:${id}`
const sha256 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text))
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('')
}

type PendingRow = {
  operation_id: string
  command_type: string
  payload_digest: string
  sealed_hex: string
  created_at: string
  state: QueueItem['state']
  attempts: number
  server_cursor: string | null
  last_reason: string | null
}
type CursorRow = { last_server_seq: number }
type EventRow = { server_seq: number; event_id: string; sealed_hex: string }

export function createNativeTransactionalSyncStore(db: SqlitePort, codec: NativeRecordCodec): SyncStore & {
  append(item: QueueItem): Promise<'created' | 'already-present'>
  readFeed(actorId: string, companyId: string): Promise<readonly FeedEvent[]>
} {
  const repo = createLocalSqliteRepository(db)
  async function decryptQueue(row: PendingRow, actor: string, company: string): Promise<QueueItem> {
    if (!validId(row.operation_id) && !/^[0-9a-f-]{36}$/iu.test(row.operation_id)) throw new Error('NATIVE_SYNC_OPERATION_ID_INVALID')
    const json = await codec.unseal(hexBytes(row.sealed_hex), recordScope(actor, company, 'outbox', row.operation_id))
    const envelope = parseSyncEnvelope(JSON.parse(json) as unknown)
    if (envelope?.actorId !== actor || envelope.companyId !== company ||
        envelope.operationId !== row.operation_id || envelope.commandType !== row.command_type ||
        envelope.createdAt !== row.created_at || await sha256(json) !== row.payload_digest ||
        !['queued','synced','conflict','rejected'].includes(row.state) ||
        !validCursor(row.attempts) || row.attempts > 1_000_000 ||
        (row.state === 'synced' && row.server_cursor === null) ||
        (row.state !== 'queued' && row.state !== 'synced' && row.last_reason === null)) throw new Error('NATIVE_SYNC_RECORD_INVALID')
    return { envelope, state: row.state, attempts: row.attempts, serverCursor: row.server_cursor, lastReason: row.last_reason }
  }
  return {
    async append(item) {
      const env = item.envelope
      requireScope(env.actorId, env.companyId)
      if (item.state !== 'queued' || item.attempts !== 0 || item.serverCursor !== null || !parseSyncEnvelope(env)) {
        throw new Error('NATIVE_SYNC_APPEND_INVALID')
      }
      const json = JSON.stringify(env)
      const sealed = await codec.seal(json, recordScope(env.actorId, env.companyId, 'outbox', env.operationId))
      return repo.appendEncryptedCommand({ actorId: env.actorId, companyId: env.companyId,
        operationId: env.operationId, commandType: env.commandType, payloadDigest: await sha256(json),
        sealedRecord: sealed, createdAt: env.createdAt })
    },
    async pending(actorId, companyId) {
      requireScope(actorId, companyId)
      const rows = await db.all<PendingRow>(`SELECT operation_id,command_type,payload_digest,hex(sealed_record) AS sealed_hex,
        created_at,state,attempts,server_cursor,last_reason FROM local_outbox
        WHERE actor_id=? AND company_id=? AND state='queued' ORDER BY created_at,operation_id`, [actorId, companyId])
      return Promise.all(rows.map(row => decryptQueue(row, actorId, companyId)))
    },
    async persistAttempt(actorId, companyId, next) {
      requireScope(actorId, companyId)
      if (next.envelope.actorId !== actorId || next.envelope.companyId !== companyId) throw new Error('NATIVE_SYNC_RECEIPT_SCOPE')
      await db.transaction(async () => {
        const row = await db.get<PendingRow>(`SELECT operation_id,command_type,payload_digest,hex(sealed_record) AS sealed_hex,
          created_at,state,attempts,server_cursor,last_reason FROM local_outbox
          WHERE actor_id=? AND company_id=? AND operation_id=?`, [actorId, companyId, next.envelope.operationId])
        if (!row) throw new Error('NATIVE_SYNC_RECEIPT_MISSING')
        const old = await decryptQueue(row, actorId, companyId)
        if (old.state !== 'queued' || next.attempts !== old.attempts + 1 || next.attempts > 1_000_000 ||
            JSON.stringify(old.envelope) !== JSON.stringify(next.envelope) ||
            !['queued','synced','conflict','rejected'].includes(next.state) ||
            (next.state === 'synced' && next.serverCursor === null) ||
            ((next.state === 'conflict' || next.state === 'rejected') && next.lastReason === null)) {
          throw new Error('NATIVE_SYNC_RECEIPT_TRANSITION_INVALID')
        }
        const result = await db.run(`UPDATE local_outbox SET state=?,attempts=?,server_cursor=?,last_reason=?
          WHERE actor_id=? AND company_id=? AND operation_id=? AND state='queued' AND attempts=?`,
        [next.state, next.attempts, next.serverCursor, next.lastReason, actorId, companyId, next.envelope.operationId, old.attempts])
        if (result.changes !== 1) throw new Error('NATIVE_SYNC_RECEIPT_CONCURRENT_UPDATE')
      })
    },
    async cursor(actorId, companyId) {
      requireScope(actorId, companyId)
      const row = await db.get<CursorRow>('SELECT last_server_seq FROM local_cursors WHERE actor_id=? AND company_id=?', [actorId, companyId])
      const value = row?.last_server_seq ?? 0
      if (!validCursor(value)) throw new Error('NATIVE_SYNC_CURSOR_INVALID')
      return value
    },
    async commitFeedPage(actorId, companyId, page: FeedPage) {
      requireScope(actorId, companyId)
      const checked = parseContiguousFeed(page, companyId, page.fromCursor)
      const sealed = await Promise.all(checked.events.map(async event => ({ event,
        ciphertext: await codec.seal(JSON.stringify(event), recordScope(actorId, companyId, 'feed', `${event.serverSeq}:${event.eventId}`)) })))
      await db.transaction(async () => {
        const row = await db.get<CursorRow>('SELECT last_server_seq FROM local_cursors WHERE actor_id=? AND company_id=?', [actorId, companyId])
        const current = row?.last_server_seq ?? 0
        if (!validCursor(current) || current !== checked.fromCursor) throw new Error('NATIVE_SYNC_FEED_CURSOR_STALE')
        await sealed.reduce(async (previous, item) => {
          await previous
          const result = await db.run(`INSERT INTO local_inbox(actor_id,company_id,server_seq,event_id,sealed_change)
            VALUES(?,?,?,?,?)`, [actorId, companyId, item.event.serverSeq, item.event.eventId, item.ciphertext])
          if (result.changes !== 1) throw new Error('NATIVE_SYNC_FEED_INSERT_FAILED')
        }, Promise.resolve())
        const result = await db.run(`INSERT INTO local_cursors(actor_id,company_id,last_server_seq)
          VALUES(?,?,?) ON CONFLICT(actor_id,company_id) DO UPDATE SET last_server_seq=excluded.last_server_seq`,
        [actorId, companyId, checked.nextCursor])
        if (result.changes !== 1) throw new Error('NATIVE_SYNC_FEED_CURSOR_SAVE_FAILED')
      })
    },
    async readFeed(actorId, companyId) {
      requireScope(actorId, companyId)
      const rows = await db.all<EventRow>(`SELECT server_seq,event_id,hex(sealed_change) AS sealed_hex FROM local_inbox
        WHERE actor_id=? AND company_id=? ORDER BY server_seq`, [actorId, companyId])
      const events = await Promise.all(rows.map(async row => {
        if (!validCursor(row.server_seq) || row.server_seq < 1 || !validId(row.event_id)) throw new Error('NATIVE_SYNC_FEED_INVALID')
        const json = await codec.unseal(hexBytes(row.sealed_hex), recordScope(actorId, companyId, 'feed', `${row.server_seq}:${row.event_id}`))
        const event = JSON.parse(json) as FeedEvent
        if (event.companyId !== companyId || event.serverSeq !== row.server_seq || event.eventId !== row.event_id) {
          throw new Error('NATIVE_SYNC_FEED_SCOPE_MISMATCH')
        }
        return event
      }))
      for (let i = 0; i < events.length; i++) if (events[i].serverSeq !== i + 1) throw new Error('NATIVE_SYNC_FEED_GAP')
      return events
    },
  }
}
