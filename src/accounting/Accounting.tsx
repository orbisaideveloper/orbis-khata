import { useEffect, useRef, useState } from 'react'
import type { Language } from '../i18n'
import * as api from './api'
import { accountingCopy } from './copy'
import { balance, minor, money, today } from './model'
import type { Account, Command, Company, Kind, Report, Voucher } from './model'
import './accounting.css'

type Props = { readonly userId: string; readonly language: Language }
const actions = ['sale', 'purchase', 'receipt', 'payment'] as const
const accounts: Account[] = ['cash', 'bank', 'receivable', 'payable', 'sales', 'purchases']
const pendingKey = (user: string) => `khata-pending-v1:${user}`
function restore(user: string): Command | null {
  try {
    const raw = sessionStorage.getItem(pendingKey(user))
    if (!raw) return null
    const c = JSON.parse(raw) as Command
    return c.id && c.company && c.party && /^\d+$/.test(c.amount) && [...actions, 'reversal'].includes(c.kind) ? c : null
  } catch { return null }
}
export function Accounting({ userId, language }: Props) {
  const t = accountingCopy[language]
  const [list, setList] = useState<Company[]>([])
  const [selected, setSelected] = useState(() => restore(userId)?.company ?? '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [create, setCreate] = useState(false)
  const [locked, setLocked] = useState(Boolean(restore(userId)))
  useEffect(() => {
    let alive = true
    setLoading(true); setError(false)
    void api.companies(userId).then(items => {
      if (!alive) return
      setList(items); setSelected(old => items.some(c => c.id === old) ? old : (items[0]?.id ?? ''))
      setLoading(false)
    }, () => { if (alive) { setLoading(false); setError(true) } })
    return () => { alive = false }
  }, [userId, refresh])
  if (loading) return <output>{t.loading}</output>
  if (error) return <div role="alert"><p>{t.error}</p><button type="button" onClick={() => setRefresh(n => n + 1)}>{t.retry}</button></div>
  const company = list.find(c => c.id === selected)
  return <div className="books">
    <div className="books-company">
      <label>{t.company}<select aria-label={t.company} value={selected} disabled={locked || !list.length} onChange={e => setSelected(e.target.value)}>
        {list.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      <button type="button" disabled={locked} onClick={() => setCreate(true)}>＋ {t.newCompany}</button>
    </div>
    {locked && <p className="books-warning">{t.locked}</p>}
    {(create || !list.length) && <RecordForm language={language} owner={userId} onCancel={list.length ? () => setCreate(false) : undefined}
      onCreated={c => { setList(old => [...old.filter(x => x.id !== c.id), c]); setSelected(c.id); setCreate(false) }} />}
    {company && <Books key={company.id} {...{ userId, language, company }} onLock={setLocked} />}
  </div>
}
function RecordForm({ language, owner, company, onCreated, onCancel }: {
  language: Language; owner: string; company?: string; onCreated: (record: Company) => void; onCancel?: () => void
}) {
  const t = accountingCopy[language]
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const guard = useRef(false)
  const pending = useRef<Record<string, string> | null>(null)
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (guard.current) return
    const form = new FormData(e.currentTarget)
    pending.current ??= company
      ? { id: crypto.randomUUID(), company_id: company, name: String(form.get('name')).trim(), kind: String(form.get('kind')) }
      : { id: crypto.randomUUID(), owner_id: owner, name: String(form.get('name')).trim() }
    guard.current = true; setBusy(true); setFailed(false)
    try { onCreated(await api.createRecord(company ? 'khata_parties' : 'khata_companies', pending.current)) }
    catch { setFailed(true) }
    finally { guard.current = false; setBusy(false) }
  }
  return <form className="books-card books-form" onSubmit={e => { void save(e) }}>
    <h2>{company ? t.newParty : t.newCompany}</h2>
    <label>{company ? t.partyName : t.companyName}<input name="name" required maxLength={120} pattern=".*\S.*" disabled={busy || failed} /></label>
    {company && <label>{t.kind}<select name="kind" disabled={busy || failed}><option value="customer">{t.customer}</option><option value="supplier">{t.supplier}</option><option value="both">{t.both}</option></select></label>}
    {failed && <p role="alert">{t.pending}</p>}
    <div className="books-buttons"><button type="submit" className="books-primary" disabled={busy}>{busy ? t.saving : (failed ? t.retry : t.create)}</button>
      {onCancel && !failed && <button type="button" onClick={onCancel} disabled={busy}>{t.cancel}</button>}</div>
  </form>
}
function Books({ userId, language, company, onLock }: Props & { company: Company; onLock: (locked: boolean) => void }) {
  const t = accountingCopy[language]
  const [from, setFrom] = useState(() => `${today().slice(0, 7)}-01`)
  const [to, setTo] = useState(today)
  const [party, setParty] = useState('')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [version, setVersion] = useState(0)
  const [addParty, setAddParty] = useState(false)
  const [kind, setKind] = useState<Kind | null>(null)
  const [reversal, setReversal] = useState<Voucher | null>(null)
  const [command, setCommand] = useState<Command | null>(() => { const c = restore(userId); return c?.company === company.id ? c : null })
  const [attempted, setAttempted] = useState(Boolean(command))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const [draft, setDraft] = useState<Command | null>(null)
  const guard = useRef(false)
  useEffect(() => { onLock(Boolean(command) || busy); }, [command, busy, onLock])
  useEffect(() => {
    if (!command) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [command])
  useEffect(() => {
    let alive = true
    setLoading(true); setError(false); setData(null)
    if (!from || !to || from > to) { setLoading(false); setError(true); return }
    void api.report(company.id, from, to, party, offset).then(report => {
      if (alive) { setData(report); setLoading(false) }
    }, () => { if (alive) { setError(true); setLoading(false) } })
    return () => { alive = false }
  }, [company.id, from, to, party, offset, version])
  async function save() {
    if (!command || guard.current) return
    try { sessionStorage.setItem(pendingKey(userId), JSON.stringify(command)) }
    catch { setSaveError(t.storage); return }
    guard.current = true; setBusy(true); setAttempted(true); setSaveError('')
    try {
      await api.post(command)
      sessionStorage.removeItem(pendingKey(userId))
      setCommand(null); setKind(null); setReversal(null); setAttempted(false)
      setMessage(t.saved); setVersion(n => n + 1)
    } catch (error_) {
      if (api.rejected(error_)) {
        sessionStorage.removeItem(pendingKey(userId)); setAttempted(false); setSaveError(t.rejected)
      } else setSaveError(t.pending)
    }
    finally { guard.current = false; setBusy(false) }
  }
  function review(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaveError(''); setMessage('')
    const f = new FormData(e.currentTarget)
    try {
      const amount = reversal?.amount_minor ?? minor(String(f.get('amount')))
      setCommand({ id: crypto.randomUUID(), company: company.id, party: reversal?.party_id ?? String(f.get('party')),
        kind: kind!, date: String(f.get('date')), amount, method: f.get('method') === 'bank' ? 'bank' : 'cash',
        reference: String(f.get('reference') ?? '').trim(), note: String(f.get('note') ?? '').trim(), reverses: reversal?.id ?? null })
      setAttempted(false)
    } catch { setSaveError(t.validation) }
  }
  const allowedParties = data?.parties.filter(p => kind === 'sale' || kind === 'receipt' ? p.kind !== 'supplier' : p.kind !== 'customer') ?? []
  const aggregate = (field: 'receivable' | 'payable', advance = false) => (data?.parties ?? []).reduce((sum, p) => {
    const n = BigInt(p[field]) * (advance ? -1n : 1n); return sum + (n > 0n ? n : 0n)
  }, 0n)
  return <>
    <section className="books-hero"><span className="books-kicker">ORBIS / {company.name}</span><h2>{t.title}</h2><p>{t.subtitle}</p><small>{t.separate}</small></section>
    <div className="books-filters"><label>{t.from}<input type="date" value={from} onChange={e => { setFrom(e.target.value); setOffset(0) }} /></label>
      <label>{t.to}<input type="date" value={to} max={today()} onChange={e => { setTo(e.target.value); setOffset(0) }} /></label>
      <button type="button" onClick={() => setVersion(n => n + 1)} disabled={loading}>{t.refresh}</button></div>
    {message && <output className="books-success">{message}</output>}
    {command && <section className="books-card books-confirm" aria-label={t.review}>
      <h2>{attempted ? t.pending : t.review}</h2><p>{t.reviewHint}</p>
      <dl><dt>{t.company}</dt><dd>{company.name}</dd><dt>{t.party}</dt><dd>{data?.parties.find(p => p.id === command.party)?.name ?? command.party}</dd>
        <dt>{t.kind}</dt><dd>{t[command.kind]}</dd><dt>{t.amount}</dt><dd className="books-total">{money(command.amount)}</dd>
        <dt>{t.date}</dt><dd>{command.date}</dd>{['receipt', 'payment'].includes(command.kind) && <><dt>{t.method}</dt><dd>{t[command.method]}</dd></>}
        <dt>{t.reference}</dt><dd>{command.reference || '—'}</dd><dt>{t.note}</dt><dd>{command.note || '—'}</dd></dl>
      {saveError && <p role="alert">{saveError}</p>}
      <div className="books-buttons"><button type="button" className="books-primary" disabled={busy} onClick={() => { void save() }}>{busy ? t.saving : (attempted ? t.retry : t.confirm)}</button>
        {!attempted && <button type="button" onClick={() => { setDraft(command); setKind(command.kind); setCommand(null); setSaveError('') }}>{t.edit}</button>}
        {!attempted && <button type="button" onClick={() => { setCommand(null); setKind(null); setReversal(null) }}>{t.cancel}</button>}</div>
      <small>ID: {command.id}</small>
    </section>}
    {loading && <output>{t.loading}</output>}
    {error && <p className="books-warning" role="alert">{from > to || !from || !to ? t.range : t.error}</p>}
    {data && <>
      <div className="books-section-title"><h2>{t.closing}</h2><span>{to}</span></div>
      <div className="books-stats">
        {(['cash', 'bank'] as const).map(a => <Metric key={a} label={t[a]} value={balance(data, a)} />)}
        <Metric label={t.receivable} value={aggregate('receivable')} /><Metric label={t.payable} value={aggregate('payable')} />
      </div>
      <div className="books-mini"><span>{t.advanceCustomer}<strong>{money(aggregate('receivable', true))}</strong></span><span>{t.advanceSupplier}<strong>{money(aggregate('payable', true))}</strong></span></div>
      {balance(data, 'cash') < 0n && <p className="books-warning">{t.cashWarning}</p>}
      <div className="books-section-title"><h2>{t.period}</h2><span>{from} → {to}</span></div>
      <div className="books-stats two"><Metric label={t.sales} value={-balance(data, 'sales', 'movement')} /><Metric label={t.purchases} value={balance(data, 'purchases', 'movement')} /></div>
      <div className="books-actions">{actions.map((action, i) => <button type="button" key={action} disabled={Boolean(command)} onClick={() => { setDraft(null); setKind(action); setReversal(null); setSaveError(''); setMessage('') }}><span aria-hidden="true">{['↗', '↙', '＋', '−'][i]}</span>{t[action]}</button>)}</div>
      <p className="books-hint">{t.invoiceHint}</p>
      {kind && !command && <form key={kind} className="books-card books-form" onSubmit={review}>
        <h2>{t[kind]}</h2>
        {reversal ? <p>{reversal.party_name} · {money(reversal.amount_minor)} · {reversal.reference}</p> : <>
          <label>{t.party}<select name="party" required defaultValue={draft?.party ?? ''}><option value="" disabled>{t.party}</option>{allowedParties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          {!allowedParties.length && <p>{t.noParties}</p>}
          <label>{t.amount}<input name="amount" inputMode="decimal" required autoComplete="off" defaultValue={draft ? `${BigInt(draft.amount) / 100n}.${String(BigInt(draft.amount) % 100n).padStart(2, '0')}` : ''} /></label></>}
        <label>{t.date}<input name="date" type="date" defaultValue={draft?.date ?? today()} min={reversal?.effective_date} max={today()} required /></label>
        {(kind === 'receipt' || kind === 'payment') && <label>{t.method}<select name="method" defaultValue={draft?.method ?? 'cash'}><option value="cash">{t.cash}</option><option value="bank">{t.bank}</option></select></label>}
        <label>{t.reference}<input name="reference" maxLength={80} defaultValue={draft?.reference ?? ''} /></label>
        <label>{t.note}<textarea name="note" maxLength={500} required={kind === 'reversal'} defaultValue={draft?.note ?? ''} /></label>
        {saveError && <p role="alert">{saveError}</p>}
        <div className="books-buttons"><button type="submit" className="books-primary" disabled={!reversal && !allowedParties.length}>{t.review}</button><button type="button" onClick={() => { setKind(null); setReversal(null) }}>{t.cancel}</button></div>
      </form>}
      <section className="books-card"><div className="books-section-title"><h2>{t.parties}</h2><button type="button" disabled={Boolean(command)} onClick={() => setAddParty(true)}>＋ {t.newParty}</button></div>
        {!data.parties.length && <p>{t.noParties}</p>}
        {addParty && <RecordForm language={language} owner={userId} company={company.id} onCancel={() => setAddParty(false)} onCreated={() => { setAddParty(false); setVersion(n => n + 1) }} />}
        <div className="books-party-list">{data.parties.map(p => <button type="button" key={p.id} className={party === p.id ? 'selected' : ''} onClick={() => { setParty(p.id); setOffset(0) }}>
          <span><strong>{p.name}</strong><small>{t[p.kind]}</small></span><span><small>{t.receivable}: {money(p.receivable)}</small><small>{t.payable}: {money(p.payable)}</small></span>
        </button>)}</div>
      </section>
      <section className="books-card"><div className="books-section-title"><h2>{t.ledger}</h2><span>{data.count} {t.entries}</span></div>
        <label className="books-party-filter">{t.party}<select value={party} onChange={e => { setParty(e.target.value); setOffset(0) }}><option value="">{t.all}</option>{data.parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <div className="books-ledger-summary"><span>{t.opening} / {t.receivable}<strong>{money(data.ledger_balances.receivable?.opening ?? '0')}</strong></span><span>{t.opening} / {t.payable}<strong>{money(-BigInt(data.ledger_balances.payable?.opening ?? '0'))}</strong></span>
          <span>{t.closing} / {t.receivable}<strong>{money(data.ledger_balances.receivable?.closing ?? '0')}</strong></span><span>{t.closing} / {t.payable}<strong>{money(-BigInt(data.ledger_balances.payable?.closing ?? '0'))}</strong></span></div>
        {!data.entries.length && <p className="books-empty">{t.empty}</p>}
        {data.entries.map(v => <article className="books-entry" key={v.id}>
          <div className="books-entry-top"><span className={`books-badge ${v.kind}`}>{t[v.kind]}</span><time>{v.effective_date}</time><strong>{money(v.amount_minor)}</strong></div>
          <h3>{v.party_name}</h3><p>{t.dr}: {t[v.debit_account]} · {t.cr}: {t[v.credit_account]}</p>
          {v.reference && <p>{t.reference}: {v.reference}</p>}{v.note && <p>{v.note}</p>}
          <details><summary>ID</summary><small>{v.id}</small></details>
          {v.reversed ? <small>{t.reversed}</small> : v.kind !== 'reversal' && <button type="button" disabled={Boolean(command)} onClick={() => { setDraft(null); setKind('reversal'); setReversal(v); setSaveError('') }}>{t.reverse}</button>}
        </article>)}
        <div className="books-buttons"><button type="button" disabled={offset === 0} onClick={() => setOffset(n => Math.max(0, n - 50))}>{t.previous}</button><span>{Math.floor(offset / 50) + 1}</span><button type="button" disabled={offset + 50 >= data.count} onClick={() => setOffset(n => n + 50)}>{t.next}</button></div>
      </section>
      <footer className="books-foot"><span>{accounts.reduce((sum, a) => sum + balance(data, a), 0n) === 0n ? `✓ ${t.trial}` : '⚠ Journal mismatch'}</span><p>{t.scope}</p></footer>
    </>}
  </>
}
function Metric({ label, value }: { readonly label: string; readonly value: bigint }) {
  return <div className="books-metric"><span>{label}</span><strong>{money(value)}</strong></div>
}
