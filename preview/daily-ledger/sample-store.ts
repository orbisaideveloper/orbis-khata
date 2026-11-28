import { postHousehold } from '../../src/daily-ledger/household'
import { normalize, post, type Command, type Entry } from '../../src/daily-ledger/journal'
import type { LedgerStore } from '../../src/daily-ledger/ledger-store'

export function createSampleStore(date: string): LedgerStore {
  const header = { version: 1, date, note: '', wallet: 'cash' } as const
  const sampleIncome = normalize({
    ...header,
    id: '00000000-0000-4000-8000-000000000001',
    kind: 'income',
    amountMinor: '240000',
  })
  const sampleExpense = normalize({
    ...header,
    id: '00000000-0000-4000-8000-000000000002',
    kind: 'expense',
    category: 'food',
    amountMinor: '35000',
  })
  const entries = new Map([[sampleIncome.id, post(sampleIncome)], [sampleExpense.id, post(sampleExpense)]])
  const personId = '00000000-0000-4000-8000-000000000003'
  const sample = [
    { ...header, id: personId, kind: 'person', name: 'Sample A' },
    { ...header, id: '00000000-0000-4000-8000-000000000004', kind: 'borrow', personId, amountMinor: '15000' },
    { ...header, id: '00000000-0000-4000-8000-000000000005', kind: 'lend', personId, amountMinor: '15000' },
    { ...header, id: '00000000-0000-4000-8000-000000000006', kind: 'bill', billType: 'electricity',
      amountMinor: '85000', dueDate: date, category: 'home' },
    { ...header, id: '00000000-0000-4000-8000-000000000007', kind: 'billSeries', billType: 'gas',
      amountMinor: '40000', dueDate: date.slice(0, 7) + '-28', category: 'home' },
  ] satisfies Command[]
  const ordered = () => [...entries.values()].reverse().sort((a, b) => b.command.date.localeCompare(a.command.date))
  for (const fixture of sample) entries.set(fixture.id, postHousehold(normalize(fixture), ordered(), date))


  return {
    async list() {
      return structuredClone(ordered())
    },
    async save(input): Promise<Entry> {
      const command = normalize(input)
      const existing = entries.get(command.id)
      if (existing) {
        if (JSON.stringify(existing.command) !== JSON.stringify(command)) throw new Error('DAILY_ID_CONFLICT')
        return structuredClone(existing)
      }
      const originalId = command.kind === 'reversal' ? command.originalId : undefined
      const entry = postHousehold(command, ordered(), date, originalId ? entries.get(originalId) : undefined)
      entries.set(command.id, entry)
      return structuredClone(entry)
    },
  }
}
