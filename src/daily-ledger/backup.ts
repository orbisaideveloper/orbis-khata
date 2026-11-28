import { financialBackupCodec } from '../sync/financial-backup'
import { needsHouseholdHistory, postHousehold } from './household'
import { matchDailyLedgerManifest } from './integration-contracts'
import { envelope, normalize, post, validId, type Entry } from './journal'

const codec = financialBackupCodec('orbis.khata.daily-ledger.backup.v1')
const scopeFor = (owner: string) => ({
  orbisIdentityId: owner, scopeKind: 'personal_ledger' as const, scopeId: owner,
})
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export type BackupRow = Readonly<{ entry: Entry; wire: string; digest: string }>
type Snapshot = Readonly<{ schemaVersion: 1; protocolVersion: 1; rows: readonly BackupRow[] }>
type Manifest = Parameters<typeof matchDailyLedgerManifest>[0]

export async function sha256(text: string) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function facts(snapshot: Snapshot) {
  const json = JSON.stringify(snapshot)
  const bytes = new TextEncoder().encode(json).byteLength
  return { bytes, sha256: await sha256(json), journalRows: snapshot.rows.length, outboxRows: snapshot.rows.length }
}

function restoreEntry(row: BackupRow, accepted: ReadonlyMap<string, Entry>, reversed: Set<string>) {
  if (!isObject(row) || !isObject(row.entry) || !isObject(row.entry.command) ||
      typeof row.wire !== 'string' || typeof row.digest !== 'string') {
    throw new Error('DAILY_BACKUP_ROW_INVALID')
  }
  const command = normalize(row.entry.command)
  if (accepted.has(command.id)) throw new Error('DAILY_BACKUP_DUPLICATE')
  if (command.kind === 'reversal') {
    if (reversed.has(command.originalId)) throw new Error('DAILY_BACKUP_DUPLICATE')
    reversed.add(command.originalId)
  }
  const original = command.kind === 'reversal' ? accepted.get(command.originalId) : undefined
  const needsHistory = needsHouseholdHistory(command) || (original && needsHouseholdHistory(original.command))
  if (!needsHistory) return post(command, original)
  const history = [...accepted.values()].reverse()
  history.sort((a, b) => b.command.date.localeCompare(a.command.date))
  return postHousehold(command, history, command.date, original)
}

async function verifyRows(rows: readonly BackupRow[], owner: string) {
  // Each replay depends on preceding rows in the archive's commit order.
  const accepted = new Map<string, Entry>()
  const reversed = new Set<string>()
  await rows.reduce(async (previous, row) => {
    await previous
    const expected = restoreEntry(row, accepted, reversed)
    const wire = JSON.stringify(envelope(owner, expected.command, expected.postings.length))
    if (JSON.stringify(expected) !== JSON.stringify(row.entry) || wire !== row.wire ||
        await sha256(wire) !== row.digest) throw new Error('DAILY_BACKUP_ROW_INVALID')
    accepted.set(expected.command.id, expected)
  }, Promise.resolve())
}

export async function exportDailyLedgerArchive(owner: string, rows: readonly BackupRow[], key: Uint8Array<ArrayBuffer>) {
  if (!validId(owner)) throw new Error('DAILY_SCOPE_INVALID')
  await verifyRows(rows, owner)
  const snapshot: Snapshot = { schemaVersion: 1, protocolVersion: 1, rows }
  const manifest: Manifest = { version: 1, scope: scopeFor(owner), snapshot: await facts(snapshot) }
  return codec.encrypt(owner, { manifest, snapshot }, key)
}

export async function openDailyLedgerArchive(owner: string, archive: Uint8Array<ArrayBuffer>, key: Uint8Array<ArrayBuffer>) {
  if (!validId(owner)) throw new Error('DAILY_SCOPE_INVALID')
  const body = await codec.inspect(archive, owner, key)
  if (!isObject(body) || !isObject(body.manifest) || !isObject(body.manifest.scope) ||
      !isObject(body.manifest.snapshot) || !isObject(body.snapshot)) throw new Error('DAILY_BACKUP_MANIFEST_INVALID')
  const snapshot = body.snapshot
  if (snapshot.schemaVersion !== 1 || snapshot.protocolVersion !== 1 || body.manifest.version !== 1) {
    throw new Error('DAILY_BACKUP_VERSION_UNSUPPORTED')
  }
  if (!Array.isArray(snapshot.rows)) throw new Error('DAILY_BACKUP_MANIFEST_INVALID')
  const manifest = body.manifest as Manifest
  const checked = snapshot as Snapshot
  if (!matchDailyLedgerManifest(manifest, scopeFor(owner), await facts(checked))) {
    throw new Error('DAILY_BACKUP_MANIFEST_INVALID')
  }
  await verifyRows(checked.rows, owner)
  return { manifest, rows: checked.rows }
}
