import { minor } from '../accounting/model'
import { isMonthlyAnchor, recurringDueDate } from './calendar'

export type Wallet = 'cash' | 'bank'
export const categories = ['food', 'home', 'travel', 'other'] as const
export type Category = typeof categories[number]
export const isCategory = (value: unknown): value is Category => categories.some(category => category === value)
type Account = Wallet | 'income' | 'expense' | 'receivable' | 'payable' | 'openingEquity'
export const billTypes = ['electricity', 'gas', 'rent', 'internet', 'school', 'other'] as const
export type BillType = typeof billTypes[number]
type BillTerms = Readonly<{ billType: BillType; category: Category; dueDate: string; amountMinor: string }>
type Header = Readonly<{ version: 1; id: string; date: string; note: string }>
export type Command = Header & (
  | Readonly<{ kind: 'opening'; wallet: Wallet; amountMinor: string; correctionOf?: string }>
  | Readonly<{ kind: 'income'; wallet: Wallet; amountMinor: string }>
  | Readonly<{ kind: 'expense'; wallet: Wallet; amountMinor: string; category?: Category }>
  | Readonly<{ kind: 'transfer'; from: Wallet; to: Wallet; amountMinor: string }>
  | Readonly<{ kind: 'reversal'; originalId: string }>
  | Readonly<{ kind: 'budget'; category: Category; amountMinor: string }>
  | Readonly<{ kind: 'person'; name: string }>
  | Readonly<{ kind: 'borrow' | 'lend'; personId: string; wallet: Wallet; amountMinor: string; correctionOf?: string }>
  | Readonly<{ kind: 'loanRepay' | 'billPay'; obligationId: string; wallet: Wallet; amountMinor: string; correctionOf?: string }>
  | (Readonly<{ kind: 'bill'; correctionOf?: string }> & BillTerms)
  | (Readonly<{ kind: 'billSeries'; anchorDay?: number }> & BillTerms)
  | Readonly<{ kind: 'billOccurrence'; seriesId: string }>
)
type Posting = Readonly<{ id: string; account: Account; delta: string }>
export type Entry = Readonly<{ command: Command; postings: readonly Posting[] }>

export const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value)
export const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/u.test(date) &&
  Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
const wallet = (value: unknown): value is Wallet => value === 'cash' || value === 'bank'
export const parseAmount = minor

export function normalize(input: Command): Command {
  if (input.version !== 1 || !validId(input.id) || !validDate(input.date) ||
      typeof input.note !== 'string' || input.note.length > 240) throw new Error('DAILY_COMMAND_INVALID')
  const header = { version: 1 as const, id: input.id, date: input.date, note: input.note.trim() }
  if (input.kind === 'reversal') {
    if (!validId(input.originalId) || input.originalId === input.id) throw new Error('DAILY_REVERSAL_INVALID')
    return { ...header, kind: input.kind, originalId: input.originalId }
  }
  const correctionOf = 'correctionOf' in input ? input.correctionOf : undefined
  if (correctionOf !== undefined && (!validId(correctionOf) || correctionOf === input.id)) {
    throw new Error('DAILY_COMMAND_INVALID')
  }
  const correction = correctionOf ? { correctionOf } : {}
  const { kind } = input
  if (kind === 'person' && typeof input.name === 'string') {
    const name = input.name.trim().normalize('NFC')
    if (name.length > 0 && name.length <= 80) return { ...header, kind, name }
  }
  if (kind === 'billOccurrence' && validId(input.seriesId) && input.id !== input.seriesId) {
    return { ...header, kind, seriesId: input.seriesId }
  }
  if (!('amountMinor' in input)) throw new Error('DAILY_COMMAND_INVALID')
  const { amountMinor } = input
  if (typeof amountMinor !== 'string' || !/^[1-9]\d{0,11}$/u.test(amountMinor)) throw new Error('DAILY_AMOUNT_INVALID')
  if (kind === 'transfer' && wallet(input.from) && wallet(input.to) && input.from !== input.to) {
    return { ...header, kind, amountMinor, from: input.from, to: input.to }
  }
  if (kind === 'budget' && isCategory(input.category) && input.date.endsWith('-01')) {
    return { ...header, kind, amountMinor, category: input.category }
  }
  if (kind === 'opening' && wallet(input.wallet)) {
    if (!header.note) throw new Error('DAILY_OPENING_SOURCE_REQUIRED')
    return { ...header, kind, amountMinor, wallet: input.wallet, ...correction }
  }
  if (kind === 'income' && wallet(input.wallet)) return { ...header, kind, amountMinor, wallet: input.wallet }
  if (kind === 'expense' && wallet(input.wallet) && (input.category === undefined || isCategory(input.category))) {
    return { ...header, kind, amountMinor, wallet: input.wallet, ...(input.category && { category: input.category }) }
  }
  if ((kind === 'borrow' || kind === 'lend') && validId(input.personId) && wallet(input.wallet)) {
    return { ...header, kind, amountMinor, personId: input.personId, wallet: input.wallet, ...correction }
  }
  if ((kind === 'loanRepay' || kind === 'billPay') && validId(input.obligationId) && wallet(input.wallet)) {
    return { ...header, kind, amountMinor, obligationId: input.obligationId, wallet: input.wallet, ...correction }
  }
  if ((kind === 'bill' || kind === 'billSeries') && billTypes.includes(input.billType) &&
      isCategory(input.category) && validDate(input.dueDate)) {
    const terms = { amountMinor, billType: input.billType, category: input.category, dueDate: input.dueDate }
    if (kind === 'bill' && input.dueDate >= input.date) return { ...header, kind, ...terms, ...correction }
    if (kind === 'billSeries') {
      const month = input.date.slice(0, 7)
      const anchor = input.anchorDay === undefined ? Number(input.dueDate.slice(8)) : input.anchorDay
      if (isMonthlyAnchor(anchor) && recurringDueDate(month, anchor) === input.dueDate) {
        // Keep legacy serialized commands and their pending-outbox digests byte-for-byte.
        return { ...header, kind, ...terms, ...(input.anchorDay !== undefined && { anchorDay: anchor }) }
      }
    }
  }
  throw new Error('DAILY_COMMAND_INVALID')
}

const child = (id: string, slot: number) => id + ':' + slot
function postCount(command: Command) {
  return command.kind === 'budget' || command.kind === 'person' || command.kind === 'bill' ||
    command.kind === 'billSeries' || command.kind === 'billOccurrence' ? 0 : 2
}

export function envelope(owner: string, command: Command, postingCount = postCount(command)) {
  return { protocolVersion: 1, scopeKind: 'personal_ledger', scopeId: owner, operationId: command.id,
    command, childIds: Array.from({ length: postingCount }, (_, slot) => child(command.id, slot)) }
}

export function post(command: Command, original?: Entry): Entry {
  if (command.kind === 'budget' || command.kind === 'person' || command.kind === 'bill' ||
      command.kind === 'billSeries' || command.kind === 'billOccurrence') return { command, postings: [] }
  if (command.kind === 'reversal') {
    if (!original || original.command.id !== command.originalId ||
        (!original.postings.length && original.command.kind !== 'bill' && original.command.kind !== 'billOccurrence') ||
        original.command.kind === 'reversal' || command.date < original.command.date) throw new Error('DAILY_REVERSAL_INVALID')
    return { command, postings: original.postings.map((row, i) => ({
      id: child(command.id, i), account: row.account, delta: (-BigInt(row.delta)).toString(),
    })) }
  }
  if (command.kind === 'transfer') return pair(command, command.to, command.from, command.amountMinor)
  if (command.kind === 'opening') return pair(command, command.wallet, 'openingEquity', command.amountMinor)
  if (command.kind === 'income') return pair(command, command.wallet, 'income', command.amountMinor)
  if (command.kind === 'expense') return pair(command, 'expense', command.wallet, command.amountMinor)
  if (command.kind === 'billPay' && original?.command.id === command.obligationId &&
      (original.command.kind === 'bill' || original.command.kind === 'billOccurrence')) {
    return pair(command, 'expense', command.wallet, command.amountMinor)
  }
  if (command.kind === 'borrow') return pair(command, command.wallet, 'payable', command.amountMinor)
  if (command.kind === 'lend') return pair(command, 'receivable', command.wallet, command.amountMinor)
  if (command.kind === 'loanRepay' && original?.command.id === command.obligationId) {
    if (original.command.kind === 'borrow') return pair(command, 'payable', command.wallet, command.amountMinor)
    if (original.command.kind === 'lend') return pair(command, command.wallet, 'receivable', command.amountMinor)
  }
  throw new Error('DAILY_REFERENCE_INVALID')
}

function pair(command: Command, debit: Account, credit: Account, amountMinor: string): Entry {
  return { command, postings: [
    { id: child(command.id, 0), account: debit, delta: amountMinor },
    { id: child(command.id, 1), account: credit, delta: '-' + amountMinor },
  ] }
}

export function summarize(entries: readonly Entry[], today: string) {
  const balance = { cash: 0n, bank: 0n }
  const month = { income: 0n, expense: 0n }
  const day = { income: 0n, expense: 0n }
  for (const { command, postings } of entries) {
    if (command.date > today) continue
    for (const row of postings) {
      if (wallet(row.account)) balance[row.account] += BigInt(row.delta)
      else if ((row.account === 'income' || row.account === 'expense') && command.date.slice(0, 7) === today.slice(0, 7)) {
        const delta = BigInt(row.delta) * (row.account === 'income' ? -1n : 1n)
        month[row.account] += delta
        if (command.date === today) day[row.account] += delta
      }
    }
  }
  return { balance, month, day }
}
