import { billDetails } from './household'
import { categories, type Category, type Entry } from './journal'

/** Journal entries arrive newest-first within each day. Latest plan for the month wins. */
export function budgets(entries: readonly Entry[], today: string) {
  const month = today.slice(0, 7)
  const previous = new Date(today + 'T00:00:00Z')
  previous.setUTCDate(0)
  const lastMonth = previous.toISOString().slice(0, 7)
  const originals = new Map(entries.map(entry => [entry.command.id, entry.command]))
  const limits = new Map<Category, bigint>()
  const spent = new Map<Category, bigint>()
  const priorSpent = new Map<Category, bigint>()
  for (const { command, postings } of entries) {
    const period = command.date.slice(0, 7)
    if (command.date > today || (period !== month && period !== lastMonth)) continue
    if (command.kind === 'budget') {
      if (period === month && !limits.has(command.category)) limits.set(command.category, BigInt(command.amountMinor))
      continue
    }
    const source = command.kind === 'reversal' ? originals.get(command.originalId) : command
    const reference = source?.kind === 'billPay' ? originals.get(source.obligationId) : undefined
    const category = source?.kind === 'expense' ? source.category ?? 'other' :
      reference && billDetails(reference, originals)?.category
    if (!category) continue
    const effect = postings.find(row => row.account === 'expense')
    const totals = period === month ? spent : priorSpent
    if (effect) totals.set(category, (totals.get(category) ?? 0n) + BigInt(effect.delta))
  }
  return categories.map(category => {
    const limit = limits.get(category)
    const actual = spent.get(category) ?? 0n
    return { category, limit, actual, previous: priorSpent.get(category) ?? 0n,
      remaining: limit === undefined ? undefined : limit - actual }
  })
}
