import {useEffect,useRef,useState} from 'react';
import type {Language} from '../i18n';
import {inLanguage} from '../localize';
import {requestKhata,rejected} from '../accounting/api';
import {minor,money,today} from '../accounting/model';
import {ScheduleFields,WorkSwitch} from './ScheduleFields';
import {billError} from '../accounting/business-error';
import {changeWork,validSchedule} from './schedule';
import {profileBalance,profileCommand,type ExpenseProfile,type ProfileCommand,type ProfileState} from './model';
type Request=<T>(operation:string,input:unknown)=>Promise<T>;
type Props={userId:string;company:string;language:Language;gateway?:Request;onBack:()=>void;onChanged:()=>void;onLock:(locked:boolean)=>void;blocked:boolean};
type Draft={profile:ExpenseProfile;amount:string;opening:string;advance:boolean};
function newDraft(categoryId:string):Draft {return {profile:{id:crypto.randomUUID(),categoryId,name:'',schedule:{kind:'BILL',mode:'ONCE',start:today(),amount:'0',changes:[]},opening:'0',openingDate:today()},amount:'',opening:'0',advance:false};}
function amountInput(input:string,zero=false):string|null {try {return zero&&/^[0০०]+([.][0০०]{1,2})?$/u.test(input.trim())?'0':minor(input);}catch{return null;}}
const decimal=(amount:string)=>{const n=BigInt(amount);return `${n/100n}.${String(n%100n).padStart(2,'0')}`;};
export default function ExpenseProfiles({userId,company,language,gateway=requestKhata,onBack,onChanged,onLock,blocked}:Readonly<Props>) {
 const l=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en);
 const [data,setData]=useState<ProfileState|null>(null),[draft,setDraft]=useState<Draft|null>(null),[selected,setSelected]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
 const key=`orbis.expense-profiles.pending.v1:${userId}:${company}`;
 const [pending,setPending]=useState<ProfileCommand|null>(()=>{try {const p=JSON.parse(sessionStorage.getItem(key)??'null');return p&&p.company===company&&profileCommand(p)?p:null;}catch{return null;}});
 const running=useRef(false);
 useEffect(()=>{let active=true;setData(null);void gateway<ProfileState>('expense-profiles',{company,action:'list'}).then(value=>{if(active)setData(value);},()=>{if(active)setMessage(l('তথ্য লোড হয়নি। আবার চেষ্টা করুন।','जानकारी नहीं मिली। फिर कोशिश करें।','Could not load accounts. Retry.'));});return()=>{active=false;};},[company,gateway,attempt]);
 useEffect(()=>{onLock(Boolean(pending)||busy);return()=>onLock(false);},[pending,busy,onLock]);
 async function send(command:ProfileCommand) {
  if(running.current)return;
  running.current=true;setBusy(true);setMessage('');
  try {
   sessionStorage.setItem(key,JSON.stringify(command));setPending(command);
   const result=await gateway<ProfileState>('expense-profiles',command);
   sessionStorage.removeItem(key);setPending(null);setData(result);setDraft(null);onChanged();
   setMessage(l('সেভ হয়েছে।','सुरक्षित हुआ।','Saved.'));
  }catch(error){if(rejected(error)){sessionStorage.removeItem(key);setPending(null);}setMessage(billError(error,language,l('সেভ নিশ্চিত হয়নি। একই এন্ট্রি দিয়ে আবার চেষ্টা করুন।','सहेजने की पुष्टि नहीं हुई। इसी प्रविष्टि से फिर कोशिश करें।','Save not confirmed. Retry this same entry.')));}
  finally{running.current=false;setBusy(false);}
 }
 function confirmTwice(question:string){return window.confirm(question)&&window.confirm(l('নিশ্চিত করুন। পুরোনো ইতিহাস থাকবে।','पुष्टि करें। पुराना इतिहास सुरक्षित रहेगा।','Confirm. Existing history will be retained.'));}
 const mutate=(command:Omit<ProfileCommand,'company'|'operationId'>)=>void send({...command,company,operationId:crypto.randomUUID()});
 function save(event:React.FormEvent<HTMLFormElement>) {
  event.preventDefault();if(!draft||!data)return;
  const amount=amountInput(draft.amount),opening=amountInput(draft.opening,true);
  if(amount===null||BigInt(amount)<=0n||opening===null){setMessage(l('টাকার পরিমাণ পরীক্ষা করুন।','राशि जाँचें।','Check the amount.'));return;}
  const profile={...draft.profile,schedule:{...draft.profile.schedule,amount:amount.toString()},opening:(draft.advance?-BigInt(opening):BigInt(opening)).toString()};
  if(!validSchedule(profile.schedule))return;
  const previous=data.profiles.find(p=>p.id===profile.id);
  if(previous&&JSON.stringify(previous)!==JSON.stringify(profile)&&!confirmTwice(l('এই প্রোফাইলের সংশোধন সেভ করবেন?','इस खाते का सुधार सहेजें?','Save this account correction?')))return;
  mutate({action:'save',id:crypto.randomUUID(),profile});
 }
 const current=data?.profiles.find(p=>p.id===selected);
 return <section className="books-card" aria-label={l('বেতন ও বিল','वेतन और बिल','Salary and bills')}>
  <div className="expense-profile-toolbar"><button type="button" disabled={busy||Boolean(pending)} onClick={onBack}>← {l('ফিরুন','वापस','Back')}</button><h2>{l('বেতন ও বিল','वेतन और बिल','Salary and bills')}</h2></div>
  {message&&<output aria-live="polite">{message}</output>}
  {!data&&!pending&&<button type="button" onClick={()=>setAttempt(n=>n+1)}>{l('আবার চেষ্টা','फिर कोशिश','Retry')}</button>}
  {pending&&<div role="status"><p>{l('আগের সেভটি আগে নিশ্চিত করুন।','पहले पिछला सहेजना पूरा करें।','Resolve the previous save first.')}</p><button type="button" disabled={busy} onClick={()=>void send(pending)}>{l('একই এন্ট্রি আবার পাঠান','यही प्रविष्टि फिर भेजें','Retry same entry')}</button></div>}
  {data&&!pending&&<>
   <div className="expense-profile-toolbar">
    <button type="button" disabled={busy||blocked} onClick={()=>{const name=window.prompt(l('ক্যাটাগরির নাম','श्रेणी का नाम','Category name'));if(name?.trim())mutate({action:'category',id:crypto.randomUUID(),name:name.trim()});}}>＋ {l('ক্যাটাগরি','श्रेणी','Category')}</button>
    <button type="button" disabled={busy||blocked||!data.categories.length} onClick={()=>{setSelected('');setDraft(newDraft(data.categories[0].id));}}>＋ {l('প্রোফাইল','खाता','Profile')}</button>
   </div>
   <details><summary>{l('ক্যাটাগরি সাজান','श्रेणियाँ व्यवस्थित करें','Manage categories')}</summary>{data.categories.map(c=><div className="expense-profile-summary" key={c.id}><span>{c.name}</span><button type="button" disabled={busy||blocked} onClick={()=>{const name=window.prompt(l("ক্যাটাগরির নাম","श्रेणी का नाम","Category name"),c.name);if(name?.trim())mutate({action:"category",id:c.id,name:name.trim()});}}>{l("সংশোধন","सुधार","Edit")}</button><button type="button" aria-label={'Remove '+c.name} disabled={busy||data.profiles.some(p=>p.categoryId===c.id)} onClick={()=>{if(confirmTwice(l('ক্যাটাগরি সরাবেন?','श्रेणी हटाएँ?','Remove category?')))mutate({action:'category-delete',id:c.id});}}>×</button></div>)}</details>
   {draft&&<form className="books-form expense-profile-form" onSubmit={save}>
    <label>{l('নাম','नाम','Name')}<input aria-label="Profile name" required maxLength={120} value={draft.profile.name} onChange={e=>setDraft({...draft,profile:{...draft.profile,name:e.target.value}})}/></label>
    <label>{l('ক্যাটাগরি','श्रेणी','Category')}<select aria-label="Profile category" value={draft.profile.categoryId} onChange={e=>setDraft({...draft,profile:{...draft.profile,categoryId:e.target.value}})}>{data.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>{l('টাকা','राशि','Amount')}<input aria-label="Profile amount" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={draft.amount} onChange={e=>setDraft({...draft,amount:e.target.value})}/></label>
    <ScheduleFields value={draft.profile.schedule} language={language} onChange={schedule=>setDraft({...draft,profile:{...draft.profile,schedule}})}/>
    <details><summary>{l('আগের ব্যালেন্স','पुराना शेष','Opening balance')}</summary>
     <label>{l('ধরন','प्रकार','Direction')}<select aria-label="Profile opening direction" value={draft.advance?'advance':'due'} onChange={e=>setDraft({...draft,advance:e.target.value==='advance'})}><option value="due">{l('ওকে দেবেন','उसे देना है','You owe')}</option><option value="advance">{l('আগে দিয়েছেন / পাবেন','पहले दिया / लेना है','Advance / recoverable')}</option></select></label>
     <label>{l('টাকা','राशि','Amount')}<input aria-label="Profile opening amount" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={draft.opening} onChange={e=>setDraft({...draft,opening:e.target.value})}/></label>
     <label>{l('তারিখ','तारीख','Date')}<input aria-label="Profile opening date" type="date" required value={draft.profile.openingDate} onChange={e=>setDraft({...draft,profile:{...draft.profile,openingDate:e.target.value}})}/></label>
    </details>
    <div className="expense-profile-toolbar"><button type="submit" disabled={busy||blocked}>{l('সেভ','सहेजें','Save')}</button><button type="button" onClick={()=>setDraft(null)}>{l('বাতিল','रद्द','Cancel')}</button></div>
   </form>}
   {!draft&&!current&&<div className="expense-profiles-list">{data.profiles.map(profile=><button className="expense-profile-row" key={profile.id} type="button" onClick={()=>setSelected(profile.id)}><div className="expense-profile-summary"><strong>{profile.name}</strong><span>{money(profileBalance(data,profile,today()).toString())}</span></div><small>{data.categories.find(c=>c.id===profile.categoryId)?.name} · {profile.schedule.kind==='SALARY'?l('বেতন','वेतन','Salary'):l('বিল','बिल','Bill')}</small></button>)}</div>}
   {!draft&&current&&<>
    <div className="expense-profile-summary"><strong>{current.name}</strong><strong>{money(profileBalance(data,current,today()).toString())}</strong></div>
    <div className="expense-profile-toolbar"><button type="button" onClick={()=>setSelected('')}>← {l('তালিকা','सूची','List')}</button><button type="button" disabled={busy||blocked} onClick={()=>setDraft({profile:structuredClone(current),amount:decimal(current.schedule.amount),opening:decimal((BigInt(current.opening)<0n?-BigInt(current.opening):BigInt(current.opening)).toString()),advance:BigInt(current.opening)<0n})}>{l('সংশোধন','सुधार','Edit')}</button></div>
    <WorkSwitch disabled={busy||blocked} value={current.schedule} language={language} onChange={(active,date)=>{try{const profile={...current,schedule:changeWork(current.schedule,date,active)};if(confirmTwice(l('কাজের অবস্থা বদলাবেন?','काम की स्थिति बदलें?','Change work status?')))mutate({action:'save',id:crypto.randomUUID(),profile});}catch{setMessage(l('তারিখ পরীক্ষা করুন।','तारीख जाँचें।','Check the date.'));}}}/>
    <form className="books-form" onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget),amount=amountInput(String(f.get('amount')));if(amount===null||BigInt(amount)<=0n)return;if(confirmTwice(l('পেমেন্ট সেভ করবেন?','भुगतान सहेजें?','Save payment?')))mutate({action:'pay',payment:{id:crypto.randomUUID(),profileId:current.id,date:String(f.get('date')),amount:amount.toString(),method:f.get('method') as 'cash'|'bank'}});}}>
     <label>{l('পেমেন্ট','भुगतान','Payment')}<input name="amount" aria-label="Profile payment amount" inputMode="decimal" required pattern="[0-9]+([.][0-9]{1,2})?"/></label><label>{l('তারিখ','तारीख','Date')}<input name="date" type="date" defaultValue={today()} required/></label><select name="method" aria-label="Profile payment method"><option value="cash">{l('নগদ','नकद','Cash')}</option><option value="bank">{l('ব্যাংক','बैंक','Bank')}</option></select><button disabled={busy||blocked} type="submit">{l('পেমেন্ট সেভ','भुगतान सहेजें','Save payment')}</button>
    </form>
    <details><summary>{l('বন্ধ–চালুর ইতিহাস','काम की स्थिति का इतिहास','Work history')}</summary>{current.schedule.changes.map((change,i)=><p key={change.date+String(i)}>{change.date} · {change.active?l('চালু','चालू','Active'):l('বন্ধ','बंद','Stopped')}</p>)}</details>
    <h3>{l('পেমেন্টের ইতিহাস','भुगतान इतिहास','Payments')}</h3>{data.payments.filter(p=>p.profileId===current.id).map(p=><div className="expense-profile-summary" key={p.id}><span>{p.date} · {money(p.amount)} {p.voided?l('বাতিল','रद्द','Cancelled'):''}</span>{!p.voided&&<button type="button" disabled={busy||blocked} onClick={()=>{if(confirmTwice(l('পেমেন্ট বাতিল করবেন?','भुगतान रद्द करें?','Cancel payment?')))mutate({action:'void',id:p.id,date:today()});}}>×</button>}</div>)}
   </>}
  </>}
 </section>;
}
