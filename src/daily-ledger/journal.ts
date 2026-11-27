import { minor } from '../accounting/model'

export type Wallet = 'cash' | 'bank'
export const categories = ['food', 'home', 'travel', 'other'] as const
export type Category = typeof categories[number]
export const isCategory = (value: unknown): value is Category => categories.some(category => category === value)
type Account = Wallet | 'income' | 'expense'
type Header = Readonly<{ version: 1; id: string; date: string; note: string }>
export type Command = Header & (
  | Readonly<{ kind: 'income'; wallet: Wallet; amountMinor: string }>
  | Readonly<{ kind: 'expense'; wallet: Wallet; amountMinor: string; category?: Category }>
  | Readonly<{ kind: 'transfer'; from: Wallet; to: Wallet; amountMinor: string }>
  | Readonly<{ kind: 'reversal'; originalId: string }>
  | Readonly<{ kind: 'budget'; category: Category; amountMinor: string }>
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
  const { amountMinor, kind } = input
  if (typeof amountMinor !== 'string' || !/^[1-9]\d{0,11}$/u.test(amountMinor)) throw new Error('DAILY_AMOUNT_INVALID')
  if (kind === 'transfer' && wallet(input.from) && wallet(input.to) && input.from !== input.to) {
    return { ...header, kind, amountMinor, from: input.from, to: input.to }
  }
  if (kind === 'budget' && isCategory(input.category) && input.date.endsWith('-01')) {
    return { ...header, kind, amountMinor, category: input.category }
  }
  if (kind === 'income' && wallet(input.wallet)) return { ...header, kind, amountMinor, wallet: input.wallet }
  if (kind === 'expense' && wallet(input.wallet) && (input.category === undefined || isCategory(input.category))) {
    return { ...header, kind, amountMinor, wallet: input.wallet, ...(input.category && { category: input.category }) }
  }
  throw new Error('DAILY_COMMAND_INVALID')
}

const child = (id: string, slot: number) => id + ':' + slot
export function envelope(owner: string, command: Command) {
  return { protocolVersion: 1, scopeKind: 'personal_ledger', scopeId: owner, operationId: command.id,
    command, childIds: command.kind === 'budget' ? [] : [child(command.id, 0), child(command.id, 1)] }
}

export function post(command: Command, original?: Entry): Entry {
  if (command.kind === 'budget') return { command, postings: [] }
  if (command.kind === 'reversal') {
    if (!original || original.command.id !== command.originalId || !original.postings.length ||
        original.command.kind === 'reversal' || command.date < original.command.date) throw new Error('DAILY_REVERSAL_INVALID')
    return { command, postings: original.postings.map((row, i) => ({
      id: child(command.id, i), account: row.account, delta: (-BigInt(row.delta)).toString(),
    })) }
  }
  const [debit, credit]: readonly [Account, Account] = command.kind === 'transfer' ? [command.to, command.from] :
    command.kind === 'income' ? [command.wallet, 'income'] : ['expense', command.wallet]
  return { command, postings: [
    { id: child(command.id, 0), account: debit, delta: command.amountMinor },
    { id: child(command.id, 1), account: credit, delta: '-' + command.amountMinor },
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
      else if (command.date.slice(0, 7) === today.slice(0, 7)) {
        const delta = BigInt(row.delta) * (row.account === 'income' ? -1n : 1n)
        month[row.account] += delta
        if (command.date === today) day[row.account] += delta
      }
    }
  }
  return { balance, month, day }
}
