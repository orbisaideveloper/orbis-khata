import type { Entry } from './journal'

/** The local share contains daily totals only. No IDs, notes or names leave the ledger. */
export function monthlyReport(entries: readonly Entry[], asOf: string) {
  const month = asOf.slice(0, 7)
  const days = new Map<string, { cash: bigint; bank: bigint; income: bigint; expense: bigint }>()
  for (const { command, postings } of entries) {
    if (command.date.slice(0, 7) !== month || command.date > asOf || !postings.length) continue
    const row = days.get(command.date) ?? { cash: 0n, bank: 0n, income: 0n, expense: 0n }
    for (const { account, delta } of postings) {
      if (account === 'cash' || account === 'bank' || account === 'expense') row[account] += BigInt(delta)
      if (account === 'income') row.income -= BigInt(delta)
    }
    days.set(command.date, row)
  }
  const csv = ['date,cash_change_paise,bank_change_paise,income_paise,expense_paise']
  for (const date of [...days.keys()].sort((a, b) => a.localeCompare(b))) {
    const row = days.get(date)!
    csv.push([date, row.cash, row.bank, row.income, row.expense].join(','))
  }
  return new File([csv.join('\r\n') + '\r\n'], 'daily-ledger-' + month + '.csv', { type: 'text/csv' })
}
