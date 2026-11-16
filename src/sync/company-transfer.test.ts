import { expect, it } from 'vitest'
import { checkImportedLedger, emptyDeviceLocalSnapshot, readDeviceLocalSnapshot } from '../demo/store'
import { emptyPartyDetails } from '../demo/master-model'
import { companyProjection, companyProjectionText, isUnchangedCompanySubset, mergeCompanyExport, parseCompanyExport, withoutCompanyProjection } from './company-transfer'

const company = 'company'
const actor = 'actor'
const party = { ...emptyPartyDetails, id: 'party', company, name: 'Customer', kind: 'customer', receivable: '0', payable: '0' }
const sale = { id: 'sale', company, party_id: party.id, party_name: party.name, kind: 'sale', effective_date: '2026-11-16', amount_minor: '10000', debit_account: 'receivable', credit_account: 'sales', reference: 'S1', note: '', reversed: false }
const payment = { ...sale, id: 'receipt', kind: 'receipt', amount_minor: '3500', debit_account: 'cash', credit_account: 'receivable' }
const archive = {
  ...emptyDeviceLocalSnapshot(),
  actor, company: { id: company, name: 'Web company' }, settings: null, unsupported: false,
  expenseProfiles: null, productionRoutes: {},
  parties: [party], entries: [sale, payment],
  paymentLinks: { receipt: { bill: sale.id, account: 'cash' } },
  balances: { receivable: '6500', cash: '3500', sales: '-10000' },
}

it('imports a company beside existing data and verifies bill and receipt balances', () => {
  const original = { ...emptyDeviceLocalSnapshot(), companies: [{ id: 'phone', name: 'Phone company' }] }
  const before = readDeviceLocalSnapshot()
  const parsed = parseCompanyExport(archive, company, actor)
  const next = mergeCompanyExport(original, parsed)
  checkImportedLedger(next, company, parsed.balances)
  expect(readDeviceLocalSnapshot()).toEqual(before)
  expect(next.companies).toEqual([...original.companies, archive.company])
  expect(next.paymentLinks.receipt.bill).toBe(sale.id)
  expect(original.entries).toEqual([])
  expect(() => mergeCompanyExport(next, parsed)).toThrow('IMPORT_CONFLICT')
  expect(() => checkImportedLedger(next, company, { ...parsed.balances, cash: '0' })).toThrow('LEDGER_MISMATCH')
  expect(readDeviceLocalSnapshot()).toEqual(before)
})

it('rejects a different actor, a foreign record, unsupported payments, and missing linked bills', () => {
  expect(() => parseCompanyExport(archive, company, 'other')).toThrow('EXPORT_INVALID')
  expect(() => parseCompanyExport({ ...archive, parties: [{ ...party, company: 'other' }] }, company, actor)).toThrow('EXPORT_INVALID')
  expect(() => parseCompanyExport({ ...archive, unsupported: true }, company, actor)).toThrow('EXPORT_UNSUPPORTED')
  expect(() => parseCompanyExport({ ...archive, entries: [payment] }, company, actor)).toThrow('EXPORT_INVALID')
})

it('recognizes an unchanged legacy copy and isolates the synchronized company', () => {
  const original = { ...emptyDeviceLocalSnapshot(), companies: [{ id: 'phone', name: 'Phone company' }] }
  const first = mergeCompanyExport(original, parseCompanyExport({
    ...archive, entries: [sale], paymentLinks: {},
  }, company, actor))
  const next = mergeCompanyExport(withoutCompanyProjection(first, company), parseCompanyExport(archive, company, actor))
  expect(isUnchangedCompanySubset(companyProjection(first, company), companyProjection(next, company))).toBe(true)
  expect(next.companies).toEqual([...original.companies, archive.company])
  expect(next.entries.map(entry => entry.id)).toEqual(['sale', 'receipt'])
  first.entries[0] = { ...first.entries[0], note: 'Local edit' }
  expect(isUnchangedCompanySubset(companyProjection(first, company), companyProjection(next, company))).toBe(false)
  expect(companyProjectionText(companyProjection(next, company))).toEqual(
    companyProjectionText(companyProjection({ ...next, entries: [...next.entries].reverse() }, company)))
})
