import { validId } from './journal.ts'
import type { envelope } from './journal.ts'

const validDigest = (value: string) => /^[0-9a-f]{64}$/u.test(value)
type OwnerScope = Readonly<{ orbisIdentityId: string; scopeKind: 'personal_ledger'; scopeId: string }>
type SnapshotFacts = Readonly<{ bytes: number; sha256: string; journalRows: number; outboxRows: number }>
type Manifest = Readonly<{ version: 1; scope: OwnerScope; snapshot: SnapshotFacts }>
const count = (number: number) => Number.isSafeInteger(number) && number >= 0

/** Compatibility check over independently measured snapshot facts. This does not authenticate or restore a backup. */
export function matchDailyLedgerManifest(manifest: Manifest, owner: OwnerScope, measured: SnapshotFacts) {
  const stated = manifest.snapshot
  return manifest.version === 1 && manifest.scope.scopeKind === 'personal_ledger' &&
    validId(owner.orbisIdentityId) && owner.orbisIdentityId === owner.scopeId &&
    manifest.scope.orbisIdentityId === owner.orbisIdentityId && manifest.scope.scopeId === owner.scopeId &&
    count(stated.bytes) && stated.bytes > 0 && count(stated.journalRows) && count(stated.outboxRows) &&
    stated.journalRows === stated.outboxRows && validDigest(stated.sha256) &&
    stated.bytes === measured.bytes && stated.sha256 === measured.sha256 &&
    stated.journalRows === measured.journalRows && stated.outboxRows === measured.outboxRows
}

type Tier = 'Free' | 'Plus' | 'Premium'
type RemoteCapability = 'webLedger' | 'cloudLedger' | 'multiDevice'
type VerifiedSession = Readonly<{
  scope: OwnerScope; tier: Tier; active: boolean; certified: boolean
  grants: readonly RemoteCapability[]
}>
/** Only for a future verified server session. No local metadata, client flag, or tier alone grants access. */
export function matchesRemoteLedgerGrant(
  session: VerifiedSession | undefined, owner: OwnerScope, capability: RemoteCapability,
) {
  return Boolean(session?.active && session.certified && (session.tier === 'Plus' || session.tier === 'Premium') &&
    session.scope.scopeKind === owner.scopeKind && validId(owner.orbisIdentityId) &&
    owner.scopeId === owner.orbisIdentityId && session.scope.orbisIdentityId === owner.orbisIdentityId &&
    session.scope.scopeId === owner.scopeId && session.grants.includes(capability))
}

type Address = Readonly<{ scope: OwnerScope; deviceId: string; epoch: string }>
type Receipt = Readonly<{ operationId: string; digest: string; sequence: string }>
/** Draft seam only. A server adapter must authenticate, fence device/epoch, and replay atomically before use. */
export interface DraftLedgerTransport {
  submit(address: Address, command: ReturnType<typeof envelope>, digest: string): Promise<Receipt>
  read(address: Address, cursor: string): Promise<Readonly<{ cursor: string; receipts: readonly Receipt[] }>>
}
