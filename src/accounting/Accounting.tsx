import { LedgerExplorer } from './LedgerExplorer'
import { useBooksNavigation, booksLabels } from '../books-navigation'
import { useEffect, useRef, useState } from 'react'
import type { Language } from '../i18n'
import * as api from './api'
import { pendingCommand } from './pending-command'
import { accountingCopy } from './copy'
import { balance, minor, money, today } from './model'
import type { Account, Command, Company, Kind, Report, Voucher } from './model'
import './accounting.css'
import { useTutorial } from '../tutorial'
import { restoreInventory } from '../inventory/pending'
import { Inventory } from '../inventory/Inventory'
import { Expenses } from './Expenses'
import { restoreExpense } from './expense-pending'

type Props = { readonly userId: string; readonly language: Language; readonly initialCompany?:string; readonly onBill?:(kind:'sale'|'purchase'|'expense')=>void; readonly onCompanyChange?:(id:string)=>void }
const actions = ['sale', 'purchase', 'receipt', 'payment'] as const
function aggregateParties(parties: Report['parties'], field: 'receivable' | 'payable', advance = false) {
  return parties.reduce((sum, party) => {
    const amount = BigInt(party[field]) * (advance ? -1n : 1n)
    return sum + (amount > 0n ? amount : 0n)
  }, 0n)
}

const accounts: Account[] = ['cash', 'bank', 'receivable', 'payable', 'sales', 'purchases', 'expenses', 'expense_payable', 'opening_equity']
const pendingKey = (user: string) => `khata-pending-v1:${user}`

function restore(user: string): Command | null {
  try {
    const raw = sessionStorage.getItem(pendingKey(user))
    if (!raw) return null
    return pendingCommand(JSON.parse(raw.startsWith('{') ? raw : decodeURIComponent(raw)))
  } catch { return null }
}

export function Accounting({ userId, language, onBill, onCompanyChange, initialCompany }: Readonly<Props>) {
  const t = accountingCopy[language]
  const [list, setList] = useState<Company[]>([])
  const [selected, setSelected] = useState(() => restore(userId)?.company ?? restoreInventory(userId)?.company ?? initialCompany ?? '')
  useEffect(()=>{if(selected)onCompanyChange?.(selected)},[selected,onCompanyChange])
  const [refresh, setRefresh] = useState(0)
  const [outcome, setOutcome] = useState<{ user: string; refresh: number; error: boolean } | null>(null)
  const currentOutcome = outcome?.user === userId && outcome.refresh === refresh ? outcome : null
  const loading = currentOutcome === null
  const error = Boolean(currentOutcome?.error)
  const [create, setCreate] = useState(false)
  const [locked, setLocked] = useState(Boolean(restore(userId)||restoreInventory(userId)))

  useEffect(() => {
    let alive = true
    void api.companies(userId).then(items => {
      if (!alive) return
      setList(items);
      setSelected(old => {
        if (items.some(c => c.id === old)) return old;
        return items[0]?.id ?? '';
      })
      setOutcome({ user: userId, refresh, error: false })
    }, () => { if (alive) setOutcome({ user: userId, refresh, error: true }) })
    return () => { alive = false }
  }, [userId, refresh])

  if (loading) return <output aria-live="polite">{t.loading}</output>
  if (error) return <output aria-live="polite"><p>{t.error}</p><button type="button" onClick={() => setRefresh(n => n + 1)}>{t.retry}</button></output>

  const company = list.find(c => c.id === selected)
  const showRecordForm = create || !list.length;

  return <div className="books">
    <div className="books-company">
      <label>{t.company}<select aria-label={t.company} value={selected} disabled={locked || !list.length} onChange={e => setSelected(e.target.value)}>
        {list.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      <button type="button" disabled={locked} onClick={() => setCreate(true)}>＋ {t.newCompany}</button>
    </div>
    {locked && <p className="books-warning">{t.locked}</p>}

    {showRecordForm && <RecordForm language={language} owner={userId} onCancel={list.length ? () => setCreate(false) : undefined}
      onCreated={c => { setList(old => [...old.filter(x => x.id !== c.id), c]); setSelected(c.id); setCreate(false) }} />}

    {company && <Books key={company.id} {...{ userId, language, company, onBill }} onLock={setLocked} />}
  </div>
}

function RecordForm({ language, owner, company, onCreated, onCancel }: Readonly<{
  language: Language; owner: string; company?: string; onCreated: (record: Company) => void; onCancel?: () => void
}>) {
  const t = accountingCopy[language]
  const [partyType,setPartyType] = useState('customer')
  const expensePreview = Boolean(company) && partyType==='expense' && import.meta.env.VITE_KHATA_PREVIEW === 'true' && import.meta.env.VITE_KHATA_DEMO !== 'true'
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const guard = useRef(false)
  const pending = useRef<Record<string, string> | null>(null)

  async function save(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (guard.current || expensePreview) return
    const form = new FormData(e.currentTarget)
    pending.current ??= company
      ? { id: crypto.randomUUID(), company_id: company, name: (form.get('name') as string || '').trim(), kind: (form.get('kind') as string || '') }
      : { id: crypto.randomUUID(), owner_id: owner, name: (form.get('name') as string || '').trim() }

    guard.current = true; setBusy(true); setFailed(false)
    try { onCreated(await api.createRecord(company ? 'khata_parties' : 'khata_companies', pending.current)) }
    catch { setFailed(true) }
    finally { guard.current = false; setBusy(false) }
  }

  let recordBtnLabel = t.create;
  if (busy) recordBtnLabel = t.saving;
  else if (failed) recordBtnLabel = t.retry;

  return <form className="books-card books-form" onSubmit={save}>
    <h2>{company ? t.newParty : t.newCompany}</h2>
    <label>{company ? t.partyName : t.companyName}<input name="name" required maxLength={120} pattern=".*\S.*" disabled={busy || failed} /></label>
    {company && <label>{t.kind}<select name="kind" value={partyType} onChange={e=>setPartyType(e.target.value)} disabled={busy || failed}><option value="customer">{t.customer}</option><option value="supplier">{t.supplier}</option><option value="both">{t.both}</option><option value="expense">{t.expense}</option></select></label>}
    {expensePreview && <output>{language==='bn'?'খরচের পার্টি এখন প্রিভিউতে আছে। আপডেট চালু হলে সংরক্ষণ করা যাবে।':language==='hi'?'खर्च पार्टी अभी प्रीव्यू में है। अपडेट के बाद सेव कर सकेंगे।':'Expense contacts are in preview. Saving becomes available after the update.'}</output>}
    {failed && <output aria-live="polite">{t.pending}</output>}
    <div className="books-buttons">
      <button type="submit" className="books-primary" disabled={busy || expensePreview}>{recordBtnLabel}</button>
      {onCancel && !failed && <button type="button" onClick={onCancel} disabled={busy}>{t.cancel}</button>}
    </div>
  </form>
}

function SectionTitle({ title, subtitle, children }: Readonly<{ title: string; subtitle?: React.ReactNode; children?: React.ReactNode }>) {
  return <div className="books-section-title"><h2>{title}</h2>{subtitle && <span>{subtitle}</span>}{children}</div>
}

function Metric({ label, value }: Readonly<{ label: string; value: bigint }>) {
  return <div className="books-metric"><span>{label}</span><strong>{money(value)}</strong></div>
}

function Books({ userId, language, company, onLock, onBill }: Readonly<Props & { company: Company; onLock: (locked: boolean) => void }>) {
  const t = accountingCopy[language]
  const [from, setFrom] = useState(() => `${today().slice(0, 7)}-01`)
  const [to, setTo] = useState(today)
  const [party, setParty] = useState('')
  const [offset, setOffset] = useState(0)
  const [version, setVersion] = useState(0)
  const query = JSON.stringify([company.id, from, to, party, offset, version])
  const validRange = Boolean(from && to && from <= to)
  const [result, setResult] = useState<{ query: string; data: Report | null; error: boolean } | null>(null)
  const currentResult = result?.query === query ? result : null
  const data = validRange ? currentResult?.data ?? null : null
  const loading = validRange && currentResult === null
  const error = !validRange || Boolean(currentResult?.error)
  const [addParty, setAddParty] = useState(false)
  const [editingParty,setEditingParty]=useState<Report['parties'][number]|null>(null)
  const demo=import.meta.env.DEV&&import.meta.env.VITE_KHATA_DEMO==='true'
  async function editParty(event:React.SyntheticEvent<HTMLFormElement>){
   event.preventDefault();if(!demo||!editingParty)return
   const form=new FormData(event.currentTarget)
   try{(await import('../demo/store')).editDemoParty(editingParty.id,String(form.get('name')??''));setEditingParty(null);setVersion(n=>n+1)}catch{setMessage(t.validation)}
  }
  const [kind, setKind] = useState<Kind | null>(null)
  const [reversal, setReversal] = useState<Voucher | null>(null)
  const [command, setCommand] = useState<Command | null>(() => { const c = restore(userId); return c?.company === company.id ? c : null })
  const [attempted, setAttempted] = useState(Boolean(command))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const [draft, setDraft] = useState<Command | null>(null)
  const guard = useRef(false)
  const [expenseLocked, setExpenseLocked] = useState(()=>Boolean(restoreExpense(userId,company.id)))
  const [inventoryLocked,setInventoryLocked] = useState(()=>restoreInventory(userId)?.company===company.id)
  const [stockOpen] = useState(()=>restoreInventory(userId)?.company===company.id)
  const tutorial = useTutorial()
  const navigation = useBooksNavigation()
  const labels = booksLabels[language]
  const page = navigation.page
  const navigationLocked = Boolean(command)||busy||expenseLocked||inventoryLocked

  useEffect(() => { onLock(Boolean(command) || busy || expenseLocked || inventoryLocked); }, [command, busy, expenseLocked, inventoryLocked, onLock])
  useEffect(() => {
    if (!command) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [command])

  useEffect(() => {
    let alive = true
    if (!from || !to || from > to) return
    void api.report(company.id, from, to, party, offset).then(report => {
      if (alive) setResult({ query, data: report, error: false })
    }, () => { if (alive) setResult({ query, data: null, error: true }) })
    return () => { alive = false }
  }, [company.id, from, to, party, offset, version, query])

  async function save() {
    if (!command || guard.current) return
    const recovery = JSON.stringify(command)
    // Recovery is a bounded plain-text record; markup is refused before persistence.
    if (!/^[^<>]{1,8192}$/u.test(recovery)) { setSaveError(t.plainText); return }
    try { sessionStorage.setItem(pendingKey(userId), encodeURIComponent(recovery)) }
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

  function review(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (expenseLocked || inventoryLocked) return
    setSaveError(''); setMessage('')
    const f = new FormData(e.currentTarget)
    try {
      const amountStr = (f.get('amount') as string || '')
      const partyStr = (f.get('party') as string || '')
      const dateStr = (f.get('date') as string || '')
      const refStr = (f.get('reference') as string || '').trim()
      const noteStr = (f.get('note') as string || '').trim()

      const amount = reversal?.amount_minor ?? minor(amountStr)
      setCommand({ id: crypto.randomUUID(), company: company.id, party: reversal?.party_id ?? partyStr,
        kind: kind!, date: dateStr, amount, method: f.get('method') === 'bank' ? 'bank' : 'cash',
        reference: refStr, note: noteStr, reverses: reversal?.id ?? null })
      setAttempted(false)
    } catch { setSaveError(t.validation) }
  }

  const allowedParties = data?.parties.filter(p => p.kind !== 'expense').filter(p => kind === 'sale' || kind === 'receipt' ? p.kind !== 'supplier' : p.kind !== 'customer') ?? []


  let saveButtonLabel = t.confirm;
  if (busy) saveButtonLabel = t.saving;
  else if (attempted) saveButtonLabel = t.retry;

  return <>
    <section className="books-hero"><span className="books-kicker">ORBIS / {company.name}</span><h2>{t.title}</h2>{tutorial && <><p>{t.subtitle}</p><small>{t.separate}</small></>}</section>

    <nav className="books-navigation" aria-label={labels.ledger}>{(['ledger','all-ledgers','parties','items','expenses'] as const).map(target=><button type="button" key={target} aria-current={page===target?'page':undefined} disabled={navigationLocked} onClick={()=>navigation.open(target)}>{labels[target]}</button>)}</nav>
    <div className="books-filters">
      <label>{t.from}<input type="date" value={from} onChange={e => { setFrom(e.target.value); setOffset(0) }} /></label>
      <label>{t.to}<input type="date" value={to} max={today()} onChange={e => { setTo(e.target.value); setOffset(0) }} /></label>
      <button type="button" onClick={() => setVersion(n => n + 1)} disabled={loading}>{t.refresh}</button>
    </div>

    {message && <output aria-live="polite" className="books-success">{message}</output>}

    {command && <section className="books-card books-confirm" aria-label={t.review}>
      <h2>{attempted ? t.pending : t.review}</h2>{tutorial && <p>{t.reviewHint}</p>}
      <dl>
        <dt>{t.company}</dt><dd>{company.name}</dd>
        <dt>{t.party}</dt><dd>{data?.parties.find(p => p.id === command.party)?.name ?? command.party}</dd>
        <dt>{t.kind}</dt><dd>{t[command.kind]}</dd>
        <dt>{t.amount}</dt><dd className="books-total">{money(command.amount)}</dd>
        <dt>{t.date}</dt><dd>{command.date}</dd>
        {['receipt', 'payment'].includes(command.kind) && <><dt>{t.method}</dt><dd>{t[command.method]}</dd></>}
        <dt>{t.reference}</dt><dd>{command.reference || '—'}</dd>
        <dt>{t.note}</dt><dd>{command.note || '—'}</dd>
      </dl>
      {saveError && <output aria-live="polite">{saveError}</output>}
      <div className="books-buttons">
        <button type="button" className="books-primary" disabled={busy} onClick={() => { void save() }}>{saveButtonLabel}</button>
        {!attempted && <button type="button" onClick={() => { setDraft(command); setKind(command.kind); setCommand(null); setSaveError('') }}>{t.edit}</button>}
        {!attempted && <button type="button" onClick={() => { setCommand(null); setKind(null); setReversal(null) }}>{t.cancel}</button>}
      </div>
      <small>ID: {command.id}</small>
    </section>}

    {loading && <output aria-live="polite">{t.loading}</output>}
    {error && <output aria-live="polite" className="books-warning">{from > to || !from || !to ? t.range : t.error}</output>}

    {data && <>
      <div hidden={page!=='items'&&page!=='stock'&&!inventoryLocked}>
        {(page==='items'||page==='stock'||stockOpen||inventoryLocked) && <Inventory key={company.id} {...{userId,language,from,to,version}} simple={page==='items'} company={company.id} companyName={company.name} parties={data.parties} onLock={setInventoryLocked} onChanged={()=>setVersion(n=>n+1)} blocked={Boolean(command)||busy||expenseLocked}/>} 
      </div>
      {page==='all-ledgers'&&<><LedgerExplorer {...{language,from,to,version}} company={company.id} parties={data.parties}/><button type="button" disabled={navigationLocked} onClick={()=>navigation.open('stock')}>{labels.stock}</button></>}
      {page==='stock'&&<button type="button" disabled={navigationLocked} onClick={()=>navigation.open('all-ledgers')}>{labels['all-ledgers']}</button>}
      {(page==='expenses'||expenseLocked)&&<div><Expenses {...{userId,language,from,to,version}} company={company.id} companyName={company.name} payees={data.parties.filter(p=>p.kind==='expense').map(p=>p.name)} onLock={setExpenseLocked} onChanged={()=>setVersion(n=>n+1)} blocked={Boolean(command)||busy||inventoryLocked}/></div>}
      <div hidden={page!=='ledger'}>
      <SectionTitle title={t.closing} subtitle={to} />
      <div className="books-stats">
        {(['cash', 'bank'] as const).map(a => <Metric key={a} label={t[a]} value={balance(data, a)} />)}
        <Metric label={t.receivable} value={aggregateParties(data.parties, 'receivable')} /><Metric label={t.payable} value={aggregateParties(data.parties, 'payable')} />
      </div>
      <div className="books-mini"><span>{t.advanceCustomer}<strong>{money(aggregateParties(data.parties, 'receivable', true))}</strong></span><span>{t.advanceSupplier}<strong>{money(aggregateParties(data.parties, 'payable', true))}</strong></span></div>
      {balance(data, 'cash') < 0n && <p className="books-warning">{t.cashWarning}</p>}

      <SectionTitle title={t.period} subtitle={`${from} → ${to}`} />
      <div className="books-stats two"><Metric label={t.sales} value={-balance(data, 'sales', 'movement')} /><Metric label={t.purchases} value={balance(data, 'purchases', 'movement')} /></div>
      <div className="books-actions">
        {actions.map((action, i) => <button type="button" key={action} disabled={Boolean(command) || expenseLocked || inventoryLocked} onClick={() => { if(onBill&&(action==='sale'||action==='purchase')){onBill(action);return}setDraft(null); setKind(action); setReversal(null); setSaveError(''); setMessage('') }}><span aria-hidden="true">{['↗', '↙', '＋', '−'][i]}</span>{t[action]}</button>)}
      </div>
      {tutorial && <p className="books-hint">{t.invoiceHint}</p>}

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
        {saveError && <output aria-live="polite">{saveError}</output>}
        <div className="books-buttons">
          <button type="submit" className="books-primary" disabled={!reversal && !allowedParties.length}>{t.review}</button>
          <button type="button" onClick={() => { setKind(null); setReversal(null) }}>{t.cancel}</button>
        </div>
      </form>}

      </div>
      <section className="books-card" hidden={page!=='parties'}>
        <SectionTitle title={labels.parties}><button type="button" disabled={Boolean(command) || expenseLocked || inventoryLocked} onClick={() => setAddParty(true)}>＋ {t.newParty}</button></SectionTitle>
        {!data.parties.length && <p>{t.noParties}</p>}
        {addParty && <RecordForm language={language} owner={userId} company={company.id} onCancel={() => setAddParty(false)} onCreated={() => { setAddParty(false); setVersion(n => n + 1) }} />}
        <div className="books-party-list">{data.parties.map(p => <div key={p.id}><button type="button" key={p.id} className={party === p.id ? 'selected' : ''} onClick={() => { if(p.kind==='expense'){navigation.open('expenses');return}setParty(p.id); setOffset(0);navigation.open('ledger') }}>
          <span><strong>{p.name}</strong><small>{t[p.kind]}</small></span><span><small>{t.receivable}: {money(p.receivable)}</small><small>{t.payable}: {money(p.payable)}</small></span>
        </button>{demo&&<button type="button" disabled={navigationLocked} onClick={()=>setEditingParty(p)}>{t.edit}</button>}</div>)}</div>
        {editingParty&&<form className="books-form" onSubmit={editParty}><h3>{t.edit}: {editingParty.name}</h3><label>{t.partyName}<input name="name" required maxLength={120} defaultValue={editingParty.name}/></label><button type="submit">{t.confirm}</button><button type="button" onClick={()=>setEditingParty(null)}>{t.cancel}</button></form>}
      </section>

      <section className="books-card" hidden={page!=='ledger'}>
        <SectionTitle title={t.ledger} subtitle={`${data.count} ${t.entries}`} />
        <label className="books-party-filter">{t.party}<select value={party} onChange={e => { setParty(e.target.value); setOffset(0) }}><option value="">{t.all}</option>{data.parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <div className="books-ledger-summary"><span>{t.opening} / {t.receivable}<strong>{money(data.ledger_balances.receivable?.opening ?? '0')}</strong></span><span>{t.opening} / {t.payable}<strong>{money(-BigInt(data.ledger_balances.payable?.opening ?? '0'))}</strong></span>
          <span>{t.closing} / {t.receivable}<strong>{money(data.ledger_balances.receivable?.closing ?? '0')}</strong></span><span>{t.closing} / {t.payable}<strong>{money(-BigInt(data.ledger_balances.payable?.closing ?? '0'))}</strong></span></div>
        {!data.entries.length && <p className="books-empty">{t.empty}</p>}
        {data.entries.map(v => <article className="books-entry" key={v.id}>
          <div className="books-entry-top"><span className={`books-badge ${v.kind}`}>{t[v.kind]}</span><time>{v.effective_date}</time><strong>{money(v.amount_minor)}</strong></div>
          <h3>{v.party_name}</h3><p>{t.dr}: {t[v.debit_account]} · {t.cr}: {t[v.credit_account]}</p>
          {v.reference && <p>{t.reference}: {v.reference}</p>}{v.note && <p>{v.note}</p>}
          <details><summary>ID</summary><small>{v.id}</small></details>
          {v.reversed ? <small>{t.reversed}</small> : v.kind !== 'reversal' && <button type="button" disabled={Boolean(command) || expenseLocked || inventoryLocked} onClick={() => { setDraft(null); setKind('reversal'); setReversal(v); setSaveError('') }}>{t.reverse}</button>}
        </article>)}
        <div className="books-buttons">
          <button type="button" disabled={offset === 0} onClick={() => setOffset(n => Math.max(0, n - 50))}>{t.previous}</button><span>{Math.floor(offset / 50) + 1}</span>
          <button type="button" disabled={offset + 50 >= data.count} onClick={() => setOffset(n => n + 50)}>{t.next}</button>
        </div>
      </section>

      <footer className="books-foot"><span>{accounts.reduce((sum, a) => sum + balance(data, a), 0n) === 0n ? `✓ ${t.trial}` : '⚠ Journal mismatch'}</span>{tutorial && <p>{t.scope}</p>}</footer>
    </>}
  </>
}
