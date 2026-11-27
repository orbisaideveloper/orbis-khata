import { normalize, post, type Entry } from '../../src/daily-ledger/journal'
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
  const reversed = new Set<string>()

  return {
    async list() {
      return structuredClone([...entries.values()].reverse().sort((a, b) => b.command.date.localeCompare(a.command.date)))
    },
    async save(input): Promise<Entry> {
      const command = normalize(input)
      const existing = entries.get(command.id)
      if (existing) {
        if (JSON.stringify(existing.command) !== JSON.stringify(command)) throw new Error('DAILY_ID_CONFLICT')
        return structuredClone(existing)
      }
      const originalId = command.kind === 'reversal' ? command.originalId : undefined
      if (originalId && reversed.has(originalId)) throw new Error('DAILY_REVERSAL_INVALID')
      const entry = post(command, originalId ? entries.get(originalId) : undefined)
      entries.set(command.id, entry)
      if (originalId) reversed.add(originalId)
      return structuredClone(entry)
    },
  }
}
