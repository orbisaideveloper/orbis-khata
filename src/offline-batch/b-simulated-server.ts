/**
 * Step 04 Batch B — DETERMINISTIC SERVER SIMULATOR, NOT A PRODUCTION SERVER.
 * It models server-owned idempotency, per-company ordering and optimistic
 * conflict rejection. Live PostgreSQL RPC/RLS/changefeed remain unimplemented.
 */
import { parseSyncEnvelope, SYNC_PROTOCOL_VERSION, type SyncEnvelope, type SyncReceipt } from '../sync/protocol'
import type { FeedEvent, FeedPage, SyncNetwork } from './sync-coordinator'

type Applied = Readonly<{ fingerprint: string; actorId: string; companyId: string; receipt: SyncReceipt }>
type State = { seq: number; events: FeedEvent[]; versions: Map<string, string> }
const validId = (x: unknown): x is string => typeof x === 'string' && /^[\w-]{1,128}$/u.test(x)
const body = (e: SyncEnvelope): string => JSON.stringify(e)
function receipt(e: SyncEnvelope, disposition: SyncReceipt['disposition'], cursor: string | null, reason: string | null): SyncReceipt {
  return { protocolVersion: SYNC_PROTOCOL_VERSION, operationId: e.operationId, companyId: e.companyId,
    disposition, serverCursor: cursor, reason }
}

/** No database and no side effects beyond this test fixture's in-memory state. */
export function createSimulatedKhataServer() {
  const companies = new Map<string, State>()
  const applied = new Map<string, Applied>()
  const ensure = (companyId: string): State => {
    let state = companies.get(companyId)
    if (!state) { state = { seq: 0, events: [], versions: new Map() }; companies.set(companyId, state) }
    return state
  }
  function forIdentity(actorId: string, allowedCompanyIds: readonly string[]): SyncNetwork {
    if (!validId(actorId) || allowedCompanyIds.length > 128 || !allowedCompanyIds.every(validId)) {
      throw new Error('SIMULATED_SESSION_INVALID')
    }
    const grants = new Set(allowedCompanyIds)
    return {
      async send(value) {
        const e = parseSyncEnvelope(value)
        if (!e) throw new Error('SIMULATED_ENVELOPE_INVALID')
        if (e.actorId !== actorId || !grants.has(e.companyId)) {
          return receipt(e, 'rejected', null, 'SCOPE_DENIED')
        }
        const key = `${e.companyId}:${e.operationId}`
        const previous = applied.get(key)
        if (previous) {
          // Identical operation must yield same effect, even after timeout.
          if (previous.actorId !== e.actorId || previous.fingerprint !== body(e)) {
            return receipt(e, 'rejected', null, 'IDEMPOTENCY_COLLISION')
          }
          return receipt(e, 'already-applied', previous.receipt.serverCursor, null)
        }
        const command = e.payload
        const entityId = command.entityId
        const action = command.action
        if (!validId(entityId) || (action !== 'put' && action !== 'delete') ||
            e.commandType !== 'fixture-voucher' || Object.keys(command).some(k => !['entityId', 'action', 'amountPaise'].includes(k))) {
          return receipt(e, 'rejected', null, 'FIXTURE_COMMAND_INVALID')
        }
        if (action === 'put' && (!Number.isSafeInteger(command.amountPaise) || (command.amountPaise as number) <= 0)) {
          return receipt(e, 'rejected', null, 'FIXTURE_AMOUNT_INVALID')
        }
        const state = ensure(e.companyId)
        const current = state.versions.get(entityId)
        if ((current ?? null) !== e.baseVersion) return receipt(e, 'conflict', null, 'BASE_VERSION_MISMATCH')
        if (state.seq >= Number.MAX_SAFE_INTEGER) throw new Error('SIMULATED_CURSOR_OVERFLOW')
        state.seq += 1
        const version = `v-${state.seq}`
        const event: FeedEvent = {
          eventId: `ev-${state.seq}`, companyId: e.companyId, serverSeq: state.seq,
          entityId, entityType: 'voucher', tombstone: action === 'delete',
          change: action === 'delete' ? { version, deleted: true } : { version, amountPaise: command.amountPaise },
        }
        state.events.push(event)
        state.versions.set(entityId, version)
        const saved = receipt(e, 'accepted', String(state.seq), null)
        applied.set(key, { fingerprint: body(e), actorId, companyId: e.companyId, receipt: saved })
        return saved
      },
      async pull(companyId: string, fromCursor: number): Promise<FeedPage> {
        if (!validId(companyId) || !grants.has(companyId)) throw new Error('SIMULATED_FEED_SCOPE_DENIED')
        if (!Number.isSafeInteger(fromCursor) || fromCursor < 0) throw new Error('SIMULATED_CURSOR_INVALID')
        const state = ensure(companyId)
        if (fromCursor > state.seq) throw new Error('SIMULATED_CURSOR_AHEAD')
        const events = state.events.slice(fromCursor, fromCursor + 500)
        return { companyId, fromCursor, nextCursor: fromCursor + events.length, events }
      },
    }
  }
  return { forIdentity, sequence: (companyId: string) => ensure(companyId).seq }
}
