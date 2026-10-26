import { restoreBill,retainBill,clearBill } from '../billing/recovery'
import { rejected } from '../accounting/api'
import type { KhataOperation } from '../accounting/server-gateway'
import { confirmDelete } from '../confirm-delete'
import '../billing/memo.css'
import { amountFromRate, rateDisplay, rateMinor, updatePricing } from '../billing/amounts'
import { useEffect, useRef, useState } from 'react'
import { PaperPreview } from './PaperPreview'
import { BillDesign, type BillTemplate } from './BillDesign'
import { useBookServices } from '../books-services'
import { PartyMaster } from './Masters'
import { designCopy } from './design-copy'
import type { Language } from '../i18n'
import { money, today } from '../accounting/model'
import { billTotal, displayQuantity, quantity, type InventoryCommand, type StockLine } from '../inventory/model'
import { decimal, itemLabel, type DemoItem, type DemoParty } from './master-model'
import { masterCopy } from './master-copy'
import { demoRequest, nextDemoBillNumber, saveDemoExpenseBill, demoPreviousBalance } from './store'
export type BillKind='sale'|'purchase'|'expense'
const copy={
 bn:{memo:'মেমো / বিল',subtotal:'সাবটোটাল',previous:'আগের ব্যালেন্স (B/F)',totalQuantity:'মোট পরিমাণ',partySignature:'পার্টির স্বাক্ষর',authorizedSignature:'অনুমোদিত স্বাক্ষর',thanks:'ধন্যবাদ',creditBalance:'অবশিষ্ট অ্যাডভান্স',sale:'বিক্রয় বিল',purchase:'ক্রয় বিল',expense:'খরচের বিল',number:'বিল নম্বর',date:'তারিখ',party:'পার্টি',choose:'বেছে নিন',serial:'নং',item:'আইটেমের নাম',description:'বিবরণ',quantity:'পরিমাণ',unit:'ইউনিট',rate:'দর',amount:'টাকা',total:'সর্বমোট',add:'রো যোগ করুন',remove:'সরান',review:'বিল যাচাই',confirm:'নিশ্চিত করে সংরক্ষণ',edit:'বিলে ফিরুন',cancel:'ফিরে যান',notes:'নোট',warehouse:'গোডাউন',saved:'বিল সংরক্ষণ হয়েছে।',invalid:'পার্টি, আইটেম, পরিমাণ ও দর পরীক্ষা করুন।',stock:'এই গোডাউনে পর্যাপ্ত স্টক নেই।',due:'এই বিলের টাকা বাকি হিসাবে থাকবে।',method:'পরিশোধ',unpaid:'বাকি',cash:'নগদ',bank:'ব্যাংক',print:'বিল প্রিন্ট',newBill:'নতুন বিল',noParty:'আগে এই ধরনের পার্টি যোগ করুন।',category:'খরচের খাতা'},
 en:{memo:'Memo / Bill',subtotal:'Subtotal',previous:'Previous balance (B/F)',totalQuantity:'Total quantity',partySignature:'Party signature',authorizedSignature:'Authorized signature',thanks:'Thank you',creditBalance:'Advance remaining',sale:'Sales invoice',purchase:'Purchase invoice',expense:'Expense bill',number:'Bill number',date:'Date',party:'Party',choose:'Choose',serial:'No.',item:'Item name',description:'Description',quantity:'Quantity',unit:'Unit',rate:'Rate',amount:'Amount',total:'Grand total',add:'Add row',remove:'Remove',review:'Review bill',confirm:'Confirm & save',edit:'Back to bill',cancel:'Back',notes:'Notes',warehouse:'Godown',saved:'Bill saved.',invalid:'Check party, items, quantities and rates.',stock:'Insufficient stock in this godown.',due:'This bill remains due until a separate payment is recorded.',method:'Payment',unpaid:'Unpaid',cash:'Cash',bank:'Bank',print:'Print bill',newBill:'New bill',noParty:'Add a party of this category first.',category:'Expense account'},
 hi:{memo:'मेमो / बिल',subtotal:'उप-योग',previous:'पुराना बैलेंस (B/F)',totalQuantity:'कुल मात्रा',partySignature:'पार्टी के हस्ताक्षर',authorizedSignature:'अधिकृत हस्ताक्षर',thanks:'धन्यवाद',creditBalance:'शेष एडवांस',sale:'बिक्री बिल',purchase:'खरीद बिल',expense:'खर्च बिल',number:'बिल नंबर',date:'तारीख',party:'पार्टी',choose:'चुनें',serial:'क्रम',item:'आइटम नाम',description:'विवरण',quantity:'मात्रा',unit:'यूनिट',rate:'दर',amount:'रकम',total:'कुल योग',add:'पंक्ति जोड़ें',remove:'हटाएँ',review:'बिल जाँचें',confirm:'पुष्टि और सहेजें',edit:'बिल पर लौटें',cancel:'वापस',notes:'नोट',warehouse:'गोदाम',saved:'बिल सहेजा गया।',invalid:'पार्टी, आइटम, मात्रा और दर जाँचें।',stock:'इस गोदाम में पर्याप्त स्टॉक नहीं है।',due:'अलग भुगतान दर्ज करने तक यह बिल बकाया रहेगा।',method:'भुगतान',unpaid:'बकाया',cash:'नकद',bank:'बैंक',print:'बिल प्रिंट',newBill:'नया बिल',noParty:'पहले इस श्रेणी की पार्टी जोड़ें।',category:'खर्च खाता'},
}
type Line={key:string;item:string;description:string;quantity:string;rate:string;amount:string;basis:'rate'|'amount'}
const fresh=():Line=>({key:crypto.randomUUID(),item:'',description:'',quantity:'1',rate:'',amount:'',basis:'rate'})
export function InvoicePage({kind,language,company,companyName,items,parties,warehouses,onSaved,onBack,onLock,userId='demo-owner'}:Readonly<{onLock?:(locked:boolean)=>void;userId?:string;kind:BillKind;language:Language;company:string;companyName:string;items:DemoItem[];parties:DemoParty[];warehouses:{id:string;name:string}[];onSaved:()=>void;onBack:()=>void}>){
 const t=copy[language],m=masterCopy[language],d=designCopy[language],services=useBookServices()
 const [recovery,setRecovery]=useState(()=>services?restoreBill(userId):null)
 const balanceGeneration=useRef(0),[balanceBusy,setBalanceBusy]=useState(false),[balanceFailed,setBalanceFailed]=useState(false)
 const [template,setTemplate]=useState<BillTemplate>('sample'),[companyDetails,setCompanyDetails]=useState('')
 const [id]=useState(()=>crypto.randomUUID()),[automaticNumber]=useState(()=>services?`${kind==='sale'?'S':kind==='purchase'?'P':'E'}-${id.slice(0,8).toUpperCase()}`:import.meta.env.DEV?nextDemoBillNumber(company,kind):''),guard=useRef(false)
 const [lines,setLines]=useState<Line[]>([fresh()]),[partyId,setPartyId]=useState(''),[date,setDate]=useState(today),[reference,setReference]=useState(''),[note,setNote]=useState(''),[warehouse,setWarehouse]=useState(warehouses[0]?.id??''),[category,setCategory]=useState(''),[method,setMethod]=useState('due'),[phase,setPhase]=useState<'edit'|'review'|'saved'>('edit'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[previous,setPrevious]=useState('0')
 const [addingParty,setAddingParty]=useState(false),[addedParties,setAddedParties]=useState<DemoParty[]>([])
 const allParties=[...new Map([...parties,...addedParties].filter(p=>p.company===company).map(p=>[p.id,p])).values()]
 const party=allParties.find(p=>p.id===partyId)
 const selectedWarehouse=warehouse||warehouses[0]?.id||''
 const partyKind=kind==='sale'?'customer':kind==='purchase'?'supplier':'expense'
 const allowed=allParties.filter(p=>kind==='expense'?p.kind==='expense':kind==='sale'?p.kind==='customer'||p.kind==='both':p.kind==='supplier'||p.kind==='both')
 function change(key:string,field:keyof Line,value:string){
  setLines(old=>old.map(line=>{
   if(line.key!==key)return line
   if(field==='quantity'||field==='rate'||field==='amount')return updatePricing(line,field,value)
   if(field==='item')return updatePricing({...line,item:value},'rate',decimal(items.find(i=>i.id===value)?.default_rate??null))
   return {...line,[field]:value}
  }))
 }
 function stockLines():StockLine[]{return lines.map(line=>({item:line.item,warehouse:selectedWarehouse,to:null,quantity:quantity(line.quantity),rate:rateMinor(line.rate),unit_rate:line.rate}))}
 function total(){return lines.reduce((sum,line)=>{try{return sum+BigInt(amountFromRate(line.quantity,line.rate))}catch{return sum}},0n)}
 function rowAmount(line:Line){try{return money(amountFromRate(line.quantity,line.rate))}catch{return '—'}}
 function loadPrevious(party:string,day:string){
  const generation=++balanceGeneration.current;setBalanceFailed(false)
  if(!services){setPrevious(import.meta.env.DEV?demoPreviousBalance(company,party,day,kind):'0');return}
  if(!party||!day){setPrevious('0');return}
  setBalanceBusy(true);void services.previous(company,party,day,kind).then(value=>{if(generation===balanceGeneration.current){setPrevious(value);setBalanceBusy(false)}},()=>{if(generation===balanceGeneration.current){setBalanceFailed(true);setBalanceBusy(false);setError(t.invalid)}})
 }
 function pickParty(value:string){setPartyId(value);loadPrevious(value,date)}
 function pickDate(value:string){setDate(value);loadPrevious(partyId,value)}
 function totalQuantities(){
  const groups=new Map<string,bigint>()
  for(const line of lines){try{const unit=items.find(i=>i.id===line.item)?.unit??'';groups.set(unit,(groups.get(unit)??0n)+BigInt(quantity(line.quantity)))}catch{/* Incomplete draft rows have no quantity total. */}}
  return [...groups].map(([unit,value])=>`${displayQuantity(String(value))}${unit?' '+unit:''}`).join(' · ')||'—'
 }
 useEffect(()=>{onLock?.(busy);return()=>{onLock?.(false)}},[busy,onLock])
 const grandTotal=total()+BigInt(previous)
 const billNumber=reference.trim()||automaticNumber
 function review(event:React.SyntheticEvent<HTMLFormElement>){
  event.preventDefault();setError('')
  try{
   if(balanceBusy||balanceFailed||!party||!allowed.some(p=>p.id===party.id)||date>today()||!date||!lines.length||lines.length>50||total()<=0n)throw Error()
   stockLines()
   if(kind==='expense'){if(lines.some(l=>!l.description.trim()))throw Error()}
   else if(!selectedWarehouse||lines.some(l=>!items.some(i=>i.id===l.item)))throw Error()
   setPhase('review');window.scrollTo?.(0,0)
  }catch{setError(t.invalid)}
 }
 async function save(){
  if(guard.current||!party)return;guard.current=true;setBusy(true);setError('')
  try{
   if(services){
    const operation:KhataOperation=kind==='expense'?{operation:'expense-bill',input:{command:{id,company,date,kind:'charge',amount:String(total()),category:category.trim()||party.name,payee:party.name,method:method==='cash'?'cash':method==='bank'?'bank':null,parent:null,reference:billNumber,note},lines:lines.map(line=>({description:line.description,quantity:quantity(line.quantity),unit:'',rate:rateMinor(line.rate),unit_rate:line.rate}))}}:{operation:'inventory-post',input:{id,company,kind,date,code:'',name:'',unit:'',party:party.id,reference:billNumber,note,lines:stockLines()}}
    retainBill(userId,operation);await services.request(operation.operation,operation.input);clearBill(userId)
   }else if(import.meta.env.DEV){
    if(kind==='expense')await saveDemoExpenseBill({id,company,date,kind:'charge',amount:String(total()),category:category.trim()||party.name,payee:party.name,method:method==='cash'?'cash':method==='bank'?'bank':null,parent:null,reference:billNumber,note},lines.map(line=>({description:line.description,quantity:quantity(line.quantity),unit:'',rate:rateMinor(line.rate),unit_rate:line.rate})))
    else {const command:InventoryCommand={id,company,kind,date,code:'',name:'',unit:'',party:party.id,reference:billNumber,note,lines:stockLines()};await demoRequest('inventory-post',command)}
   }else throw Error('LIVE_SERVICES_REQUIRED')
   setPhase('saved');onSaved()
  }catch(e){if(services){if(rejected(e))clearBill(userId);else setRecovery(restoreBill(userId))}setError((e as Error).message==='INSUFFICIENT_STOCK'?t.stock:t.invalid)}finally{guard.current=false;setBusy(false)}
 }
 const recoveryCommand=recovery?(recovery.operation==='expense-bill'?recovery.input.command as Record<string,unknown>:recovery.input):null
 const sameRecoveryCompany=recoveryCommand?.company===company
 const recoveredAmount=recoveryCommand?(recovery?.operation==='expense-bill'?String(recoveryCommand.amount):String(billTotal(recoveryCommand.lines as StockLine[]))):'0'
 async function retryRecovery(){
  if(!recovery||!services||!sameRecoveryCompany||guard.current)return;guard.current=true;setBusy(true);setError('')
  try{await services.request(recovery.operation,recovery.input);clearBill(userId);setRecovery(null);onSaved();onBack()}catch(e){if(rejected(e)){clearBill(userId);setRecovery(null)}setError(t.invalid)}finally{guard.current=false;setBusy(false)}
 }
 if(recovery)return <section className="books-card"><h2>{sameRecoveryCompany?companyName:language==='bn'?'আগের বিলের কোম্পানি বেছে নিন':language==='hi'?'पिछले बिल की कंपनी चुनें':'Choose the previous bill’s company'}</h2>{sameRecoveryCompany&&<p>{String(recoveryCommand?.date??'')} · {String(recoveryCommand?.reference??'')} · {recovery.operation==='expense-bill'?String(recoveryCommand?.payee??''):parties.find(p=>p.id===recoveryCommand?.party)?.name??''} · {money(recoveredAmount)}</p>}<output role="alert">{language==='bn'?'আগের বিল সেভ হয়েছে কি না নিশ্চিত নয়। একই বিল আবার যাচাই করুন।':language==='hi'?'पिछला बिल सहेजा गया या नहीं, निश्चित नहीं है। उसी बिल को फिर जाँचें।':'The previous bill has an unconfirmed save. Retry the same bill before adding another.'}</output>{error&&<output>{error}</output>}<button disabled={busy||!sameRecoveryCompany} type="button" onClick={()=>{void retryRecovery()}}>{t.confirm}</button><button disabled={busy} type="button" onClick={onBack}>{t.cancel}</button></section>
 if(phase!=='edit')return <section aria-label={t[kind]} className="bill-review">
  <BillDesign language={language} value={template} onChange={setTemplate}/>
  <PaperPreview template={template} companyDetails={companyDetails} draft={phase!=='saved'?d.draft:''} continuation={d.continue} companyName={companyName} title={t[kind]} memo={t.memo} numberLabel={t.number} number={billNumber} dateLabel={t.date} date={date.split('-').reverse().join('-')} partyName={party?.name??''} partyDetails={[party?m[party.kind]:'',party?.phone,party?.address,party?.email].filter(Boolean).join(' · ')} headings={[t.serial,kind==='expense'?t.description:t.item,t.quantity,t.rate,t.amount]} rows={lines.map((line,index)=>[String(index+1),kind==='expense'?line.description:items.find(i=>i.id===line.item)?.name??'',displayQuantity(quantity(line.quantity))+' '+(items.find(i=>i.id===line.item)?.unit??''),rateDisplay(line.rate),rowAmount(line)])} totals={[[t.totalQuantity,totalQuantities()],[t.subtotal,money(total())],[t.previous,money(previous)],[t.total,money(grandTotal)]]} note={note} thanks={t.thanks} signatures={[t.partySignature,t.authorizedSignature]}/>
  <button className="bill-print-button" type="button" onClick={()=>window.print()}>{d.print}</button>
  {grandTotal<0n&&<p>{t.creditBalance}: {money(-grandTotal)}</p>}{error&&<output role="alert">{error}</output>}
  <div className="books-buttons memo-controls">{phase==='review'?<><button type="button" className="books-primary" disabled={busy} onClick={()=>{void save()}}>{t.confirm}</button><button type="button" disabled={busy} onClick={()=>setPhase('edit')}>{t.edit}</button></>:<><output>{t.saved}</output></>}<button type="button" disabled={busy} onClick={onBack}>{t.cancel}</button></div>
 </section>
 if(addingParty)return <PartyMaster language={language} company={company} parties={allParties} startKind={partyKind} onChanged={()=>{}} onCreated={p=>{setAddedParties(old=>[...old,p]);pickParty(p.id);setAddingParty(false)}} onCancelCreate={()=>setAddingParty(false)}/>
 const editing=true
 return <section className={`invoice-page books-card memo-paper ${editing?'memo-edit':'memo-preview'}`} aria-label={t[kind]}>
  <div className="invoice-heading memo-heading"><h1>{companyName}</h1><span className="memo-badge">{t.memo}</span><p>{t[kind]}</p></div><button className="memo-back" type="button" disabled={busy} onClick={onBack}>{t.cancel}</button>
  <BillDesign language={language} value={template} onChange={setTemplate}/>
  <form onSubmit={review}>
   <details className="bill-company-details"><summary>{d.businessDetails}</summary><label>{d.businessAddress}<textarea maxLength={250} value={companyDetails} onChange={e=>setCompanyDetails(e.target.value)}/></label></details>
   <div className="invoice-party"><p className="bill-party-context">{companyName} · {m[partyKind]}</p>{editing&&<label>{t.party}<select required value={partyId} onChange={e=>pickParty(e.target.value)}><option value="">{t.choose}</option>{allowed.map(p=><option key={p.id} value={p.id}>{p.name} · {m[p.kind]}</option>)}</select></label>}<button type="button" className="bill-add-party" onClick={()=>setAddingParty(true)}>＋ {m.addParty}</button>{!allowed.length&&<p role="status">{t.noParty} ({m[partyKind]})</p>}{party&&<address><strong>{party.name}</strong><span>{m[party.kind]}</span>{party.phone&&<span>{m.phone}: {party.phone}</span>}{party.address&&<span>{party.address}</span>}{party.email&&<span>{party.email}</span>}</address>}</div>
   <div className="invoice-meta">{editing?<><label>{t.number}<input value={reference} placeholder={billNumber} maxLength={80} onChange={e=>setReference(e.target.value)}/></label><label>{t.date}<input type="date" required max={today()} value={date} onChange={e=>pickDate(e.target.value)}/></label></>:<><p>{t.number}: <strong>{billNumber}</strong></p><p>{t.date}: {date.split('-').reverse().join('-')}</p></>}</div>
   {editing&&kind!=='expense'&&warehouses.length>1&&<label>{t.warehouse}<select value={selectedWarehouse} onChange={e=>setWarehouse(e.target.value)}>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}
   {editing&&kind==='expense'&&<div className="invoice-meta"><label>{t.category}<input maxLength={80} value={category} onChange={e=>setCategory(e.target.value)}/></label><label>{t.method}<select value={method} onChange={e=>setMethod(e.target.value)}>{(['due','cash','bank'] as const).map(value=><option key={value} value={value}>{value==='due'?t.unpaid:t[value]}</option>)}</select></label></div>}
   <div className="invoice-scroll"><table className="invoice-table"><thead><tr><th>{t.serial}</th><th>{kind==='expense'?t.description:t.item}</th><th>{t.quantity}</th><th>{t.rate}</th><th>{t.amount}</th>{editing&&<th/>}</tr></thead><tbody>{lines.map((line,index)=><tr key={line.key}><td>{index+1}</td><td>{editing?(kind==='expense'?<input aria-label={`${t.description} ${index+1}`} required maxLength={120} value={line.description} onChange={e=>change(line.key,'description',e.target.value)}/>:<select aria-label={`${t.item} ${index+1}`} required value={line.item} onChange={e=>change(line.key,'item',e.target.value)}><option value="">{t.choose}</option>{items.map(item=><option key={item.id} value={item.id}>{itemLabel(item)}</option>)}</select>):kind==='expense'?line.description:items.find(i=>i.id===line.item)?.name}</td><td data-label={t.quantity}>{editing?<input aria-label={`${t.quantity} ${index+1}`} inputMode="decimal" required value={line.quantity} onChange={e=>change(line.key,'quantity',e.target.value)}/>:displayQuantity(quantity(line.quantity))}<small className="memo-unit">{items.find(i=>i.id===line.item)?.unit??''}</small></td><td data-label={t.rate}>{editing?<input aria-label={`${t.rate} ${index+1}`} inputMode="decimal" required value={line.rate} onChange={e=>change(line.key,'rate',e.target.value)}/>:rateDisplay(line.rate)}</td><td data-label={t.amount}>{editing?<input aria-label={`${t.amount} ${index+1}`} inputMode="decimal" required value={line.amount} onChange={e=>change(line.key,'amount',e.target.value)}/>:rowAmount(line)}</td>{editing&&<td><button type="button" aria-label={`${t.remove} ${index+1}`} disabled={lines.length===1} onClick={()=>{if(confirmDelete(language,String(lines.indexOf(line)+1)))setLines(old=>old.filter(row=>row.key!==line.key))}}>×</button></td>}</tr>)}</tbody><tfoot><tr><th colSpan={2}>{t.totalQuantity}</th><td>{totalQuantities()}</td><th>{t.subtotal}</th><td><strong>{money(total())}</strong></td>{editing&&<td/>}</tr></tfoot></table></div>
   {editing&&<button className="memo-add-row" type="button" disabled={lines.length>=50} onClick={()=>setLines(old=>[...old,fresh()])}>＋ {t.add}</button>}
   <dl className="memo-totals"><div><dt>{t.subtotal}</dt><dd>{money(total())}</dd></div><div><dt>{t.previous}</dt><dd>{money(previous)}</dd></div><div className="memo-grand"><dt>{t.total}</dt><dd>{money(grandTotal)}</dd></div></dl>{grandTotal<0n&&<p>{t.creditBalance}: {money(-grandTotal)}</p>}

   {editing?<details className="invoice-notes"><summary>{t.notes}</summary><textarea aria-label={t.notes} maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></details>:note&&<p>{note}</p>}
   {kind!=='expense'&&<p className="books-hint">{t.due}</p>}{error&&<output role="alert">{error}</output>}
   <p className="memo-thanks">{t.thanks}</p><div className="memo-signatures"><span>{t.partySignature}</span><span>{t.authorizedSignature}</span></div>
   <div className="books-buttons memo-controls"><button type="submit" className="books-primary" disabled={!allowed.length||balanceBusy||balanceFailed}>{t.review}</button></div>
  </form>
 </section>
}
