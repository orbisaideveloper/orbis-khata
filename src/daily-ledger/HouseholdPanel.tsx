import { useState } from 'react'
import type { Language } from '../i18n'
import { displayAmount, label, locale } from './copy'
import { householdView, occurrenceId } from './household'
import type { Command, Entry } from './journal'

export type HouseholdFlow =
  | { kind: 'person' | 'billSeries' }
  | { kind: 'bill'; correctionOf?: string }
  | { kind: 'borrow' | 'lend'; personId: string; correctionOf?: string }
  | { kind: 'loanRepay' | 'billPay'; obligationId: string; correctionOf?: string }
  | { kind: 'billOccurrence'; seriesId: string }

type Action = HouseholdFlow | { kind: 'reversal'; originalId: string; offWallet?: boolean }
type Props = Readonly<{ entries: readonly Entry[]; day: string; language: Language; onAction(flow: Action): void }>

const hasCorrection = (history: readonly Command[], id: string) =>
  history.some(row => 'correctionOf' in row && row.correctionOf === id)

function PaymentHistory({ history, id, mayCorrect, language, onAction }: Readonly<{
  history: readonly Command[]; id: string; mayCorrect: boolean; language: Language; onAction(flow: Action): void
}>) {
  const payments = history.filter(row => (row.kind === 'loanRepay' || row.kind === 'billPay') && row.obligationId === id)
  const paymentIds = new Set(payments.map(row => row.id))
  const reversals = history.filter(row => row.kind === 'reversal' && paymentIds.has(row.originalId))
  const reversed = new Set(reversals.flatMap(row => row.kind === 'reversal' ? [row.originalId] : []))
  if (!payments.length) return null
  return <ul className="daily-history">{[...payments, ...reversals].sort((a, b) => b.date.localeCompare(a.date)).map(row =>
    <li key={row.id}>
      <span>{label(language, row.kind === 'reversal' ? 'reversed' : row.kind)} · <time dateTime={row.date}>{row.date}</time>
        {'amountMinor' in row && <> · {displayAmount(BigInt(row.amountMinor), language)}</>}
      </span>
      {row.kind !== 'reversal' && !reversed.has(row.id) &&
        <button type="button" onClick={() => onAction({ kind: 'reversal', originalId: row.id })}>{label(language, 'reversal')}</button>}
      {mayCorrect && (row.kind === 'loanRepay' || row.kind === 'billPay') && reversed.has(row.id) &&
        !hasCorrection(history, row.id) && <button type="button" onClick={() =>
          onAction({ kind: row.kind, obligationId: id, correctionOf: row.id })}>{label(language, 'correctEntry')}</button>}
    </li>)}</ul>
}

export function HouseholdPanel({ entries, day, language, onAction }: Props) {
  const t = (key: Parameters<typeof label>[1]) => label(language, key)
  const amount = (value: bigint) => displayAmount(value, language)
  const [month, setMonth] = useState(day.slice(0, 7))
  const { history, billRows, loans } = householdView(entries, day)
  const dates = new Intl.DateTimeFormat(locale[language], { dateStyle: 'medium', timeZone: 'UTC' })
  const persons = history.filter(row => row.kind === 'person')
  const series = history.filter(row => row.kind === 'billSeries')
  const issued = new Set(history.flatMap(row => row.kind === 'billOccurrence' ? [occurrenceId(row.seriesId, row.date)] : []))
  const activeBills = billRows.filter(row => row.dueDate.startsWith(month))
  return <>
    <details className="daily-panel">
      <summary>{t('people')}</summary>
      <button type="button" onClick={() => onAction({ kind: 'person' })}>{t('person')}</button>
      {persons.map(person => {
        const rows = loans.filter(row => row.command.personId === person.id)
        const outstanding = (kind: 'borrow' | 'lend') => rows.reduce((sum, row) =>
          !row.reversed && row.command.kind === kind ? sum + BigInt(row.command.amountMinor) - row.paid : sum, 0n)
        return <section key={person.id} className="daily-household-record">
          <h3>{person.name}</h3>
          {person.note && <p>{person.note}</p>}
          <p>{t('receivable')} · {amount(outstanding('lend'))} · {t('payable')} · {amount(outstanding('borrow'))}</p>
          <div className="daily-actions">
            <button type="button" onClick={() => onAction({ kind: 'lend', personId: person.id })}>{t('lend')}</button>
            <button type="button" onClick={() => onAction({ kind: 'borrow', personId: person.id })}>{t('borrow')}</button>
          </div>
          {rows.map(({ command, paid, reversed }) => <section key={command.id} className="daily-household-record">
            <strong>{t(command.kind)} · <time dateTime={command.date}>{dates.format(new Date(command.date))}</time></strong>
            {command.note && <p>{command.note}</p>}
            <p>{t('principal')} · {amount(BigInt(command.amountMinor))} · {reversed ? t('reversed') :
              t('outstanding') + ' · ' + amount(BigInt(command.amountMinor) - paid)}</p>
            {!reversed && <div className="daily-actions">
              {paid < BigInt(command.amountMinor) &&
                <button type="button" onClick={() => onAction({ kind: 'loanRepay', obligationId: command.id })}>{t('loanRepay')}</button>}
              {paid === 0n && <button type="button" onClick={() => onAction({ kind: 'reversal', originalId: command.id })}>{t('reversal')}</button>}
            </div>}
            {reversed && !hasCorrection(history, command.id) && <button type="button" onClick={() =>
              onAction({ kind: command.kind, personId: command.personId, correctionOf: command.id })}>{t('correctEntry')}</button>}
            <PaymentHistory mayCorrect={!reversed && paid < BigInt(command.amountMinor)} history={history} id={command.id} language={language} onAction={onAction} />
          </section>)}
        </section>
      })}
    </details>
    <details className="daily-panel">
      <summary>{t('bills')}</summary>
      <div className="daily-actions">
        <button type="button" onClick={() => onAction({ kind: 'bill' })}>{t('bill')}</button>
        <button type="button" onClick={() => onAction({ kind: 'billSeries' })}>{t('billSeries')}</button>
      </div>
      {series.map(row => <div key={row.id} className="daily-household-record">
        <p>{t(row.billType)} · {amount(BigInt(row.amountMinor))}{row.note && ' · ' + row.note}</p>
        {!issued.has(occurrenceId(row.id, day)) &&
          <button type="button" onClick={() => onAction({ kind: 'billOccurrence', seriesId: row.id })}>{t('billOccurrence')}</button>}
      </div>)}
      <label>{t('billingMonth')}<input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>
      {!activeBills.length && <p>{t('noBills')}</p>}
      {activeBills.map(({ command, billType, dueDate, amountMinor, paid, reversed }) => {
        const total = BigInt(amountMinor)
        const status = reversed ? 'reversed' : paid === total ? 'paid' : paid > 0n ? 'partiallyPaid' : 'unpaid'
        return <section key={command.id} className="daily-household-record">
          <h3>{t(billType)} · {amount(total)}</h3>
          <p>{t('dueDate')} · <time dateTime={dueDate}>{dates.format(new Date(dueDate))}</time></p>
          {command.note && <p>{command.note}</p>}
          <p>{t(status)}{!reversed && ' · ' + t('outstanding') + ' · ' + amount(total - paid)}</p>
          {!reversed && <div className="daily-actions">
            {paid < total && <button type="button" onClick={() => onAction({ kind: 'billPay', obligationId: command.id })}>{t('billPay')}</button>}
            {paid === 0n && <button type="button" onClick={() => onAction({ kind: 'reversal', originalId: command.id, offWallet: true })}>{t('reversal')}</button>}
          </div>}
          {reversed && command.kind === 'bill' && !hasCorrection(history, command.id) &&
            <button type="button" onClick={() => onAction({ kind: 'bill', correctionOf: command.id })}>{t('correctEntry')}</button>}
          <PaymentHistory mayCorrect={!reversed && paid < total} history={history} id={command.id} language={language} onAction={onAction} />
        </section>
      })}
    </details>
  </>
}
