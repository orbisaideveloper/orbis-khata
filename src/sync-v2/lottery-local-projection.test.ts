import { expect, it, vi } from 'vitest'
import { bootstrapLotteryProjection, createLotterySnapshotReader, lotteryLocalRow } from './lottery-local-projection'

const row = {
  model: 'foundationLotteryLedgerEntry',
  id: 'entry',
  ordinal: '1',
  projectionJson: JSON.stringify({ id: 'entry', organizationId: 'org', amount: '100' }),
}
const page = {
  projection: 'lottery-organization-v1', scopeId: 'org', epoch: 'v1',
  highWater: '5', after: '0', next: '1', done: false, rows: [row],
}

it('rejects malformed rows, cross-organization data, and mismatched row IDs', () => {
  for (const invalid of [null, { ...row, ordinal: '01' }, { ...row, projectionJson: 12 }]) {
    expect(() => lotteryLocalRow('org', invalid)).toThrow('SYNC_LOCAL_LOTTERY_ROW_INVALID')
  }
  expect(() => lotteryLocalRow('other', row)).toThrow('SYNC_LOCAL_LOTTERY_ROW_SCOPE')
  expect(() => lotteryLocalRow('org', { ...row, id: 'other' })).toThrow('SYNC_LOCAL_LOTTERY_ROW_ID')
  expect(lotteryLocalRow('org', { ...row, projectionJson: null })).toEqual({
    collection: row.model, id: row.id, value: null,
  })
})

it('never installs a snapshot that changes its high-water mark or repeats a row', async () => {
  const install = vi.fn()
  for (const invalid of [{ highWater: '6' }, { next: '2' }, { rows: [] }]) {
    const read = vi.fn()
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({ ...page, after: '1', ...invalid })
    await expect(bootstrapLotteryProjection('org', 'v1', read, install)).rejects.toThrow('SYNC_LOTTERY_SNAPSHOT_INVALID')
    expect(read).toHaveBeenLastCalledWith({ after: '1', head: '5' })
  }
  expect(install).not.toHaveBeenCalled()
})

it('preserves ordinary request failures and rejects an out-of-scope fallback fragment', async () => {
  const denied = new Error('denied')
  const request = vi.fn().mockRejectedValueOnce(denied)
  const read = createLotterySnapshotReader(request, {
    organization: 'org', epoch: 'v1', registration: 'device', credential: 'fixture',
  })
  await expect(read({ after: '0', head: null })).rejects.toBe(denied)
  expect(request).toHaveBeenCalledTimes(1)
  request.mockRejectedValueOnce({ code: 'SYNC_LOTTERY_SNAPSHOT_PAGE_TOO_LARGE' })
    .mockResolvedValueOnce({ ...page, scopeId: 'other' })
  await expect(read({ after: '0', head: null })).rejects.toThrow('SYNC_LOTTERY_SNAPSHOT_INVALID')
  expect(request).toHaveBeenLastCalledWith('lottery-sync', expect.objectContaining({
    action: 'snapshot-part', organization: 'org', offset: 0,
  }))
})


it('rejects duplicate model/ID rows across pages before installing the snapshot', async () => {
  const install = vi.fn()
  const duplicate = { ...row, ordinal: '2', projectionJson: JSON.stringify({ id: 'entry', organizationId: 'org', amount: '200' }) }
  const read = vi.fn()
    .mockResolvedValueOnce(page)
    .mockResolvedValueOnce({ ...page, after: '1', next: '2', done: true, rows: [duplicate] })
  await expect(bootstrapLotteryProjection('org', 'v1', read, install))
    .rejects.toThrow('SYNC_LOTTERY_SNAPSHOT_INVALID')
  expect(install).not.toHaveBeenCalled()
})

it('allows the same row ID in distinct models and installs only after all pages validate', async () => {
  const install = vi.fn()
  const differentModel = { ...row, model: 'foundationLotteryPayment', ordinal: '2' }
  const read = vi.fn()
    .mockResolvedValueOnce(page)
    .mockResolvedValueOnce({ ...page, after: '1', next: '2', done: true, rows: [differentModel] })
  await bootstrapLotteryProjection('org', 'v1', read, install)
  expect(install).toHaveBeenCalledOnce()
  expect(install).toHaveBeenCalledWith({ epoch: 'v1', sequence: '5' },
    expect.arrayContaining([expect.objectContaining({ collection: row.model, id: row.id }),
      expect.objectContaining({ collection: differentModel.model, id: row.id })]))
})
