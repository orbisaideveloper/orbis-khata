/**
 * Step 04 isolated sync orchestration. No production endpoint or live app import.
 * All I/O is via injected ports; server receipts are NEVER inferred from HTTP 200.
 * The store adapter must make persistAttempt and commitFeedPage durable/atomic.
 */
import type { QueueItem } from '../sync/outbox-state'
import { finishAttempt } from '../sync/outbox-state'
import { parseSyncEnvelope } from '../sync/protocol'
import { assertOfflineAuthority, type VerifiedOfflineGrant } from './offline-authority'

export type FeedEvent = Readonly<{
  eventId: string
  companyId: string
  serverSeq: number
  entityType: string
  entityId: string
  tombstone: boolean
  change: Readonly<Record<string, unknown>>
}>
export type FeedPage = Readonly<{
  companyId: string
  fromCursor: number
  nextCursor: number
  events: readonly FeedEvent[]
}>
export type SyncStore = {
  pending(actorId: string, companyId: string): Promise<readonly QueueItem[]>
  persistAttempt(actorId: string, companyId: string, item: QueueItem): Promise<void>
  cursor(actorId: string, companyId: string): Promise<number>
  /** Atomic encrypted write of all events + cursor; must rollback on ANY failure. */
  commitFeedPage(actorId: string, companyId: string, page: FeedPage): Promise<void>
}
export type SyncNetwork = {
  send(envelope: QueueItem['envelope']): Promise<unknown>
  pull(companyId: string, fromCursor: number): Promise<unknown>
}
const object = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x)
const opaque = (v: unknown): v is string =>
  typeof v === 'string' && /^[\w-]{1,128}$/u.test(v)
const numberCursor = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0

/** Reject cross-company, replayed, duplicate, out-of-order or gapped feed pages. */
export function parseContiguousFeed(value: unknown, companyId: string, fromCursor: number): FeedPage {
  if (!object(value) || value.companyId !== companyId ||
      !numberCursor(fromCursor) || value.fromCursor !== fromCursor ||
      !numberCursor(value.nextCursor) || !Array.isArray(value.events) || value.events.length > 500) {
    throw new Error('SYNC_FEED_INVALID')
  }
  const events: FeedEvent[] = []
  const ids = new Set<string>()
  for (const raw of value.events) {
    if (!object(raw) || !opaque(raw.eventId) || ids.has(raw.eventId) ||
        raw.companyId !== companyId || !numberCursor(raw.serverSeq) ||
        raw.serverSeq !== fromCursor + events.length + 1 ||
        !opaque(raw.entityType) || !opaque(raw.entityId) ||
        typeof raw.tombstone !== 'boolean' || !object(raw.change)) {
      throw new Error('SYNC_FEED_GAP_OR_SCOPE')
    }
    let encoded: string | undefined
    try { encoded = JSON.stringify(raw.change) } catch { throw new Error('SYNC_FEED_INVALID') }
    if (!encoded || encoded.length > 131072) throw new Error('SYNC_FEED_TOO_LARGE')
    ids.add(raw.eventId)
    events.push(raw as FeedEvent)
  }
  if (value.nextCursor !== fromCursor + events.length) throw new Error('SYNC_FEED_CURSOR_MISMATCH')
  return { companyId, fromCursor, nextCursor: value.nextCursor as number, events }
}

export type SyncOutcome = Readonly<{
  processed: number
  accepted: number
  conflict: number
  rejected: number
  uncertain: number
  imported: number
  nextCursor: number | null
}>
export async function syncCompanyOnce(args: {
  grant: VerifiedOfflineGrant | null
  actorId: string
  companyId: string
  nowMs: number
  store: SyncStore
  network: SyncNetwork
  onlineSessionVerified: boolean
}): Promise<SyncOutcome> {
  const { grant, actorId, companyId, nowMs, store, network } = args
  assertOfflineAuthority(grant, actorId, companyId, nowMs, 'sync')
  if (args.onlineSessionVerified !== true) throw new Error('SYNC_ONLINE_AUTH_REQUIRED')
  const rows = await store.pending(actorId, companyId)
  let accepted = 0, conflict = 0, rejected = 0, uncertain = 0, processed = 0
  const known = new Set<string>()
  // Validate the complete batch before any network operation.
  for (const row of rows) {
    if (row.state !== 'queued' || !parseSyncEnvelope(row.envelope) ||
        row.envelope.actorId !== actorId || row.envelope.companyId !== companyId ||
        known.has(row.envelope.operationId)) throw new Error('SYNC_STORE_SCOPE_OR_DUPLICATE')
    known.add(row.envelope.operationId)
  }
  await rows.reduce(async (previous, row) => {
    await previous
    let receipt: unknown = null
    try { receipt = await network.send(row.envelope) } catch { /* unknown server outcome */ }
    const next = finishAttempt(row, receipt)
    // Persist BEFORE considering an operation acknowledged. Failed persistence
    // must stop the batch so the same immutable operation ID can be retried.
    await store.persistAttempt(actorId, companyId, next)
    processed += 1
    if (next.state === 'synced') accepted += 1
    else if (next.state === 'conflict') conflict += 1
    else if (next.state === 'rejected') rejected += 1
    else uncertain += 1
  }, Promise.resolve())
  // An unknown server outcome must not be silently described as finished sync.
  if (uncertain > 0) return { processed, accepted, conflict, rejected, uncertain, imported: 0, nextCursor: null }
  const before = await store.cursor(actorId, companyId)
  if (!numberCursor(before)) throw new Error('SYNC_STORED_CURSOR_INVALID')
  const raw = await network.pull(companyId, before)
  const page = parseContiguousFeed(raw, companyId, before)
  await store.commitFeedPage(actorId, companyId, page)
  return { processed, accepted, conflict, rejected, uncertain, imported: page.events.length, nextCursor: page.nextCursor }
}
