import { rateDisplay } from '../billing/amounts'
import { itemLabel } from '../demo/master-model'
import { useEffect, useState } from 'react'
import type { Language } from '../i18n'
import type { Report } from './model'
import type { ExpenseReport } from './expense-model'
import type { InventoryReport } from '../inventory/model'
import { expenseReport, report } from './api'
import { inventoryReport } from '../inventory/api'
import { displayQuantity } from '../inventory/model'
import { money } from './model'
import { accountingCopy } from './copy'
import { expenseCopy } from './expense-copy'
import { inventoryCopy } from '../inventory/copy'
const copy={
 bn:{title:'লেজার',search:'নাম বা আইটেম কোড দিয়ে খুঁজুন',all:'সব লেজার',party:'পার্টি',expense:'খরচ',item:'আইটেম',choose:'বিস্তারিত দেখতে একটি লেজার বেছে নিন',empty:'কোনো লেজার পাওয়া যায়নি',back:'তালিকায় ফিরুন'},
 en:{title:'Ledger',search:'Search by name or item code',all:'All ledgers',party:'Party',expense:'Expense',item:'Item',choose:'Choose a ledger to view its details',empty:'No matching ledgers',back:'Back to list'},
 hi:{title:'लेजर',search:'नाम या आइटम कोड से खोजें',all:'सभी लेजर',party:'पार्टी',expense:'खर्च',item:'आइटम',choose:'विवरण के लिए एक लेजर चुनें',empty:'कोई लेजर नहीं मिला',back:'सूची पर लौटें'},
}
type Entity={id:string;name:string;type:'party'|'expense'|'item';category?:string;payee?:string}
async function allPages<T extends {count:number},K extends keyof T>(first:T,key:K,load:(offset:number)=>Promise<T>):Promise<T>{
 const values=[...(first[key] as unknown as unknown[])]
 for(let offset=50;offset<first.count;offset+=50){const next=await load(offset);values.push(...next[key] as unknown as unknown[])}
 return {...first,[key]:values}
}
export function LedgerExplorer({company,language,from,to,version,parties}:Readonly<{company:string;language:Language;from:string;to:string;version:number;parties:Report['parties']}>) {
 const t=copy[language],a=accountingCopy[language],e=expenseCopy[language],i=inventoryCopy[language]
 const [search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[selected,setSelected]=useState<Entity|null>(null)
 const query=JSON.stringify([company,from,to,version])
 const [result,setResult]=useState<{query:string;expenses:ExpenseReport;inventory:InventoryReport}|null>(null)
 const [failed,setFailed]=useState(''),[retry,setRetry]=useState(0)
 const [partyResult,setPartyResult]=useState<{key:string;data:Report}|null>(null)
 useEffect(()=>{
  let alive=true
  async function load(){
   try{
    const [expenses,inventory]=await Promise.all([expenseReport(company,from,to,0),inventoryReport(company,from,to,0)])
    const [fullExpense,fullInventory]=await Promise.all([allPages(expenses,'entries',offset=>expenseReport(company,from,to,offset)),allPages(inventory,'documents',offset=>inventoryReport(company,from,to,offset))])
    if(alive){setResult({query,expenses:fullExpense,inventory:fullInventory});setFailed('')}
   }catch{if(alive)setFailed(query)}
  }
  void load();return()=>{alive=false}
 },[company,from,to,query,retry])
 const data=result?.query===query?result:null
 const partyKey=query+selected?.id
 useEffect(()=>{
  let alive=true
  if(!selected||(selected.type!=='party'&&!(selected.type==='expense'&&selected.payee)))return
  void report(company,from,to,selected.id,0).then(first=>allPages(first,'entries',offset=>report(company,from,to,selected.id,offset))).then(data=>{if(alive)setPartyResult({key:partyKey,data})},()=>{if(alive)setFailed(partyKey)})
  return()=>{alive=false}
 },[company,from,to,selected,partyKey,retry])
 if(failed===query)return <output>{a.error}<button type="button" onClick={()=>setRetry(n=>n+1)}>{a.retry}</button></output>
 if(!data)return <output>{a.loading}</output>
 const entities:Entity[]=[...parties.map(p=>({id:p.id,name:p.name,type:p.kind==='expense'?'expense' as const:'party' as const,...(p.kind==='expense'?{payee:p.name}:{})})),...data.expenses.categories.map(c=>({id:'category:'+c.name,name:c.name,type:'expense' as const,category:c.name})),...data.inventory.items.map(item=>({id:item.id,name:itemLabel(item),type:'item' as const}))]
 const matches=entities.filter(row=>(filter==='all'||row.type===filter)&&row.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
 const expenseEntries=selected?.type==='expense'?data.expenses.entries.filter(row=>selected.category?row.category===selected.category:row.payee===selected.payee):[]
 const selectedExpenseBills=data.expenses.bills.filter(row=>selected?.type==='expense'&&(selected.category?row.category===selected.category:row.payee===selected.payee))
 const expenseTotal=expenseEntries.filter(row=>row.kind==='charge'&&!row.reversed).reduce((sum,row)=>sum+BigInt(row.amount),0n)
 const expenseDue=selectedExpenseBills.reduce((sum,row)=>sum+BigInt(row.due),0n)
 const stockRows=data.inventory.stocks.filter(row=>row.item===selected?.id)
 const item=data.inventory.items.find(row=>row.id===selected?.id)
 const documents=data.inventory.documents.filter(row=>row.lines.some(line=>line.item===selected?.id))
 const partyData=partyResult?.key===partyKey?partyResult.data:null
 return <section className="books-card" aria-label={t.title}><h2>{t.title}</h2>
  <label>{t.search}<input type="search" value={search} onChange={event=>{setSearch(event.target.value);setSelected(null)}}/></label>
  <div className="books-buttons">{(['all','party','expense','item'] as const).map(type=><button type="button" key={type} aria-pressed={filter===type} onClick={()=>{setFilter(type);setSelected(null)}}>{t[type]}</button>)}</div>
  {!selected&&<><p>{t.choose}</p>{!matches.length&&<p>{t.empty}</p>}{matches.map(row=><button type="button" className="books-entity" key={row.id} onClick={()=>setSelected(row)}><strong>{row.name}</strong>{' '}<span>{t[row.type]}</span></button>)}</>}
  {selected&&<div className="ledger-detail"><button type="button" onClick={()=>setSelected(null)}>{t.back}</button><h3>{selected.name}</h3>
   {selected.type==='party'&&<>{failed===partyKey?<output>{a.error}<button type="button" onClick={()=>setRetry(n=>n+1)}>{a.retry}</button></output>:!partyData?<output>{a.loading}</output>:<><p>{a.receivable}: {money(partyData.ledger_balances.receivable?.closing??'0')} · {a.payable}: {money(-BigInt(partyData.ledger_balances.payable?.closing??'0'))}</p>{partyData.opening_entries?.map(row=><article className="books-entry" key={row.id}><time>{row.date}</time><p>{a.opening} · {row.side==='advance'?language==='bn'?'অ্যাডভান্স':language==='hi'?'एडवांस':'Advance':language==='bn'?'আগের বাকি':language==='hi'?'पुराना बकाया':'Previous due'} · {money(row.amount)}</p></article>)}{!partyData.entries.length&&!partyData.opening_entries?.length&&<p>{a.empty}</p>}{partyData.entries.map(row=><article key={row.id} className="books-entry"><time>{row.effective_date}</time><p>{a[row.kind]} · {money(row.amount_minor)}</p><p>{row.reference} {row.note}</p></article>)}</>}</>}
   {selected.type==='expense'&&<>{partyResult?.key===partyKey&&partyResult.data.opening_entries?.map(row=><p key={row.id}>{a.opening} · {row.date} · {row.side==='advance'?language==='bn'?'অ্যাডভান্স':'Advance':language==='bn'?'আগের বাকি':'Previous due'} · {money(row.amount)}</p>)}<p>{e.period}: {money(expenseTotal)} · {e.outstanding}: {money(expenseDue)}</p>{!expenseEntries.length&&<p>{a.empty}</p>}{expenseEntries.map(row=><article key={row.id} className="books-entry"><time>{row.effective_date}</time><p>{row.category} · {row.payee}</p><p>{e[row.kind==='charge'?'charge':row.kind==='payment'?'payment':'corrected']} · {money(row.amount)} {row.reversed&&e.reversed}</p><p>{row.reference} {row.note}</p>{row.bill_lines?.map((line,index)=><p key={index}>{index+1}. {line.description} · {displayQuantity(line.quantity)} × {line.unit_rate?rateDisplay(line.unit_rate):money(line.rate)}</p>)}</article>)}</>}
   {selected.type==='item'&&<><p>{i.unit}: {item?.unit}</p>{stockRows.map(row=><article className="books-entry" key={row.warehouse}><strong>{data.inventory.warehouses.find(w=>w.id===row.warehouse)?.name}</strong><p>{i.start}: {displayQuantity(row.opening)} · {i.incoming}: {displayQuantity(row.incoming)} · {i.outgoing}: {displayQuantity(row.outgoing)} · {i.balance}: {displayQuantity(row.closing)} {item?.unit}</p></article>)}{!documents.length&&<p>{a.empty}</p>}{documents.map(doc=><article className="books-entry" key={doc.id}><time>{doc.date}</time><p>{i[doc.kind]} · {doc.party_name} · {doc.reference}</p>{doc.lines.filter(line=>line.item===selected.id).map((line,index)=><p key={index}>{i.quantity}: {displayQuantity(line.quantity)} {item?.unit} · {i.rate}: {line.unit_rate?rateDisplay(line.unit_rate):money(line.rate)}</p>)}</article>)}</>}
  </div>}
 </section>
}
