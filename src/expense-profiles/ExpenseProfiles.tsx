import {useEffect,useRef,useState} from 'react';
import type {Language} from '../i18n';
import {inLanguage} from '../localize';
import {requestKhata,rejected} from '../accounting/api';
import {minor,money,today} from '../accounting/model';
import {ScheduleFields,WorkSwitch} from './ScheduleFields';
import {billError} from '../accounting/business-error';
import {textValue} from '../text-value';
import {changeWork,validSchedule} from './schedule';
import {profileBalance,profileCommand,type ExpenseProfile,type ProfileCommand,type ProfileState} from './model';
type Request=<T>(operation:string,input:unknown)=>Promise<T>;
type InlineEntry={category:string;subcategory:string;payee:string;onPick:(profile:ExpenseProfile|null,editing?:boolean)=>void};
type Props={userId:string;company:string;language:Language;gateway?:Request;onBack:()=>void;onChanged:()=>void;onLock:(locked:boolean)=>void;blocked:boolean;entry?:InlineEntry};
type Draft={profile:ExpenseProfile;amount:string;opening:string;advance:boolean};
function newDraft(categoryId:string,monthly=false):Draft {return {profile:{id:crypto.randomUUID(),categoryId,name:'',schedule:{kind:'BILL',mode:monthly?'CALENDAR':'ONCE',start:today(),amount:'0',changes:[]},opening:'0',openingDate:today()},amount:'',opening:'0',advance:false};}
function amountInput(input:string,zero=false):string|null {try {return zero&&/^[0০०]+([.][0০०]{1,2})?$/u.test(input.trim())?'0':minor(input);}catch{return null;}}
const decimal=(amount:string)=>{const n=BigInt(amount);return `${n/100n}.${String(n%100n).padStart(2,'0')}`;};
function absoluteMoney(amount:bigint){return money((amount<0n?-amount:amount).toString());}
function accountDisplay(state:ProfileState,profile:ExpenseProfile,language:Language){const amount=profileBalance(state,profile,today());const prefix=amount<0n?inLanguage(language,'Advance ','अग्रिम ','Advance '):'';return prefix+absoluteMoney(amount);}
export default function ExpenseProfiles({userId,company,language,gateway=requestKhata,onBack,onChanged,onLock,blocked,entry}:Readonly<Props>) {
 const l=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en);
 const categoryName=entry?.category;
 const loadFailure=l('তথ্য লোড হয়নি। আবার চেষ্টা করুন।','जानकारी नहीं मिली। फिर कोशिश करें।','Could not load accounts. Retry.');
 const [data,setData]=useState<ProfileState|null>(null),[draft,setDraft]=useState<Draft|null>(()=>entry?newDraft(crypto.randomUUID(),true):null),[selected,setSelected]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
 const key=`orbis.expense-profiles.pending.v1:${userId}:${company}`;
 const [pending,setPending]=useState<ProfileCommand|null>(()=>{try {const p=JSON.parse(sessionStorage.getItem(key)??'null');return p?.company===company&&profileCommand(p)?p:null;}catch{return null;}});
 const running=useRef(false);
 useEffect(()=>{let active=true;setData(null);void gateway<ProfileState>('expense-profiles',{company,action:'list'}).then(value=>{if(active){setData(value);if(categoryName&&value.profiles.some(p=>value.categories.some(c=>c.id===p.categoryId&&c.name.toLocaleLowerCase()===categoryName.toLocaleLowerCase())))setDraft(null);}},()=>{if(active)setMessage(loadFailure);});return()=>{active=false;};},[company,gateway,attempt,categoryName,loadFailure]);
 useEffect(()=>{onLock(Boolean(pending)||busy);return()=>onLock(false);},[pending,busy,onLock]);
 async function send(command:ProfileCommand) {
  if(running.current)return;
  running.current=true;setBusy(true);setMessage('');
  try {
   sessionStorage.setItem(key,JSON.stringify(command));setPending(command);
   const result=await gateway<ProfileState>('expense-profiles',command);
   sessionStorage.removeItem(key);setPending(null);setData(result);setDraft(null);if(command.action==='delete'){setSelected('');entry?.onPick(null);}onChanged();
   setMessage(l('সেভ হয়েছে।','सुरक्षित हुआ।','Saved.'));
  }catch(error){if(rejected(error)){sessionStorage.removeItem(key);setPending(null);}setMessage(billError(error,language,l('সেভ নিশ্চিত হয়নি। একই এন্ট্রি দিয়ে আবার চেষ্টা করুন।','सहेजने की पुष्टि नहीं हुई। इसी प्रविष्टि से फिर कोशिश करें।','Save not confirmed. Retry this same entry.')));}
  finally{running.current=false;setBusy(false);}
 }
 function confirmTwice(question:string){return window.confirm(question)&&window.confirm(l('নিশ্চিত করুন। পুরোনো ইতিহাস থাকবে।','पुष्टि करें। पुराना इतिहास सुरक्षित रहेगा।','Confirm. Existing history will be retained.'));}
 const mutate=(command:Omit<ProfileCommand,'company'|'operationId'>)=>void send({...command,company,operationId:crypto.randomUUID()});
 function save(event:React.SubmitEvent<HTMLFormElement>) {
  event.preventDefault();if(!draft||!data)return;
  if(entry&&(!entry.category.trim()||!entry.payee.trim())){setMessage(l('ক্যাটাগরি ও কাকে দেবেন লিখুন।','श्रेणी और प्राप्तकर्ता लिखें।','Enter the category and payee.'));return;}
  const amount=draft.profile.schedule.mode==='VARIABLE'?'0':amountInput(draft.amount),opening=amountInput(draft.opening,true);
  if(amount===null||(amount==='0'&&draft.profile.schedule.mode!=='VARIABLE')||opening===null){setMessage(l('টাকার পরিমাণ পরীক্ষা করুন।','राशि जाँचें।','Check the amount.'));return;}
  const profile={...draft.profile,...(entry?{name:entry.payee.trim(),subcategory:entry.subcategory.trim(),categoryId:data.categories.find(c=>c.name.toLocaleLowerCase()===entry.category.trim().toLocaleLowerCase())?.id??draft.profile.categoryId}:{}),schedule:{...draft.profile.schedule,amount:amount.toString()},opening:(draft.advance?-BigInt(opening):BigInt(opening)).toString()};
  if(!validSchedule(profile.schedule))return;
  const previous=data.profiles.find(p=>p.id===profile.id);
  if(previous&&JSON.stringify(previous)!==JSON.stringify(profile)&&!confirmTwice(l('এই প্রোফাইলের সংশোধন সেভ করবেন?','इस खाते का सुधार सहेजें?','Save this account correction?')))return;
  mutate({action:'save',id:crypto.randomUUID(),profile,...(entry?{categoryName:entry.category.trim()}:{})});
 }
 function pay(event:React.SubmitEvent<HTMLFormElement>,profile:ExpenseProfile) {
  event.preventDefault();
  const f=new FormData(event.currentTarget),amount=amountInput(textValue(f.get('amount')));
  if(amount===null||BigInt(amount)<=0n){return;}
  const advance=BigInt(amount)>profileBalance(data!,profile,textValue(f.get('date')));
  if(advance&&!window.confirm(l('বকেয়ার বেশি দিচ্ছেন। অতিরিক্ত টাকা Advance থাকবে। চালিয়ে যাবেন?','बकाया से अधिक भुगतान है। अतिरिक्त रकम अग्रिम रहेगी। जारी रखें?','Payment exceeds the accrued balance. The excess will be an advance. Continue?')))return;
  if(confirmTwice(l('পেমেন্ট সেভ করবেন?','भुगतान सहेजें?','Save payment?'))) {
   mutate({action:'pay',payment:{id:crypto.randomUUID(),profileId:profile.id,date:textValue(f.get('date')),amount,method:textValue(f.get('method')) as 'cash'|'bank',...(advance?{allowAdvance:true}:{})}});
  }
 }
 const current=data?.profiles.find(p=>p.id===selected);
 const visible=(data?.profiles??[]).filter(p=>!entry||data?.categories.some(c=>c.id===p.categoryId&&c.name.toLocaleLowerCase()===entry.category.trim().toLocaleLowerCase()));
 const net=current&&data?profileBalance(data,current,today()):0n;
 function actualBill(event:React.SubmitEvent<HTMLFormElement>){event.preventDefault();
  if(!current){return;}
  const f=new FormData(event.currentTarget),amount=amountInput(textValue(f.get('amount')));if(amount&&window.confirm(l('আসল বিল সেভ করবেন? Payment-এর আগে খরচ বা cash কাটবে না।','वास्तविक बिल सहेजें? भुगतान से पहले खर्च या नकद नहीं कटेगा।','Save the actual bill? Expense and cash change only on payment.')))mutate({action:'bill',bill:{id:crypto.randomUUID(),profileId:current.id,date:textValue(f.get('date')),amount}});}
 return <section className={entry?"expense-scheduled-inline":"books-card"} aria-label={l('বেতন ও বিল','वेतन और बिल','Salary and bills')}>
  {!entry&&<div className="expense-profile-toolbar"><button type="button" disabled={busy||Boolean(pending)} onClick={onBack}>← {l('ফিরুন','वापस','Back')}</button><h2>{l('বেতন ও বিল','वेतन और बिल','Salary and bills')}</h2></div>}
  {message&&<output aria-live="polite">{message}</output>}
  {!data&&!pending&&<button type="button" onClick={()=>setAttempt(n=>n+1)}>{l('আবার চেষ্টা','फिर कोशिश','Retry')}</button>}
  {pending&&<div><output>{l('আগের সেভটি আগে নিশ্চিত করুন।','पहले पिछला सहेजना पूरा करें।','Resolve the previous save first.')}</output><button type="button" disabled={busy} onClick={()=>void send(pending)}>{l('একই এন্ট্রি আবার পাঠান','यही प्रविष्टि फिर भेजें','Retry same entry')}</button></div>}
  {data&&!pending&&<>
   {entry&&<small>{l('মাসিক amount বাকি/Advance রাখে। খরচ ও cash শুধু payment-এ বদলাবে।','मासिक राशि बकाया/अग्रिम रखती है। खर्च व नकद केवल भुगतान से बदलेंगे।','Monthly amounts track due/advance. Only payments change expense and cash.')}</small>}
   <div className="expense-profile-toolbar">
    {entry&&draft&&<button type="button" disabled={busy||blocked} onClick={()=>setDraft(null)}>{l('সংরক্ষিত হিসাব','सहेजे खाते','Saved schedules')}</button>}
    {!entry&&<button type="button" disabled={busy||blocked} onClick={()=>{const name=window.prompt(l('ক্যাটাগরির নাম','श्रेणी का नाम','Category name'));if(name?.trim())mutate({action:'category',id:crypto.randomUUID(),name:name.trim()});}}>＋ {l('ক্যাটাগরি','श्रेणी','Category')}</button>}
    <button type="button" disabled={busy||blocked||!entry&&!data.categories.length} onClick={()=>{setSelected('');entry?.onPick(null);setDraft(newDraft(data.categories.find(c=>c.name.toLocaleLowerCase()===categoryName?.trim().toLocaleLowerCase())?.id??data.categories[0]?.id??crypto.randomUUID(),Boolean(entry)));}}>＋ {entry?l('নতুন হিসাব','नया खाता','New schedule'):l('প্রোফাইল','खाता','Profile')}</button>
   </div>
   {!entry&&<details><summary>{l('ক্যাটাগরি সাজান','श्रेणियाँ व्यवस्थित करें','Manage categories')}</summary>{data.categories.map(c=><div className="expense-profile-summary" key={c.id}><span>{c.name}</span><button type="button" disabled={busy||blocked} onClick={()=>{const name=window.prompt(l("ক্যাটাগরির নাম","श्रेणी का नाम","Category name"),c.name);if(name?.trim())mutate({action:"category",id:c.id,name:name.trim()});}}>{l("সংশোধন","सुधार","Edit")}</button><button type="button" aria-label={'Remove '+c.name} disabled={busy||data.profiles.some(p=>p.categoryId===c.id)} onClick={()=>{if(confirmTwice(l('ক্যাটাগরি সরাবেন?','श्रेणी हटाएँ?','Remove category?')))mutate({action:'category-delete',id:c.id});}}>×</button></div>)}</details>}
   {draft&&<form className="books-form expense-profile-form" onSubmit={save}>
    {!entry&&<label>{l('নাম','नाम','Name')}<input aria-label="Profile name" required maxLength={120} value={draft.profile.name} onChange={e=>setDraft({...draft,profile:{...draft.profile,name:e.target.value}})}/></label>}
    {!entry&&<label>{l('ক্যাটাগরি','श्रेणी','Category')}<select aria-label="Profile category" value={draft.profile.categoryId} onChange={e=>setDraft({...draft,profile:{...draft.profile,categoryId:e.target.value}})}>{data.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    {draft.profile.schedule.mode!=='VARIABLE'&&<label>{l('নির্ধারিত টাকা','निर्धारित राशि','Scheduled amount')}<input aria-label="Profile amount" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={draft.amount} onChange={e=>setDraft({...draft,amount:e.target.value})}/></label>}
    <ScheduleFields extended value={draft.profile.schedule} language={language} onChange={schedule=>setDraft({...draft,profile:{...draft.profile,schedule}})}/>
    <details><summary>{l('আগের ব্যালেন্স','पुराना शेष','Opening balance')}</summary>
     <label>{l('ধরন','प्रकार','Direction')}<select aria-label="Profile opening direction" value={draft.advance?'advance':'due'} onChange={e=>setDraft({...draft,advance:e.target.value==='advance'})}><option value="due">{l('ওকে দেবেন','उसे देना है','You owe')}</option><option value="advance">{l('আগে দিয়েছেন / পাবেন','पहले दिया / लेना है','Advance / recoverable')}</option></select></label>
     <label>{l('টাকা','राशि','Amount')}<input aria-label="Profile opening amount" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={draft.opening} onChange={e=>setDraft({...draft,opening:e.target.value})}/></label>
     <label>{l('তারিখ','तारीख','Date')}<input aria-label="Profile opening date" type="date" required value={draft.profile.openingDate} onChange={e=>setDraft({...draft,profile:{...draft.profile,openingDate:e.target.value}})}/></label>
    </details>
    <div className="expense-profile-toolbar"><button type="submit" disabled={busy||blocked}>{l('সেভ','सहेजें','Save')}</button><button type="button" onClick={()=>{setDraft(null);entry?.onPick(current??null);}}>{l('বাতিল','रद्द','Cancel')}</button></div>
   </form>}
   {!draft&&!current&&<div className="expense-profiles-list">{visible.map(profile=><button className="expense-profile-row" key={profile.id} type="button" onClick={()=>{setSelected(profile.id);entry?.onPick(profile);}}><div className="expense-profile-summary"><strong>{profile.name}</strong><span>{accountDisplay(data,profile,language)}</span></div><small>{data.categories.find(c=>c.id===profile.categoryId)?.name} · {profile.schedule.kind==='SALARY'?l('বেতন','वेतन','Salary'):l('বিল','बिल','Bill')}</small></button>)}</div>}
   {!draft&&current&&<>
    <div className="expense-profile-summary"><strong>{current.name}</strong><strong>{net<0n?l('Advance','अग्रिम','Advance'):l('বাকি','बकाया','Due')}: {absoluteMoney(net)}</strong></div>
    <div className="expense-profile-toolbar"><button type="button" onClick={()=>{setSelected('');entry?.onPick(null);}}>← {l('তালিকা','सूची','List')}</button><button type="button" disabled={busy||blocked} onClick={()=>{entry?.onPick(current,true);setDraft({profile:structuredClone(current),amount:decimal(current.schedule.amount),opening:decimal((BigInt(current.opening)<0n?-BigInt(current.opening):BigInt(current.opening)).toString()),advance:BigInt(current.opening)<0n});}}>{l('সংশোধন','सुधार','Edit')}</button><button type="button" disabled={busy||blocked||current.opening!=='0'||current.schedule.changes.length>0||data.payments.some(p=>p.profileId===current.id)||(data.bills??[]).some(b=>b.profileId===current.id)} onClick={()=>{if(confirmTwice(l('এই ভুল হিসাব মুছবেন? History থাকবে।','यह गलत खाता हटाएँ? इतिहास सुरक्षित रहेगा।','Delete this mistaken account? History is retained.')))mutate({action:'delete',id:current.id});}}>{l('ডিলিট','मिटाएँ','Delete')}</button></div>
    {current.schedule.mode==='VARIABLE'&&<details><summary>{l('আসল বিল যোগ করুন','वास्तविक बिल जोड़ें','Add actual bill')}</summary><form className="books-form" onSubmit={actualBill}><label>{l('বিলের টাকা','बिल राशि','Bill amount')}<input name="amount" required inputMode="decimal"/></label><label>{l('বিলের তারিখ','बिल की तारीख','Bill date')}<input name="date" type="date" defaultValue={today()} required max={today()}/></label><button type="submit" disabled={busy||blocked}>{l('বিল সেভ','बिल सहेजें','Save bill')}</button></form></details>}
    <details><summary>{l('সময়সূচি বন্ধ / চালু','समय-सारणी बंद / चालू','Stop / resume schedule')}</summary><WorkSwitch extended disabled={busy||blocked} value={current.schedule} language={language} onChange={(active,date)=>{try{const profile={...current,schedule:changeWork(current.schedule,date,active)};if(confirmTwice(l('কাজের অবস্থা বদলাবেন?','काम की स्थिति बदलें?','Change work status?')))mutate({action:'save',id:crypto.randomUUID(),profile});}catch{setMessage(l('তারিখ পরীক্ষা করুন।','तारीख जाँचें।','Check the date.'));}}}/></details>
    <form className="books-form" onSubmit={event=>pay(event,current)}>
     <label>{l('পেমেন্ট','भुगतान','Payment')}<input name="amount" aria-label="Profile payment amount" inputMode="decimal" required pattern="[0-9]+([.][0-9]{1,2})?"/></label><label>{l('তারিখ','तारीख','Date')}<input name="date" type="date" defaultValue={today()} required/></label><select name="method" aria-label="Profile payment method"><option value="cash">{l('নগদ','नकद','Cash')}</option><option value="bank">{l('ব্যাংক','बैंक','Bank')}</option></select><button disabled={busy||blocked} type="submit">{l('পেমেন্ট সেভ','भुगतान सहेजें','Save payment')}</button>
    </form>
    <details><summary>{l('বন্ধ–চালুর ইতিহাস','काम की स्थिति का इतिहास','Work history')}</summary>{current.schedule.changes.map((change,i)=><p key={change.date+String(i)}>{change.date} · {change.active?l('চালু','चालू','Active'):l('বন্ধ','बंद','Stopped')}</p>)}</details>
    {current.schedule.mode==='VARIABLE'&&<div><h3>{l('বিলের ইতিহাস','बिल इतिहास','Bill history')}</h3>{(data.bills??[]).filter(b=>b.profileId===current.id).map(b=><div className="expense-profile-summary" key={b.id}><span>{b.date} · {money(b.amount)} {b.voided?l('বাতিল','रद्द','Cancelled'):''}</span>{!b.voided&&<button type="button" disabled={busy||blocked} onClick={()=>{if(confirmTwice(l('ভুল বিল বাতিল করবেন? Payment থাকবে।','गलत बिल रद्द करें? भुगतान सुरक्षित रहेगा।','Cancel incorrect bill? Payments remain unchanged.')))mutate({action:'bill-void',id:b.id,date:today()});}}>{l('বাতিল','रद्द','Cancel bill')}</button>}</div>)}</div>}
    <h3>{l('পেমেন্টের ইতিহাস','भुगतान इतिहास','Payments')}</h3>{data.payments.filter(p=>p.profileId===current.id).map(p=><div className="expense-profile-summary" key={p.id}><span>{p.date} · {money(p.amount)} {p.voided?l('বাতিল','रद्द','Cancelled'):''}</span>{!p.voided&&<button type="button" disabled={busy||blocked} onClick={()=>{if(confirmTwice(l('পেমেন্ট বাতিল করবেন?','भुगतान रद्द करें?','Cancel payment?')))mutate({action:'void',id:p.id,date:today()});}}>×</button>}</div>)}
   </>}
  </>}
 </section>;
}
