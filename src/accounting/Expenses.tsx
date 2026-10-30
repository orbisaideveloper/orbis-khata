import {expenseCategoryParts,expenseCategoryName} from "./expense-category";
import {currentEntries} from './current-entries';
import { expensePendingKey as key, restoreExpense as recovered } from './expense-pending'
import { useTutorial } from '../tutorial'
import { useEffect, useRef, useState } from 'react'
import type { Language } from '../i18n'
import { expenseReport, postExpense, rejected } from './api'
import { expenseCommand } from './expense-model'
import type { ExpenseBill, ExpenseCommand, ExpenseEntry, ExpenseReport } from './expense-model'
import { expenseCopy } from './expense-copy'
import { minor, money, today } from './model'

type Props = { userId: string; company: string; companyName: string; language: Language; from: string; to: string; version: number; onChanged: () => void; onLock: (locked: boolean) => void; blocked: boolean; payees?: string[];startOpen?:boolean;gateway?:<T>(operation:string,input:unknown)=>Promise<T> }
type Draft = { kind: ExpenseCommand['kind']; parent: string | null; category: string; payee: string; amount: string; date: string }
function decimal(value: string) { return `${BigInt(value)/100n}.${String(BigInt(value)%100n).padStart(2,'0')}` }
function formText(form: FormData, name: string) {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}
export function Expenses({userId,company,companyName,language,from,to,version,onChanged,onLock,blocked,payees=[],startOpen=false,gateway}: Readonly<Props>) {
  const t = expenseCopy[language]
  const tutorial = useTutorial()
  const [offset,setOffset] = useState(0), [reload,setReload] = useState(0)
  const query = JSON.stringify([company,from,to,offset,version,reload])
  const [result,setResult] = useState<{query: string; data: ExpenseReport | null} | null>(null)
  const validRange = Boolean(from && to && from<=to)
  const data = validRange && result?.query === query ? result.data : null
  const loading = validRange && result?.query !== query
  const [draft,setDraft] = useState<Draft | null>(()=>startOpen?{kind:"charge",parent:null,category:"",payee:"",amount:"",date:today()}:null)
  const [pending,setPending] = useState<ExpenseCommand | null>(() => recovered(userId,company))
  const [attempted,setAttempted] = useState(Boolean(pending)), [busy,setBusy] = useState(false), [message,setMessage] = useState('')
  const guard = useRef(false)
  useEffect(() => {
    let alive = true
    if (!from || !to || from>to) return
    void (gateway?gateway<ExpenseReport>("expense-report",{company,from,to,offset}):expenseReport(company,from,to,offset)).then(data => { if(alive) setResult({query,data}) }, () => { if(alive) setResult({query,data:null}) })
    return () => {alive=false}
  },[company,from,to,offset,query,gateway])
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
      const p = expenseCommand({id:crypto.randomUUID(),company,date:formText(f,'date'),kind:draft.kind,amount:minor(formText(f,'amount')),
        category:expenseCategoryName(formText(f,'category'),formText(f,'subcategory')),payee:formText(f,'payee').trim(),method:draft.kind==='reversal' || f.get('method')==='due' ? null : formText(f,'method'),
        parent:draft.parent,reference:formText(f,'reference').trim(),note:formText(f,'note').trim()})
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
      if(gateway)await gateway("expense-post",pending);else await postExpense(pending)
      sessionStorage.removeItem(key(userId,company));setPending(null);setAttempted(false);setMessage(t.saved)
      setReload(n=>n+1);onChanged()
    } catch(error) {
      if(rejected(error)) {
        sessionStorage.removeItem(key(userId,company));setPending(null);setAttempted(false);setMessage(t.rejected)
      } else setMessage(t.uncertain)
    } finally {guard.current=false;setBusy(false)}
  }
  const kindLabel = {charge:t.charge,payment:t.payment,reversal:t.corrected}
  const draftTitle = {charge:t.add,payment:t.payment,reversal:t.reversal}
  function methodLabel(entry: ExpenseCommand | ExpenseEntry) {
    if (entry.method) return t[entry.method]
    return entry.kind==='charge' ? t.due : ''
  }
  const movement = (account: string) => BigInt(data?.balances[account]?.movement ?? '0')
  const paid = -movement('cash')-movement('bank')
  return <section className="books-card" aria-label={t.title}>
    <div className="books-section-title"><h2>{t.title}</h2><button type="button" disabled={Boolean(draft)||Boolean(pending)||busy||blocked} onClick={()=>{setDraft({kind:'charge',parent:null,category:'',payee:'',amount:'',date:today()});setMessage('')}}>＋ {t.add}</button></div>
    {tutorial && <p>{t.hint}</p>}
    {loading && <output aria-live="polite">{t.loading}</output>}
    {!loading && !data && <output aria-live="polite"><p>{t.failed}</p><button type="button" onClick={()=>setReload(n=>n+1)}>{t.retry}</button></output>}
    {message && <output aria-live="polite">{message}</output>}
    {draft && !pending && <form className="books-form expense-entry-form" onSubmit={review}>
      <h3>{draftTitle[draft.kind]}</h3>
      <label>{{bn:"ক্যাটাগরি",en:"Category",hi:"श्रेणी"}[language]}<input name="category" list={`expense-categories-${company}`} required maxLength={80} defaultValue={expenseCategoryParts(draft.category).category} readOnly={draft.kind!=='charge'}/></label>
      <datalist id={`expense-categories-${company}`}>{[...new Set([...t.suggestions,...(data?.categories.map(c=>expenseCategoryParts(c.name).category)??[])])].map(name=><option key={name} value={name}/>)}</datalist>
      <label>{{bn:"সাব-ক্যাটাগরি",en:"Subcategory",hi:"उप-श्रेणी"}[language]}<input name="subcategory" list={`expense-subcategories-${company}`} maxLength={60} defaultValue={expenseCategoryParts(draft.category).subcategory} readOnly={draft.kind!=='charge'}/></label>
      <datalist id={`expense-subcategories-${company}`}>{[...new Set(data?.categories.map(c=>expenseCategoryParts(c.name).subcategory).filter(Boolean)??[])].map(name=><option key={name} value={name}/>)}</datalist>
      <label>{t.payee}<input name="payee" list={`expense-payees-${company}`} maxLength={120} defaultValue={draft.payee} readOnly={draft.kind!=='charge'}/></label>
      <datalist id={`expense-payees-${company}`}>{payees.map(name=><option key={name} value={name}/>)}</datalist>
      <label>{t.amount}<input name="amount" inputMode="decimal" required defaultValue={draft.amount} readOnly={draft.kind==='reversal'}/></label>
      <label>{t.date}<input name="date" type="date" required defaultValue={draft.date} max={today()}/></label>
      {draft.kind!=='reversal' && <label>{t.method}<select aria-label={t.method} name="method" defaultValue="cash"><option value="cash">{t.cash}</option><option value="bank">{t.bank}</option>{draft.kind==='charge'&&<option value="due">{t.due}</option>}</select></label>}
      <label>{t.reference}<input name="reference" maxLength={80}/></label>
      <label>{t.note}<textarea name="note" maxLength={500} required={draft.kind==='reversal'}/></label>
      <div className="books-buttons"><button type="submit" disabled={blocked}>{t.review}</button><button type="button" onClick={()=>setDraft(null)}>{t.cancel}</button></div>
    </form>}
    {pending && <div className="books-confirm" aria-label={t.review}>
      <h3>{t.review}</h3>{tutorial && <p>{t.confirmHint}</p>}<p>{companyName} · {pending.date}</p>
      <p>{pending.category} · {pending.payee} · {money(pending.amount)}</p>
      <p>{kindLabel[pending.kind]} · {methodLabel(pending)}</p>
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
      <h3>{t.entries} ({currentEntries(data.entries).length})</h3>{!currentEntries(data.entries).length&&<p>{t.empty}</p>}
      <div className="expense-statement"><table><thead><tr><th>{t.date}</th><th>{t.category}</th><th>{t.payee}</th><th>{t.amount}</th><th>{t.method}</th><th>{t.note}</th><th></th></tr></thead><tbody>{currentEntries(data.entries).map(e=><tr key={e.id}><td>{e.effective_date}</td><td>{e.category}</td><td>{e.payee}</td><td>{money(e.amount)}</td><td>{methodLabel(e)}</td><td>{e.note}</td><td>{e.reversed?<small>{t.reversed}</small>:e.kind!=='reversal'&&<button type="button" disabled={Boolean(pending)||busy||blocked} onClick={()=>reverse(e)}>{t.reversal}</button>}</td></tr>)}</tbody></table></div>
      <div className="books-buttons"><button type="button" disabled={!offset} onClick={()=>setOffset(n=>Math.max(0,n-50))}>{t.previous}</button>
        <span>{Math.floor(offset/50)+1}</span><button type="button" disabled={offset+50>=data.count} onClick={()=>setOffset(n=>n+50)}>{t.next}</button></div>
    </>}
  </section>
}
