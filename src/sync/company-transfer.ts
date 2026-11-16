import { expenseCommand } from '../accounting/expense-model'
import { validSettings } from '../accounting/workspace-contract'
import type { DeviceLocalSnapshot } from '../demo/store'

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
      !Object.keys(data.fiscalCounters).every(key => key.startsWith(company + ':'))) invalid()
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
