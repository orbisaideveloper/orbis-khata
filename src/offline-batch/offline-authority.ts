/**
 * Step 05 isolated authorization gate. The online central identity provider must
 * verify and issue the grant. A local PIN/biometric success unlocks only an
 * already verified local grant; it does NOT provide server authorization.
 * No tokens, secrets, PINs or passwords are stored by this module.
 */
export type OfflineAction = 'read' | 'draft' | 'queue' | 'sync'
export type VerifiedOfflineGrant = Readonly<{
  actorId: string
  allowedCompanyIds: readonly string[]
  verifiedOnline: boolean
  localUnlockVerified: boolean
  revoked: boolean
  validFromMs: number
  validUntilMs: number
}>
const opaque = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(value)

export function assertOfflineAuthority(
  grant: VerifiedOfflineGrant | null,
  actorId: string,
  companyId: string,
  nowMs: number,
  action: OfflineAction,
): void {
  if (!grant || !opaque(actorId) || !opaque(companyId) ||
      !['read', 'draft', 'queue', 'sync'].includes(action)) throw Error('OFFLINE_ACCESS_INVALID')
  if (!grant.verifiedOnline || grant.revoked ||
      grant.actorId !== actorId || !grant.allowedCompanyIds.includes(companyId)) {
    throw Error('OFFLINE_ACCESS_DENIED')
  }
  if (!grant.localUnlockVerified) throw Error('OFFLINE_UNLOCK_REQUIRED')
  if (!Number.isSafeInteger(nowMs) || !Number.isSafeInteger(grant.validFromMs) ||
      !Number.isSafeInteger(grant.validUntilMs) || grant.validUntilMs <= grant.validFromMs ||
      nowMs < grant.validFromMs || nowMs >= grant.validUntilMs) {
    throw Error('OFFLINE_GRANT_EXPIRED')
  }
  // This is a local-only decision. Server must revalidate auth, company and
  // idempotency for *every* queued operation and reject revoked credentials.
}
