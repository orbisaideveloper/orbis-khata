/**
 * Step 05 Batch B — integration boundary, no PINs/biometrics/tokens persisted.
 * Only a TRUSTED online verifier can issue grants. A native platform verifier
 * must implement localUnlock; this module does NOT itself verify biometrics.
 */
import { assertOfflineAuthority, type OfflineAction, type VerifiedOfflineGrant } from './offline-authority'
export type CentralGrant = Readonly<{
  actorId: string
  companyIds: readonly string[]
  verifiedAtMs: number
  expiresAtMs: number
  revoked: boolean
}>
const valid = (s: unknown): s is string => typeof s === 'string' && /^[\w-]{1,128}$/u.test(s)
export function createIsolatedOfflineSession() {
  let generation = 0
  let grant: VerifiedOfflineGrant | null = null
  function lock(): void {
    generation++
    if (grant) grant = { ...grant, localUnlockVerified: false }
  }
  return {
    lock,
    logout() { generation++; grant = null },
    /** Verify online against ORBIS Admin through a trusted caller; not a caller-supplied user assertion. */
    async activate(verifyOnline: () => Promise<CentralGrant>, nowMs: number) {
      const current = ++generation
      grant = null
      const response = await verifyOnline()
      if (generation !== current) throw Error('OFFLINE_SESSION_SUPERSEDED')
      if (!valid(response.actorId) || !Array.isArray(response.companyIds) ||
          response.companyIds.length < 1 || response.companyIds.length > 128 ||
          !response.companyIds.every(valid) || new Set(response.companyIds).size !== response.companyIds.length ||
          !Number.isSafeInteger(nowMs) || !Number.isSafeInteger(response.verifiedAtMs) ||
          !Number.isSafeInteger(response.expiresAtMs) ||
          response.verifiedAtMs > nowMs || response.expiresAtMs <= nowMs || response.revoked) {
        throw Error('OFFLINE_CENTRAL_GRANT_INVALID')
      }
      grant = { actorId: response.actorId, allowedCompanyIds: [...response.companyIds],
        verifiedOnline: true, localUnlockVerified: false, revoked: false,
        validFromMs: response.verifiedAtMs, validUntilMs: response.expiresAtMs }
      return { actorId: response.actorId, companyCount: response.companyIds.length }
    },
    /** Must be wired to actual OS-backed verifier before any release. */
    async localUnlock(verifyDevice: () => Promise<boolean>) {
      const current = generation
      if (!grant) throw Error('OFFLINE_GRANT_MISSING')
      const ok = await verifyDevice()
      if (generation !== current) throw Error('OFFLINE_SESSION_SUPERSEDED')
      if (ok !== true) throw Error('OFFLINE_DEVICE_UNLOCK_FAILED')
      grant = { ...grant, localUnlockVerified: true }
    },
    authorize(actorId: string, companyId: string, nowMs: number, action: OfflineAction) {
      assertOfflineAuthority(grant, actorId, companyId, nowMs, action)
    },
    /** Scope is copy-only; no token or verifier objects can escape. */
    scopes(): readonly string[] { return grant ? [...grant.allowedCompanyIds] : [] },
  }
}
