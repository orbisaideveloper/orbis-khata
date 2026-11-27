// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import fc from 'fast-check'
import type { SqlitePort } from '../../src/local-db/sqlite-repository'
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
