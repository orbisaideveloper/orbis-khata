import { useState } from "react";
import type { Language } from '../i18n';
import { inLanguage } from '../localize';
import type { ExpenseSchedule } from './schedule';
export function ScheduleFields({ value, onChange, language, extended=false }: Readonly<{value:ExpenseSchedule;extended?:boolean;onChange:(value:ExpenseSchedule)=>void;language:Language}>) {
 const l=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en);
 return <div className="expense-schedule-fields">
  <label>{l('ধরন','प्रकार','Type')}<select aria-label="Expense type" value={value.kind} onChange={e=>onChange({...value,kind:e.target.value as ExpenseSchedule['kind'],mode:e.target.value==='SALARY'&&(value.mode==='ONCE'||value.mode==='VARIABLE')?'CALENDAR':value.mode,changes:[]})}><option value="BILL">{l('বিল','बिल','Bill')}</option><option value="SALARY">{l('বেতন','वेतन','Salary')}</option></select></label>
  <label>{l('সময়সূচি','समय-सारणी','Schedule')}<select aria-label="Expense schedule" value={value.mode} onChange={e=>onChange({...value,mode:e.target.value as ExpenseSchedule['mode'],amount:e.target.value==='VARIABLE'?'0':value.amount,changes:[]})}>{extended&&value.kind==='BILL'&&<option value="VARIABLE">{l('প্রতি মাসে আসল বিল','हर महीने वास्तविक बिल','Actual bill each month')}</option>}{value.kind==='BILL'&&<option value="ONCE">{l('একবার','एक बार','One-time')}</option>}<option value="CALENDAR">{l('মাসভিত্তিক','कैलेंडर माह','Monthly')}</option><option value="ANNIVERSARY">{l('তারিখের চক্র','तारीख का चक्र','Date cycle')}</option></select></label>
  <label>{l('শুরুর তারিখ','शुरू की तारीख','Start date')}<input aria-label="Schedule start" type="date" required value={value.start} onChange={e=>onChange({...value,start:e.target.value})}/></label>
  {extended&&<label>{l('শেষ তারিখ (ঐচ্ছিক)','अंतिम तारीख (वैकल्पिक)','End date (optional)')}<input aria-label="Schedule end" type="date" min={value.start} value={value.end??''} onChange={e=>{const next={...value};if(e.target.value){next.end=e.target.value;}else{delete next.end;}
    onChange(next);}}/></label>}
  <p className="expense-schedule-hint">{scheduleHint(value,language)}</p>
 </div>;
}
export function WorkSwitch({value,onChange,language,disabled=false,extended=false}:Readonly<{value:ExpenseSchedule;onChange:(active:boolean,date:string)=>void;language:Language;disabled?:boolean;extended?:boolean}>) {
 const l=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en);
 const active=value.changes.at(-1)?.active??true;
 const [date,setDate]=useState(()=>new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"}));
 if(value.mode==='ONCE'||!extended&&value.kind!=='SALARY') return null;
 return <div className="expense-work-switch">
  <label>{active?l('শেষ কাজের দিন','अंतिम कार्य दिवस','Last paid work day'):l('ফেরার তারিখ','वापसी की तारीख','Resume date')}<input name="date" type="date" required value={date} onChange={e=>setDate(e.target.value)} min={value.changes.at(-1)?.date??value.start}/></label>
  <button type="button" disabled={disabled} onClick={()=>onChange(!active,date)} aria-label={(active?'Stop ':'Start ')+(extended?'schedule':'salary')}>{active?l('✓ চালু · বন্ধ করুন','✓ चालू · रोकें','✓ Active · Stop'):l('বন্ধ · চালু করুন','बंद · शुरू करें','Stopped · Start')}</button>
 </div>;
}

function scheduleHint(value:ExpenseSchedule,language:Language){
 const l=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en);
 if(value.mode==='VARIABLE')return l('প্রতি মাসের আসল বিল লিখুন। Payment-এর আগে খরচ বা cash বদলাবে না।','हर महीने वास्तविक बिल लिखें। भुगतान से पहले खर्च या नकद नहीं बदलेगा।','Enter each actual bill. Expense and cash do not change before payment.');
 if(value.kind==='SALARY')return l('বেতন কাজের দিন অনুযায়ী জমবে।','वेतन काम के दिनों के अनुसार जुड़ेगा।','Salary accrues for active work days.');
 return l('নির্দিষ্ট চক্রের টাকা হিসাবে জমবে।','निर्धारित चक्र की राशि जुड़ेगी।','The scheduled amount accrues for each active cycle.');
}
