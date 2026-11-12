import { describe, expect, it } from 'vitest'
import { confirmedReceipt, parseSyncEnvelope, parseSyncReceipt, SYNC_PROTOCOL_VERSION } from './protocol'

const base = {
  protocolVersion: SYNC_PROTOCOL_VERSION,
  operationId: '11111111-1111-4111-8111-111111111111',
  actorId: 'user_1',
  companyId: 'company_1',
  commandType: 'voucher-post',
  baseVersion: null,
  createdAt: '2026-11-10T09:15:00.000Z',
  payload: { id: 'voucher_1', amountMinor: '100' },
}
const ack = {
  protocolVersion: SYNC_PROTOCOL_VERSION,
  operationId: base.operationId,
  companyId: base.companyId,
  disposition: 'accepted',
  serverCursor: 'seq:1',
  reason: null,
}

describe('backend-neutral sync contract', () => {
  it('accepts a complete versioned command without mutating it', () => {
    expect(parseSyncEnvelope(base)).toEqual(base)
    expect(parseSyncEnvelope(base)).toBe(base)
  })
  it('rejects malformed or extra-field commands', () => {
    expect(parseSyncEnvelope({ ...base, protocolVersion: 2 })).toBeNull()
    expect(parseSyncEnvelope({ ...base, operationId: 'not-a-uuid' })).toBeNull()
    expect(parseSyncEnvelope({ ...base, secret: 'unwanted' })).toBeNull()
    expect(parseSyncEnvelope({ ...base, createdAt: 'nonsense' })).toBeNull()
    expect(parseSyncEnvelope({ ...base, payload: 'bad' })).toBeNull()
  })
  it('rejects malformed receipts and accepts a valid server acknowledgement', () => {
    expect(parseSyncReceipt(ack)?.disposition).toBe('accepted')
    expect(parseSyncReceipt({ ...ack, disposition: 'accepted', serverCursor: null })).toBeNull()
    expect(parseSyncReceipt({ ...ack, disposition: 'conflict', reason: null })).toBeNull()
  })
  it('never acknowledges a different operation or a different company', () => {
    expect(confirmedReceipt(base, ack)).toBe(true)
    expect(confirmedReceipt(base, { ...ack, disposition: 'already-applied' })).toBe(true)
    expect(confirmedReceipt(base, { ...ack, operationId: '22222222-2222-4222-8222-222222222222' })).toBe(false)
    expect(confirmedReceipt(base, { ...ack, companyId: 'company_2' })).toBe(false)
    expect(confirmedReceipt(base, { ...ack, disposition: 'conflict', reason: 'VERSION_CONFLICT', serverCursor: null })).toBe(false)
  })
})
