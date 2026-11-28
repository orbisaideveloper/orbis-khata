import { isMonthlyAnchor, recurringDueDate } from './calendar.ts'

export type Wallet = 'cash' | 'bank'
export const categories = ['food', 'home', 'travel', 'other'] as const
export type Category = typeof categories[number]
export const isCategory = (value: unknown): value is Category => (categories as readonly unknown[]).includes(value)
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
export { minor as parseAmount } from '../accounting/model.ts'

type AmountCommand = Extract<Command, { amountMinor: string }>
type BillCommand = Extract<Command, { kind: 'bill' | 'billSeries' }>

function normalizeBill(input: BillCommand, header: Header, correction: { correctionOf?: string }): Command {
  if (!billTypes.includes(input.billType) || !isCategory(input.category) || !validDate(input.dueDate)) {
    throw new Error('DAILY_COMMAND_INVALID')
  }
  const terms = { ...header, kind: input.kind, amountMinor: input.amountMinor, billType: input.billType, category: input.category, dueDate: input.dueDate }
  if (input.kind === 'bill') {
    if (input.dueDate < input.date) throw new Error('DAILY_COMMAND_INVALID')
    return { ...terms, kind: input.kind, ...correction }
  }
  if (input.anchorDay === null) throw new Error('DAILY_COMMAND_INVALID')
  const anchor = input.anchorDay ?? Number(input.dueDate.slice(8))
  if (!isMonthlyAnchor(anchor) || recurringDueDate(input.date.slice(0, 7), anchor) !== input.dueDate) {
    throw new Error('DAILY_COMMAND_INVALID')
  }
  if (input.anchorDay === undefined) return { ...terms, kind: input.kind }
  // Keep legacy serialized commands and their pending-outbox digests byte-for-byte.
  return { ...terms, kind: input.kind, anchorDay: anchor }
}

function normalizeWallet(input: Exclude<AmountCommand, BillCommand | { kind: 'transfer' | 'budget' }>,
  header: Header, correction: { correctionOf?: string }): Command {
  if (!wallet(input.wallet)) throw new Error('DAILY_COMMAND_INVALID')
  const { kind, amountMinor } = input
  const common = { ...header, kind, amountMinor }
  switch (kind) {
    case 'opening':
      if (!header.note) throw new Error('DAILY_OPENING_SOURCE_REQUIRED')
      return { ...common, kind, wallet: input.wallet, ...correction }
    case 'income':
      return { ...common, kind, wallet: input.wallet }
    case 'expense':
      if (input.category !== undefined && !isCategory(input.category)) throw new Error('DAILY_COMMAND_INVALID')
      return { ...common, kind, wallet: input.wallet, ...(input.category && { category: input.category }) }
    case 'borrow':
    case 'lend':
      if (!validId(input.personId)) throw new Error('DAILY_COMMAND_INVALID')
      return { ...common, kind, personId: input.personId, wallet: input.wallet, ...correction }
    case 'loanRepay':
    case 'billPay':
      if (!validId(input.obligationId)) throw new Error('DAILY_COMMAND_INVALID')
      return { ...common, kind, obligationId: input.obligationId, wallet: input.wallet, ...correction }
    default:
      throw new Error('DAILY_COMMAND_INVALID')
  }
}

function normalizeAmount(input: AmountCommand, header: Header, correction: { correctionOf?: string }): Command {
  const { kind, amountMinor } = input
  if (typeof amountMinor !== 'string' || !/^[1-9]\d{0,11}$/u.test(amountMinor)) throw new Error('DAILY_AMOUNT_INVALID')
  switch (kind) {
    case 'transfer':
      if (!wallet(input.from) || !wallet(input.to) || input.from === input.to) throw new Error('DAILY_COMMAND_INVALID')
      return { ...header, kind, amountMinor, from: input.from, to: input.to }
    case 'budget':
      if (!isCategory(input.category) || !input.date.endsWith('-01')) throw new Error('DAILY_COMMAND_INVALID')
      return { ...header, kind, amountMinor, category: input.category }
    case 'bill':
    case 'billSeries':
      // The order of these properties is part of older backup digests.
      return normalizeBill(input, header, correction)
    default:
      return normalizeWallet(input, header, correction)
  }
}

function normalizeName(value: unknown) {
  const name = typeof value === 'string' ? value.trim().normalize('NFC') : ''
  if (!name || name.length > 80) throw new Error('DAILY_COMMAND_INVALID')
  return name
}

export function normalize(input: Command): Command {
  if (input.version !== 1 || !validId(input.id) || !validDate(input.date) ||
      typeof input.note !== 'string' || input.note.length > 240) throw new Error('DAILY_COMMAND_INVALID')
  const header = { version: 1 as const, id: input.id, date: input.date, note: input.note.trim() }
  const { kind } = input
  if (kind === 'reversal') {
    if (!validId(input.originalId) || input.originalId === input.id) throw new Error('DAILY_REVERSAL_INVALID')
    return { ...header, kind, originalId: input.originalId }
  }
  const correctionOf = 'correctionOf' in input ? input.correctionOf : undefined
  if (correctionOf !== undefined && (!validId(correctionOf) || correctionOf === input.id)) {
    throw new Error('DAILY_COMMAND_INVALID')
  }
  switch (kind) {
    case 'person':
      return { ...header, kind, name: normalizeName(input.name) }
    case 'billOccurrence':
      if (!validId(input.seriesId) || input.id === input.seriesId) throw new Error('DAILY_COMMAND_INVALID')
      return { ...header, kind, seriesId: input.seriesId }
    default:
      if (!('amountMinor' in input)) throw new Error('DAILY_COMMAND_INVALID')
      return normalizeAmount(input, header, correctionOf ? { correctionOf } : {})
  }
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

function postReversal(command: Extract<Command, { kind: 'reversal' }>, original?: Entry): Entry {
  if (!original) throw new Error('DAILY_REVERSAL_INVALID')
  if (original.command.id !== command.originalId || original.command.kind === 'reversal' ||
      command.date < original.command.date) throw new Error('DAILY_REVERSAL_INVALID')
  if (!original.postings.length && original.command.kind !== 'bill' && original.command.kind !== 'billOccurrence') {
    throw new Error('DAILY_REVERSAL_INVALID')
  }
  return { command, postings: original.postings.map((row, i) => ({
    id: child(command.id, i), account: row.account, delta: (-BigInt(row.delta)).toString(),
  })) }
}

export function post(command: Command, original?: Entry): Entry {
  switch (command.kind) {
    case 'budget':
    case 'person':
    case 'bill':
    case 'billSeries':
    case 'billOccurrence':
      return { command, postings: [] }
    case 'reversal':
      return postReversal(command, original)
    case 'transfer':
      return pair(command, command.to, command.from, command.amountMinor)
    case 'opening':
      return pair(command, command.wallet, 'openingEquity', command.amountMinor)
    case 'income':
      return pair(command, command.wallet, 'income', command.amountMinor)
    case 'expense':
      return pair(command, 'expense', command.wallet, command.amountMinor)
    case 'borrow':
      return pair(command, command.wallet, 'payable', command.amountMinor)
    case 'lend':
      return pair(command, 'receivable', command.wallet, command.amountMinor)
    case 'billPay':
      if (original?.command.id === command.obligationId &&
          (original.command.kind === 'bill' || original.command.kind === 'billOccurrence')) {
        return pair(command, 'expense', command.wallet, command.amountMinor)
      }
      break
    case 'loanRepay':
      if (original?.command.id !== command.obligationId) break
      if (original.command.kind === 'borrow') return pair(command, 'payable', command.wallet, command.amountMinor)
      if (original.command.kind === 'lend') return pair(command, command.wallet, 'receivable', command.amountMinor)
      break
  }
  throw new Error('DAILY_REFERENCE_INVALID')
}

function pair(command: Command, debit: Account, credit: Account, amountMinor: string): Entry {
  return { command, postings: [
    { id: child(command.id, 0), account: debit, delta: amountMinor },
    { id: child(command.id, 1), account: credit, delta: '-' + amountMinor },
  ] }
}

type Earnings = Record<'income' | 'expense', bigint>

function tallyPosting(row: Posting, balance: Record<Wallet, bigint>, month: Earnings, day: Earnings,
  inMonth: boolean, onDay: boolean) {
  if (wallet(row.account)) {
    balance[row.account] += BigInt(row.delta)
    return
  }
  if (!inMonth || (row.account !== 'income' && row.account !== 'expense')) return
  const delta = BigInt(row.delta) * (row.account === 'income' ? -1n : 1n)
  month[row.account] += delta
  if (onDay) day[row.account] += delta
}

export function summarize(entries: readonly Entry[], today: string) {
  const balance = { cash: 0n, bank: 0n }
  const month = { income: 0n, expense: 0n }
  const day = { income: 0n, expense: 0n }
  const period = today.slice(0, 7)
  for (const { command, postings } of entries) {
    if (command.date > today) continue
    const inMonth = command.date.startsWith(period)
    for (const row of postings) tallyPosting(row, balance, month, day, inMonth, command.date === today)
  }
  return { balance, month, day }
}
