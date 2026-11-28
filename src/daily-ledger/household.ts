import { recurringDueDate } from './calendar'
import { post, type BillType, type Category, type Command, type Entry } from './journal'

const isLoan = (command: Command): command is Extract<Command, { kind: 'borrow' | 'lend' }> => command.kind === 'borrow' || command.kind === 'lend'
const isBill = (command: Command): command is Extract<Command, { kind: 'bill' | 'billOccurrence' }> => command.kind === 'bill' || command.kind === 'billOccurrence'
const isSettlement = (command: Command): command is Extract<Command, { kind: 'loanRepay' | 'billPay' }> => command.kind === 'loanRepay' || command.kind === 'billPay'

export const occurrenceId = (seriesId: string, date: string) => seriesId + ':' + date.slice(0, 7)

export const recurringAnchorDay = (series: Readonly<{ dueDate: string; anchorDay?: number }>) =>
  series.anchorDay ?? Number(series.dueDate.slice(8))

type BillDetails = Readonly<{ billType: BillType; dueDate: string; category: Category; amountMinor: string }>
export function billDetails(command: Command, commands: ReadonlyMap<string, Command>): BillDetails | undefined {
  if (command.kind === 'bill' || command.kind === 'billSeries') return command
  if (command.kind !== 'billOccurrence') return undefined
  const series = commands.get(command.seriesId)
  if (series?.kind !== 'billSeries') throw new Error('DAILY_REFERENCE_INVALID')
  return {
    billType: series.billType, category: series.category, amountMinor: series.amountMinor,
    dueDate: recurringDueDate(command.date.slice(0, 7), recurringAnchorDay(series)),
  }
}

export function needsHouseholdHistory(command: Command) {
  return command.kind === 'opening' || isLoan(command) || isBill(command) || isSettlement(command)
}

// Reversals resolve the original settlement by operation ID.
function movements(commands: readonly Command[], obligationId: string) {
  const payments = new Map(commands.flatMap(command =>
    isSettlement(command) && command.obligationId === obligationId ? [[command.id, command]] : []))
  return commands.flatMap(command => {
    const payment = command.kind === 'reversal' ? payments.get(command.originalId) : payments.get(command.id)
    if (!payment || !isSettlement(payment)) return []
    return [{ date: command.date, cleared: BigInt(payment.amountMinor) * (command.kind === 'reversal' ? -1n : 1n) }]
  })
}

function checkTimeline(commands: readonly Command[], original: Command, principal: bigint, candidate: Command) {
  const ordered = movements([...commands, candidate], original.id).sort((a, b) => a.date.localeCompare(b.date))
  let cleared = 0n
  for (const movement of ordered) {
    cleared += movement.cleared
    if (movement.date < original.date || cleared < 0n || cleared > principal) throw new Error('DAILY_SETTLEMENT_LIMIT')
  }
}

function principalOf(original: Command, commands: ReadonlyMap<string, Command>) {
  if (isLoan(original)) return BigInt(original.amountMinor)
  const bill = billDetails(original, commands)
  if (!bill) throw new Error('DAILY_REFERENCE_INVALID')
  return BigInt(bill.amountMinor)
}

function obligationFor(command: Command, commands: ReadonlyMap<string, Command>) {
  if (!isSettlement(command)) throw new Error('DAILY_REFERENCE_INVALID')
  const obligation = commands.get(command.obligationId)
  if (!obligation || (command.kind === 'billPay' ? !isBill(obligation) : !isLoan(obligation))) {
    throw new Error('DAILY_REFERENCE_INVALID')
  }
  return obligation
}

function checkCorrection(command: Command, history: readonly Command[], commands: ReadonlyMap<string, Command>) {
  if (!('correctionOf' in command) || !command.correctionOf) return
  const original = commands.get(command.correctionOf)
  const reversal = history.find(row => row.kind === 'reversal' && row.originalId === command.correctionOf)
  if (!original || original.kind !== command.kind || !reversal || command.date < reversal.date ||
      (isLoan(command) && (!isLoan(original) || command.personId !== original.personId)) ||
      (isSettlement(command) && (!isSettlement(original) || command.obligationId !== original.obligationId)) ||
      history.some(row => 'correctionOf' in row && row.correctionOf === command.correctionOf)) {
    throw new Error('DAILY_CORRECTION_INVALID')
  }
}

export function postHousehold(command: Command, entries: readonly Entry[], currentDay: string, original?: Entry): Entry {
  // Stores supply newest-first history. The reverse preserves original commit order within a date.
  const history = entries.map(row => row.command).reverse()
  const commands = new Map(history.map(row => [row.id, row]))
  const reversed = new Set(history.flatMap(row => row.kind === 'reversal' ? [row.originalId] : []))
  checkCorrection(command, history, commands)
  if (command.kind === 'opening') {
    const prior = history.filter(row => row.kind === 'opening' && row.wallet === command.wallet).at(-1)
    if (prior && !reversed.has(prior.id)) throw new Error('DAILY_OPENING_EXISTS')
    if (prior?.id !== command.correctionOf) throw new Error('DAILY_CORRECTION_INVALID')
  }
  if (isLoan(command)) {
    const person = commands.get(command.personId)
    if (person?.kind !== 'person' || command.date < person.date) throw new Error('DAILY_REFERENCE_INVALID')
  }
  if (command.kind === 'billOccurrence') {
    if (command.date.slice(0, 7) !== currentDay.slice(0, 7) || command.date > currentDay) {
      throw new Error('DAILY_OCCURRENCE_MONTH')
    }
    const series = commands.get(command.seriesId)
    if (series?.kind !== 'billSeries' || series.date > command.date) throw new Error('DAILY_REFERENCE_INVALID')
    const key = occurrenceId(command.seriesId, command.date)
    if (history.some(row => row.kind === 'billOccurrence' && occurrenceId(row.seriesId, row.date) === key)) {
      throw new Error('DAILY_OCCURRENCE_EXISTS')
    }
  }
  if (isSettlement(command)) {
    const obligation = obligationFor(command, commands)
    if (command.date < obligation.date || reversed.has(obligation.id)) throw new Error('DAILY_REFERENCE_INVALID')
    checkTimeline(history, obligation, principalOf(obligation, commands), command)
    return post(command, entries.find(row => row.command.id === obligation.id))
  }
  if (command.kind === 'reversal' && original) {
    const source = original.command
    if (reversed.has(source.id)) throw new Error('DAILY_REVERSAL_INVALID')
    if (isSettlement(source)) {
      const obligation = obligationFor(source, commands)
      if (reversed.has(obligation.id)) throw new Error('DAILY_REVERSAL_INVALID')
      checkTimeline(history, obligation, principalOf(obligation, commands), command)
    }
    if (isLoan(source) || isBill(source)) {
      const events = movements(history, source.id)
      if (events.some(row => row.date > command.date) || events.reduce((sum, row) => sum + row.cleared, 0n) !== 0n) {
        throw new Error('DAILY_SETTLEMENT_EXISTS')
      }
    }
  }
  return post(command, original)
}

export function householdView(entries: readonly Entry[], asOf: string) {
  const history = entries.map(row => row.command).filter(row => row.date <= asOf)
  const commands = new Map(history.map(row => [row.id, row]))
  const reversed = new Set(history.flatMap(row => row.kind === 'reversal' ? [row.originalId] : []))
  const cleared = new Map<string, bigint>()
  for (const row of history) {
    if (isSettlement(row) && !reversed.has(row.id)) {
      cleared.set(row.obligationId, (cleared.get(row.obligationId) ?? 0n) + BigInt(row.amountMinor))
    }
  }
  const billRows = history.filter(isBill).map(command => {
    const details = billDetails(command, commands)
    if (!details) throw new Error('DAILY_REFERENCE_INVALID')
    return { command, ...details, paid: cleared.get(command.id) ?? 0n, reversed: reversed.has(command.id) }
  })
  const loans = history.filter(isLoan).map(command => ({
    command, paid: cleared.get(command.id) ?? 0n, reversed: reversed.has(command.id),
  }))
  return { history, commands, billRows, loans, reversed }
}
