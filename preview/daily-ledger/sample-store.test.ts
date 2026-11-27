import { expect, it } from 'vitest'
import { summarize, type Command } from '../../src/daily-ledger/journal'
import { createSampleStore } from './sample-store'

const date = '2026-11-27'
const transfer = {
  version: 1,
  id: 'ad41c8b7-e02d-4719-ac23-2aae8e2cb645',
  date,
  note: 'Sample transfer',
  kind: 'transfer',
  from: 'cash',
  to: 'bank',
  amountMinor: '1215',
} as const satisfies Command

it('keeps sample writes in one adapter and treats identical retries as one posting', async () => {
  const sample = createSampleStore(date)
  const initial = await sample.list()
  const posted = await sample.save(transfer)
  expect(await sample.save(transfer)).toEqual(posted)
  await expect(sample.save({ ...transfer, amountMinor: '100' })).rejects.toThrow('DAILY_ID_CONFLICT')
  const result = await sample.list()
  expect(result).toHaveLength(initial.length + 1)
  expect(summarize(result, date)).toEqual({
    ...summarize(initial, date),
    balance: { cash: 203785n, bank: 1215n },
  })
  expect(await createSampleStore(date).list()).toEqual(initial)
})

it('preserves the original sample operation and rejects a second reversal', async () => {
  const sample = createSampleStore(date)
  const initial = await sample.list()
  await sample.save(transfer)
  const reversal = {
    ...transfer, kind: 'reversal', originalId: transfer.id, id: '30e9cc7d-d15d-4edc-bbd6-7a1306026341',
  } as const
  const posted = await sample.save(reversal)
  expect(await sample.save(reversal)).toEqual(posted)
  await expect(sample.save({
    ...reversal, id: 'd631a762-4d3b-4d1d-8374-30519c8bad40',
  })).rejects.toThrow('DAILY_REVERSAL_INVALID')
  const result = await sample.list()
  expect(result).toHaveLength(initial.length + 2)
  expect(summarize(result, date)).toEqual(summarize(initial, date))
})

it('returns detached entries so external mutation cannot corrupt a later read', async () => {
  const sample = createSampleStore(date)
  const posted = await sample.save(transfer)
  Object.assign(posted.command, { amountMinor: '1' })
  const [entry] = await sample.list()
  expect(entry.command).toEqual(transfer)
})
