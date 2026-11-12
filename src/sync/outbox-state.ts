/**
 * Deterministic state transition rules for a future durable outbox.
 * No storage, network, migration or business posting is performed here.
 * The real durable store must commit the new entry and local accounting projection
 * in one transaction, and persist every acknowledgement before clearing pending.
 */
import { confirmedReceipt, parseSyncEnvelope, parseSyncReceipt } from './protocol'
import type { SyncEnvelope } from './protocol'

type QueueState = 'queued' | 'synced' | 'conflict' | 'rejected'
export type QueueItem = Readonly<{
  envelope: SyncEnvelope
  state: QueueState
  attempts: number
  lastReason: string | null
  serverCursor: string | null
}>

/** Reject unsafe or malformed messages before they reach a future local store. */
export function validQueueItem(value: unknown): value is QueueItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  const envelope = parseSyncEnvelope(item.envelope)
  return envelope !== null &&
    ['queued', 'synced', 'conflict', 'rejected'].includes(String(item.state)) &&
    typeof item.attempts === 'number' && Number.isSafeInteger(item.attempts) &&
    item.attempts >= 0 && item.attempts <= 1000000 &&
    (item.lastReason === null || (typeof item.lastReason === 'string' && item.lastReason.length <= 128)) &&
    (item.serverCursor === null || (typeof item.serverCursor === 'string' && item.serverCursor.length <= 128)) &&
    (item.state !== 'synced' || item.serverCursor !== null) &&
    (!['conflict', 'rejected'].includes(String(item.state)) || item.lastReason !== null) &&
    Object.keys(item).sort().join(',') === 'attempts,envelope,lastReason,serverCursor,state'
}

export function queueNew(value: unknown): QueueItem {
  const envelope = parseSyncEnvelope(value)
  if (!envelope) throw new Error('INVALID_SYNC_ENVELOPE')
  return { envelope, state: 'queued', attempts: 0, lastReason: null, serverCursor: null }
}

/** Idempotency identity is actor + company + operation ID; never overwrite payload. */
export function enqueueUnique(items: readonly QueueItem[], next: QueueItem): readonly QueueItem[] {
  for (const existing of items) {
    if (existing.envelope.actorId !== next.envelope.actorId ||
        existing.envelope.companyId !== next.envelope.companyId ||
        existing.envelope.operationId !== next.envelope.operationId) continue
    if (JSON.stringify(existing.envelope) !== JSON.stringify(next.envelope)) {
      throw new Error('IDEMPOTENCY_CONFLICT')
    }
    return items
  }
  return [...items, next]
}

/**
 * Apply a server acknowledgement to exactly its matching pending command.
 * A timeout or malformed/unrelated response stays QUEUED and is retried using
 * the SAME operation ID. Never assume a timed-out write failed on the server.
 */
export function finishAttempt(item: QueueItem, response: unknown): QueueItem {
  if (item.state !== 'queued') return item
  const attempts = item.attempts + 1
  const receipt = parseSyncReceipt(response)
  if (!receipt || receipt.operationId !== item.envelope.operationId ||
      receipt.companyId !== item.envelope.companyId) {
    return { ...item, attempts, lastReason: 'UNKNOWN_OUTCOME' }
  }
  if (confirmedReceipt(item.envelope, receipt)) {
    return { ...item, state: 'synced', attempts, lastReason: null, serverCursor: receipt.serverCursor }
  }
  if (receipt.disposition === 'conflict') {
    return { ...item, state: 'conflict', attempts, lastReason: receipt.reason }
  }
  return { ...item, state: 'rejected', attempts, lastReason: receipt.reason }
}

/** Only a queued item may be retried automatically. Conflicts need resolution. */
export function mayAutoRetry(item: QueueItem): boolean { return item.state === 'queued' }
