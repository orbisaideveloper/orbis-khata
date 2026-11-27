import { expect, expectTypeOf, it } from 'vitest'
import { matchDailyLedgerManifest, matchesRemoteLedgerGrant, type DraftLedgerTransport } from './integration-contracts'

const id = '11111111-1111-7111-8111-111111111111'
const scope = { scopeKind: 'personal_ledger', orbisIdentityId: id, scopeId: id } as const
const facts = { bytes: 100, sha256: 'a'.repeat(64), journalRows: 4, outboxRows: 4 }
const manifest = { version: 1, scope, snapshot: facts } as const

it('rejects foreign scope, incomplete outbox, and digest/length mismatches before future restore', () => {
  expect(matchDailyLedgerManifest(manifest, scope, facts)).toBe(true)
  expect(matchDailyLedgerManifest(manifest, { ...scope, scopeId: 'another' }, facts)).toBe(false)
  expect(matchDailyLedgerManifest(manifest, scope, { ...facts, sha256: 'b'.repeat(64) })).toBe(false)
  expect(matchDailyLedgerManifest(manifest, scope, { ...facts, bytes: 99 })).toBe(false)
  expect(matchDailyLedgerManifest({ ...manifest, snapshot: { ...facts, outboxRows: 3 } }, scope, facts)).toBe(false)
})

it('requires active certified scope and explicit trusted grants, with no remote defaults', () => {
  const candidate = { scope, tier: 'Plus', active: true, certified: true, grants: ['webLedger'] } as const
  expect(matchesRemoteLedgerGrant(undefined, scope, 'webLedger')).toBe(false)
  expect(matchesRemoteLedgerGrant(candidate, scope, 'webLedger')).toBe(true)
  expect(matchesRemoteLedgerGrant(candidate, scope, 'multiDevice')).toBe(false)
  expect(matchesRemoteLedgerGrant({ ...candidate, tier: 'Free' }, scope, 'webLedger')).toBe(false)
  expect(matchesRemoteLedgerGrant({ ...candidate, certified: false }, scope, 'webLedger')).toBe(false)
  expect(matchesRemoteLedgerGrant({ ...candidate, active: false }, scope, 'webLedger')).toBe(false)
  expect(matchesRemoteLedgerGrant({ ...candidate, scope: { ...scope, orbisIdentityId: 'foreign' } }, scope, 'webLedger')).toBe(false)
})

it('requires a device and epoch on both future submission and feed', () => {
  expectTypeOf<Parameters<DraftLedgerTransport['submit']>[0]>()
    .toEqualTypeOf<Parameters<DraftLedgerTransport['read']>[0]>()
  expectTypeOf<Parameters<DraftLedgerTransport['read']>[0]>().toHaveProperty('epoch')
  expectTypeOf<Parameters<DraftLedgerTransport['read']>[0]>().toHaveProperty('deviceId')
})
