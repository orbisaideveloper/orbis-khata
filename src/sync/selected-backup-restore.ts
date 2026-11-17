import type { DeviceLocalSnapshot } from '../demo/store'
import { billTotal } from '../inventory/model'

type Entry = DeviceLocalSnapshot['entries'][number]
type Bill = DeviceLocalSnapshot['documents'][number]

/** A selection is one posting and, for a simple bill, its matching stock document. */
export function selectableBackupPostings(current: DeviceLocalSnapshot, archive: DeviceLocalSnapshot) {
  const liveCompanies = new Set(current.companies.filter(row => !Object.hasOwn(current.retired, row.id)).map(row => row.id))
  const localIds = new Set([...current.entries, ...current.documents, ...current.expenses].map(row => row.id))
  const reversed = new Set([...current.entries, ...archive.entries].map(row => row.reverses_id))
  const attached = new Set([...Object.values(current.paymentLinks), ...Object.values(archive.paymentLinks)].map(row => row.bill))
  const bills = new Map(archive.documents.map(row => [row.id, row]))
  const parties = new Map(current.parties.map(row => [row.id, row.company]))
  const items = new Map(current.items.map(row => [row.id, row.company]))
  const warehouses = new Map(current.warehouses.map(row => [row.id, row.company]))
  const references = new Set([...current.entries, ...current.documents].filter(row => row.reference?.trim())
    .map(row => JSON.stringify([row.company, row.reference.trim().toLowerCase()])))
  const deleted = new Set([...(current.deletedMasters ?? []), ...(archive.deletedMasters ?? [])]
    .map(row => JSON.stringify([row.kind, row.company, row.id])))
  const reversedBills = new Set([...archive.reversals, ...current.reversals].map(([id]) => id))
  function eligibleEntry(entry: Entry) {
    const { company, id, kind, party_id: party, amount_minor: amount } = entry
    if (!id || !liveCompanies.has(company) || Object.hasOwn(archive.retired, company) || localIds.has(id) ||
        parties.get(party) !== company || deleted.has(JSON.stringify(['party', company, party])) || entry.reversed || entry.reverses_id || reversed.has(id) ||
        entry.bill_id || entry.settled_minor || attached.has(id) || Object.hasOwn(archive.paymentLinks, id) ||
        Object.hasOwn(current.paymentLinks, id) || typeof amount !== 'string' || !/^[1-9]\d{0,11}$/u.test(amount) ||
        !/^\d{4}-\d{2}-\d{2}$/u.test(entry.effective_date) || typeof entry.reference !== 'string' ||
        references.has(JSON.stringify([company, entry.reference.trim().toLowerCase()]))) return false
    const debit = entry.debit_account
    const credit = entry.credit_account
    return kind === 'sale' && debit === 'receivable' && credit === 'sales' ||
      kind === 'purchase' && debit === 'purchases' && credit === 'payable' ||
      kind === 'receipt' && (debit === 'cash' || debit === 'bank') && credit === 'receivable' ||
      kind === 'payment' && debit === 'payable' && (credit === 'cash' || credit === 'bank')
  }

  function eligibleBill(entry: Entry, bill: Bill) {
    const { company, id, kind, party_id: party, amount_minor: amount } = entry
    if (bill.company !== company || bill.kind !== kind || bill.party !== party || bill.reversed ||
        bill.date !== entry.effective_date || bill.total !== amount || bill.reference !== entry.reference ||
        Object.hasOwn(archive.workspaceEvents, 'production-route:' + id) ||
        reversedBills.has(id) ||
        !Array.isArray(bill.lines) || !bill.lines.length || !bill.lines.every(line =>
          items.get(line.item) === company && !deleted.has(JSON.stringify(['item', company, line.item])) && warehouses.get(line.warehouse) === company && !line.to &&
          /^[1-9]\d*$/u.test(line.quantity) && /^\d+$/u.test(line.rate))) return false
    try {
      const counters = Object.entries(archive.fiscalCounters).filter(([key]) => key.startsWith(company + ':'))
      if (counters.some(([key, counter]) => BigInt(current.fiscalCounters[key] ?? '0') < BigInt(counter))) return false
      return billTotal(bill.lines) + BigInt(bill.roundoff ?? '0') === BigInt(amount)
    } catch {
      return false
    }
  }

  const approved = new Map<string, { entry: Entry; bill?: Bill }>()
  const duplicateIds = new Set<string>()
  const seen = new Set<string>()
  for (const entry of archive.entries) {
    if (seen.has(entry.id)) duplicateIds.add(entry.id)
    seen.add(entry.id)
    if (!eligibleEntry(entry)) continue
    const { id } = entry
    const bill = bills.get(id)
    if (bill && !eligibleBill(entry, bill)) continue
    approved.set(id, { entry, bill })
  }
  for (const id of duplicateIds) approved.delete(id)
  return approved
}

export function restoreSelectedBackupPostings(current: DeviceLocalSnapshot, archive: DeviceLocalSnapshot, ids: string[]) {
  const approved = selectableBackupPostings(current, archive)
  const entries: Entry[] = []
  const documents: Bill[] = []
  const references = new Set<string>()
  for (const id of new Set(ids)) {
    const posting = approved.get(id)
    if (!posting) throw new Error('FINANCIAL_RESTORE_SELECTION_CONFLICT')
    const { entry, bill } = posting
    const reference = entry.reference.trim().toLowerCase()
    const key = JSON.stringify([entry.company, reference])
    if (reference && references.has(key)) throw new Error('FINANCIAL_RESTORE_SELECTION_CONFLICT')
    if (reference) references.add(key)
    entries.push(entry)
    if (bill) documents.push(bill)
  }
  return { ...current, entries: [...current.entries, ...entries], documents: [...current.documents, ...documents] }
}
