import { recurringDueDate } from './calendar'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { today } from '../accounting/model'
import type { Language } from '../i18n'
import { budgets } from './budget'
import { displayAmount, label, locale, type LedgerKey } from './copy'
import { HouseholdPanel, type HouseholdFlow } from './HouseholdPanel'
import { billTypes, categories, normalize, isCategory, parseAmount, summarize, validDate, type BillType, type Category, type Command, type Entry, type Wallet } from './journal'
import type { LedgerStore } from './ledger-store'
import './daily-ledger.css'

type Flow = { kind: 'income' | 'expense' | 'transfer' } | { kind: 'opening'; wallet: Wallet; correctionOf?: string } | { kind: 'reversal'; originalId: string; offWallet?: boolean } | { kind: 'budget'; category: Category } | HouseholdFlow
type Props = Readonly<{
  store: LedgerStore
  language: Language
  preview?: boolean
  separateBackup?: boolean
  shareMonthlyReport?(entries: readonly Entry[], asOf: string): Promise<void>
}>
const text = (language: Language) => (key: LedgerKey) => label(language, key)

function makeCommand(flow: Flow, wallet: Wallet, form: FormData): Command {
  const date = flow.kind === 'budget' ? today().slice(0, 7) + '-01' :
    flow.kind === 'billOccurrence' ? today() : String(form.get('date'))
  if (!validDate(date) || date > today()) throw new Error('DAILY_DATE_INVALID')
  const common = { version: 1 as const, id: crypto.randomUUID(), date, note: String(form.get('note') ?? '') }
  if (flow.kind === 'reversal') return { ...common, kind: flow.kind, originalId: flow.originalId }
  if (flow.kind === 'billOccurrence') return { ...common, ...flow }
  if (flow.kind === 'person') return { ...common, kind: flow.kind, name: String(form.get('name')) }
  const amountMinor = parseAmount(String(form.get('amount')))
  if (flow.kind === 'budget' || flow.kind === 'opening') return { ...common, ...flow, amountMinor }
  if (flow.kind === 'borrow' || flow.kind === 'lend' || flow.kind === 'billPay' || flow.kind === 'loanRepay') {
    return { ...common, ...flow, amountMinor, wallet }
  }
  if (flow.kind === 'transfer') return { ...common, kind: flow.kind, from: wallet, to: wallet === 'cash' ? 'bank' : 'cash', amountMinor }
  const category = form.get('category')
  if (flow.kind === 'bill' || flow.kind === 'billSeries') {
    const billType = String(form.get('billType')) as BillType
    if (!billTypes.includes(billType) || !isCategory(category)) throw new Error('DAILY_COMMAND_INVALID')
    const terms = { ...common, amountMinor, billType, category }
    if (flow.kind === 'billSeries') {
      const anchorDay = Number(form.get('dueDay'))
      const dueDate = recurringDueDate(date.slice(0, 7), anchorDay)
      return { ...terms, kind: flow.kind, dueDate, anchorDay }
    }
    return { ...terms, kind: flow.kind, dueDate: String(form.get('dueDate')),
      ...(flow.correctionOf && { correctionOf: flow.correctionOf }) }
  }
  if (flow.kind !== 'expense' && flow.kind !== 'income') throw new Error('DAILY_COMMAND_INVALID')
  return flow.kind === 'expense'
    ? { ...common, kind: flow.kind, wallet, amountMinor, ...(isCategory(category) && { category }) }
    : { ...common, kind: flow.kind, wallet, amountMinor }
}

const editableErrors: Readonly<Record<string, LedgerKey>> = {
  DAILY_SETTLEMENT_LIMIT: 'settlementLimit',
  DAILY_SETTLEMENT_EXISTS: 'correctFirst',
  DAILY_CORRECTION_INVALID: 'referenceInvalid',
  DAILY_REFERENCE_INVALID: 'referenceInvalid',
  DAILY_REVERSAL_INVALID: 'referenceInvalid',
  DAILY_OCCURRENCE_EXISTS: 'alreadyRecorded',
  DAILY_OCCURRENCE_MONTH: 'recurringMonth',
  DAILY_OPENING_EXISTS: 'alreadyRecorded',
}

function EntryForm({ store, flow, language, onSave, onCancel }: Props & Readonly<{
  flow: Flow; onSave: (entry: Entry) => void; onCancel: () => void
}>) {
  const t = text(language)
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const [wallet, setWallet] = useState<Wallet>('cash')
  const [pending, setPending] = useState<Command>()
  const [saving, setSaving] = useState(false)
  const [issue, setIssue] = useState<LedgerKey>()
  const busy = useRef(false)
  const bill = flow.kind === 'bill' || flow.kind === 'billSeries'
  const money = flow.kind !== 'reversal' && flow.kind !== 'person' && flow.kind !== 'billOccurrence'
  const selectWallet = money && !bill && flow.kind !== 'budget' && flow.kind !== 'opening'
  useEffect(() => { heading.current?.focus() }, [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    let input: Command
    try { input = pending ?? normalize(makeCommand(flow, wallet, new FormData(event.currentTarget))) }
    catch (error) {
      setIssue(error instanceof Error && error.message === 'DAILY_OPENING_SOURCE_REQUIRED' ? 'openingSource' : 'invalid')
      return
    }
    busy.current = true
    setPending(input)
    setSaving(true)
    setIssue(undefined)
    try { onSave(await store.save(input)) }
    catch (error) {
      const issueKey = error instanceof Error && Object.hasOwn(editableErrors, error.message) ? editableErrors[error.message] : undefined
      if (issueKey) setPending(undefined)
      setIssue(issueKey ?? 'saveFailed')
    }
    finally { busy.current = false; setSaving(false) }
  }

  return <form className="daily-panel daily-form" aria-labelledby={headingId} onSubmit={event => { void save(event) }}>
    <h2 id={headingId} tabIndex={-1} ref={heading}>{flow.kind === 'budget' ? t('plan') + ' · ' + t(flow.category) : t(flow.kind)}{flow.kind === 'opening' && ' · ' + t(flow.wallet)}</h2>
    <fieldset disabled={Boolean(pending)}>
      {flow.kind === 'reversal' && <p>{t(flow.offWallet ? 'billCancel' : 'confirm')}</p>}
      {flow.kind === 'billSeries' && <p>{t('recurringHelp')}</p>}
      {flow.kind === 'person' && <label>{t('personName')}<input name="name" maxLength={80} required /></label>}
      {money && <>
        <label>{t('amount')}<input name="amount" inputMode="decimal" maxLength={16} required /></label>
        {selectWallet && <label>{t(flow.kind === 'transfer' ? 'from' : 'account')}
          <select value={wallet} onChange={event => setWallet(event.target.value === 'bank' ? 'bank' : 'cash')}>
            <option value="cash">{t('cash')}</option><option value="bank">{t('bank')}</option>
          </select>
        </label>}
        {flow.kind === 'transfer' && <p>{t('to')} · {t(wallet === 'cash' ? 'bank' : 'cash')}</p>}
        {bill && <label>{t('billType')}<select name="billType">
          {billTypes.map(type => <option key={type} value={type}>{t(type)}</option>)}
        </select></label>}
        {(bill || flow.kind === 'expense') && <label>{t('category')}<select name="category" defaultValue="other">
          {categories.map(category => <option key={category} value={category}>{t(category)}</option>)}
        </select></label>}
      </>}
      {flow.kind === 'bill' && <label>{t('dueDate')}<input name="dueDate" type="date" defaultValue={today()} required /></label>}
      {flow.kind === 'billSeries' && <label>{t('monthlyAnchor')}<input name="dueDay" type="number" min={1} max={31} defaultValue={1} required /></label>}
      {flow.kind !== 'budget' && flow.kind !== 'billOccurrence' &&
        <label>{t('date')}<input name="date" type="date" defaultValue={today()} max={today()} required /></label>}
      <label>{t(flow.kind === 'opening' ? 'openingSource' : 'note')}<input name="note" maxLength={240} required={flow.kind === 'opening'} /></label>
    </fieldset>
    {issue && <p role="alert">{t(issue)}</p>}
    <div className="daily-actions">
      <button type="submit" className="daily-primary" disabled={saving}>{t(pending ? 'retry' : 'save')}</button>
      {!pending && <button type="button" onClick={onCancel}>{t('cancel')}</button>}
    </div>
  </form>
}

function History({ entries, language, onReverse }: Readonly<{
  entries: readonly Entry[]; language: Language; onReverse: (operation: string) => void
}>) {
  const t = text(language)
  const historyHeading = useId()
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(20)
  const dates = new Intl.DateTimeFormat(locale[language], { dateStyle: 'medium', timeZone: 'UTC' })
  const reversed = new Set(entries.flatMap(({ command }) => command.kind === 'reversal' ? [command.originalId] : []))
  const linked = new Set(entries.flatMap(({ command }) => command.kind === 'loanRepay' && !reversed.has(command.id)
    ? [command.obligationId] : []))
  const rows = entries.filter(({ command, postings }) => postings.length > 0 &&
    (command.note + ' ' + command.date).toLocaleLowerCase(locale[language]).includes(query.trim().toLocaleLowerCase(locale[language])))
  return <section className="daily-panel" aria-labelledby={historyHeading}>
    <h2 id={historyHeading}>{t('history')}</h2>
    <label>{t('search')}<input type="search" value={query} onChange={event => { setQuery(event.target.value); setVisible(20) }} /></label>
    {!rows.length && <p>{t('empty')}</p>}
    <ul className="daily-history">{rows.slice(0, visible).map(({ command, postings }) => <li key={command.id}>
      <div><strong>{t(command.kind === 'reversal' ? 'reversed' : command.kind)}</strong><br />
        <time dateTime={command.date}>{dates.format(new Date(command.date))}</time>
        {command.note && <p>{command.note}</p>}
      </div>
      <div><strong>{displayAmount(BigInt(postings[0].delta.replace(/^-/, '')), language)}</strong>
        {command.kind !== 'reversal' && !reversed.has(command.id) && !linked.has(command.id) &&
          <button type="button" onClick={() => onReverse(command.id)}>{t('reversal')}</button>}
      </div>
    </li>)}</ul>
    {visible < rows.length && <button type="button" onClick={() => setVisible(visible + 20)}>{t('more')}</button>}
  </section>
}

function BudgetPanel({ entries, language, onPlan }: Readonly<{
  entries: readonly Entry[]; language: Language; onPlan: (category: Category) => void
}>) {
  const t = text(language)
  return <details className="daily-panel">
    <summary>{t('budget')}</summary>
    <ul className="daily-history">{budgets(entries, today()).map(row => <li key={row.category}>
      <div>
        <strong>{t(row.category)}</strong>
        {row.limit !== undefined && <p>{t('planned')} · {displayAmount(row.limit, language)}</p>}
        <p>{t('spent')} · {displayAmount(row.actual, language)}</p>
        <p>{t('previous')} · {displayAmount(row.previous, language)}</p>
        {row.remaining !== undefined && <p>
          {t(row.remaining < 0n ? 'over' : 'remaining')} · {displayAmount(row.remaining < 0n ? -row.remaining : row.remaining, language)}
        </p>}
      </div>
      <div><button type="button" onClick={() => onPlan(row.category)}>{t('plan')} · {t(row.category)}</button></div>
    </li>)}</ul>
  </details>
}

export default function DailyLedger({ store, language, preview = false, separateBackup = false, shareMonthlyReport }: Props) {
  const t = text(language)
  const [entries, setEntries] = useState<readonly Entry[] | 'failed'>()
  const [attempt, setAttempt] = useState(0)
  const [flow, setFlow] = useState<Flow>()
  const [saved, setSaved] = useState(false)
  const [shareStatus, setShareStatus] = useState<'pending' | 'failed'>()
  useEffect(() => {
    let current = true
    void store.list().then(
      value => { if (current) setEntries(value) },
      () => { if (current) setEntries('failed') },
    )
    return () => { current = false }
  }, [store, attempt])
  if (!entries) return <p role="status">{t('loading')}</p>
  if (entries === 'failed') return <div role="alert">{t('failed')} <button type="button" onClick={() => {
    setEntries(undefined)
    setAttempt(value => value + 1)
  }}>{t('retry')}</button></div>

  const start = (next: Flow) => { setSaved(false); setFlow(next) }
  if (flow) return <div className="daily-ledger"><EntryForm store={store} flow={flow} language={language}
    onCancel={() => setFlow(undefined)} onSave={entry => {
      const next = [entry, ...entries.filter(row => row.command.id !== entry.command.id)]
      setEntries(next.sort((a, b) => b.command.date.localeCompare(a.command.date)))
      setFlow(undefined)
      setSaved(true)
    }} /></div>

  const asOf = today()
  const { balance, month, day } = summarize(entries, asOf)
  async function shareReport(entriesToReport: readonly Entry[]) {
    if (!shareMonthlyReport) return
    setShareStatus('pending')
    try {
      await shareMonthlyReport(entriesToReport, asOf)
      setShareStatus(undefined)
    } catch {
      setShareStatus('failed')
    }
  }
  return <div className="daily-ledger">
    <section className="daily-panel daily-overview">
      <h1>{t('title')}</h1>
      {!preview && <p>{t(separateBackup ? 'separateBackup' : 'backup')}</p>}
      <p>{t('balance')}</p>
      <strong className="daily-balance">{displayAmount(balance.cash + balance.bank, language)}</strong>
      <dl className="daily-summary">{([
        ['cash', balance.cash], ['bank', balance.bank], ['todayIn', day.income], ['todayOut', day.expense],
        ['monthIn', month.income], ['monthOut', month.expense],
      ] as const).map(([key, value]) => <div key={key}><dt>{t(key)}</dt><dd>{displayAmount(value, language)}</dd></div>)}</dl>
    </section>
    <div className="daily-actions">
      <button type="button" className="daily-primary" onClick={() => start({ kind: 'income' })}>{t('income')}</button>
      <button type="button" className="daily-primary" onClick={() => start({ kind: 'expense' })}>{t('expense')}</button>
    </div>
    <button type="button" className="daily-transfer" onClick={() => start({ kind: 'transfer' })}>{t('transfer')}</button>
    <details className="daily-panel">
      <summary>{t('opening')}</summary>
      <p>{t('openingHelp')}</p>
      {(['cash', 'bank'] as const).map(wallet => {
        const original = entries.find(({ command }) => command.kind === 'opening' && command.wallet === wallet)
        const reversed = original && entries.some(({ command }) => command.kind === 'reversal' && command.originalId === original.command.id)
        return <button type="button" key={wallet} disabled={Boolean(original && !reversed)}
          onClick={() => start({ kind: 'opening', wallet, ...(original && { correctionOf: original.command.id }) })}>
          {t(wallet)}
        </button>
      })}
    </details>
    {saved && <output role="status">{t(preview ? 'sampleSaved' : 'saved')}</output>}
    {shareMonthlyReport && <details className="daily-panel">
      <summary>{t('monthlyReport')}</summary>
      <p>{t('reportHelp')}</p>
      <button type="button" disabled={shareStatus === 'pending'} onClick={() => { void shareReport(entries) }}>
        {t('shareReport')}
      </button>
      {shareStatus === 'failed' && <p role="alert">{t('shareFailed')}</p>}
    </details>}
    <BudgetPanel entries={entries} language={language} onPlan={category => start({ kind: 'budget', category })} />
    <HouseholdPanel entries={entries} day={today()} language={language} onAction={start} />
    <History entries={entries} language={language} onReverse={originalId => start({ kind: 'reversal', originalId })} />
  </div>
}
