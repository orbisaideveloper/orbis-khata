import {OutstandingPreview} from './OutstandingPreview';
import {useEffect,useRef,useState} from 'react';
import type {Language} from '../i18n';
import {inLanguage} from '../localize';
import {minor,money,today} from './model';
import {useWorkspaceSettings} from './use-settings';
import {profileBalance,profileCommand,type ProfileState,type ProfileCommand} from '../expense-profiles/model';
import {expenseCommand,type ExpenseCommand} from './expense-model';
import {expensePendingKey,restoreExpense} from './expense-pending';
import {rejected} from './api';
import {billError} from './business-error';
type Pending={operation:'expense-profiles';command:ProfileCommand}|{operation:'expense-post';command:ExpenseCommand};
function readPending(user:string,company:string):Pending|null{
 try{
  const raw=sessionStorage.getItem(`orbis.expense-profiles.pending.v1:${user}:${company}`);
  if(raw){const command=JSON.parse(raw);if(command.company===company&&profileCommand(command))return {operation:'expense-profiles',command};}
  const command=restoreExpense(user,company);return command?{operation:'expense-post',command}:null;
 }catch{return null;}
}
export function ExpensePayment({company,userId,language,onChanged}:Readonly<{company:string;userId:string;language:Language;onChanged:()=>void}>){
 const {request}=useWorkspaceSettings(company,true),[data,setData]=useState<ProfileState|null>(null),[failed,setFailed]=useState(false),[reload,setReload]=useState(0);
 const [selected,setSelected]=useState(''),[name,setName]=useState(''),[category,setCategory]=useState(''),[amount,setAmount]=useState(''),[date,setDate]=useState(today),[method,setMethod]=useState<'cash'|'bank'>('cash'),[message,setMessage]=useState(''),[pending,setPending]=useState<Pending|null>(()=>readPending(userId,company)),[busy,setBusy]=useState(false),guard=useRef(false);
 const l=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en);
 useEffect(()=>{let active=true;setData(null);setFailed(false);void request<ProfileState>('expense-profiles',{company,action:'list'}).then(value=>{if(active)setData(value);},()=>{if(active)setFailed(true);});return()=>{active=false;};},[company,request,reload]);
 const profile=data?.profiles.find(row=>row.id===selected),due=profile&&data?profileBalance(data,profile,date):null;
 function prepare():Pending|null{
   let next:Pending;
    const value=minor(amount);if(date>today())throw new Error('INVALID_DATE');
    if(profile&&data){
     const advance=BigInt(value)>profileBalance(data,profile,date);
     if(advance&&!window.confirm(l('বাকির চেয়ে বেশি। Advance হিসেবে সেভ করবেন?','बकाया से अधिक है। अग्रिम सहेजें?','Exceeds the amount due. Save as advance?')))return null;
     next={operation:'expense-profiles',command:{company,action:'pay',operationId:crypto.randomUUID(),payment:{id:crypto.randomUUID(),profileId:profile.id,date,amount:value,method,...(advance?{allowAdvance:true}:{})}}};
    }else{
     const command=expenseCommand({id:crypto.randomUUID(),company,date,kind:'charge',amount:value,category:category.trim(),payee:name.trim(),method,parent:null,reference:'',note:''});
     if(!command){throw new Error('INVALID_EXPENSE');}
     next={operation:'expense-post',command};
    }
    if(!window.confirm(l('খরচের পেমেন্ট সেভ করবেন?','खर्च भुगतान सहेजें?','Save expense payment?')+' '+money(value)))return null;
   return next;
 }
 async function save(){
  if(guard.current){return;}
  guard.current=true;setBusy(true);setMessage('');
  let activePending=pending;
  try{
   const next=pending??prepare();
   if(!next)return;
   const storageKey=next.operation==='expense-profiles'?`orbis.expense-profiles.pending.v1:${userId}:${company}`:expensePendingKey(userId,company);
   sessionStorage.setItem(storageKey,JSON.stringify(next.command));setPending(next);activePending=next;
   await request(next.operation,next.command);
   sessionStorage.removeItem(storageKey);setPending(null);setAmount('');setReload(n=>n+1);onChanged();setMessage(l('পেমেন্ট সেভ হয়েছে।','भुगतान सहेजा गया।','Payment saved.'));
  }catch(error){
   if(rejected(error)&&activePending){const key=activePending.operation==='expense-profiles'?`orbis.expense-profiles.pending.v1:${userId}:${company}`:expensePendingKey(userId,company);sessionStorage.removeItem(key);setPending(null);}
   setMessage(billError(error,language,l('সেভ নিশ্চিত নয়। একই পেমেন্ট আবার পাঠান।','सहेजना अनिश्चित है। वही भुगतान फिर भेजें।','Save not confirmed. Retry the same payment.')));
  }finally{guard.current=false;setBusy(false);}
 }
 return <section className="expense-payment"><h3>{l('খরচের পেমেন্ট','खर्च भुगतान','Expense payment')}</h3>{failed&&<output role="alert">{l('হিসাব পড়া যায়নি।','खाता उपलब्ध नहीं।','Accounts unavailable.')}<button type="button" onClick={()=>setReload(n=>n+1)}>{l('আবার চেষ্টা','पुनः प्रयास','Retry')}</button></output>}{!data&&!failed&&<output>{l('লোড হচ্ছে…','लोड हो रहा है…','Loading…')}</output>}
 <form onSubmit={event=>{event.preventDefault();void save();}}><fieldset disabled={busy||Boolean(pending)||!data}><label>{l('কাকে দেওয়া','किसे दिया','Paid to')}<select value={selected} onChange={event=>{setSelected(event.target.value);setName('');}}><option value="">{l('সাধারণ খরচ','सामान्य खर्च','Ordinary expense')}</option>{data?.profiles.map(p=><option key={p.id} value={p.id}>{p.name} · {data.categories.find(c=>c.id===p.categoryId)?.name}</option>)}</select></label>
 {!profile&&<><label>{l('নাম','नाम','Name')}<input value={name} onChange={e=>setName(e.target.value)} maxLength={120}/></label><label>{l('ক্যাটাগরি','श्रेणी','Category')}<input required value={category} onChange={e=>setCategory(e.target.value)} maxLength={80}/></label></>}
 {due!==null&&<><output>{due<0n?l('Advance','अग्रिम','Advance'):l('বাকি','बकाया','Due')}: {money(due<0n?-due:due)}</output><OutstandingPreview showCurrent={false} due={due} amount={amount} language={language}/></>}
 <label>{l('টাকা','रकम','Amount')}<input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>{l('তারিখ','तारीख','Date')}<input required type="date" max={today()} value={date} onChange={e=>setDate(e.target.value)}/></label><label>{l('পরিশোধ','भुगतान माध्यम','Settlement')}<select value={method} onChange={e=>setMethod(e.target.value as 'cash'|'bank')}><option value="cash">{l('নগদ','नकद','Cash')}</option><option value="bank">{l('ব্যাংক','बैंक','Bank')}</option></select></label></fieldset>
 <button type="submit" disabled={busy||!data}>{pending?l('একই পেমেন্ট আবার পাঠান','वही भुगतान फिर भेजें','Retry same payment'):l('যাচাই ও সেভ','जाँचें और सहेजें','Review & save')}</button></form>{message&&<output aria-live="polite">{message}</output>}</section>;
}
