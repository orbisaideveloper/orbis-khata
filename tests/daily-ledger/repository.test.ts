// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import fc from 'fast-check'
import type { SqlitePort } from '../../src/local-db/sqlite-repository'
import { createDailyLedgerDriveWorkflow } from '../../src/daily-ledger/drive-workflow'
import { budgets } from '../../src/daily-ledger/budget'
import { exportDailyLedgerArchive, openDailyLedgerArchive, sha256 } from '../../src/daily-ledger/backup'
import { financialBackupCodec, generateFinancialBackupKey } from '../../src/sync/financial-backup'
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

const backupCipher = financialBackupCodec('orbis.khata.daily-ledger.backup.v1')

it('round-trips every financial lineage and durable outbox through encrypted SQLite recovery', async () => {
  directory = mkdtempSync(join(tmpdir(), 'orbis-ledger-backup-'))
  const sourcePath = join(directory, 'source.db')
  const destination = join(directory, 'destination.db')
  const source = await openDailyLedger(sqlite(sourcePath), codec, owner, noop)
  const day = today()
  const header = { ...base, date: day }
  const id = () => crypto.randomUUID()
  const samplePerson = { ...person('Synthetic backup person'), date: day }
  const loan = { ...header, id: id(), kind: 'lend', personId: samplePerson.id, wallet: 'cash', amountMinor: '5000' } as const
  const borrowed = { ...loan, id: id(), kind: 'borrow', wallet: 'bank', amountMinor: '7000' } as const
  const recurring = { ...bill(), date: day, kind: 'billSeries', dueDate: day.slice(0, 7) + '-28' } as const
  const issue = { ...header, id: id(), kind: 'billOccurrence', seriesId: recurring.id } as const
  const partial = { ...header, id: id(), kind: 'billPay', obligationId: issue.id, wallet: 'bank', amountMinor: '950' } as const
  const expense = { ...header, id: id(), kind: 'expense', category: 'food', wallet: 'cash', amountMinor: '101' } as const
  const initialBudget = { ...header, date: day.slice(0, 7) + '-01', id: id(), kind: 'budget',
    category: 'home', amountMinor: '9900' } as const
  const entries: Command[] = [
    { ...cash, date: day, note: 'Synthetic backup private note' },
    { ...transfer(), date: day },
    expense,
    { ...reversal(expense.id), date: day },
    initialBudget,
    { ...initialBudget, id: id(), amountMinor: '12000' },
    samplePerson, loan, borrowed,
    { ...header, id: id(), kind: 'loanRepay', obligationId: loan.id, wallet: 'bank', amountMinor: '2400' },
    { ...header, id: id(), kind: 'loanRepay', obligationId: borrowed.id, wallet: 'cash', amountMinor: '900' },
    { ...bill(), date: day, dueDate: day },
    recurring, issue, partial,
    { ...reversal(partial.id), date: day },
    { ...partial, id: id(), amountMinor: '700', correctionOf: partial.id },
  ]
  for (const command of entries) await source.save(command)
  const prior = await source.list()
  const key = generateFinancialBackupKey()
  const archive = await source.exportBackup(key)
  const verified = await source.verifyBackup(archive, key)
  expect(verified.scope).toEqual({ orbisIdentityId: owner, scopeKind: 'personal_ledger', scopeId: owner })
  expect(verified.snapshot).toMatchObject({ journalRows: entries.length, outboxRows: entries.length })
  expect(new TextDecoder().decode(archive)).not.toContain('Synthetic backup')
  expect(await source.exportBackup(key)).not.toEqual(archive)
  const originalPayload = await openDailyLedgerArchive(owner, archive, key)
  const driveEmail = 'ledger-integration@example.test'
  const versions: { id: string; size: string; createdTime: string }[] = []
  const copies = new Map<string, Uint8Array<ArrayBuffer>>()
  const drive = {
    accountEmail: async () => driveEmail,
    history: async () => [...versions],
    async latest(version: { id: string }) {
      const bytes = copies.get(version.id)
      if (!bytes) throw new Error('SYNTHETIC_MISSING_FILE')
      return bytes.slice()
    },
    async uploadPending(data: Uint8Array<ArrayBuffer>) {
      const file = { id: crypto.randomUUID(), size: String(data.byteLength), createdTime: new Date().toISOString() }
      copies.set(file.id, data.slice())
      versions.unshift(file)
      return file
    },
  }
  const useDrive = (ledger: typeof source) => createDailyLedgerDriveWorkflow({
    authorize: async () => noop,
    recovery: async () => ({
      email: driveEmail, key: Array.from(key, byte => byte.toString(16).padStart(2, '0')).join(''),
    }),
    connect: async () => drive,
    exportArchive: ledger.exportBackup,
    verifyArchive: ledger.verifyBackup,
    previewRestore: ledger.previewRestore,
    restoreArchive: ledger.restoreBackup,
  }, () => true)
  const sender = useDrive(source)
  expect(await sender.backup(false, noop)).toEqual(verified)
  expect(await sender.backup(true, noop)).toEqual(verified)
  expect(versions).toHaveLength(1)
  const uploadedCopy = copies.get(versions[0].id)!
  expect(uploadedCopy).not.toEqual(archive)
  expect(await openDailyLedgerArchive(owner, uploadedCopy, key)).toEqual(originalPayload)
  expect(originalPayload.rows.map(row => row.entry.command.id)).toEqual(entries.map(command => command.id))
  raw?.close()

  // The destination codec represents another hardware key with the same owner AAD contract.
  const anotherDevice = {
    async seal(value: string, aad: string) { return codec.seal(value, 'replacement:' + aad) },
    async unseal(value: Uint8Array, aad: string) { return codec.unseal(value, 'replacement:' + aad) },
  }
  const target = await openDailyLedger(sqlite(destination), anotherDevice, owner, noop)
  const receiver = useDrive(target)
  const history = await receiver.history()
  expect(history.files).toEqual(versions)
  expect(await receiver.preview(history.files[0].id, history.email)).toMatchObject({
    preview: { toRestore: entries.length, newerLocalRows: 0 },
  })
  expect(await target.list()).toEqual([])
  expect(await receiver.confirmRestore()).toEqual({ inserted: entries.length, alreadyPresent: 0 })
  const restored = await target.list()
  expect(restored).toEqual(prior)
  expect(summarize(restored, day)).toEqual(summarize(prior, day))
  expect(budgets(restored, day)).toEqual(budgets(prior, day))
  const household = householdView(restored, day)
  expect(household).toEqual(householdView(prior, day))
  expect(household.loans).toEqual(expect.arrayContaining([
    expect.objectContaining({ command: loan, paid: 2400n }),
    expect.objectContaining({ command: borrowed, paid: 900n }),
  ]))
  expect(household.billRows.find(row => row.command.id === issue.id)).toMatchObject({ paid: 700n, amountMinor: '50000' })
  const targetCopy = await openDailyLedgerArchive(owner, await target.exportBackup(key), key)
  expect(targetCopy.rows).toEqual(originalPayload.rows)
  expect(targetCopy.manifest).toEqual(verified)
  raw?.close()

  const reopened = await openDailyLedger(sqlite(destination), anotherDevice, owner, noop)
  expect(await reopened.restoreBackup(archive, key)).toEqual({ inserted: 0, alreadyPresent: entries.length })
  const last = entries.at(-1)!
  expect(await reopened.save(last)).toEqual(restored.find(entry => entry.command.id === last.id))
  expect(await reopened.list()).toEqual(prior)
})

it('preserves a valid prefix after an interrupted restore and appends missing rows exactly once', async () => {
  const key = generateFinancialBackupKey()
  let writes = 0
  const db = sqlite(':memory:', statement => {
    if (writes > 0 && statement.startsWith('INSERT INTO personal_ledger_outbox_v1') && ++writes === 3) {
      throw new Error('INJECTED_RESTORE_FAILURE')
    }
  })
  const ledger = await openDailyLedger(db, codec, owner, noop)
  await ledger.save(cash)
  const older = await ledger.exportBackup(key)
  const olderSnapshot = await openDailyLedgerArchive(owner, older, key)
  const next = [post(normalize(transfer())), post(normalize(transfer()))]
  // Build an archive representing an exact prefix followed by two valid journal/outbox pairs.
  const extra = await Promise.all(next.map(async entry => {
    const wire = JSON.stringify(envelope(owner, entry.command, entry.postings.length))
    return { entry, wire, digest: await sha256(wire) }
  }))
  const newer = await exportDailyLedgerArchive(owner, [...olderSnapshot.rows, ...extra], key)
  const before = await ledger.list()
  writes = 1
  await expect(ledger.restoreBackup(newer, key)).rejects.toThrow('INJECTED_RESTORE_FAILURE')
  expect(await ledger.list()).toEqual(before)
  expect(await db.get('SELECT count(*) AS total FROM personal_ledger_outbox_v1')).toEqual({ total: 1 })
  expect(await ledger.verifyBackup(older, key)).toEqual(olderSnapshot.manifest)
  writes = 0
  await expect(ledger.restoreBackup(newer, key)).resolves.toEqual({ inserted: 2, alreadyPresent: 1 })
  await expect(ledger.restoreBackup(older, key)).resolves.toEqual({ inserted: 0, alreadyPresent: 1 })
  const after = await ledger.list()
  expect(after).toHaveLength(3)
  const divergent = await exportDailyLedgerArchive(owner, [olderSnapshot.rows[0], extra[1]], key)
  await expect(ledger.restoreBackup(divergent, key)).rejects.toThrow('DAILY_BACKUP_HISTORY_CONFLICT')
  expect(await ledger.list()).toEqual(after)
})

it('rejects malformed, forged, truncated and wrong-key snapshots before touching data', async () => {
  const key = generateFinancialBackupKey()
  const db = sqlite()
  const ledger = await openDailyLedger(db, codec, owner, noop)
  await ledger.save(cash)
  const other = await openDailyLedger(db, codec, crypto.randomUUID(), noop)
  const valid = await ledger.exportBackup(key)
  const prior = await ledger.list()
  const { rows, manifest } = await openDailyLedgerArchive(owner, valid, key)
  const snapshot = { schemaVersion: 1, protocolVersion: 1, rows }
  const forge = (metadata: unknown, content: unknown) => backupCipher.encrypt(owner, { manifest: metadata, snapshot: content }, key)
  await expect(other.restoreBackup(valid, key)).rejects.toThrow('FINANCIAL_BACKUP_CONTENT_INVALID')
  await expect(ledger.restoreBackup(valid, generateFinancialBackupKey())).rejects.toThrow()
  const corrupt = valid.slice()
  corrupt[corrupt.length - 1] ^= 1
  await expect(ledger.restoreBackup(corrupt, key)).rejects.toThrow()
  await expect(ledger.restoreBackup(valid.slice(0, 10), key)).rejects.toThrow('FINANCIAL_BACKUP_ARCHIVE_INVALID')
  const wrongScope = await forge({ ...manifest, scope: { ...manifest.scope, scopeKind: 'company' } }, snapshot)
  await expect(ledger.restoreBackup(wrongScope, key)).rejects.toThrow('DAILY_BACKUP_MANIFEST_INVALID')
  for (const content of [{ ...snapshot, schemaVersion: 2 }, { ...snapshot, protocolVersion: 2 }]) {
    await expect(ledger.restoreBackup(await forge(manifest, content), key)).rejects.toThrow('DAILY_BACKUP_VERSION_UNSUPPORTED')
  }
  await expect(ledger.restoreBackup(await forge({ ...manifest, version: 2 }, snapshot), key))
    .rejects.toThrow('DAILY_BACKUP_VERSION_UNSUPPORTED')
  await expect(ledger.restoreBackup(await forge(manifest, { ...snapshot, rows: [] }), key))
    .rejects.toThrow('DAILY_BACKUP_MANIFEST_INVALID')

  async function withMatchingManifest(updated: typeof rows) {
    const payload = { ...snapshot, rows: updated }
    const json = JSON.stringify(payload)
    return forge({ ...manifest, snapshot: { sha256: await sha256(json), bytes: new TextEncoder().encode(json).byteLength,
      journalRows: updated.length, outboxRows: updated.length } }, payload)
  }
  const repeated = await withMatchingManifest([rows[0], rows[0]])
  await expect(ledger.restoreBackup(repeated, key)).rejects.toThrow('DAILY_BACKUP_DUPLICATE')
  const altered = await withMatchingManifest([{ ...rows[0], digest: '0'.repeat(64) }])
  await expect(ledger.restoreBackup(altered, key)).rejects.toThrow('DAILY_BACKUP_ROW_INVALID')
  const invalidPosting = await withMatchingManifest([{ ...rows[0], entry: { ...rows[0].entry, postings: [] } }])
  await expect(ledger.restoreBackup(invalidPosting, key)).rejects.toThrow('DAILY_BACKUP_ROW_INVALID')
  expect(await ledger.list()).toEqual(prior)
  expect(await other.list()).toEqual([])
  expect(await ledger.verifyBackup(valid, key)).toEqual(manifest)
})

it('refuses export when the journal and persisted outbox no longer reconcile', async () => {
  const key = generateFinancialBackupKey()
  const db = sqlite()
  const ledger = await openDailyLedger(db, codec, owner, noop)
  await ledger.save(cash)
  const valid = await ledger.exportBackup(key)
  await db.run('UPDATE personal_ledger_outbox_v1 SET digest=? WHERE owner=?', ['0'.repeat(64), owner])
  await expect(ledger.exportBackup(key)).rejects.toThrow('DAILY_BACKUP_ROW_INVALID')
  await db.run('DELETE FROM personal_ledger_outbox_v1 WHERE owner=?', [owner])
  await expect(ledger.exportBackup(key)).rejects.toThrow('DAILY_BACKUP_JOURNAL_OUTBOX_MISMATCH')
  expect(await ledger.verifyBackup(valid, key)).toMatchObject({ snapshot: { journalRows: 1, outboxRows: 1 } })
  expect(await ledger.list()).toHaveLength(1)
})
