/**
 * Step 04–06 client integration boundary; NOT enabled in live accounting API/UI.
 * A central verified grant and OS/device credential are required for all work.
 * Every queued accounting command must be durably stored before returning.
 */
import { assertOfflineAuthority, type VerifiedOfflineGrant } from '../offline-batch/offline-authority'
import { createIsolatedAccountingDraft } from '../offline-batch/b-accounting-command'
import { syncCompanyOnce, type SyncNetwork, type SyncStore } from '../offline-batch/sync-coordinator'
import type { QueueItem } from '../sync/outbox-state'
import type { CentralGrant } from '../offline-batch/b-offline-session'

export type CombinedStore = SyncStore & { append(item: QueueItem): Promise<'created' | 'already-present'> }
export function createCombinedLocalFlow(config: {
  store: CombinedStore
  network: SyncNetwork
  verifyOnlineGrant: () => Promise<CentralGrant>
  verifyOnlineSession: () => Promise<boolean>
  verifyDeviceCredential: () => Promise<boolean>
  nowMs?: () => number
}) {
  let revision = 0
  let verified: VerifiedOfflineGrant | null = null
  const now = config.nowMs ?? Date.now
  const authorize = (actor: string, company: string, action: 'queue' | 'sync') =>
    assertOfflineAuthority(verified, actor, company, now(), action)
  return {
    async activate() {
      const current = ++revision
      verified = null
      const info = await config.verifyOnlineGrant()
      if (revision !== current) throw Error('LOCAL_FLOW_AUTH_SUPERSEDED')
      const clock = now()
      if (!info || !/^[\w-]{1,128}$/u.test(info.actorId) || !Array.isArray(info.companyIds) ||
          info.companyIds.length < 1 || info.companyIds.length > 128 ||
          !info.companyIds.every(id => /^[\w-]{1,128}$/u.test(id)) ||
          new Set(info.companyIds).size !== info.companyIds.length || info.revoked ||
          !Number.isSafeInteger(info.verifiedAtMs) || !Number.isSafeInteger(info.expiresAtMs) ||
          info.verifiedAtMs > clock || info.expiresAtMs <= clock) throw Error('LOCAL_FLOW_GRANT_INVALID')
      verified = { actorId: info.actorId, allowedCompanyIds: [...info.companyIds],
        verifiedOnline: true, localUnlockVerified: false, revoked: false,
        validFromMs: info.verifiedAtMs, validUntilMs: info.expiresAtMs }
      return { actorId: info.actorId, companyCount: info.companyIds.length }
    },
    async unlock() {
      const current = revision
      if (!verified) throw Error('LOCAL_FLOW_GRANT_MISSING')
      const allowed = await config.verifyDeviceCredential()
      if (revision !== current) throw Error('LOCAL_FLOW_AUTH_SUPERSEDED')
      if (allowed !== true) throw Error('LOCAL_FLOW_UNLOCK_FAILED')
      verified = { ...verified, localUnlockVerified: true }
    },
    lock() { revision++; if (verified) verified = { ...verified, localUnlockVerified: false } },
    logout() { revision++; verified = null },
    async queueAccounting(args: {
      actorId: string; companyId: string; rawCommand: unknown
      operationId: string; createdAt: string; baseVersion: string | null
    }) {
      authorize(args.actorId, args.companyId, 'queue')
      const ticket = createIsolatedAccountingDraft({ ...args, verifiedGrant: verified, nowMs: now() })
      const result = await config.store.append(ticket)
      return { status: result, operationId: ticket.envelope.operationId } as const
    },
    async sync(actorId: string, companyId: string) {
      authorize(actorId, companyId, 'sync')
      const expected = revision
      const online = await config.verifyOnlineSession()
      if (expected !== revision) throw Error('LOCAL_FLOW_AUTH_SUPERSEDED')
      if (online !== true) throw Error('SYNC_ONLINE_AUTH_REQUIRED')
      return syncCompanyOnce({ grant: verified, actorId, companyId, nowMs: now(),
        store: config.store, network: config.network, onlineSessionVerified: true })
    },
  }
}
