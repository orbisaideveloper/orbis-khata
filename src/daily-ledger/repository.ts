import type { SqlitePort } from '../local-db/sqlite-repository'
import type { NativeRecordCodec } from '../offline-integration/native-transactional-sync-store'
import { envelope, normalize, post, validId, type Command, type Entry } from './journal'

type Row = { operation: string; sealed_hex: string }
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
async function digest(text: string) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('')
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
  return {
    async list() {
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
    },
    async save(input: Command) {
      guard()
      const command = normalize(input)
      const wire = JSON.stringify(envelope(owner, command))
      const hash = await digest(wire)
      return db.transaction(async () => {
        guard()
        const prior = await db.get<{ digest: string }>('SELECT digest FROM personal_ledger_outbox_v1 WHERE owner=? AND operation=?', [owner, command.id])
        if (prior) {
          if (prior.digest !== hash) throw new Error('DAILY_RETRY_CONFLICT')
          const row = await find(command.id)
          if (!row) throw new Error('DAILY_RECORD_DAMAGED')
          const result = await read(row)
          guard()
          return result
        }
        const reverses = command.kind === 'reversal' ? command.originalId : null
        const original = reverses ? await find(reverses) : undefined
        const entry = post(command, original ? await read(original) : undefined)
        const sealed = await codec.seal(JSON.stringify(entry), aad('entry', command.id))
        const pending = await codec.seal(wire, aad('outbox', command.id))
        guard()
        const inserted = await db.run(`INSERT INTO personal_ledger_journal_v1(owner,operation,day,reverses,sealed)
          VALUES(?,?,?,?,?)`, [owner, command.id, command.date, reverses, sealed])
        const queued = await db.run(`INSERT INTO personal_ledger_outbox_v1(owner,operation,digest,sealed)
          VALUES(?,?,?,?)`, [owner, command.id, hash, pending])
        if (inserted.changes !== 1 || queued.changes !== 1) throw new Error('DAILY_SAVE_NOT_DURABLE')
        guard()
        return entry
      })
    },
  }
}
