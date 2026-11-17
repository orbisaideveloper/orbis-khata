import { expenseCommand } from '../accounting/expense-model'
import { validSettings } from '../accounting/workspace-contract'
import type { DeviceLocalSnapshot } from '../demo/store'

const serialPattern = /^[1-9]\d{0,8}$/u

type Snapshot = DeviceLocalSnapshot
type CompanyExport = Pick<Snapshot, 'parties' | 'entries' | 'expenses' | 'expenseBillLines' | 'documents' | 'reversals' | 'items' | 'warehouses' | 'paymentLinks' | 'fiscalCounters'> & {
  actor: string
  balances: Record<string, string>
  version: 1
  company: Snapshot['companies'][number]
  settings: Snapshot['workspaceSettings'][string] | null
  unsupported: boolean
  expenseProfiles: unknown
  productionRoutes: Record<string, { input: string }>
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function invalid(): never { throw new Error('KHATA_COMPANY_EXPORT_INVALID') }

function ownedRows(value: unknown, company: string): boolean {
  return Array.isArray(value) && value.every(row => record(row) && row.company === company && typeof row.id === 'string')
}

export function parseCompanyExport(value: unknown, company: string, actor: string): CompanyExport {
  if (!record(value) || value.version !== 1 || value.actor !== actor || !record(value.company) ||
      value.company.id !== company || typeof value.company.name !== 'string') invalid()
  if (value.unsupported === true) throw new Error('KHATA_COMPANY_EXPORT_UNSUPPORTED')
  if (value.unsupported !== false || ![value.parties, value.entries, value.documents, value.expenses, value.items, value.warehouses]
      .every(rows => ownedRows(rows, company))) invalid()
  if (![value.expenseBillLines, value.paymentLinks, value.fiscalCounters, value.productionRoutes].every(record) ||
      (value.settings !== null && !validSettings(value.settings)) ||
      !Array.isArray(value.reversals) || !value.reversals.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(x => typeof x === 'string'))) invalid()

  if (!record(value.balances) || !Object.values(value.balances).every(amount => typeof amount === 'string' && /^-?\d+$/u.test(amount))) invalid()
  const data = value as unknown as CompanyExport
  const parties = new Set(data.parties.map(row => row.id))
  const documents = new Set(data.documents.map(row => row.id))
  const names = new Set(data.entries.map(row => row.id))
  if (!data.entries.every(row => parties.has(row.party_id) && typeof row.amount_minor === 'string' &&
      /^\d+$/u.test(row.amount_minor) && (!row.reverses_id || names.has(row.reverses_id))) ||
      !data.expenses.every(row => expenseCommand(row)) ||
      !data.documents.every(row => Array.isArray(row.lines) && typeof row.total === 'string') ||
      !Object.entries(data.paymentLinks).every(([id, link]) => names.has(id) && record(link) &&
        typeof link.account === 'string' && (link.bill === null || names.has(link.bill) || documents.has(link.bill))) ||
      !data.reversals.every(([id]) => documents.has(id)) ||
      !Object.entries(data.productionRoutes).every(([id, route]) => documents.has(id) && record(route) && documents.has(route.input)) ||
      !Object.entries(data.fiscalCounters).every(([key, value]) => key.startsWith(company + ':') && typeof value === 'string' && serialPattern.test(value))) invalid()
  return data
}

function append<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const ids = new Set(current.map(row => row.id))
  for (const row of incoming) {
    if (ids.has(row.id)) throw new Error('KHATA_COMPANY_IMPORT_CONFLICT')
    ids.add(row.id)
  }
  return [...current, ...incoming]
}

function addRecords<T>(current: Record<string, T>, incoming: Record<string, T>): Record<string, T> {
  if (Object.keys(incoming).some(key => Object.hasOwn(current, key))) throw new Error('KHATA_COMPANY_IMPORT_CONFLICT')
  return { ...current, ...incoming }
}

export function mergeCompanyExport(current: Snapshot, incoming: CompanyExport): Snapshot {
  const { company } = incoming
  if (Object.hasOwn(current.retired, company.id)) throw new Error('KHATA_COMPANY_IMPORT_CONFLICT')
  const events: Snapshot['workspaceEvents'] = {}
  if (incoming.expenseProfiles !== null) events['expense-profiles:' + company.id] = { payload: '', result: incoming.expenseProfiles }
  for (const [id, route] of Object.entries(incoming.productionRoutes)) {
    events['production-route:' + id] = { payload: '', result: route }
  }
  const reversals = addRecords(Object.fromEntries(current.reversals), Object.fromEntries(incoming.reversals))
  return {
    ...current,
    companies: append(current.companies, [company]),
    parties: append(current.parties, incoming.parties),
    entries: append(current.entries, incoming.entries),
    expenses: append(current.expenses, incoming.expenses),
    documents: append(current.documents, incoming.documents),
    items: append(current.items, incoming.items),
    warehouses: append(current.warehouses, incoming.warehouses),
    reversals: Object.entries(reversals),
    expenseBillLines: addRecords(current.expenseBillLines, incoming.expenseBillLines),
    paymentLinks: addRecords(current.paymentLinks, incoming.paymentLinks),
    fiscalCounters: addRecords(current.fiscalCounters, incoming.fiscalCounters),
    workspaceSettings: addRecords(current.workspaceSettings, incoming.settings ? { [company.id]: incoming.settings } : {}),
    workspaceEvents: addRecords(current.workspaceEvents, events),
  }
}

export const companySyncKey = (id: string) => 'web-company-sync:' + id

export function companySyncState(snapshot: Snapshot, company: string) {
  const result = snapshot.workspaceEvents[companySyncKey(company)]?.result
  if (record(result) && typeof result.digest === 'string' && typeof result.syncedAt === 'string') {
    return { digest: result.digest, syncedAt: result.syncedAt }
  }
}

function companyRows(snapshot: Snapshot, company: string) {
  const owned = <T extends { company: string }>(rows: T[]) => rows.filter(row => row.company === company)
  return {
    companies: snapshot.companies.filter(row => row.id === company),
    parties: owned(snapshot.parties), entries: owned(snapshot.entries), expenses: owned(snapshot.expenses),
    documents: owned(snapshot.documents), items: owned(snapshot.items), warehouses: owned(snapshot.warehouses),
  }
}

function companyRecords(snapshot: Snapshot, company: string, rows: ReturnType<typeof companyRows>) {
  const pick = <T,>(values: Record<string, T>, keys: string[]) =>
    Object.fromEntries(keys.filter(key => Object.hasOwn(values, key)).map(key => [key, values[key]]))
  return {
    reversals: pick(Object.fromEntries(snapshot.reversals), rows.documents.map(row => row.id)),
    expenseBillLines: pick(snapshot.expenseBillLines, rows.expenses.map(row => row.id)),
    paymentLinks: pick(snapshot.paymentLinks, rows.entries.map(row => row.id)),
    fiscalCounters: pick(snapshot.fiscalCounters, Object.keys(snapshot.fiscalCounters).filter(key => key.startsWith(company + ':'))),
    workspaceSettings: pick(snapshot.workspaceSettings, [company]),
    workspaceEvents: pick(snapshot.workspaceEvents, ['expense-profiles:' + company,
      ...rows.documents.map(row => 'production-route:' + row.id)]),
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (record(value)) {
    // Keep UTF-16 key order so persisted sync digests remain valid across locales.
    const keys = Object.keys(value).sort((left, right) => Number(left > right) - Number(left < right))
    return '{' + keys.map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}'
  }
  return JSON.stringify(value) ?? 'null'
}

export function companyProjection(snapshot: Snapshot, company: string): Record<string, Record<string, unknown>> {
  const rows = companyRows(snapshot, company)
  const collections = Object.fromEntries(Object.entries(rows).map(([key, list]) =>
    [key, Object.fromEntries(list.map(row => [row.id, row]))]))
  return { ...collections, ...companyRecords(snapshot, company, rows) }
}

export function companyProjectionText(projection: ReturnType<typeof companyProjection>): string {
  return stable(projection)
}

type Projection = ReturnType<typeof companyProjection>

function serialAdvanced(before: unknown, after: unknown): boolean {
  return typeof before === 'string' && typeof after === 'string' && serialPattern.test(before) &&
    serialPattern.test(after) && Number(after) > Number(before)
}

function numberingAdvanced(company: string, before: unknown, after: unknown, remote: Projection): boolean {
  if (!validSettings(before) || !validSettings(after)) return false
  if (stable({ ...before, next: null }) !== stable({ ...after, next: null })) return false
  if (Object.keys(before.next).length !== Object.keys(after.next).length) return false
  const counters = Object.entries(remote.fiscalCounters)
  return Object.entries(before.next).every(([kind, previous]) => {
    const current = after.next[kind as keyof typeof after.next]
    return previous === current || (serialAdvanced(previous, current) &&
      counters.some(([key, value]) => key.startsWith(company + ':' + kind + ':') && value === current))
  })
}

function legacyRecordCompatible(family: string, id: string, before: unknown, remote: Projection): boolean {
  const records = remote[family]
  if (!Object.hasOwn(records, id)) return false
  const after = records[id]
  if (stable(before) === stable(after)) return true
  if (family === 'fiscalCounters') return serialAdvanced(before, after)
  return family === 'workspaceSettings' && numberingAdvanced(id, before, after, remote)
}

/** A legacy import lacks a digest. Financial rows and all non-numbering settings must still match. */
export function isUnchangedCompanySubset(local: Projection, remote: Projection): boolean {
  return Object.entries(local).every(([family, values]) =>
    Object.entries(values).every(([id, value]) => legacyRecordCompatible(family, id, value, remote)))
}

export type CompanyConflictReason = 'PENDING_LOCAL_OUTBOX' | 'LOCAL_BASELINE_MISMATCH' | 'LEGACY_RECORD_MISMATCH' | 'COMPANY_NOT_FOUND'

export class CompanySyncConflict extends Error {
  readonly reason: CompanyConflictReason

  constructor(reason: CompanyConflictReason) {
    super('KHATA_COMPANY_SYNC_CONFLICT')
    this.reason = reason
  }
}

export function withoutCompanyProjection(snapshot: Snapshot, company: string): Snapshot {
  const rows = companyRows(snapshot, company)
  const records = companyRecords(snapshot, company, rows)
  const exclude = <T,>(all: Record<string, T>, removed: object) =>
    Object.fromEntries(Object.entries(all).filter(([key]) => !Object.hasOwn(removed, key)))
  const other = <T extends { company: string }>(all: T[]) => all.filter(row => row.company !== company)
  return {
    ...snapshot, companies: snapshot.companies.filter(row => row.id !== company),
    parties: other(snapshot.parties), entries: other(snapshot.entries), expenses: other(snapshot.expenses),
    documents: other(snapshot.documents), items: other(snapshot.items), warehouses: other(snapshot.warehouses),
    reversals: snapshot.reversals.filter(([id]) => !Object.hasOwn(records.reversals, id)),
    expenseBillLines: exclude(snapshot.expenseBillLines, records.expenseBillLines),
    paymentLinks: exclude(snapshot.paymentLinks, records.paymentLinks),
    fiscalCounters: exclude(snapshot.fiscalCounters, records.fiscalCounters),
    workspaceSettings: exclude(snapshot.workspaceSettings, records.workspaceSettings),
    workspaceEvents: exclude(snapshot.workspaceEvents, records.workspaceEvents),
  }
}

/** Add complete, independent companies. Existing ledgers must match exactly. */
export function mergeBackupCompanies(current: Snapshot, archive: Snapshot, actor: string): Snapshot {
  const conflict = () => { throw new Error('FINANCIAL_RESTORE_COMPANY_CONFLICT') }
  for (const company of archive.companies) {
    if (Object.hasOwn(current.retired, company.id) || Object.hasOwn(archive.retired, company.id)) conflict()
    const existing = current.companies.some(row => row.id === company.id)
    if (existing) {
      if (stable(companyProjection(current, company.id)) !== stable(companyProjection(archive, company.id))) conflict()
      continue
    }
    const rows = companyRows(archive, company.id)
    const records = companyRecords(archive, company.id, rows)
    const parties = new Set(rows.parties.map(row => row.id))
    const items = new Set(rows.items.map(row => row.id))
    const warehouses = new Set(rows.warehouses.map(row => row.id))
    if (!rows.documents.every(row => (!row.party || parties.has(row.party)) && Array.isArray(row.lines) &&
      row.lines.every(line => items.has(line.item) && warehouses.has(line.warehouse) && (!line.to || warehouses.has(line.to))))) conflict()
    parseCompanyExport({
      ...rows, ...records, actor, company, version: 1, unsupported: false, balances: {},
      settings: archive.workspaceSettings[company.id] ?? null, expenseProfiles: null, productionRoutes: {},
      reversals: Object.entries(records.reversals),
    }, company.id, actor)
  }
  function union<T>(before: Record<string, T>, after: Record<string, T>): Record<string, T> {
    for (const [id, value] of Object.entries(after)) {
      if (Object.hasOwn(before, id) && stable(before[id]) !== stable(value)) conflict()
    }
    return { ...after, ...before }
  }
  function unionRows<T extends { id: string }>(before: T[], after: T[]): T[] {
    const byId = (rows: T[]) => Object.fromEntries(rows.map(row => [row.id, row]))
    const indexed = byId(after)
    if (Object.keys(indexed).length !== after.length) conflict()
    const merged = union(byId(before), indexed)
    const previous = new Set(before.map(row => row.id))
    return [...before, ...after.filter(row => !previous.has(row.id)).map(row => merged[row.id])]
  }
  const companies = new Set(archive.companies.map(row => row.id))
  const owned = (rows: { company: string }[]) => rows.every(row => companies.has(row.company))
  if (![archive.parties, archive.entries, archive.expenses, archive.documents, archive.items, archive.warehouses].every(owned)) conflict()
  const archivedEntries = new Set(archive.entries.map(row => row.id))
  const archivedExpenses = new Set(archive.expenses.map(row => row.id))
  const archivedDocuments = new Set(archive.documents.map(row => row.id))
  if (!Object.keys(archive.workspaceSettings).every(id => companies.has(id)) ||
      !Object.keys(archive.paymentLinks).every(id => archivedEntries.has(id)) ||
      !Object.keys(archive.expenseBillLines).every(id => archivedExpenses.has(id)) ||
      !archive.reversals.every(([id]) => archivedDocuments.has(id))) conflict()
  const deleted = new Map<string, NonNullable<Snapshot['deletedMasters']>[number]>()
  for (const row of [...(current.deletedMasters ?? []), ...(archive.deletedMasters ?? [])]) {
    deleted.set(stable(row), row)
  }
  const parties = unionRows(current.parties, archive.parties)
  const items = unionRows(current.items, archive.items)
  const masterIds = {
    party: new Set(parties.map(row => stable([row.company, row.id]))),
    item: new Set(items.map(row => stable([row.company, row.id]))),
  }
  if ([...deleted.values()].some(row => masterIds[row.kind].has(stable([row.company, row.id])))) conflict()
  return {
    ...current,
    companies: unionRows(current.companies, archive.companies),
    parties, items,
    entries: unionRows(current.entries, archive.entries),
    expenses: unionRows(current.expenses, archive.expenses),
    documents: unionRows(current.documents, archive.documents),
    warehouses: unionRows(current.warehouses, archive.warehouses),
    reversals: Object.entries(union(Object.fromEntries(current.reversals), Object.fromEntries(archive.reversals))),
    expenseBillLines: union(current.expenseBillLines, archive.expenseBillLines),
    paymentLinks: union(current.paymentLinks, archive.paymentLinks),
    fiscalCounters: union(current.fiscalCounters, archive.fiscalCounters),
    workspaceSettings: union(current.workspaceSettings, archive.workspaceSettings),
    workspaceEvents: union(current.workspaceEvents, archive.workspaceEvents),
    ...(deleted.size ? { deletedMasters: [...deleted.values()] } : {}),
  }
}
