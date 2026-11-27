/**
 * Android offline-first product adapter for fresh, device-local Khata accounts.
 * - The first trust enrollment comes ONLY from a live, verified ORBIS Admin session.
 * - Cold starts require Android screen lock or fresh central sign-in.
 * - SQLCipher is mandatory; hardware-keystore AES-GCM authenticates identity and state.
 * - Every change is persisted before caller sees success; unsupported calls fail closed.
 * - No production sync, remote POST or implicit migration. PWA uses its existing gateway.
 *
 * NOTE: Release needs real-phone enrollment, reboot, offline, isolation, rollback,
 * low-space and test-update acceptance. Backup/export and restore are separate gates.
 */
import { openDailyLedger } from '../daily-ledger/repository'
import type { Command } from '../daily-ledger/journal'
import { CompanySyncConflict, companyProjection, companyProjectionText, companySyncKey, companySyncState, isUnchangedCompanySubset, mergeBackupCompanies, mergeCompanyExport, parseCompanyExport, withoutCompanyProjection } from '../sync/company-transfer'
import { SQLiteConnection, CapacitorSQLite } from '@capacitor-community/sqlite'
import { registerPlugin } from '@capacitor/core'
import { createAndroidSqlcipherRuntime } from '../local-db/android-sqlcipher-runtime'
import { openVerifiedAndroidSqlcipher } from '../local-db/native-cipher-gate'
import { createLocalSqliteRepository, ensureLocalSchema, type SqlitePort } from '../local-db/sqlite-repository'
import { createAndroidHardwareRecordCodec } from '../offline-integration/android-hardware-codec'
import { isLotteryRead, lotteryInput } from '../lottery/protocol'
import { encryptFinancialBackup, inspectFinancialBackup } from '../sync/financial-backup'
import { restoreSelectedBackupPostings, selectableBackupPostings } from '../sync/selected-backup-restore'
import { stageLotteryPull } from '../sync/lottery-transfer'
import { queueNew } from '../sync/outbox-state'
import { failClosedIfMissingSnapshot } from './snapshot-policy'
import {
  deviceLottery, demoRequest, demoMasters, demoPreviousBalance, saveDemoParty, saveDemoItem,
  deleteDemoParty, deleteDemoItem, saveDemoExpenseBill,
  readDeviceLocalSnapshot, checkImportedLedger, restoreDeviceLocalSnapshot, emptyDeviceLocalSnapshot, validateDeviceLocalSnapshot,
  type DeviceLocalSnapshot,
} from '../demo/store'
import type { DemoParty, DemoItem } from '../demo/master-model'
import type { ExpenseCommand } from '../accounting/expense-model'

const DATABASE = 'orbis-khata-local-primary'
const HINT = 'orbis.khata.android.local.actor.v1' // Public identity hint ONLY, never a password/token.
const IDENTITY = 'verified-identity'
const STATE = 'account-state'
const LOCAL_SCOPE = 'android-local-v1'
const MAX_LOCAL_BYTES = 32 * 1024 * 1024 // Guard against runaway state; chunked hardware records.
const GRANT_DAYS = 45
const codec = createAndroidHardwareRecordCodec()
const bridge = createAndroidSqlcipherRuntime()
const deviceLock = registerPlugin<{ deviceLockStatus(): Promise<{ secure: boolean }> }>('OrbisKhataOfflineBridge')
async function nativeHasDeviceLock(): Promise<boolean> {
  const { secure } = await deviceLock.deviceLockStatus()
  if (typeof secure !== 'boolean') throw new Error('ANDROID_DEVICE_LOCK_STATUS_INVALID')
  return secure
}
const keyBridge = registerPlugin<{
  status(): Promise<{nativePlatform:string;hardwareBacked:boolean;secretPresent:boolean}>
  getOrCreatePassphrase(): Promise<{passphrase:string;hardwareBacked:boolean}>
}>('OrbisKhataKeyBridge')
const actorPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const idPattern = /^[A-Za-z0-9_-]{1,128}$/u
const encoder = new TextEncoder()
const MAX_CHUNK_CHARS = 60_000
const sha256 = async (text: string): Promise<string> => {
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(text))
  return Array.from(new Uint8Array(digest), x=>x.toString(16).padStart(2,'0')).join('')
}
const actorScope = (actor: string, kind: string) => `orbis:${LOCAL_SCOPE}:${actor}:${kind}`
function hexToBytes(value: string) {
  if (typeof value !== 'string' || value.length < 58 || value.length > 2_000_100 || value.length % 2 !== 0 || !/^[0-9a-f]+$/iu.test(value)) {
    throw new Error('ANDROID_LOCAL_CORRUPTED_ENCRYPTED_STATE')
  }
  return Uint8Array.from({length:value.length/2}, (_,i) => Number.parseInt(value.slice(i*2,i*2+2),16))
}
type StoredIdentity = {version:1;actorId:string;displayId:string;enrolledAtMs:number;expiresAtMs:number}
type SnapshotRow = { sealed_hex:string }
let active: string | null = null
let db: SqlitePort | null = null
let storeGeneration = 0
let serial: Promise<unknown> = Promise.resolve()
let identity: StoredIdentity | null = null
function assertActive(): {actor:string;db:SqlitePort;generation:number} {
  if (!active || !db || identity?.actorId !== active || identity.expiresAtMs <= Date.now()) {
    throw new Error('ANDROID_LOCAL_UNLOCK_REQUIRED')
  }
  return {actor:active,db,generation:storeGeneration}
}
function ordered<T>(task:()=>T | Promise<T>):Promise<T> {
  const result=serial.then(task)
  serial=result.catch(()=>undefined)
  return result
}
/** Fixed failure stage only: native provider messages can contain sensitive details. */
async function atNativeStage<T>(stage:string,work:()=>Promise<T>):Promise<T> {
  try{return await work()}
  catch(error){
    if(error instanceof Error && /^(?:ANDROID|NATIVE|LOCAL|OFFLINE|KEYSTORE)_[A-Z0-9_]{3,70}$/u.test(error.message))throw error
    throw new Error(stage)
  }
}
async function openDatabase() {
  const sql = new SQLiteConnection(CapacitorSQLite)
  if (!(await sql.isInConfigEncryption()).result) throw new Error('ANDROID_SQLCIPHER_NOT_CONFIGURED')
  const status = await keyBridge.status()
  if (status.nativePlatform !== 'android') throw new Error('ANDROID_PLATFORM_REQUIRED')
  const existingSecret = (await sql.isSecretStored()).result === true
  if (!existingSecret) {
    if (status.secretPresent || (await sql.isDatabase(DATABASE)).result) throw new Error('ANDROID_LOCAL_CIPHER_KEY_MISSING')
    const key = await keyBridge.getOrCreatePassphrase()
    try {
      if (!key.hardwareBacked || key.passphrase.length < 48) throw new Error('ANDROID_KEYSTORE_NOT_HARDWARE_BACKED')
      await sql.setEncryptionSecret(key.passphrase)
    } finally { key.passphrase='' }
  } else if (!(status.secretPresent && status.hardwareBacked)) {
    throw new Error('ANDROID_LOCAL_HARDWARE_KEY_MISSING')
  }
  const opened = await openVerifiedAndroidSqlcipher(bridge,DATABASE)
  await ensureLocalSchema(opened)
  return opened
}
async function requireDatabase() {
  db ??= await openDatabase()
  return db
}
async function encryptedRead(conn:SqlitePort,actor:string,name:string):Promise<string|null> {
  const row=await conn.get<SnapshotRow>(`SELECT hex(sealed_record) AS sealed_hex FROM local_snapshots
    WHERE actor_id=? AND company_id=? AND object_type=? AND object_id=? AND is_deleted=0`,
    [actor,actor,LOCAL_SCOPE,name])
  if (!row) return null
  return codec.unseal(hexToBytes(row.sealed_hex),actorScope(actor,name))
}
async function encryptedWrite(conn:SqlitePort,actor:string,name:string,text:string) {
  if (encoder.encode(text).byteLength > MAX_LOCAL_BYTES) throw new Error('ANDROID_LOCAL_STORAGE_CAPACITY_REACHED')
  const sealed=await codec.seal(text,actorScope(actor,name))
  await conn.transaction(async()=>{
    await conn.run(`INSERT INTO local_snapshots(actor_id,company_id,object_type,object_id,server_version,sealed_record,is_deleted)
      VALUES(?,?,?,?,?,?,0) ON CONFLICT(actor_id,company_id,object_type,object_id)
      DO UPDATE SET sealed_record=excluded.sealed_record, server_version=excluded.server_version,is_deleted=0`,
      [actor,actor,LOCAL_SCOPE,name,'1',sealed])
  })
}
function parseIdentity(raw:string,actor:string):StoredIdentity {
  const parsed:unknown=JSON.parse(raw)
  if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new Error('ANDROID_LOCAL_IDENTITY_INVALID')
  const p=parsed as Partial<StoredIdentity>
  if (p.version!==1 || p.actorId!==actor || typeof p.displayId!=='string' ||
      !/^ORB-U-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/u.test(p.displayId) ||
      typeof p.enrolledAtMs!=='number' || typeof p.expiresAtMs!=='number' ||
      !Number.isSafeInteger(p.enrolledAtMs) || !Number.isSafeInteger(p.expiresAtMs) ||
      (p.expiresAtMs ?? 0)<=(p.enrolledAtMs??0) || (p.expiresAtMs ?? 0)<=Date.now()) {
    throw new Error('ANDROID_LOCAL_IDENTITY_EXPIRED_OR_INVALID')
  }
  return p as StoredIdentity
}
async function readState(conn:SqlitePort,actor:string,allowInitialEmpty=false):Promise<DeviceLocalSnapshot> {
  const raw=await encryptedRead(conn,actor,STATE)
  if (raw===null) {
    // An enrolled actor losing their finance snapshot must NEVER see an empty ledger.
    failClosedIfMissingSnapshot(allowInitialEmpty)
    return emptyDeviceLocalSnapshot()
  }
  const head:unknown=JSON.parse(raw)
  if (!head || typeof head!=='object' || Array.isArray(head) || !('kind' in head)) {
    // Initial release has only v2 manifests, not a plaintext fallback.
    throw new Error('ANDROID_LOCAL_STATE_MANIFEST_MISSING')
  }
  const manifest=head as {kind?:unknown;count?:unknown;digest?:unknown;bytes?:unknown}
  if (manifest.kind!=='orbis.local.state.v2' || typeof manifest.count!=='number' ||
      !Number.isSafeInteger(manifest.count) || manifest.count<1 || manifest.count>1024 ||
      typeof manifest.digest!=='string' || !/^[0-9a-f]{64}$/u.test(manifest.digest) ||
      typeof manifest.bytes!=='number' || !Number.isSafeInteger(manifest.bytes) ||
      manifest.bytes<2 || manifest.bytes>MAX_LOCAL_BYTES) throw new Error('ANDROID_LOCAL_STATE_MANIFEST_INVALID')
  const chunks: string[] = []
  const indexes = Array.from({ length: manifest.count }, (_, index) => index)
  await indexes.reduce(async (previous, index) => {
    await previous
    const part = await encryptedRead(conn, actor, `state-part-${index}`)
    if (part === null) throw new Error('ANDROID_LOCAL_STATE_CHUNK_MISSING')
    chunks.push(part)
  }, Promise.resolve())
  const text=chunks.join('')
  if(encoder.encode(text).byteLength!==manifest.bytes || await sha256(text)!==manifest.digest) {
    throw new Error('ANDROID_LOCAL_STATE_DIGEST_MISMATCH')
  }
  return JSON.parse(text) as DeviceLocalSnapshot
}
type JournalInput = { operation:string; input:unknown; companyId:string }
async function persistState(conn:SqlitePort,actor:string,state:DeviceLocalSnapshot,journal?:JournalInput):Promise<void> {
  const text=JSON.stringify(state)
  const bytes=encoder.encode(text).byteLength
  if (bytes>MAX_LOCAL_BYTES) throw new Error('ANDROID_LOCAL_STORAGE_CAPACITY_REACHED')
  const parts:string[]=[]
  for(let i=0;i<text.length;){
    let end=Math.min(text.length,i+MAX_CHUNK_CHARS)
    if(end<text.length && /[\uD800-\uDBFF]/u.test(text[end-1])) end--
    parts.push(text.slice(i,end));i=end
  }
  if(parts.length<1 || parts.length>1024) throw new Error('ANDROID_LOCAL_STATE_TOO_MANY_CHUNKS')
  const sealedParts=await Promise.all(parts.map((part,i)=>codec.seal(part,actorScope(actor,`state-part-${i}`))))
  const header=JSON.stringify({kind:'orbis.local.state.v2',count:parts.length,bytes,digest:await sha256(text)})
  const sealedHeader=await codec.seal(header,actorScope(actor,STATE))
  let sealedOperation:Uint8Array|undefined
  let eventJson=''
  let operationId=''
  let operationCompany=''
  let eventAt=''
  if(journal){
    if(!idPattern.test(journal.companyId))throw new Error('ANDROID_LOCAL_OPERATION_COMPANY_INVALID')
    operationCompany=journal.companyId
    operationId=crypto.randomUUID()
    eventAt=new Date().toISOString()
    const draft=queueNew({protocolVersion:1,actorId:actor,companyId:operationCompany,
      operationId,commandType:'android-local-draft',createdAt:eventAt,baseVersion:null,
      payload:{operation:journal.operation,input:journal.input}})
    eventJson=JSON.stringify(draft.envelope)
    sealedOperation=await codec.seal(eventJson,`orbis:outbox:${actor}:${operationCompany}:${operationId}`)
  }
  await conn.transaction(async()=>{
    // Atomic replacement: old encrypted parts and manifest either ALL survive or ALL change.
    await conn.run(`DELETE FROM local_snapshots WHERE actor_id=? AND company_id=? AND object_type=? AND object_id LIKE 'state-part-%'`,
      [actor,actor,LOCAL_SCOPE])
    await sealedParts.reduce(async (previous, part, index) => {
      await previous
      await conn.run(`INSERT INTO local_snapshots(actor_id,company_id,object_type,object_id,server_version,sealed_record,is_deleted)
        VALUES(?,?,?,?,?,?,0)`, [actor, actor, LOCAL_SCOPE, `state-part-${index}`, '2', part])
    }, Promise.resolve())
    await conn.run(`INSERT INTO local_snapshots(actor_id,company_id,object_type,object_id,server_version,sealed_record,is_deleted)
      VALUES(?,?,?,?,?,?,0) ON CONFLICT(actor_id,company_id,object_type,object_id)
      DO UPDATE SET sealed_record=excluded.sealed_record, server_version=excluded.server_version,is_deleted=0`,
      [actor,actor,LOCAL_SCOPE,STATE,'2',sealedHeader])
    // The projection and the future sync outbox entry commit in ONE SQLCipher transaction.
    if(journal&&sealedOperation){
      const written=await conn.run(`INSERT INTO local_outbox(actor_id,company_id,operation_id,command_type,payload_digest,sealed_record,created_at)
        VALUES(?,?,?,?,?,?,?)`,[actor,operationCompany,operationId,'android-local-draft',
          await sha256(eventJson),sealedOperation,eventAt])
      if(written.changes!==1)throw new Error('ANDROID_LOCAL_JOURNAL_NOT_DURABLE')
    }
  })
}
async function hydrateForActor(actor:string,conn:SqlitePort,firstEnrollment=false):Promise<void> {
  restoreDeviceLocalSnapshot(await readState(conn,actor,firstEnrollment))
}
const DRIVE_RECOVERY_KEY = 'drive-recovery-key'

function withPersonalLedger<T>(owner: string, work: (ledger: Awaited<ReturnType<typeof openDailyLedger>>) => Promise<T>) {
  return ordered(async () => {
    const scope = assertActive()
    const guard = () => {
      const current = assertActive()
      if (scope.actor !== owner || current.generation !== scope.generation) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    }
    guard()
    return work(await openDailyLedger(scope.db, codec, owner, guard))
  })
}

export const readNativeDailyLedger = (owner: string) => withPersonalLedger(owner, ledger => ledger.list())
export const saveNativeDailyLedger = (owner: string, input: Command) => withPersonalLedger(owner, ledger => ledger.save(input))
export const exportNativeDailyLedgerBackup = (owner: string, key: Uint8Array<ArrayBuffer>) =>
  withPersonalLedger(owner, ledger => ledger.exportBackup(key))
export const verifyNativeDailyLedgerBackup = (owner: string, archive: Uint8Array<ArrayBuffer>, key: Uint8Array<ArrayBuffer>) =>
  withPersonalLedger(owner, ledger => ledger.verifyBackup(archive, key))
export const restoreNativeDailyLedgerBackup = (owner: string, archive: Uint8Array<ArrayBuffer>, key: Uint8Array<ArrayBuffer>) =>
  withPersonalLedger(owner, ledger => ledger.restoreBackup(archive, key))

export function readNativeDriveRecoveryKey(actor: string): Promise<string | null> {
  return ordered(async () => {
    const scope = assertActive()
    if (scope.actor !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    const key = await encryptedRead(scope.db, actor, DRIVE_RECOVERY_KEY)
    if (assertActive().generation !== scope.generation) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    return key
  })
}

export function saveNativeDriveRecoveryKey(actor: string, key: string): Promise<void> {
  return ordered(async () => {
    const scope = assertActive()
    if (scope.actor !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    if (!/^[a-f0-9]{64}$/iu.test(key)) throw new Error('FINANCIAL_BACKUP_KEY_INVALID')
    await encryptedWrite(scope.db, actor, DRIVE_RECOVERY_KEY, key)
  })
}

/** Export the committed ledger projection under the currently unlocked identity. */
export function exportNativeFinancialBackup(recoveryKey: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return ordered(async () => {
    const { actor, db: connection, generation } = assertActive()
    const state = await readState(connection, actor)
    const archive = await encryptFinancialBackup(actor, state, recoveryKey)
    if (assertActive().generation !== generation) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    return archive
  })
}

/** Check the archive without changing any local records. */
export async function previewNativeFinancialBackup(archive: Uint8Array<ArrayBuffer>, actor: string, key: Uint8Array<ArrayBuffer>) {
  if (assertActive().actor !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
  const snapshot = validateDeviceLocalSnapshot(await inspectFinancialBackup(archive, actor, key))
  return { companies: snapshot.companies.length, entries: snapshot.entries.length }
}

/** Read an authenticated copy without replacing the active snapshot. */
export async function openNativeFinancialBackupCopy(archive: Uint8Array<ArrayBuffer>, actor: string, key: Uint8Array<ArrayBuffer>) {
  const scope = assertActive()
  if (scope.actor !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
  const snapshot = validateDeviceLocalSnapshot(await inspectFinancialBackup(archive, actor, key))
  const current = await readState(scope.db, actor)
  if (assertActive().generation !== scope.generation) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
  const selectable = selectableBackupPostings(current, snapshot)
  const entries = new Map<string, DeviceLocalSnapshot['entries']>()
  for (const row of snapshot.entries) {
    if (typeof row.amount_minor !== 'string' || !/^\d+$/u.test(row.amount_minor)) {
      throw new Error('ANDROID_LOCAL_SNAPSHOT_INVALID')
    }
    const companyEntries = entries.get(row.company)
    if (companyEntries) companyEntries.push(row)
    else entries.set(row.company, [row])
  }
  return snapshot.companies.map(company => ({
    id: company.id,
    name: company.name,
    entries: entries.get(company.id) ?? [],
    selectable: [...selectable.values()].filter(posting => posting.entry.company === company.id).map(posting => posting.entry.id),
  }))
}

async function saveImportedSnapshot(scope: ReturnType<typeof assertActive>, snapshot: DeviceLocalSnapshot) {
  if (assertActive().generation !== scope.generation) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
  await persistState(scope.db, scope.actor, snapshot)
  if (assertActive().generation !== scope.generation) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
  restoreDeviceLocalSnapshot(snapshot)
}

/** Restore an empty account or add independent companies atomically. */
export function restoreNativeFinancialBackup(archive: Uint8Array<ArrayBuffer>, actor: string, key: Uint8Array<ArrayBuffer>): Promise<void> {
  return ordered(async () => {
    const scope = assertActive()
    if (scope.actor !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    const snapshot = validateDeviceLocalSnapshot(await inspectFinancialBackup(archive, actor, key))
    const current = await readState(scope.db, actor)
    const currentJson = JSON.stringify(current)
    if (currentJson === JSON.stringify(snapshot)) return
    const restoredMasters = {
      party: new Set(snapshot.parties.map(row => JSON.stringify([row.company, row.id]))),
      item: new Set(snapshot.items.map(row => JSON.stringify([row.company, row.id]))),
    }
    if (current.deletedMasters?.some(row => restoredMasters[row.kind].has(JSON.stringify([row.company, row.id])))) {
      throw new Error('FINANCIAL_RESTORE_DELETED_MASTER_CONFLICT')
    }
    const empty = currentJson === JSON.stringify(emptyDeviceLocalSnapshot())
    const targets = snapshot.companies.filter(company => !current.companies.some(row => row.id === company.id))
    const pending = empty
      ? await scope.db.get("SELECT operation_id FROM local_outbox WHERE actor_id=? AND state<>'synced' LIMIT 1", [actor])
      : (await Promise.all(targets.map(company => scope.db.get(
        "SELECT operation_id FROM local_outbox WHERE actor_id=? AND company_id=? AND state<>'synced' LIMIT 1", [actor, company.id],
      )))).some(Boolean)
    if (pending) throw new Error('FINANCIAL_RESTORE_PENDING_CHANGES')
    const next = empty ? snapshot : mergeBackupCompanies(current, snapshot, actor)
    if (JSON.stringify(next) !== currentJson) await saveImportedSnapshot(scope, next)
  })
}

export function restoreNativeBackupSelection(archive: Uint8Array<ArrayBuffer>, actor: string, key: Uint8Array<ArrayBuffer>, ids: string[]) {
  return ordered(async () => {
    const scope = assertActive()
    if (scope.actor !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    if (!ids.length) return
    const snapshot = validateDeviceLocalSnapshot(await inspectFinancialBackup(archive, actor, key))
    const current = await readState(scope.db, actor)
    await saveImportedSnapshot(scope, restoreSelectedBackupPostings(current, snapshot, ids))
  })
}

export function readNativeLotterySyncState(actor: string) {
  return ordered(async () => {
    const scope = assertActive()
    if (scope.actor !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    const current = await readState(scope.db, actor)
    const state = current.workspaceEvents['android-lottery:state']?.result as Record<string, unknown> | undefined
    const rows = state?.foundationAccountingOrganization
    return {
      linked: Boolean(current.workspaceEvents['web-lottery-sync:baseline']),
      organizations: Array.isArray(rows) ? rows.map(row => String(row.id)) : [],
    }
  })
}

export function syncNativeLottery(actor: string, payload: unknown) {
  return ordered(async () => {
    const scope = assertActive()
    if (scope.actor !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    const current = await readState(scope.db, actor)
    const staged = await stageLotteryPull(current, actor, payload)
    if (staged.changed && document.querySelector('.lottery-module')) throw new Error('LOTTERY_SYNC_EDITOR_OPEN')
    if (staged.snapshot !== current) await saveImportedSnapshot(scope, staged.snapshot)
    return { changed: staged.changed }
  })
}

async function checkedSyncBaseline(scope: ReturnType<typeof assertActive>, current: DeviceLocalSnapshot, company: string) {
  if (Object.hasOwn(current.retired, company) || !current.companies.some(row => row.id === company)) {
    throw new CompanySyncConflict('COMPANY_NOT_FOUND')
  }
  const pending = await scope.db.get("SELECT operation_id FROM local_outbox WHERE actor_id=? AND company_id=? AND state<>'synced' LIMIT 1", [scope.actor, company])
  if (pending) throw new CompanySyncConflict('PENDING_LOCAL_OUTBOX')
  const baseline = companySyncState(current, company)
  if (baseline && baseline.digest !== await sha256(companyProjectionText(companyProjection(current, company)))) {
    throw new CompanySyncConflict('LOCAL_BASELINE_MISMATCH')
  }
  return baseline
}

function saveWebCompany(actor: string, company: string, payload: unknown, sync: boolean) {
  return ordered(async () => {
    const scope = assertActive()
    if (scope.actor !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    const imported = parseCompanyExport(payload, company, actor)
    const current = await readState(scope.db, actor)
    const baseline = sync ? await checkedSyncBaseline(scope, current, company) : undefined
    const next = mergeCompanyExport(sync ? withoutCompanyProjection(current, company) : current, imported)
    const remote = companyProjection(next, company)
    const digest = await sha256(companyProjectionText(remote))
    if (sync && !baseline && !isUnchangedCompanySubset(companyProjection(current, company), remote)) {
      throw new CompanySyncConflict('LEGACY_RECORD_MISMATCH')
    }
    if (baseline?.digest === digest) return { changed: false, syncedAt: baseline.syncedAt }
    checkImportedLedger(next, company, imported.balances)
    const syncedAt = new Date().toISOString()
    next.workspaceEvents[companySyncKey(company)] = { payload: '', result: { digest, syncedAt } }
    await saveImportedSnapshot(scope, next)
    return { changed: true, syncedAt }
  })
}

export const importNativeCompany = (actor: string, company: string, payload: unknown) =>
  saveWebCompany(actor, company, payload, false)

export const syncNativeCompany = (actor: string, company: string, payload: unknown) =>
  saveWebCompany(actor, company, payload, true)

export function readNativeSyncCompanies(actor: string) {
  return ordered(async () => {
    const scope = assertActive()
    if (scope.actor !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    const snapshot = await readState(scope.db, actor)
    return snapshot.companies.filter(row => !Object.hasOwn(snapshot.retired, row.id) && companySyncState(snapshot, row.id))
  })
}

export function readNativeCompaniesForComparison(actor: string) {
  return ordered(async () => {
    if (assertActive().actor !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    const companies = await demoRequest<{ id: string; name: string }[]>('companies', {})
    return companies.map(({ id, name }) => ({ id, name }))
  })
}

export function nativeLocalActor(): string | null { return active }
export function nativeLocalDisplayId(): string | null { return identity?.displayId ?? null }
/** Use this after successful central sign-in. No caller-supplied identity is trusted here. */
export async function enrollVerifiedCentralIdentity(actor:string,displayId:string):Promise<void> {
  if (!actorPattern.test(actor) || !/^ORB-U-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/u.test(displayId)) {
    throw new Error('ANDROID_LOCAL_CENTRAL_IDENTITY_INVALID')
  }
  const now=Date.now()
  if (await nativeHasDeviceLock() && !(await codec.verifyDeviceCredential())) throw new Error('ANDROID_DEVICE_CREDENTIAL_REQUIRED')
  await ordered(async()=>{
    const conn=await atNativeStage('ANDROID_ENROLL_DB_OPEN_FAILED',()=>requireDatabase())
    await atNativeStage('ANDROID_ENROLL_SCOPE_FAILED',()=>createLocalSqliteRepository(conn).registerScope(actor,actor,new Date(now).toISOString()))
    const next:StoredIdentity={version:1,actorId:actor,displayId,enrolledAtMs:now,expiresAtMs:now+GRANT_DAYS*86_400_000}
    const old=await atNativeStage('ANDROID_ENROLL_IDENTITY_READ_FAILED',()=>encryptedRead(conn,actor,IDENTITY))
    if (old) {
      const existing=JSON.parse(old) as Partial<StoredIdentity>
      if(existing.actorId!==actor || existing.version!==1) throw new Error('ANDROID_LOCAL_EXISTING_IDENTITY_INVALID')
    }
    await atNativeStage('ANDROID_ENROLL_SNAPSHOT_READ_FAILED',()=>hydrateForActor(actor,conn,!old))
    if (!old) await atNativeStage('ANDROID_ENROLL_SNAPSHOT_CREATE_FAILED',()=>persistState(conn,actor,readDeviceLocalSnapshot()))
    await atNativeStage('ANDROID_ENROLL_IDENTITY_WRITE_FAILED',()=>encryptedWrite(conn,actor,IDENTITY,JSON.stringify(next)))
    active=actor; identity=next; storeGeneration++
    localStorage.setItem(HINT,actor)
  })
}
/** An unlocked offline session is UI identity only; never an API bearer token. */
export async function restoreNativeOfflineIdentity():Promise<{actorId:string;displayId:string}|null> {
  if (!(await nativeHasDeviceLock())) throw new Error('ANDROID_DEVICE_LOCK_ONLINE_SIGNIN_REQUIRED')
  const hint=localStorage.getItem(HINT)
  if (!hint) return null
  if (!actorPattern.test(hint)) throw new Error('ANDROID_LOCAL_IDENTITY_HINT_INVALID')
  if (!(await codec.verifyDeviceCredential())) throw new Error('ANDROID_DEVICE_CREDENTIAL_REQUIRED')
  return ordered(async()=>{
    const conn=await atNativeStage('ANDROID_RESTORE_DB_OPEN_FAILED',()=>requireDatabase())
    const raw=await atNativeStage('ANDROID_RESTORE_IDENTITY_READ_FAILED',()=>encryptedRead(conn,hint,IDENTITY))
    if (!raw) throw new Error('ANDROID_LOCAL_IDENTITY_NOT_ENROLLED')
    const profile=parseIdentity(raw,hint)
    await atNativeStage('ANDROID_RESTORE_SNAPSHOT_READ_FAILED',()=>hydrateForActor(hint,conn))
    active=hint;identity=profile;storeGeneration++
    return {actorId:hint,displayId:profile.displayId}
  })
}
/** Explicit signout disables silent offline login but never deletes financial records. */
export function lockNativeOfflineIdentity():void {
  localStorage.removeItem(HINT)
  active=null;identity=null;storeGeneration++
  restoreDeviceLocalSnapshot(emptyDeviceLocalSnapshot())
}
async function commit<T>(callback:()=>T | Promise<T>,journal?:JournalInput):Promise<T> {
  const expected=storeGeneration
  return ordered(async()=>{
    const sc=assertActive()
    if (expected!==sc.generation) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    const prior=readDeviceLocalSnapshot()
    let attemptedCommit=false
    try {
      const output=await callback()
      if (expected!==storeGeneration) {
        restoreDeviceLocalSnapshot(emptyDeviceLocalSnapshot())
        throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
      }
      // Never tell the screen that a finance mutation succeeded before its SQL commit.
      if(journal)await createLocalSqliteRepository(sc.db).registerScope(sc.actor,journal.companyId,new Date().toISOString())
      attemptedCommit=true
      await persistState(sc.db,sc.actor,readDeviceLocalSnapshot(),journal)
      return output
    } catch(error) {
      if(expected===storeGeneration){
        if(attemptedCommit){
          // A SQLite call can throw AFTER a durable commit. Re-read authoritative
          // encrypted state; never roll back RAM blindly and overwrite the disk.
          try {restoreDeviceLocalSnapshot(await readState(sc.db,sc.actor))}
          catch {
            // Preserve the on-disk bytes, block further accounting until a fresh
            // credential-unlocked restart reconstructs an authoritative state.
            active=null;identity=null;storeGeneration++
            restoreDeviceLocalSnapshot(emptyDeviceLocalSnapshot())
          }
          throw new Error('ANDROID_LOCAL_SAVE_UNCERTAIN_REVIEW_LEDGER')
        }
        restoreDeviceLocalSnapshot(prior)
      }
      throw error
    }
  })
}
function localOperationCompany(operation:string,input:unknown):string {
  if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('ANDROID_LOCAL_OPERATION_INPUT_INVALID')
  const p=input as Record<string,unknown>
  const row=p.row && typeof p.row==='object' && !Array.isArray(p.row) ? p.row as Record<string,unknown> : null
  let company = p.company
  if (operation === 'create') {
    if (p.table === 'khata_companies') company = row?.id
    else if (p.table === 'khata_parties') company = row?.company_id
  }
  if(typeof company!=='string'||!idPattern.test(company))throw new Error('ANDROID_LOCAL_OPERATION_COMPANY_INVALID')
  return company
}
const readingOperation=(operation:string,input:unknown):boolean => {
  if(['companies','masters','report','inventory-report','expense-report','retired-companies','party-balance'].includes(operation))return true
  if(operation==='expense-profiles') return (input as {action?:unknown} | null)?.action === 'list'
  if(operation==='workspace' && input && typeof input==='object'){
    return ['settings','accounts','detail','number-preview'].includes(String((input as {action?:unknown}).action))
  }
  return false
}
export async function nativeLocalRequest<T>(operation:string,input:unknown):Promise<T> {
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(operation)) throw new Error('ANDROID_LOCAL_OPERATION_INVALID')
  if (operation==='lottery') {
    if (!lotteryInput(input)) throw new Error('LOTTERY_INPUT_INVALID')
    const { actor, generation } = assertActive()
    if (isLotteryRead(input.method)) {
      return ordered(async () => {
        const output = await deviceLottery(input, actor)
        if (generation !== storeGeneration) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
        return output as T
      })
    }
    // The receipt and Lottery state live in the same encrypted snapshot transaction.
    return commit(async () => await deviceLottery(input, actor) as T)
  }
  if (operation==='masters') {
    const p=input as {company?:unknown}|null
    if (!p || typeof p.company!=='string' || !idPattern.test(p.company)) throw new Error('ANDROID_LOCAL_COMPANY_REQUIRED')
    return ordered(()=>{ assertActive();return demoMasters(p.company as string) as T })
  }
  // Read requests never rewrite the encrypted finance snapshot. This is critical
  // for fast startup and for still allowing reads when storage is almost full.
  if (readingOperation(operation,input)) {
    return ordered(async()=>{assertActive();return demoRequest<T>(operation,input)})
  }
  const journal={operation,input,companyId:localOperationCompany(operation,input)}
  return commit(()=>demoRequest<T>(operation,input),journal)
}
export const nativeLocalBooksServices = {
  request: nativeLocalRequest,
  saveParty:(party:DemoParty)=>commit(()=>{saveDemoParty(party)},{operation:'party-save',input:party,companyId:party.company}),
  saveItem:(item:DemoItem)=>commit(()=>{saveDemoItem(item)},{operation:'item-save',input:item,companyId:item.company}),
  deleteParty:(company:string,id:string)=>commit(()=>{
    if(!idPattern.test(company)||!idPattern.test(id)) throw new Error('ANDROID_LOCAL_SCOPE_INVALID')
    deleteDemoParty(company,id)
  },{operation:'party-delete',input:{company,id},companyId:company}),
  deleteItem:(company:string,id:string)=>commit(()=>{
    if(!idPattern.test(company)||!idPattern.test(id)) throw new Error('ANDROID_LOCAL_SCOPE_INVALID')
    deleteDemoItem(company,id)
  },{operation:'item-delete',input:{company,id},companyId:company}),
  previous:(company:string,party:string,date:string,kind:string)=>ordered(()=>{
    assertActive()
    if (!idPattern.test(company)||!idPattern.test(party)||!['sale','purchase','expense'].includes(kind))throw new Error('ANDROID_LOCAL_PREVIOUS_INVALID')
    return demoPreviousBalance(company,party,date,kind as 'sale'|'purchase'|'expense')
  }),
  expenseBill:(command:ExpenseCommand,lines:Parameters<typeof saveDemoExpenseBill>[1])=>commit(()=>saveDemoExpenseBill(command,lines),{operation:'expense-bill',input:{command,lines},companyId:command.company}),
}

/** Read-only sharing cache is encrypted with the actor's existing durable snapshot. */
export function readNativeStatementRelay(actor: string): Promise<unknown> {
  return ordered(() => {
    if (assertActive().actor !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    return readDeviceLocalSnapshot().workspaceEvents['customer-relay:v1']?.result ?? null
  })
}
export function saveNativeStatementRelay(actor: string, value: unknown): Promise<void> {
  return commit(() => {
    if (assertActive().actor !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    const snapshot = readDeviceLocalSnapshot()
    snapshot.workspaceEvents['customer-relay:v1'] = { payload: '', result: structuredClone(value) }
    restoreDeviceLocalSnapshot(snapshot)
  })
}
export function readNativeStatementSource(actor: string, scope: import('../customer-view/relay/model').Scope): Promise<import('../customer-view/relay/model').Dataset> {
  return ordered(async () => {
    if (assertActive().actor !== actor) throw new Error('ANDROID_LOCAL_ACTOR_CHANGED')
    return (await import('../customer-view/relay/source')).khataProjection(readDeviceLocalSnapshot(), scope)
  })
}
