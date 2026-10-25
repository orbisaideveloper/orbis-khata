import { useEffect, useRef, useState } from 'react'
import type { Language } from '../i18n'
import { expenseReport, postExpense, rejected } from './api'
import { expenseCommand } from './expense-model'
import type { ExpenseBill, ExpenseCommand, ExpenseEntry, ExpenseReport } from './expense-model'
import { expenseCopy } from './expense-copy'
import { minor, money, today } from './model'

type Props = { userId: string; company: string; companyName: string; language: Language; from: string; to: string; version: number; onChanged: () => void; onLock: (locked: boolean) => void; blocked: boolean }
type Draft = { kind: ExpenseCommand['kind']; parent: string | null; category: string; payee: string; amount: string; date: string }
function key(user: string, company: string) { return `khata-expense-pending-v1:${user}:${company}` }
function recovered(user: string, company: string) {
  try {
    const raw = sessionStorage.getItem(key(user,company))
    const p = raw && raw.length <= 8192 ? expenseCommand(JSON.parse(raw)) : null
    return p && p.company === company ? p : null
  } catch { return null }
}
function decimal(value: string) { return `${BigInt(value)/100n}.${String(BigInt(value)%100n).padStart(2,'0')}` }
export function Expenses({userId,company,companyName,language,from,to,version,onChanged,onLock,blocked}: Readonly<Props>) {
  const t = expenseCopy[language]
  const [offset,setOffset] = useState(0), [reload,setReload] = useState(0)
  const query = JSON.stringify([company,from,to,offset,version,reload])
  const [result,setResult] = useState<{query: string; data: ExpenseReport | null} | null>(null)
  const validRange = Boolean(from && to && from<=to)
  const data = validRange && result?.query === query ? result.data : null
  const loading = validRange && result?.query !== query
  const [draft,setDraft] = useState<Draft | null>(null)
  const [pending,setPending] = useState<ExpenseCommand | null>(() => recovered(userId,company))
  const [attempted,setAttempted] = useState(Boolean(pending)), [busy,setBusy] = useState(false), [message,setMessage] = useState('')
  const guard = useRef(false)
  useEffect(() => {
    let alive = true
    if (!from || !to || from>to) return
    void expenseReport(company,from,to,offset).then(data => { if(alive) setResult({query,data}) }, () => { if(alive) setResult({query,data:null}) })
    return () => {alive=false}
  },[company,from,to,offset,query])
  useEffect(() => { onLock(Boolean(pending) || busy) },[pending,busy,onLock])
  useEffect(() => {
    if (!pending) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload',warn)
    return () => window.removeEventListener('beforeunload',warn)
  },[pending])
  function pay(bill: ExpenseBill) {
    setDraft({kind:'payment',parent:bill.id,category:bill.category,payee:bill.payee,amount:decimal(bill.due),date:today()});setMessage('')
  }
  function reverse(entry: ExpenseEntry) {
    setDraft({kind:'reversal',parent:entry.id,category:entry.category,payee:entry.payee,amount:decimal(entry.amount),date:today()});setMessage('')
  }
  function review(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if(!draft || blocked) return
    const f = new FormData(e.currentTarget)
    try {
      const p = expenseCommand({id:crypto.randomUUID(),company,date:String(f.get('date')),kind:draft.kind,amount:minor(String(f.get('amount'))),
        category:String(f.get('category')).trim(),payee:String(f.get('payee')).trim(),method:draft.kind==='reversal' || f.get('method')==='due' ? null : String(f.get('method')),
        parent:draft.parent,reference:String(f.get('reference')).trim(),note:String(f.get('note')).trim()})
      if(!p || p.date>today()) throw new Error('invalid')
      setPending(p);setAttempted(false);setDraft(null);setMessage('')
    } catch { setMessage(t.invalid) }
  }
  async function save() {
    if(!pending || guard.current || blocked) return
    if(pending.kind==='reversal' && !attempted && !window.confirm(t.reverseConfirm)) return
    const stored = JSON.stringify(pending)
    if(!/^[^<>]{1,8192}$/u.test(stored)) {setMessage(t.invalid);return}
    try {sessionStorage.setItem(key(userId,company),stored)} catch {setMessage(t.storage);return}
    guard.current=true;setBusy(true);setAttempted(true)
    try {
      await postExpense(pending)
      sessionStorage.removeItem(key(userId,company));setPending(null);setAttempted(false);setMessage(t.saved)
      setReload(n=>n+1);onChanged()
    } catch(error) {
      if(rejected(error)) {
        sessionStorage.removeItem(key(userId,company));setPending(null);setAttempted(false);setMessage(t.rejected)
      } else setMessage(t.uncertain)
    } finally {guard.current=false;setBusy(false)}
  }
  const movement = (account: string) => BigInt(data?.balances[account]?.movement ?? '0')
  const paid = -movement('cash')-movement('bank')
  return <section className="books-card" aria-label={t.title}>
    <div className="books-section-title"><h2>{t.title}</h2><button type="button" disabled={Boolean(pending)||busy||blocked} onClick={()=>{setDraft({kind:'charge',parent:null,category:'',payee:'',amount:'',date:today()});setMessage('')}}>＋ {t.add}</button></div>
    <p>{t.hint}</p>
    {loading && <output aria-live="polite">{t.loading}</output>}
    {!loading && !data && <output aria-live="polite"><p>{t.failed}</p><button type="button" onClick={()=>setReload(n=>n+1)}>{t.retry}</button></output>}
    {message && <output aria-live="polite">{message}</output>}
    {draft && !pending && <form className="books-form" onSubmit={review}>
      <h3>{draft.kind==='charge'?t.add:draft.kind==='payment'?t.payment:t.reversal}</h3>
      <label>{t.category}<input name="category" list={`expense-categories-${company}`} required maxLength={80} defaultValue={draft.category} readOnly={draft.kind!=='charge'}/></label>
      <datalist id={`expense-categories-${company}`}>{[...new Set([...t.suggestions,...(data?.categories.map(c=>c.name)??[])])].map(name=><option key={name} value={name}/>)}</datalist>
      <label>{t.payee}<input name="payee" maxLength={120} defaultValue={draft.payee} readOnly={draft.kind!=='charge'}/></label>
      <label>{t.amount}<input name="amount" inputMode="decimal" required defaultValue={draft.amount} readOnly={draft.kind==='reversal'}/></label>
      <label>{t.date}<input name="date" type="date" required defaultValue={draft.date} max={today()}/></label>
      {draft.kind!=='reversal' && <label>{t.method}<select name="method" defaultValue="cash"><option value="cash">{t.cash}</option><option value="bank">{t.bank}</option>{draft.kind==='charge'&&<option value="due">{t.due}</option>}</select></label>}
      <label>{t.reference}<input name="reference" maxLength={80}/></label>
      <label>{t.note}<textarea name="note" maxLength={500} required={draft.kind==='reversal'}/></label>
      <div className="books-buttons"><button type="submit" disabled={blocked}>{t.review}</button><button type="button" onClick={()=>setDraft(null)}>{t.cancel}</button></div>
    </form>}
    {pending && <div className="books-confirm" aria-label={t.review}>
      <h3>{t.review}</h3><p>{t.confirmHint}</p><p>{companyName} · {pending.date}</p>
      <p>{pending.category} · {pending.payee} · {money(pending.amount)}</p>
      <p>{pending.kind==='charge'?t.charge:pending.kind==='payment'?t.payment:t.corrected} · {pending.method?t[pending.method]:pending.kind==='charge'?t.due:''}</p>
      <p>{pending.reference} {pending.note}</p>
      <div className="books-buttons"><button type="button" disabled={busy||blocked} onClick={()=>{void save()}}>{attempted?t.retry:t.confirm}</button>
      {!attempted&&<button type="button" onClick={()=>setPending(null)}>{t.cancel}</button>}</div>
    </div>}
    {data && <>
      <div className="books-stats"><div className="books-metric"><span>{t.period}</span><strong>{money(movement('expenses'))}</strong></div>
        <div className="books-metric"><span>{t.paid}</span><strong>{money(paid)}</strong></div>
        <div className="books-metric"><span>{t.outstanding}</span><strong>{money(-BigInt(data.balances.expense_payable?.closing??'0'))}</strong></div></div>
      <h3>{t.categories}</h3>{data.categories.map(c=><p key={c.name}>{c.name} <strong>{money(c.amount)}</strong></p>)}
      <h3>{t.bills}</h3>{data.bills.map(b=><div className="books-entry" key={b.id}><span>{b.effective_date} · {b.category} · {b.payee} · {t.due}: {money(b.due)}</span>
        <button type="button" disabled={Boolean(pending)||busy||blocked} onClick={()=>pay(b)}>{t.payment}</button></div>)}
      <h3>{t.entries} ({data.count})</h3>{!data.entries.length&&<p>{t.empty}</p>}
      {data.entries.map(e=><article className="books-entry" key={e.id}><p>{e.effective_date} · {e.category} · {e.payee}</p>
        <p>{e.kind==='charge'?t.charge:e.kind==='payment'?t.payment:t.corrected} · {money(e.amount)} · {e.method?t[e.method]:e.kind==='charge'?t.due:''}</p>
        <p>{e.reference} {e.note}</p><details><summary>ID</summary>{e.id}</details>
        {e.reversed?<small>{t.reversed}</small>:e.kind!=='reversal'&&<button type="button" disabled={Boolean(pending)||busy||blocked} onClick={()=>reverse(e)}>{t.reversal}</button>}</article>)}
      <div className="books-buttons"><button type="button" disabled={!offset} onClick={()=>setOffset(n=>Math.max(0,n-50))}>{t.previous}</button>
        <span>{Math.floor(offset/50)+1}</span><button type="button" disabled={offset+50>=data.count} onClick={()=>setOffset(n=>n+50)}>{t.next}</button></div>
    </>}
  </section>
}
