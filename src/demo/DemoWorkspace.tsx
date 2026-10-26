import { requestKhata } from '../accounting/api'
import { useBookServices } from '../books-services'
import type { DemoItem, DemoParty } from './master-model'
import { Dashboard } from './Dashboard'
import { designCopy } from './design-copy'
import { useEffect, useState } from 'react'
import type { Language } from '../i18n'
import { useBooksNavigation, booksLabels } from '../books-navigation'
import { Accounting } from '../accounting/Accounting'
import { Expenses } from '../accounting/Expenses'
import { LedgerExplorer } from '../accounting/LedgerExplorer'
import type { Report } from '../accounting/model'
import { today } from '../accounting/model'
import { Inventory } from '../inventory/Inventory'
import { demoMasters, demoRequest, demoCompanyName } from './store'
import { ItemMaster, PartyMaster } from './Masters'
import { InvoicePage, type BillKind } from './InvoicePage'
const types={bn:{sale:'বিক্রয় বিল',purchase:'ক্রয় বিল',expense:'খরচের বিল',bills:'বিল',stock:'গোডাউন ও স্টক'},en:{sale:'Sales invoice',purchase:'Purchase invoice',expense:'Expense bill',bills:'Bills',stock:'Godown & stock'},hi:{sale:'बिक्री बिल',purchase:'खरीद बिल',expense:'खर्च बिल',bills:'बिल',stock:'गोदाम और स्टॉक'}}
export function DemoWorkspace({language,userId='demo-owner'}:Readonly<{language:Language;userId?:string}>){
 const services=useBookServices(),request=services?.request??(import.meta.env.DEV?demoRequest:requestKhata)
 const [liveMasters,setLiveMasters]=useState<{company:string;items:DemoItem[];parties:DemoParty[]}>({company:'',items:[],parties:[]})
 const navigation=useBooksNavigation(),t=types[language],labels=booksLabels[language]
 const [company,setCompany]=useState(services?'':'11111111-1111-4111-8111-111111111111'),[companies,setCompanies]=useState<{id:string;name:string}[]>([]),[version,setVersion]=useState(0)
 const [from,setFrom]=useState(()=>today().slice(0,7)+'-01'),[to,setTo]=useState(today),[bill,setBill]=useState<BillKind|null>(null),[billKey,setBillKey]=useState(0)
 const [result,setResult]=useState<{key:string;report:Report;warehouses:{id:string;name:string}[]}|null>(null),[errorKey,setErrorKey]=useState('')
 const requestKey=[company,from,to,version].join('/')
 const report=result?.key===requestKey?result.report:null,warehouses=result?.key===requestKey?result.warehouses:[],failed=errorKey===requestKey
 const [locked,setLocked]=useState(false)
 const changed=()=>setVersion(n=>n+1)
 useEffect(()=>{let alive=true;void request<{id:string;name:string}[]>('companies',{}).then(list=>{if(alive){setCompanies(list);setCompany(old=>list.some(c=>c.id===old)?old:list[0]?.id??'')}},()=>{if(alive)setErrorKey(requestKey)});return()=>{alive=false}},[version,services,request,requestKey])
 useEffect(()=>{if(!services||!company)return;let alive=true;void services.request<{items:DemoItem[];parties:DemoParty[]}>('masters',{company}).then(value=>{if(alive)setLiveMasters({company,...value})},()=>{if(alive)setErrorKey(requestKey)});return()=>{alive=false}},[services,company,version,requestKey])
 useEffect(()=>{if(!company)return;let alive=true;void Promise.all([request<Report>('report',{company,from,to,offset:0,party:null}),request<{warehouses:{id:string;name:string}[]}>('inventory-report',{company,from,to,offset:0})]).then(([r,i])=>{if(alive)setResult({key:requestKey,report:r,warehouses:i.warehouses})}).catch(()=>{if(alive)setErrorKey(requestKey)});return()=>{alive=false}},[company,from,to,version,requestKey,request])
 const masters=services?(liveMasters.company===company?liveMasters:{items:[],parties:[]}):import.meta.env.DEV?demoMasters(company):{items:[],parties:[]},companyName=services?companies.find(c=>c.id===company)?.name??'':import.meta.env.DEV?demoCompanyName(company):''
 function openBill(kind:BillKind){setBill(kind);setBillKey(n=>n+1);navigation.open('bills')}
 if(navigation.page==='ledger'||services&&!companies.length)return <Accounting userId={userId} initialCompany={company} language={language} onBill={openBill} onCompanyChange={setCompany}/>
 return <div className="books">
  <nav className="books-navigation" aria-label={labels.ledger}>{(['home','ledger','all-ledgers','parties','items','bills','expenses'] as const).map(page=><button type="button" key={page} disabled={locked} aria-current={navigation.page===page?'page':undefined} onClick={()=>{setBill(null);navigation.open(page)}}>{labels[page]}</button>)}</nav>
  <label>{language==='bn'?'কোম্পানি':language==='hi'?'कंपनी':'Company'}<select value={company} disabled={locked} onChange={e=>{setCompany(e.target.value);setBill(null)}}>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  {navigation.page==='home'&&<Dashboard language={language} companyName={companyName} report={report} failed={failed} onRetry={changed} onOpen={navigation.open} onBill={openBill} partyCount={masters.parties.length} itemCount={masters.items.length}/>}
  {navigation.page==='home'&&<button className="kh-company-manage" type="button" onClick={()=>navigation.open('ledger')}>{designCopy[language].newCompany} →</button>}
  {navigation.page==='items'&&<ItemMaster language={language} company={company} items={masters.items} onChanged={changed}/>}
  {navigation.page==='parties'&&<PartyMaster language={language} company={company} parties={masters.parties} onChanged={changed}/>}
  {(navigation.page==='all-ledgers'||navigation.page==='expenses'||navigation.page==='stock')&&<div className="books-filters"><label>{language==='bn'?'শুরুর তারিখ':'From'}<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>{language==='bn'?'শেষ তারিখ':'To'}<input type="date" value={to} min={from} max={today()} onChange={e=>setTo(e.target.value)}/></label></div>}
  {navigation.page==='all-ledgers'&&report&&<><LedgerExplorer {...{company,language,from,to,version}} parties={report.parties}/><button type="button" onClick={()=>navigation.open('stock')}>{t.stock}</button></>}
  {navigation.page==='stock'&&report&&<Inventory userId={userId} {...{company,companyName,language,from,to,version}} parties={report.parties} onLock={setLocked} onChanged={changed} blocked={false}/>}
  {navigation.page==='expenses'&&<><button type="button" onClick={()=>openBill('expense')}>{t.expense}</button><Expenses userId={userId} {...{company,companyName,language,from,to,version}} payees={masters.parties.filter(p=>p.kind==='expense').map(p=>p.name)} onLock={setLocked} onChanged={changed} blocked={false}/></>}
  {navigation.page==='bills'&&(bill?<InvoicePage onLock={setLocked} userId={userId} key={billKey} kind={bill} {...{language,company,companyName,warehouses}} items={masters.items} parties={masters.parties} onSaved={changed} onBack={()=>setBill(null)}/>:<section className="books-card kh-bill-start"><h2>{t.bills}</h2><div className="books-buttons">{(['sale','purchase','expense'] as const).map(kind=><button type="button" key={kind} onClick={()=>openBill(kind)}>{t[kind]}</button>)}</div></section>)}
 </div>
}
