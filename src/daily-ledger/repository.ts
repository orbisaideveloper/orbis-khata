import { today } from '../accounting/model'
import type { SqlitePort } from '../local-db/sqlite-repository'
import type { NativeRecordCodec } from '../offline-integration/native-transactional-sync-store'
import { exportDailyLedgerArchive, openDailyLedgerArchive, sha256, type BackupRow } from './backup'
import { needsHouseholdHistory, postHousehold } from './household'
import { envelope, normalize, post, validId, type Command, type Entry } from './journal'

type Row = { operation: string; sealed_hex: string }
type SnapshotRow = Row & { day: string; reverses: string | null; digest: string | null; outbox_hex: string }
const journal = `CREATE TABLE IF NOT EXISTS personal_ledger_journal_v1 (
  owner TEXT NOT NULL, operation TEXT NOT NULL, day TEXT NOT NULL, reverses TEXT, sealed BLOB NOT NULL,
  PRIMARY KEY(owner,operation), UNIQUE(owner,reverses),
  FOREIGN KEY(owner,reverses) REFERENCES personal_ledger_journal_v1(owner,operation)
)`
const outbox = `CREATE TABLE IF NOT EXISTS personal_ledger_outbox_v1 (
  owner TEXT NOT NULL, operation TEXT NOT NULL, digest TEXT NOT NULL, sealed BLOB NOT NULL,
  PRIMARY KEY(owner,operation), FOREIGN KEY(owner,operation) REFERENCES personal_ledger_journal_v1(owner,operation)
)`
function decode(hex: string) {
  if (!/^(?:[0-9a-f]{2})+$/iu.test(hex)) throw new Error('DAILY_RECORD_DAMAGED')
  return Uint8Array.from(hex.match(/../gu) ?? [], pair => Number.parseInt(pair, 16))
}
export async function openDailyLedger(db: SqlitePort, codec: NativeRecordCodec, owner: string, guard: () => void) {
  if (!validId(owner)) throw new Error('DAILY_SCOPE_INVALID')
  const aad = (kind: 'entry' | 'outbox', id: string) => `orbis:personal-ledger:v1:${owner}:${kind}:${id}`
  await db.transaction(async () => {
    guard()
    await db.run(journal)
    await db.run(outbox)
    guard()
  })
  const read = async ({ operation, sealed_hex }: Row): Promise<Entry> =>
    JSON.parse(await codec.unseal(decode(sealed_hex), aad('entry', operation))) as Entry
  const find = (id: string) => db.get<Row>(`SELECT operation,hex(sealed) AS sealed_hex
    FROM personal_ledger_journal_v1 WHERE owner=? AND operation=?`, [owner, id])
  async function list() {
    guard()
    const rows = await db.all<Row>(`SELECT operation,hex(sealed) AS sealed_hex FROM personal_ledger_journal_v1
      WHERE owner=? ORDER BY day DESC,rowid DESC`, [owner])
    const entries: Entry[] = []
    for (const row of rows) {
      guard()
      entries.push(await read(row))
    }
    guard()
    return entries
  }
  async function readBackupRows(): Promise<BackupRow[]> {
    guard()
    const rows = await db.all<SnapshotRow>(`SELECT j.operation,j.day,j.reverses,hex(j.sealed) AS sealed_hex,
      o.digest,hex(o.sealed) AS outbox_hex FROM personal_ledger_journal_v1 AS j
      LEFT JOIN personal_ledger_outbox_v1 AS o ON (o.owner=j.owner AND o.operation=j.operation)
      WHERE j.owner=? ORDER BY j.rowid`, [owner])
    const pending = await db.get<{ total: number }>(
      'SELECT count(*) AS total FROM personal_ledger_outbox_v1 WHERE owner=?', [owner],
    )
    if (pending?.total !== rows.length) throw new Error('DAILY_BACKUP_JOURNAL_OUTBOX_MISMATCH')
    const result: BackupRow[] = []
    for (const row of rows) {
      guard()
      if (!row.digest) throw new Error('DAILY_BACKUP_JOURNAL_OUTBOX_MISMATCH')
      const entry = await read(row)
      const { command } = entry
      const reverses = command.kind === 'reversal' ? command.originalId : null
      if (command.id !== row.operation || command.date !== row.day || reverses !== row.reverses) {
        throw new Error('DAILY_RECORD_DAMAGED')
      }
      const wire = await codec.unseal(decode(row.outbox_hex), aad('outbox', row.operation))
      result.push({ entry, wire, digest: row.digest })
    }
    guard()
    return result
  }

  async function write({ entry, wire, digest }: BackupRow) {
    const { command } = entry
    const reverses = command.kind === 'reversal' ? command.originalId : null
    const sealed = await codec.seal(JSON.stringify(entry), aad('entry', command.id))
    const pending = await codec.seal(wire, aad('outbox', command.id))
    guard()
    const inserted = await db.run(`INSERT INTO personal_ledger_journal_v1(owner,operation,day,reverses,sealed)
      VALUES(?,?,?,?,?)`, [owner, command.id, command.date, reverses, sealed])
    const queued = await db.run(`INSERT INTO personal_ledger_outbox_v1(owner,operation,digest,sealed)
      VALUES(?,?,?,?)`, [owner, command.id, digest, pending])
    if (inserted.changes !== 1 || queued.changes !== 1) throw new Error('DAILY_SAVE_NOT_DURABLE')
    guard()
  }

  async function inspectBackup(archive: Uint8Array<ArrayBuffer>, key: Uint8Array<ArrayBuffer>) {
    guard()
    const validated = await openDailyLedgerArchive(owner, archive, key)
    guard()
    return validated
  }

  return {
    list,
    async exportBackup(key: Uint8Array<ArrayBuffer>) {
      const rows = await db.transaction(readBackupRows)
      const archive = await exportDailyLedgerArchive(owner, rows, key)
      guard()
      return archive
    },
    async verifyBackup(archive: Uint8Array<ArrayBuffer>, key: Uint8Array<ArrayBuffer>) {
      return (await inspectBackup(archive, key)).manifest
    },
    async restoreBackup(archive: Uint8Array<ArrayBuffer>, key: Uint8Array<ArrayBuffer>) {
      const { rows } = await inspectBackup(archive, key)
      return db.transaction(async () => {
        const current = await readBackupRows()
        const common = Math.min(rows.length, current.length)
        // Compare exact commit order, including same-day replacements. Divergent histories need manual review.
        for (let i = 0; i < common; i++) {
          if (JSON.stringify(rows[i]) !== JSON.stringify(current[i])) throw new Error('DAILY_BACKUP_HISTORY_CONFLICT')
        }
        const append = rows.slice(common)
        for (const row of append) await write(row)
        // Read the destination before commit to verify authenticated storage and unchanged prefixes.
        if (append.length && JSON.stringify(await readBackupRows()) !== JSON.stringify(rows)) {
          throw new Error('DAILY_BACKUP_RESTORE_NOT_DURABLE')
        }
        return { inserted: append.length, alreadyPresent: common }
      })
    },
    async save(input: Command) {
      guard()
      const command = normalize(input)
      return db.transaction(async () => {
        guard()
        const prior = await db.get<{ digest: string }>('SELECT digest FROM personal_ledger_outbox_v1 WHERE owner=? AND operation=?', [owner, command.id])
        if (prior) {
          const row = await find(command.id)
          if (!row) throw new Error('DAILY_RECORD_DAMAGED')
          const result = await read(row)
          const replay = JSON.stringify(envelope(owner, command, result.postings.length))
          if (prior.digest !== await sha256(replay)) throw new Error('DAILY_RETRY_CONFLICT')
          guard()
          return result
        }
        const reverses = command.kind === 'reversal' ? command.originalId : null
        const originalRow = reverses ? await find(reverses) : undefined
        const original = originalRow ? await read(originalRow) : undefined
        const checked = needsHouseholdHistory(command) || (original && needsHouseholdHistory(original.command))
        const entry = checked ? postHousehold(command, await list(), today(), original) : post(command, original)
        const wire = JSON.stringify(envelope(owner, command, entry.postings.length))
        await write({ entry, wire, digest: await sha256(wire) })
        return entry
      })
    },
  }
}
