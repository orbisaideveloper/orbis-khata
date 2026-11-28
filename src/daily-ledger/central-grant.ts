import type { matchesRemoteLedgerGrant } from './integration-contracts.ts'

/** Decode only the optional capability in a successfully verified Central response. */
export function centralDailyLedgerGrant(value: unknown, owner: string): Parameters<typeof matchesRemoteLedgerGrant>[0] {
  if (!value || typeof value !== 'object' || !('version' in value) ||
      value.version !== 'orbis.daily-ledger.web.v1') return undefined
  if (!('ownerId' in value) || value.ownerId !== owner || !('tier' in value) ||
      (value.tier !== 'Plus' && value.tier !== 'Premium')) return undefined
  if (!('active' in value) || value.active !== true || !('certified' in value) || value.certified !== true ||
      !('capability' in value) || value.capability !== 'webLedger') return undefined
  return {
    scope: { orbisIdentityId: owner, scopeKind: 'personal_ledger', scopeId: owner },
    tier: value.tier, active: true, certified: true, grants: ['webLedger'],
  }
}
