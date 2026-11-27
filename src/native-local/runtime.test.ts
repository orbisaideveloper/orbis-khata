import type { DeviceLocalSnapshot } from '../demo/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  rows: new Map<string, Uint8Array>(),
  credential: vi.fn(),
  deviceLockStatus: vi.fn(),
  request: vi.fn(),
  masters: vi.fn(),
  restore: vi.fn(),
  journal: vi.fn(),
  registerScope: vi.fn(),
  outbox: new Map<string, string>(),
  failManifest: vi.fn(),
  state: undefined as unknown as DeviceLocalSnapshot,
}))

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    async isInConfigEncryption() { return { result: true } }
    async isSecretStored() { return { result: true } }
  },
}))
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({
    deviceLockStatus: fixture.deviceLockStatus,
    status: async () => ({ nativePlatform: 'android', hardwareBacked: true, secretPresent: true }),
  }),
}))
vi.mock('../local-db/android-sqlcipher-runtime', () => ({ createAndroidSqlcipherRuntime: () => ({}) }))
vi.mock('../local-db/native-cipher-gate', () => ({
  openVerifiedAndroidSqlcipher: async () => ({
    all: async () => [],
    get: async (sql: string, params: string[]) => {
      if (sql.includes('count(*) AS total FROM personal_ledger_outbox_v1')) return { total: 0 }
      if (sql.includes('FROM local_outbox')) {
        const state = fixture.outbox.get(params.join(':'))
        return state && (!sql.includes("state<>'synced'") || state !== 'synced') ? { operation_id: 'test-operation' } : null
      }
      const bytes = fixture.rows.get(`${params[0]}:${params[3]}`)
      return bytes ? { sealed_hex: Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') } : null
    },
    run: async (sql: string, params: [string, string, string, string, string, Uint8Array]) => {
      if (sql.includes('INSERT INTO local_outbox')) return fixture.journal()
      if (sql.includes('INSERT INTO local_snapshots')) {
        if (sql.includes('ON CONFLICT')) fixture.failManifest()
        fixture.rows.set(`${params[0]}:${params[3]}`, params[5])
      }
      return { changes: 1 }
    },
    transaction: async <T>(work: () => Promise<T>) => {
      const prior = new Map(fixture.rows)
      try {
        return await work()
      } catch (error) {
        fixture.rows = prior
        throw error
      }
    },
  }),
}))
vi.mock('../local-db/sqlite-repository', () => ({
  ensureLocalSchema: async () => {},
  createLocalSqliteRepository: () => ({ registerScope: fixture.registerScope }),
}))
vi.mock('../offline-integration/android-hardware-codec', () => ({
  createAndroidHardwareRecordCodec: () => ({
    verifyDeviceCredential: fixture.credential,
    seal: async (text: string) => new TextEncoder().encode(text.padEnd(29)),
    unseal: async (bytes: Uint8Array) => new TextDecoder().decode(bytes).trimEnd(),
  }),
}))
vi.mock('../demo/store', async (importOriginal) => ({
  ...await importOriginal<typeof import('../demo/store')>(),
  demoRequest: fixture.request,
  demoMasters: fixture.masters,
  readDeviceLocalSnapshot: () => structuredClone(fixture.state),
  restoreDeviceLocalSnapshot: (state: typeof fixture.state) => {
    fixture.restore(state)
    fixture.state = structuredClone(state)
  },
}))

const { emptyDeviceLocalSnapshot } = await vi.importActual<typeof import('../demo/store')>('../demo/store')
const demoCompany = { id: 'demo-company', name: 'Demo' }

const actor = '01234567-89ab-7def-8123-456789abcdef'
const displayId = 'ORB-U-ABCDEFGH'
const hint = 'orbis.khata.android.local.actor.v1'

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  localStorage.clear()
  fixture.rows.clear()
  fixture.outbox.clear()
  fixture.state = emptyDeviceLocalSnapshot()
  fixture.deviceLockStatus.mockResolvedValue({ secure: true })
  fixture.credential.mockResolvedValue(true)
  fixture.journal.mockResolvedValue({ changes: 1 })
})

describe('Android local accounting runtime', () => {
  it('requires valid central identity and a device credential', async () => {
    const runtime = await import('./runtime')
    await expect(runtime.enrollVerifiedCentralIdentity('invalid', displayId))
      .rejects.toThrow('ANDROID_LOCAL_CENTRAL_IDENTITY_INVALID')
    expect(fixture.credential).not.toHaveBeenCalled()
    fixture.credential.mockResolvedValue(false)
    await expect(runtime.enrollVerifiedCentralIdentity(actor, displayId))
      .rejects.toThrow('ANDROID_DEVICE_CREDENTIAL_REQUIRED')
    expect(localStorage.getItem(hint)).toBeNull()
  })

  it('enrolls, persists a mutation, and restores it after a fresh module load', async () => {
    const runtime = await import('./runtime')
    expect(await runtime.restoreNativeOfflineIdentity()).toBeNull()
    await runtime.enrollVerifiedCentralIdentity(actor, displayId)
    expect(runtime.nativeLocalActor()).toBe(actor)
    expect(runtime.nativeLocalDisplayId()).toBe(displayId)

    fixture.request.mockImplementationOnce(async () => {
      fixture.state.companies.push(demoCompany)
      return { saved: true }
    })
    await expect(runtime.nativeLocalRequest('create', { table: 'khata_companies', row: { id: 'demo-company' } }))
      .resolves.toEqual({ saved: true })
    expect(fixture.journal).toHaveBeenCalledOnce()

    vi.resetModules()
    fixture.state = emptyDeviceLocalSnapshot()
    const restarted = await import('./runtime')
    await expect(restarted.restoreNativeOfflineIdentity()).resolves.toEqual({ actorId: actor, displayId })
    expect(fixture.state.companies).toEqual([demoCompany])
    fixture.masters.mockReturnValue({ parties: [] })
    await expect(restarted.nativeLocalRequest('masters', { company: 'demo-company' }))
      .resolves.toEqual({ parties: [] })
    expect(fixture.journal).toHaveBeenCalledOnce()

    restarted.lockNativeOfflineIdentity()
    expect(restarted.nativeLocalDisplayId()).toBeNull()
    await expect(restarted.nativeLocalRequest('companies', {})).rejects.toThrow('ANDROID_LOCAL_UNLOCK_REQUIRED')
  })

  it('restores the durable snapshot after a journal write fails and permits a retry', async () => {
    const runtime = await import('./runtime')
    await runtime.enrollVerifiedCentralIdentity(actor, displayId)
    fixture.request.mockImplementation(async () => {
      fixture.state.companies.push(demoCompany)
      return { saved: true }
    })
    fixture.journal.mockResolvedValueOnce({ changes: 0 })
    const input = { table: 'khata_companies', row: { id: 'demo-company' } }
    await expect(runtime.nativeLocalRequest('create', input))
      .rejects.toThrow('ANDROID_LOCAL_SAVE_UNCERTAIN_REVIEW_LEDGER')
    expect(fixture.state.companies).toEqual([])
    await expect(runtime.nativeLocalRequest('create', input)).resolves.toEqual({ saved: true })
    expect(fixture.state.companies).toEqual([demoCompany])
  })

  it('fails closed when an enrolled snapshot loses a chunk', async () => {
    const runtime = await import('./runtime')
    await runtime.enrollVerifiedCentralIdentity(actor, displayId)
    fixture.rows.delete(`${actor}:state-part-0`)
    vi.resetModules()
    const restarted = await import('./runtime')
    await expect(restarted.restoreNativeOfflineIdentity()).rejects.toThrow('ANDROID_LOCAL_STATE_CHUNK_MISSING')
    expect(restarted.nativeLocalActor()).toBeNull()
  })
})

it('enrolls without a screen lock after central sign-in and keeps existing encrypted data behind login', async () => {
  fixture.deviceLockStatus.mockResolvedValue({ secure: false })
  const runtime = await import('./runtime')
  await runtime.enrollVerifiedCentralIdentity(actor, displayId)
  await expect(runtime.restoreNativeOfflineIdentity()).rejects.toThrow('ANDROID_DEVICE_LOCK_ONLINE_SIGNIN_REQUIRED')
  expect(fixture.credential).not.toHaveBeenCalled()
  await runtime.enrollVerifiedCentralIdentity(actor, displayId)
  expect(runtime.nativeLocalActor()).toBe(actor)
})

it('previews and restores an authenticated backup once without overwriting existing books', async () => {
  const runtime = await import('./runtime')
  const { encryptFinancialBackup, generateFinancialBackupKey, inspectFinancialBackup } = await import('../sync/financial-backup')
  await runtime.enrollVerifiedCentralIdentity(actor, displayId)
  const snapshot = emptyDeviceLocalSnapshot()
  snapshot.companies.push({ id: 'demo-company', name: 'Demo' })
  const key = generateFinancialBackupKey()
  const archive = await encryptFinancialBackup(actor, snapshot, key)
  await expect(runtime.previewNativeFinancialBackup(archive, actor, key)).resolves.toEqual({ companies: 1, entries: 0 })
  await expect(runtime.openNativeFinancialBackupCopy(archive, actor, key)).resolves.toEqual([{ ...snapshot.companies[0], entries: [], selectable: [] }])
  expect(fixture.state.companies).toEqual([])
  await runtime.restoreNativeFinancialBackup(archive, actor, key)
  expect(fixture.state.companies).toEqual(snapshot.companies)
  const exported = await runtime.exportNativeFinancialBackup(key)
  await expect(inspectFinancialBackup(exported, actor, key)).resolves.toEqual(snapshot)
  await expect(runtime.restoreNativeFinancialBackup(archive, actor, key)).resolves.toBeUndefined()
  expect(fixture.state.companies).toEqual(snapshot.companies)
  snapshot.companies[0].name = 'Older name'
  const divergent = await encryptFinancialBackup(actor, snapshot, key)
  await expect(runtime.restoreNativeFinancialBackup(divergent, actor, key)).rejects.toThrow('FINANCIAL_RESTORE_COMPANY_CONFLICT')
  expect(fixture.state.companies).toEqual([{ id: 'demo-company', name: 'Demo' }])
})

it('restores an independent company into existing books without creating duplicates', async () => {
  const runtime = await import('./runtime')
  const { encryptFinancialBackup, generateFinancialBackupKey } = await import('../sync/financial-backup')
  await runtime.enrollVerifiedCentralIdentity(actor, displayId)
  const key = generateFinancialBackupKey()
  const { emptyPartyDetails } = await import('../demo/master-model')
  const current = { ...emptyDeviceLocalSnapshot(), companies: [demoCompany] }
  const oldCompany = { id: 'archived-shop', name: 'Archived shop' }
  const archivedItem = { id: 'archived-item', company: oldCompany.id, name: 'Archived item', unit: 'pc', code: '', default_rate: null }
  const party = { ...emptyPartyDetails, id: 'archived-customer', company: oldCompany.id, name: 'Customer', kind: 'customer' as const, receivable: '0', payable: '0' }
  const entry = {
    id: 'archived-sale', company: oldCompany.id, party_id: party.id, party_name: party.name,
    kind: 'sale' as const, effective_date: '2026-10-25', amount_minor: '10000',
    debit_account: 'receivable' as const, credit_account: 'sales' as const, reference: '', note: '', reversed: false,
  }
  const archived = { ...emptyDeviceLocalSnapshot(), companies: [oldCompany], items: [archivedItem], parties: [party], entries: [entry] }
  await runtime.restoreNativeFinancialBackup(await encryptFinancialBackup(actor, current, key), actor, key)
  const archive = await encryptFinancialBackup(actor, archived, key)
  fixture.outbox.set(actor + ':' + oldCompany.id, 'pending')
  await expect(runtime.restoreNativeFinancialBackup(archive, actor, key)).rejects.toThrow('FINANCIAL_RESTORE_PENDING_CHANGES')
  expect(fixture.state).toEqual(current)
  fixture.outbox.delete(actor + ':' + oldCompany.id)
  fixture.outbox.set(actor + ':' + demoCompany.id, 'pending')
  await runtime.restoreNativeFinancialBackup(archive, actor, key)
  await runtime.restoreNativeFinancialBackup(archive, actor, key)
  expect(fixture.outbox.get(actor + ':' + demoCompany.id)).toBe('pending')
  expect(fixture.state.companies).toEqual([demoCompany, oldCompany])
  expect(fixture.state.items).toEqual([archivedItem])
  expect(fixture.state.entries).toEqual([entry])
})

it('rejects an older backup that contains a locally deleted master', async () => {
  const runtime = await import('./runtime')
  const { encryptFinancialBackup, generateFinancialBackupKey } = await import('../sync/financial-backup')
  await runtime.enrollVerifiedCentralIdentity(actor, displayId)
  const key = generateFinancialBackupKey()
  const item = { id: 'old-item', company: demoCompany.id, name: 'Old item', unit: 'pc', code: '', default_rate: null }
  const current = {
    ...emptyDeviceLocalSnapshot(), companies: [demoCompany],
    deletedMasters: [{ company: item.company, id: item.id, kind: 'item' as const }],
  }
  const older = { ...emptyDeviceLocalSnapshot(), companies: [demoCompany], items: [item] }
  await runtime.restoreNativeFinancialBackup(await encryptFinancialBackup(actor, current, key), actor, key)
  const archive = await encryptFinancialBackup(actor, older, key)
  await expect(runtime.restoreNativeFinancialBackup(archive, actor, key))
    .rejects.toThrow('FINANCIAL_RESTORE_DELETED_MASTER_CONFLICT')
  expect(fixture.state).toEqual(current)
})

it('reads the device backup key after restart only for its unlocked owner', async () => {
  const runtime = await import('./runtime')
  const key = 'ab'.repeat(32)
  await runtime.enrollVerifiedCentralIdentity(actor, displayId)
  await expect(runtime.readNativeDriveRecoveryKey(actor)).resolves.toBeNull()
  await expect(runtime.saveNativeDriveRecoveryKey(actor, 'invalid')).rejects.toThrow('FINANCIAL_BACKUP_KEY_INVALID')
  await runtime.saveNativeDriveRecoveryKey(actor, key)
  expect(JSON.stringify(localStorage)).not.toContain(key)
  vi.resetModules()
  const restarted = await import('./runtime')
  await expect(restarted.readNativeDriveRecoveryKey(actor)).rejects.toThrow('ANDROID_LOCAL_UNLOCK_REQUIRED')
  await restarted.restoreNativeOfflineIdentity()
  await expect(restarted.readNativeDriveRecoveryKey(actor)).resolves.toBe(key)
  await expect(restarted.readNativeDriveRecoveryKey('other')).rejects.toThrow('ANDROID_LOCAL_ACTOR_CHANGED')
  await expect(restarted.saveNativeDriveRecoveryKey('other', key)).rejects.toThrow('ANDROID_LOCAL_ACTOR_CHANGED')
})

it('reads the unlocked company list without writing to the encrypted journal', async () => {
  const runtime = await import('./runtime')
  await runtime.enrollVerifiedCentralIdentity(actor, displayId)
  fixture.request.mockResolvedValue([{ id: 'local-shop', name: 'Local shop' }])
  await expect(runtime.readNativeCompaniesForComparison('other')).rejects.toThrow('ANDROID_LOCAL_ACTOR_CHANGED')
  await expect(runtime.readNativeCompaniesForComparison(actor)).resolves.toEqual([{ id: 'local-shop', name: 'Local shop' }])
  expect(fixture.request).toHaveBeenCalledExactlyOnceWith('companies', {})
  expect(fixture.journal).not.toHaveBeenCalled()
})

it('updates a linked company in durable storage without duplicating it or overwriting a local edit', async () => {
  const runtime = await import('./runtime')
  await runtime.enrollVerifiedCentralIdentity(actor, displayId)
  const company = demoCompany.id
  const archive = {
    ...emptyDeviceLocalSnapshot(),
    actor, company: demoCompany, settings: null, unsupported: false,
    expenseProfiles: null, productionRoutes: {}, balances: {},
  }
  await expect(runtime.readNativeSyncCompanies(actor)).resolves.toEqual([])
  await runtime.importNativeCompany(actor, company, archive)
  await expect(runtime.readNativeSyncCompanies(actor)).resolves.toEqual([demoCompany])
  const updated = { ...archive, company: { ...demoCompany, name: 'Updated on web' } }
  await expect(runtime.syncNativeCompany(actor, company, updated)).resolves.toMatchObject({ changed: true })

  vi.resetModules()
  const restarted = await import('./runtime')
  await restarted.restoreNativeOfflineIdentity()
  expect(fixture.state.companies).toEqual([updated.company])
  await expect(restarted.syncNativeCompany(actor, company, updated)).resolves.toMatchObject({ changed: false })
  fixture.request.mockImplementationOnce(async () => {
    fixture.state.companies[0].name = 'Edited on Android'
  })
  await restarted.nativeLocalRequest('create', { table: 'khata_companies', row: { id: company } })
  await expect(restarted.syncNativeCompany(actor, company, updated)).rejects.toThrow('KHATA_COMPANY_SYNC_CONFLICT')
  expect(fixture.state.companies[0].name).toBe('Edited on Android')
})

async function legacyCompanyFixture() {
  const runtime = await import('./runtime')
  const { mergeCompanyExport, parseCompanyExport } = await import('../sync/company-transfer')
  const { defaultSettings } = await import('../accounting/workspace-contract')
  const { emptyPartyDetails } = await import('../demo/master-model')
  const { encryptFinancialBackup, generateFinancialBackupKey } = await import('../sync/financial-backup')
  await runtime.enrollVerifiedCentralIdentity(actor, displayId)
  const company = { id: 'arko', name: 'Arko' }
  const deepa = { id: 'deepa', name: 'Deepa' }
  const supplier = { ...emptyPartyDetails, id: 'supplier', company: company.id, name: 'Supplier', kind: 'supplier' as const, receivable: '0', payable: '0' }
  const customer = { ...supplier, id: 'customer', kind: 'customer' as const, name: 'Customer' }
  const purchase = { id: 'purchase', company: company.id, party_id: supplier.id, party_name: supplier.name, kind: 'purchase', effective_date: '2026-11-16', amount_minor: '100000', debit_account: 'purchases', credit_account: 'payable', reference: '1', note: '', reversed: false }
  const payment = { ...purchase, id: 'payment', kind: 'payment', amount_minor: '50000', debit_account: 'payable', credit_account: 'cash' }
  const sale = { ...purchase, id: 'sale', party_id: customer.id, party_name: customer.name, kind: 'sale', debit_account: 'receivable', credit_account: 'sales' }
  const receipt = { ...sale, id: 'receipt', kind: 'receipt', amount_minor: '60000', debit_account: 'cash', credit_account: 'receivable' }
  const settings = defaultSettings()
  const counter = 'arko:sale:2026'
  const first = {
    ...emptyDeviceLocalSnapshot(), actor, company, settings, unsupported: false, expenseProfiles: null, productionRoutes: {},
    parties: [supplier], items: [{ id: 'old-item', company: company.id, name: 'Old item', unit: 'pc', code: '', default_rate: '0' }],
    entries: [purchase, payment], fiscalCounters: { [counter]: '1' },
    balances: { purchases: '100000', payable: '-50000', cash: '-50000' },
  }
  const local = { ...emptyDeviceLocalSnapshot(), companies: [deepa] }
  const legacy = mergeCompanyExport(local, parseCompanyExport(first, company.id, actor))
  const key = generateFinancialBackupKey()
  await runtime.restoreNativeFinancialBackup(await encryptFinancialBackup(actor, legacy, key), actor, key)
  const web = {
    ...first, entries: [...first.entries, sale, receipt], parties: [supplier, customer],
    items: [...first.items, { id: 'item', company: company.id, name: 'Item', unit: 'pc', code: '', default_rate: '0' }],
    paymentLinks: { receipt: { bill: sale.id, account: 'cash' } },
    settings: { ...settings, next: { ...settings.next, sale: '2' } }, fiscalCounters: { [counter]: '2' },
    balances: { ...first.balances, sales: '-100000', receivable: '40000', cash: '10000' },
  }
  return { runtime, company, deepa, legacy, web }
}

it('syncs a pre-baseline Arko import after a Web sale, receipt and numbering advance', async () => {
  const { runtime, company, deepa, web } = await legacyCompanyFixture()
  await expect(runtime.syncNativeCompany(actor, company.id, web)).resolves.toMatchObject({ changed: true })
  expect(fixture.state.companies).toEqual([deepa, company])
  expect(fixture.state.parties).toHaveLength(2)
  expect(fixture.state.items).toHaveLength(2)
  expect(fixture.state.entries.map(row => row.id)).toEqual(['purchase', 'payment', 'sale', 'receipt'])
  expect(fixture.state.paymentLinks.receipt.bill).toBe('sale')
  const { checkImportedLedger } = await import('../demo/store')
  expect(() => checkImportedLedger(fixture.state, company.id, web.balances)).not.toThrow()
  await expect(runtime.syncNativeCompany(actor, company.id, web)).resolves.toMatchObject({ changed: false })
})

it('blocks queued local work but ignores acknowledgements and other companies outbox rows', async () => {
  const { runtime, company, deepa, legacy, web } = await legacyCompanyFixture()
  const key = actor + ':' + company.id
  fixture.outbox.set(actor + ':' + deepa.id, 'queued')
  fixture.outbox.set(key, 'queued')
  await expect(runtime.syncNativeCompany(actor, company.id, web)).rejects.toMatchObject({ reason: 'PENDING_LOCAL_OUTBOX' })
  expect(fixture.state).toEqual(legacy)
  expect(fixture.outbox.get(key)).toBe('queued')
  fixture.outbox.set(key, 'synced')
  await expect(runtime.syncNativeCompany(actor, company.id, web)).resolves.toMatchObject({ changed: true })
})

it('rejects existing Web record changes on a legacy import and accepts them after establishing a baseline', async () => {
  const { runtime, company, legacy, web } = await legacyCompanyFixture()
  const changed = { ...web, entries: web.entries.map(row => row.id === 'purchase' ? { ...row, note: 'Web correction' } : row) }
  await expect(runtime.syncNativeCompany(actor, company.id, changed)).rejects.toMatchObject({ reason: 'LEGACY_RECORD_MISMATCH' })
  expect(fixture.state).toEqual(legacy)
  await runtime.syncNativeCompany(actor, company.id, web)
  await expect(runtime.syncNativeCompany(actor, company.id, changed)).resolves.toMatchObject({ changed: true })
})

it('rejects foreign scope, bad balances and interrupted snapshot writes without changing durable books', async () => {
  const { runtime, company, legacy, web } = await legacyCompanyFixture()
  const disk = new Map(fixture.rows)
  await expect(runtime.syncNativeCompany('other-owner', company.id, web)).rejects.toThrow('ANDROID_LOCAL_ACTOR_CHANGED')
  await expect(runtime.syncNativeCompany(actor, 'deepa', web)).rejects.toThrow('EXPORT_INVALID')
  await expect(runtime.syncNativeCompany(actor, company.id, { ...web, balances: { ...web.balances, cash: '0' } })).rejects.toThrow('LEDGER_MISMATCH')
  fixture.failManifest.mockImplementationOnce(() => { throw new Error('test SQLite write failure') })
  await expect(runtime.syncNativeCompany(actor, company.id, web)).rejects.toThrow('test SQLite write failure')
  expect(fixture.state).toEqual(legacy)
  expect(fixture.rows).toEqual(disk)
  vi.resetModules()
  const restarted = await import('./runtime')
  await restarted.restoreNativeOfflineIdentity()
  expect(fixture.state).toEqual(legacy)
})

it('persists Lottery imports atomically and leaves the old snapshot intact if saving fails', async () => {
  const runtime = await import('./runtime')
  const { runLottery } = await import('../lottery/service')
  await runtime.enrollVerifiedCentralIdentity(actor, displayId)
  const created = await runLottery({}, { method: 'createOrganization', payload: { name: 'Synthetic Lottery' }, operationId: crypto.randomUUID() }, actor)
  const payload = { actor, version: 1, state: created.state }
  const before = structuredClone(fixture.state)
  fixture.failManifest.mockImplementationOnce(() => { throw new Error('storage unavailable') })
  await expect(runtime.syncNativeLottery(actor, payload)).rejects.toThrow('storage unavailable')
  expect(fixture.state).toEqual(before)
  expect(await runtime.readNativeLotterySyncState(actor)).toEqual({ linked: false, organizations: [] })
  await expect(runtime.syncNativeLottery(actor, payload)).resolves.toEqual({ changed: true })
  await expect(runtime.syncNativeLottery(actor, payload)).resolves.toEqual({ changed: false })
  expect((await runtime.readNativeLotterySyncState(actor)).linked).toBe(true)
  await expect(runtime.syncNativeLottery('other', payload)).rejects.toThrow('ANDROID_LOCAL_ACTOR_CHANGED')
})

it('persists customer statements in encrypted local storage before acknowledgement and isolates actors',async()=>{
 const runtime=await import('./runtime')
 await runtime.enrollVerifiedCentralIdentity(actor,displayId)
 expect(await runtime.readNativeStatementRelay(actor)).toBeNull()
 const value={version:1,links:{synthetic:{revision:1,dataset:{scope:{company:'Synthetic'},rows:[]}}}}
 await runtime.saveNativeStatementRelay(actor,value)
 expect(await runtime.readNativeStatementRelay(actor)).toEqual(value)
 await expect(runtime.readNativeStatementRelay('other')).rejects.toThrow('ANDROID_LOCAL_ACTOR_CHANGED')
 await expect(runtime.saveNativeStatementRelay('other',value)).rejects.toThrow('ANDROID_LOCAL_ACTOR_CHANGED')
 vi.resetModules();fixture.state=emptyDeviceLocalSnapshot()
 const reopened=await import('./runtime');await reopened.restoreNativeOfflineIdentity()
 expect(await reopened.readNativeStatementRelay(actor)).toEqual(value)
 reopened.lockNativeOfflineIdentity()
 await expect(reopened.readNativeStatementRelay(actor)).rejects.toThrow('ANDROID_LOCAL_UNLOCK_REQUIRED')
})


it('requires the active native account for Daily Ledger export, verification and restore', async () => {
  const runtime = await import('./runtime')
  const { generateFinancialBackupKey } = await import('../sync/financial-backup')
  const key = generateFinancialBackupKey()
  await runtime.enrollVerifiedCentralIdentity(actor, displayId)
  const archive = await runtime.exportNativeDailyLedgerBackup(actor, key)
  await expect(runtime.verifyNativeDailyLedgerBackup(actor, archive, key)).resolves.toMatchObject({
    scope: { orbisIdentityId: actor, scopeId: actor, scopeKind: 'personal_ledger' },
  })
  await expect(runtime.restoreNativeDailyLedgerBackup(actor, archive, key)).resolves.toEqual({
    inserted: 0, alreadyPresent: 0,
  })
  const other = '11111111-1111-7111-8111-111111111111'
  await expect(runtime.exportNativeDailyLedgerBackup(other, key)).rejects.toThrow('ANDROID_LOCAL_ACTOR_CHANGED')
  await expect(runtime.verifyNativeDailyLedgerBackup(other, archive, key)).rejects.toThrow('ANDROID_LOCAL_ACTOR_CHANGED')
  await expect(runtime.restoreNativeDailyLedgerBackup(other, archive, key)).rejects.toThrow('ANDROID_LOCAL_ACTOR_CHANGED')
})
