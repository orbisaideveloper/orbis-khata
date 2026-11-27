// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import fc from 'fast-check'
import type { SqlitePort } from '../../src/local-db/sqlite-repository'
import { budgets } from '../../src/daily-ledger/budget'
import { today } from '../../src/accounting/model'
import { householdView } from '../../src/daily-ledger/household'
import { openDailyLedger } from '../../src/daily-ledger/repository'
import { envelope, normalize, parseAmount, post, summarize, type Command } from '../../src/daily-ledger/journal'

const owner = '11111111-1111-7111-8111-111111111111'
const date = '2026-11-27'
const base = { version: 1, date, note: '' } as const
const cash = { ...base, id: '22222222-2222-4222-8222-222222222222', kind: 'income', wallet: 'cash', amountMinor: '10000' } as const
const transfer = () => ({ ...base, id: crypto.randomUUID(), kind: 'transfer', from: 'cash', to: 'bank', amountMinor: '2500' }) as const
const reversal = (originalId: string): Command => ({ ...base, id: crypto.randomUUID(), kind: 'reversal', originalId })
const codec = {
  async seal(value: string, aad: string) { return new TextEncoder().encode(JSON.stringify([aad, value])) },
  async unseal(value: Uint8Array, aad: string) {
    const [scope, body]: [string, string] = JSON.parse(new TextDecoder().decode(value))
    if (scope !== aad) throw new Error('WRONG_SCOPE')
    return body
  },
}
const noop = () => {}
let directory: string | undefined
let raw: DatabaseSync | undefined
afterEach(() => {
  raw?.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
  raw = directory = undefined
})

function sqlite(path = ':memory:', intercept: (statement: string) => void = noop): SqlitePort {
  const sql = new DatabaseSync(path, { enableForeignKeyConstraints: true })
  raw = sql
  return {
    async run(statement, params = []) {
      intercept(statement)
      return { changes: Number(sql.prepare(statement).run(...params).changes) }
    },
    async get<T extends object>(statement: string, params: Parameters<SqlitePort['get']>[1] = []) {
      return sql.prepare(statement).get(...params) as T | undefined
    },
    async all<T extends object>(statement: string, params: Parameters<SqlitePort['all']>[1] = []) {
      return sql.prepare(statement).all(...params) as T[]
    },
    async transaction(action) {
      sql.exec('BEGIN')
      try {
        const value = await action()
        sql.exec('COMMIT')
        return value
      } catch (error) {
        sql.exec('ROLLBACK')
        throw error
      }
    },
  }
}

it('balances randomized income, expense and transfer postings in exact minor units', () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 999999999999 }), (amount) => {
    const amountMinor = String(amount)
    for (const input of [{ ...cash, amountMinor }, { ...cash, amountMinor, kind: 'expense' as const }, { ...transfer(), amountMinor }]) {
      const command = normalize(input)
      const entry = post(command)
      expect(entry.postings.map(row => row.id)).toEqual(envelope(owner, command).childIds)
      expect(entry.postings.reduce((sum, row) => sum + BigInt(row.delta), 0n)).toBe(0n)
    }
  }))
  expect(parseAmount('১০.১৫')).toBe('1015')
  expect(parseAmount('१२३.४५')).toBe('12345')
  expect(() => normalize({ ...cash, date: '2026-02-30' })).toThrow()
  expect(() => normalize({ ...cash, amountMinor: '0' })).toThrow()
  expect(() => normalize({ ...transfer(), to: 'cash' })).toThrow()
})

it('keeps transfers out of income and expense and compensates only once', async () => {
  const ledger = await openDailyLedger(sqlite(), codec, owner, noop)
  await ledger.save(cash)
  const original = transfer()
  await ledger.save(original)
  expect(summarize(await ledger.list(), date)).toEqual({
    balance: { cash: 7500n, bank: 2500n }, month: { income: 10000n, expense: 0n }, day: { income: 10000n, expense: 0n },
  })
  await ledger.save(reversal(original.id))
  await expect(ledger.save(reversal(original.id))).rejects.toThrow()
  expect(summarize(await ledger.list(), date).balance).toEqual({ cash: 10000n, bank: 0n })
  expect(await ledger.list()).toHaveLength(3)
})

it('rolls back both rows when the outbox or identity check fails mid-write', async () => {
  let authorized = true
  let diskFailure = true
  const db = sqlite(':memory:', statement => {
    if (!statement.startsWith('INSERT INTO personal_ledger_outbox_v1')) return
    if (diskFailure) throw new Error('DISK_FAILURE')
    authorized = false
  })
  const ledger = await openDailyLedger(db, codec, owner, () => {
    if (!authorized) throw new Error('ACTOR_CHANGED')
  })
  await expect(ledger.save(cash)).rejects.toThrow('DISK_FAILURE')
  diskFailure = false
  await expect(ledger.save(cash)).rejects.toThrow('ACTOR_CHANGED')
  expect(await db.get('SELECT count(*) AS count FROM personal_ledger_outbox_v1')).toMatchObject({ count: 0 })
  expect(await db.get('SELECT count(*) AS count FROM personal_ledger_journal_v1')).toMatchObject({ count: 0 })
})

it('survives restart and lost acknowledgement without duplicates; enforces owner isolation', async () => {
  directory = mkdtempSync(join(tmpdir(), 'orbis-ledger-'))
  const file = join(directory, 'synthetic.db')
  const old = await openDailyLedger(sqlite(file), codec, owner, noop)
  const saved = await old.save(cash)
  raw?.close()
  const db = sqlite(file)
  const recovered = await openDailyLedger(db, codec, owner, noop)
  expect(await recovered.save(cash)).toEqual(saved)
  await expect(recovered.save({ ...cash, amountMinor: '10001' })).rejects.toThrow('DAILY_RETRY_CONFLICT')
  const other = await openDailyLedger(db, codec, crypto.randomUUID(), noop)
  expect(await other.list()).toEqual([])
  await expect(other.save(reversal(cash.id))).rejects.toThrow('DAILY_REVERSAL_INVALID')
  expect(await recovered.list()).toEqual([saved])
  expect(await db.get('SELECT count(*) AS count FROM personal_ledger_outbox_v1')).toMatchObject({ count: 1 })
})

it('keeps plan revisions non-financial and attributes expense corrections to their period', async () => {
  const ledger = await openDailyLedger(sqlite(), codec, owner, noop)
  const plan = { ...base, kind: 'budget', date: '2026-11-01', category: 'food' } as const
  await ledger.save({ ...plan, id: crypto.randomUUID(), amountMinor: '500' })
  expect((await ledger.save({ ...plan, id: crypto.randomUUID(), amountMinor: '1000' })).postings).toEqual([])
  const expense = { ...base, kind: 'expense', category: 'food', wallet: 'cash' } as const
  await ledger.save({ ...expense, id: crypto.randomUUID(), date: '2026-10-03', amountMinor: '300' })
  const latest = { ...expense, id: crypto.randomUUID(), amountMinor: '1100' }
  await ledger.save(latest)
  expect(budgets(await ledger.list(), date)[0]).toEqual({
    category: 'food', limit: 1000n, actual: 1100n, previous: 300n, remaining: -100n,
  })
  await ledger.save(reversal(latest.id))
  const entries = await ledger.list()
  expect(budgets(entries, date)[0]).toMatchObject({ actual: 0n, previous: 300n, remaining: 1000n })
  expect(summarize(entries, date).balance.cash).toBe(-300n)
})

const person = (name: string) => ({ ...base, id: crypto.randomUUID(), kind: 'person', name }) as const
const bill = () => ({
  ...base, id: crypto.randomUUID(), kind: 'bill', billType: 'electricity', category: 'home',
  dueDate: '2026-11-30', amountMinor: '50000',
}) as const

it('tracks both loan directions per person without treating principal or repayments as income or expense', async () => {
  const ledger = await openDailyLedger(sqlite(), codec, owner, noop)
  const party = person('Synthetic person')
  const borrowed = { ...base, kind: 'borrow', id: crypto.randomUUID(), personId: party.id, wallet: 'cash', amountMinor: '50000' } as const
  const lent = { ...borrowed, kind: 'lend', id: crypto.randomUUID(), wallet: 'bank', amountMinor: '30000' } as const
  const payment = (obligationId: string, wallet: 'cash' | 'bank', amountMinor: string) => ({
    ...base, kind: 'loanRepay', id: crypto.randomUUID(), obligationId, wallet, amountMinor,
  }) as const
  await ledger.save(party)
  await ledger.save(borrowed)
  await ledger.save(lent)
  const repaid = payment(borrowed.id, 'cash', '20000')
  await ledger.save(repaid)
  await ledger.save(payment(lent.id, 'bank', '5000'))
  await expect(ledger.save(payment(lent.id, 'bank', '25001'))).rejects.toThrow('DAILY_SETTLEMENT_LIMIT')
  await expect(ledger.save(reversal(borrowed.id))).rejects.toThrow('DAILY_SETTLEMENT_EXISTS')
  const entries = await ledger.list()
  expect(householdView(entries, date).loans).toEqual(expect.arrayContaining([
    expect.objectContaining({ command: borrowed, paid: 20000n, reversed: false }),
    expect.objectContaining({ command: lent, paid: 5000n, reversed: false }),
  ]))
  expect(summarize(entries, date)).toEqual({
    balance: { cash: 30000n, bank: -25000n }, month: { income: 0n, expense: 0n }, day: { income: 0n, expense: 0n },
  })
  expect(budgets(entries, date).every(row => row.actual === 0n)).toBe(true)
  expect(entries.every(entry => entry.postings.reduce((sum, row) => sum + BigInt(row.delta), 0n) === 0n)).toBe(true)
  await ledger.save(reversal(repaid.id))
  await ledger.save(reversal(borrowed.id))
  expect(householdView(await ledger.list(), date).loans.find(row => row.command.id === borrowed.id)).toMatchObject({
    paid: 0n, reversed: true,
  })
})

it('keeps bill creation neutral and uses only actual partial payments and reversals in the budget', async () => {
  const ledger = await openDailyLedger(sqlite(), codec, owner, noop)
  const obligation = bill()
  const record = await ledger.save(obligation)
  expect(record.postings).toEqual([])
  expect(summarize(await ledger.list(), date).balance.cash).toBe(0n)
  const payment = { ...base, id: crypto.randomUUID(), kind: 'billPay', wallet: 'cash', obligationId: obligation.id,
    amountMinor: '20000' } as const
  const first = await ledger.save(payment)
  expect(await ledger.save(payment)).toEqual(first)
  await expect(ledger.save({ ...payment, id: crypto.randomUUID(), date: '2026-11-26' })).rejects.toThrow('DAILY_REFERENCE_INVALID')
  await expect(ledger.save({ ...payment, id: crypto.randomUUID(), amountMinor: '30001' })).rejects.toThrow('DAILY_SETTLEMENT_LIMIT')
  const settle = { ...payment, id: crypto.randomUUID(), amountMinor: '30000' } as const
  await ledger.save(settle)
  let entries = await ledger.list()
  expect(householdView(entries, date).billRows[0]).toMatchObject({ paid: 50000n })
  expect(budgets(entries, date).find(row => row.category === 'home')?.actual).toBe(50000n)
  expect(summarize(entries, date)).toMatchObject({ balance: { cash: -50000n }, month: { expense: 50000n } })
  await ledger.save(reversal(payment.id))
  entries = await ledger.list()
  expect(householdView(entries, date).billRows[0]).toMatchObject({ paid: 30000n })
  expect(budgets(entries, date).find(row => row.category === 'home')?.actual).toBe(30000n)
  expect(summarize(entries, date).month.expense).toBe(30000n)
})

it('rejects a backdated payment that would exceed principal before a later reversal', async () => {
  const ledger = await openDailyLedger(sqlite(), codec, owner, noop)
  const obligation = { ...bill(), date: '2026-11-01' }
  await ledger.save(obligation)
  const payment = { ...base, id: crypto.randomUUID(), date: '2026-11-04', kind: 'billPay', wallet: 'bank',
    obligationId: obligation.id, amountMinor: '50000' } as const
  await ledger.save(payment)
  await ledger.save({ ...reversal(payment.id), date: '2026-11-20' })
  await expect(ledger.save({ ...payment, id: crypto.randomUUID(), date: '2026-11-05' })).rejects.toThrow('DAILY_SETTLEMENT_LIMIT')
  await expect(ledger.save({ ...reversal(obligation.id), date: '2026-11-19' })).rejects.toThrow('DAILY_SETTLEMENT_EXISTS')
  await ledger.save({ ...payment, id: crypto.randomUUID(), date: '2026-11-20' })
  expect(householdView(await ledger.list(), '2026-11-21').billRows[0]).toMatchObject({ paid: 50000n })
})

it('commits a scoped bill payment only once after an outbox failure and restart', async () => {
  directory = mkdtempSync(join(tmpdir(), 'orbis-household-'))
  const path = join(directory, 'synthetic.db')
  let fail = false
  const db = sqlite(path, statement => {
    if (fail && statement.startsWith('INSERT INTO personal_ledger_outbox_v1')) throw new Error('INJECTED_DISK_FAILURE')
  })
  const ledger = await openDailyLedger(db, codec, owner, noop)
  const obligation = bill()
  await ledger.save(obligation)
  const payment = { ...base, id: crypto.randomUUID(), kind: 'billPay', obligationId: obligation.id,
    wallet: 'bank', amountMinor: '10000' } as const
  fail = true
  await expect(ledger.save(payment)).rejects.toThrow('INJECTED_DISK_FAILURE')
  expect(await ledger.list()).toHaveLength(1)
  raw?.close()
  const reopened = sqlite(path)
  const recovered = await openDailyLedger(reopened, codec, owner, noop)
  const newOwner = await openDailyLedger(reopened, codec, crypto.randomUUID(), noop)
  await expect(newOwner.save(payment)).rejects.toThrow('DAILY_REFERENCE_INVALID')
  const saved = await recovered.save(payment)
  expect(await recovered.save(payment)).toEqual(saved)
  await expect(recovered.save({ ...payment, amountMinor: '10001' })).rejects.toThrow('DAILY_RETRY_CONFLICT')
  expect(await recovered.list()).toHaveLength(2)
  expect(await reopened.get('SELECT count(*) AS count FROM personal_ledger_outbox_v1')).toMatchObject({ count: 2 })
  expect(await newOwner.list()).toEqual([])
})

it('prevents a second recurring occurrence even after the original is reversed', async () => {
  const day = today()
  const ledger = await openDailyLedger(sqlite(), codec, owner, noop)
  const series = { ...bill(), date: day, kind: 'billSeries', dueDate: day.slice(0, 7) + '-28' } as const
  const issue = { ...base, date: day, id: crypto.randomUUID(), kind: 'billOccurrence', seriesId: series.id } as const
  await ledger.save(series)
  const issued = await ledger.save(issue)
  expect(await ledger.save(issue)).toEqual(issued)
  await expect(ledger.save({ ...issue, id: crypto.randomUUID() })).rejects.toThrow('DAILY_OCCURRENCE_EXISTS')
  const cancelled = { ...reversal(issue.id), date: day }
  expect((await ledger.save(cancelled)).postings).toEqual([])
  expect((await ledger.save(cancelled)).postings).toEqual([])
  await expect(ledger.save({ ...issue, id: crypto.randomUUID() })).rejects.toThrow('DAILY_OCCURRENCE_EXISTS')
  expect(householdView(await ledger.list(), day).billRows[0]).toMatchObject({ reversed: true })
})

it('links a single corrected obligation to its reversal and rejects a replacement before the reversal date', async () => {
  const ledger = await openDailyLedger(sqlite(), codec, owner, noop)
  const old = { ...bill(), date: '2026-11-02' }
  const replacement = { ...old, id: crypto.randomUUID(), correctionOf: old.id, amountMinor: '49000' }
  await ledger.save(old)
  await expect(ledger.save(replacement)).rejects.toThrow('DAILY_CORRECTION_INVALID')
  await ledger.save({ ...reversal(old.id), date: '2026-11-10' })
  await expect(ledger.save(replacement)).rejects.toThrow('DAILY_CORRECTION_INVALID')
  const timely = { ...replacement, date: '2026-11-10' }
  expect((await ledger.save(timely)).command).toEqual(timely)
  expect((await ledger.save(timely)).command).toEqual(timely)
  await expect(ledger.save({ ...timely, id: crypto.randomUUID() })).rejects.toThrow('DAILY_CORRECTION_INVALID')
  expect(householdView(await ledger.list(), date).billRows.map(row => [row.command.id, row.reversed])).toEqual([
    [timely.id, false], [old.id, true],
  ])
  expect(summarize(await ledger.list(), date).balance.cash).toBe(0n)
})
