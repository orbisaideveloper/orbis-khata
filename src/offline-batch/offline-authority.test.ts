import { describe, expect, it } from 'vitest'
import { assertOfflineAuthority, type VerifiedOfflineGrant } from './offline-authority'
const now = 1_700_000_000_000
const grant: VerifiedOfflineGrant = {
  actorId: 'actor-1', allowedCompanyIds: ['company-a'], verifiedOnline: true,
  localUnlockVerified: true, revoked: false, validFromMs: now - 100,
  validUntilMs: now + 1000,
}
const check = (override: Partial<VerifiedOfflineGrant> = {}, actor = 'actor-1', company = 'company-a', time = now) =>
  assertOfflineAuthority({ ...grant, ...override }, actor, company, time, 'queue')
describe('Step05 offline identity boundary (synthetic)', () => {
  it('permits previously verified, unlocked scope', () => expect(() => check()).not.toThrow())
  it('rejects absent grant', () => expect(() => assertOfflineAuthority(null, 'actor-1', 'company-a', now, 'read')).toThrow())
  it('rejects another actor', () => expect(() => check({}, 'actor-2')).toThrow())
  it('rejects company cross-over', () => expect(() => check({}, 'actor-1', 'company-b')).toThrow())
  it('rejects unverified online identity', () => expect(() => check({ verifiedOnline: false })).toThrow())
  it('rejects locked local session', () => expect(() => check({ localUnlockVerified: false })).toThrow())
  it('rejects revoked grant', () => expect(() => check({ revoked: true })).toThrow())
  it('rejects expired grant', () => expect(() => check({}, 'actor-1', 'company-a', now + 1000)).toThrow())
  it('rejects clock before validity', () => expect(() => check({}, 'actor-1', 'company-a', now - 101)).toThrow())
  it('rejects impossible validity interval', () => expect(() => check({ validUntilMs: now - 100 })).toThrow())
  it('rejects malformed company', () => expect(() => check({}, 'actor-1', 'bad company')).toThrow())
})
