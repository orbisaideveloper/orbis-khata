import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { today } from '../accounting/model'
import type { Language } from '../i18n'
import { readNativeDailyLedger, saveNativeDailyLedger } from '../native-local/runtime'
import { displayAmount, label, locale, type LedgerKey } from './copy'
import { categories, isCategory, parseAmount, summarize, validDate, type Command, type Entry, type Wallet } from './journal'
import './daily-ledger.css'

type Flow = { kind: 'income' | 'expense' | 'transfer' } | { kind: 'reversal'; originalId: string }
type Props = Readonly<{ owner: string; language: Language }>
const text = (language: Language) => (key: LedgerKey) => label(language, key)

function makeCommand(flow: Flow, wallet: Wallet, form: FormData): Command {
  const date = String(form.get('date'))
  if (!validDate(date) || date > today()) throw new Error('DAILY_DATE_INVALID')
  const common = { version: 1 as const, id: crypto.randomUUID(), date, note: String(form.get('note') ?? '') }
  if (flow.kind === 'reversal') return { ...common, ...flow }
  const amountMinor = parseAmount(String(form.get('amount')))
  if (flow.kind === 'transfer') return { ...common, kind: flow.kind, from: wallet, to: wallet === 'cash' ? 'bank' : 'cash', amountMinor }
  const category = form.get('category')
  return flow.kind === 'expense'
    ? { ...common, kind: flow.kind, wallet, amountMinor, ...(isCategory(category) && { category }) }
    : { ...common, kind: flow.kind, wallet, amountMinor }
}

function EntryForm({ owner, flow, language, onSave, onCancel }: Props & Readonly<{
  flow: Flow; onSave: (entry: Entry) => void; onCancel: () => void
}>) {
  const t = text(language)
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const [wallet, setWallet] = useState<Wallet>('cash')
  const [pending, setPending] = useState<Command>()
  const [saving, setSaving] = useState(false)
  const [issue, setIssue] = useState<'invalid' | 'saveFailed'>()
  const busy = useRef(false)
  useEffect(() => { heading.current?.focus() }, [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    let input: Command
    try { input = pending ?? makeCommand(flow, wallet, new FormData(event.currentTarget)) }
    catch { setIssue('invalid'); return }
    busy.current = true
    setPending(input)
    setSaving(true)
    setIssue(undefined)
    try { onSave(await saveNativeDailyLedger(owner, input)) }
    catch { setIssue('saveFailed') }
    finally { busy.current = false; setSaving(false) }
  }

  return <form className="daily-panel daily-form" aria-labelledby={headingId} onSubmit={event => { void save(event) }}>
    <h2 id={headingId} tabIndex={-1} ref={heading}>{t(flow.kind)}</h2>
    <fieldset disabled={Boolean(pending)}>
      {flow.kind === 'reversal' ? <p>{t('confirm')}</p> : <>
        <label>{t('amount')}<input name="amount" inputMode="decimal" maxLength={16} required /></label>
        <label>{t(flow.kind === 'transfer' ? 'from' : 'account')}
          <select value={wallet} onChange={event => setWallet(event.target.value === 'bank' ? 'bank' : 'cash')}>
            <option value="cash">{t('cash')}</option><option value="bank">{t('bank')}</option>
          </select>
        </label>
        {flow.kind === 'transfer' && <p>{t('to')} · {t(wallet === 'cash' ? 'bank' : 'cash')}</p>}
        {flow.kind === 'expense' && <label>{t('category')}<select name="category" defaultValue="other">
          {categories.map(category => <option key={category} value={category}>{t(category)}</option>)}
        </select></label>}
      </>}
      <label>{t('date')}<input name="date" type="date" defaultValue={today()} max={today()} required /></label>
      <label>{t('note')}<input name="note" maxLength={240} /></label>
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
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(20)
  const dates = new Intl.DateTimeFormat(locale[language], { dateStyle: 'medium', timeZone: 'UTC' })
  const reversed = new Set(entries.flatMap(({ command }) => command.kind === 'reversal' ? [command.originalId] : []))
  const rows = entries.filter(({ command }) => command.kind !== 'budget' &&
    (command.note + ' ' + command.date).toLocaleLowerCase(locale[language]).includes(query.trim().toLocaleLowerCase(locale[language])))
  return <section className="daily-panel">
    <h2>{t('history')}</h2>
    <label>{t('search')}<input type="search" value={query} onChange={event => { setQuery(event.target.value); setVisible(20) }} /></label>
    {!rows.length && <p>{t('empty')}</p>}
    <ul className="daily-history">{rows.slice(0, visible).map(({ command, postings }) => <li key={command.id}>
      <div><strong>{t(command.kind === 'reversal' ? 'reversed' : command.kind)}</strong><br />
        <time dateTime={command.date}>{dates.format(new Date(command.date))}</time>
        {command.note && <p>{command.note}</p>}
      </div>
      <div><strong>{displayAmount(BigInt(postings[0].delta.replace(/^-/, '')), language)}</strong>
        {command.kind !== 'reversal' && !reversed.has(command.id) &&
          <button type="button" onClick={() => onReverse(command.id)}>{t('reversal')}</button>}
      </div>
    </li>)}</ul>
    {visible < rows.length && <button type="button" onClick={() => setVisible(visible + 20)}>{t('more')}</button>}
  </section>
}

export default function DailyLedger({ owner, language }: Props) {
  const t = text(language)
  const [entries, setEntries] = useState<readonly Entry[] | 'failed'>()
  const [attempt, setAttempt] = useState(0)
  const [flow, setFlow] = useState<Flow>()
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    let current = true
    void readNativeDailyLedger(owner).then(
      value => { if (current) setEntries(value) },
      () => { if (current) setEntries('failed') },
    )
    return () => { current = false }
  }, [owner, attempt])
  if (!entries) return <p role="status">{t('loading')}</p>
  if (entries === 'failed') return <div role="alert">{t('failed')} <button type="button" onClick={() => {
    setEntries(undefined)
    setAttempt(value => value + 1)
  }}>{t('retry')}</button></div>

  const start = (next: Flow) => { setSaved(false); setFlow(next) }
  if (flow) return <div className="daily-ledger"><EntryForm owner={owner} flow={flow} language={language}
    onCancel={() => setFlow(undefined)} onSave={entry => {
      const next = [entry, ...entries.filter(row => row.command.id !== entry.command.id)]
      setEntries(next.sort((a, b) => b.command.date.localeCompare(a.command.date)))
      setFlow(undefined)
      setSaved(true)
    }} /></div>

  const { balance, month, day } = summarize(entries, today())
  return <div className="daily-ledger">
    <section className="daily-panel">
      <h1>{t('title')}</h1>
      <p>{t('backup')}</p>
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
    <button type="button" onClick={() => start({ kind: 'transfer' })}>{t('transfer')}</button>
    {saved && <output role="status">{t('saved')}</output>}
    <History entries={entries} language={language} onReverse={originalId => start({ kind: 'reversal', originalId })} />
  </div>
}
