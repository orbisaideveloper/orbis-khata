import { expect, it } from 'vitest'
import { emptyDeviceLocalSnapshot } from '../demo/store'
import { emptyPartyDetails } from '../demo/master-model'
import { restoreSelectedBackupPostings, selectableBackupPostings } from './selected-backup-restore'

const company = { id: 'company', name: 'Company' }
const party = { ...emptyPartyDetails, id: 'party', company: company.id, kind: 'customer' as const, name: 'Customer', receivable: '0', payable: '0' }
const item = { id: 'item', company: company.id, code: '', name: 'Item', unit: 'pc', default_rate: null }
const warehouse = { id: 'warehouse', company: company.id, code: '', name: 'Store' }
const sale = {
  id: 'sale', company: company.id, party_id: party.id, party_name: party.name, kind: 'sale' as const,
  debit_account: 'receivable' as const, credit_account: 'sales' as const, effective_date: '2026-10-25',
  amount_minor: '100', reference: 'SALE-1', note: '', reversed: false,
}
const bill = {
  id: sale.id, company: company.id, kind: 'sale' as const, party: party.id, date: sale.effective_date,
  code: '', name: '', unit: '', reference: sale.reference, note: '', total: '100', reversed: false, party_name: party.name,
  lines: [{ item: item.id, warehouse: warehouse.id, to: null, quantity: '1000000', rate: '100' }],
}

it('adds the selected old bill and stock document together and prevents duplicates', () => {
  const current = { ...emptyDeviceLocalSnapshot(), companies: [company], parties: [party], warehouses: [warehouse], items: [item] }
  const archive = { ...current, entries: [sale], documents: [bill] }
  const result = restoreSelectedBackupPostings(current, archive, [sale.id])
  expect(result.entries).toEqual([sale])
  expect(result.documents).toEqual([bill])
  expect(selectableBackupPostings(result, archive).size).toBe(0)
  expect(current.entries).toEqual([])
})

it('offers a standalone posting but rejects a reversed or linked posting and a deleted master', () => {
  const current = { ...emptyDeviceLocalSnapshot(), companies: [company], parties: [party] }
  const archived = { ...current, entries: [sale] }
  expect(selectableBackupPostings(current, archived).has(sale.id)).toBe(true)
  const reversed = { ...archived, entries: [sale, { ...sale, id: 'reversal', reverses_id: sale.id }] }
  const linked = { ...archived, paymentLinks: { [sale.id]: { bill: null, account: 'cash' } } }
  for (const copy of [reversed, linked]) {
    expect(() => restoreSelectedBackupPostings(current, copy, [sale.id])).toThrow('FINANCIAL_RESTORE_SELECTION_CONFLICT')
  }
  const deleted = { ...current, deletedMasters: [{ company: company.id, kind: 'party' as const, id: party.id }] }
  expect(selectableBackupPostings(deleted, archived).size).toBe(0)
})
