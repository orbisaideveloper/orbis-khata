import { describe, expect, it } from 'vitest'
import { enqueueUnique, finishAttempt, mayAutoRetry, queueNew } from './outbox-state'
const cmd = {
  protocolVersion: 1, operationId: '11111111-1111-4111-8111-111111111111',
  actorId: 'user_1', companyId: 'company_1', commandType: 'voucher-post',
  baseVersion: null, createdAt: '2026-11-10T09:15:00.000Z',
  payload: { id: 'voucher_1', amountMinor: '100' },
} as const
const accepted = {
  protocolVersion: 1, operationId: cmd.operationId,
  companyId: cmd.companyId, disposition: 'accepted', serverCursor: 'seq:1', reason: null,
}
describe('non-persistent outbox state contract', () => {
  it('starts queued without sending anything', () => {
    const q = queueNew(cmd)
    expect(q.state).toBe('queued'); expect(q.attempts).toBe(0)
    expect(mayAutoRetry(q)).toBe(true)
  })
  it('rejects malformed inputs', () => {
    expect(() => queueNew({ ...cmd, operationId: 'invalid' })).toThrow('INVALID_SYNC_ENVELOPE')
  })
  it('deduplicates identical requests but never silently changes the payload', () => {
    const old = queueNew(cmd)
    const list = [old]
    expect(enqueueUnique(list, queueNew(cmd))).toBe(list)
    expect(() => enqueueUnique(list, queueNew({ ...cmd, payload: { id: 'voucher_1', amountMinor: '200' } }))).toThrow('IDEMPOTENCY_CONFLICT')
  })
  it('keeps a timeout or mismatching acknowledgement queued under the same ID', () => {
    const old = queueNew(cmd)
    for (const response of [null, { ...accepted, companyId: 'company_2' }, { ...accepted, operationId: '22222222-2222-4222-8222-222222222222' }]) {
      const after = finishAttempt(old, response)
      expect(after.state).toBe('queued')
      expect(after.envelope.operationId).toBe(old.envelope.operationId)
      expect(after.lastReason).toBe('UNKNOWN_OUTCOME')
      expect(mayAutoRetry(after)).toBe(true)
    }
  })
  it('accepts only matching server acknowledgement and stores its cursor', () => {
    const synced = finishAttempt(queueNew(cmd), accepted)
    expect(synced.state).toBe('synced')
    expect(synced.serverCursor).toBe('seq:1')
    expect(mayAutoRetry(synced)).toBe(false)
    expect(finishAttempt(synced, null)).toBe(synced)
  })
  it('does not silently retry conflicts or definite server rejections', () => {
    for (const disposition of ['conflict','rejected'] as const) {
      const result = finishAttempt(queueNew(cmd), { ...accepted, disposition, serverCursor: null, reason: 'BUSINESS_RULE' })
      expect(result.state).toBe(disposition)
      expect(result.lastReason).toBe('BUSINESS_RULE')
      expect(mayAutoRetry(result)).toBe(false)
    }
  })
})
