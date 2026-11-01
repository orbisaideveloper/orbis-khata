import { useState } from "react";
import type { Language } from '../i18n';
import { inLanguage } from '../localize';
import type { ExpenseSchedule } from './schedule';
export function ScheduleFields({ value, onChange, language }: Readonly<{value:ExpenseSchedule;onChange:(value:ExpenseSchedule)=>void;language:Language}>) {
 const l=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en);
 return <div className="expense-schedule-fields">
  <label>{l('ধরন','प्रकार','Type')}<select aria-label="Expense type" value={value.kind} onChange={e=>onChange({...value,kind:e.target.value as ExpenseSchedule['kind'],mode:e.target.value==='SALARY'&&value.mode==='ONCE'?'CALENDAR':value.mode,changes:[]})}><option value="BILL">{l('বিল','बिल','Bill')}</option><option value="SALARY">{l('বেতন','वेतन','Salary')}</option></select></label>
  <label>{l('সময়সূচি','समय-सारणी','Schedule')}<select aria-label="Expense schedule" value={value.mode} onChange={e=>onChange({...value,mode:e.target.value as ExpenseSchedule['mode'],changes:[]})}>{value.kind==='BILL'&&<option value="ONCE">{l('একবার','एक बार','One-time')}</option>}<option value="CALENDAR">{l('মাসভিত্তিক','कैलेंडर माह','Monthly')}</option><option value="ANNIVERSARY">{l('তারিখের চক্র','तारीख का चक्र','Date cycle')}</option></select></label>
  <label>{l('শুরুর তারিখ','शुरू की तारीख','Start date')}<input aria-label="Schedule start" type="date" required value={value.start} onChange={e=>onChange({...value,start:e.target.value})}/></label>
  <p className="expense-schedule-hint">{value.kind==='SALARY'?l('বেতন কাজের দিন অনুযায়ী জমবে।','वेतन काम के दिनों के अनुसार जुड़ेगा।','Salary accrues for active work days.'):l('বিল নির্দিষ্ট চক্রে পুরো যোগ হবে।','बिल पूरे चक्र के लिए जुड़ेगा।','Bills accrue in full on the scheduled cycle.')}</p>
 </div>;
}
export function WorkSwitch({value,onChange,language,disabled=false}:Readonly<{value:ExpenseSchedule;onChange:(active:boolean,date:string)=>void;language:Language;disabled?:boolean}>) {
 const l=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en);
 const active=value.changes.at(-1)?.active??true;
 const [date,setDate]=useState(()=>new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"}));
 if(value.kind!=='SALARY'||value.mode==='ONCE') return null;
 return <div className="expense-work-switch">
  <label>{active?l('শেষ কাজের দিন','अंतिम कार्य दिवस','Last paid work day'):l('ফেরার তারিখ','वापसी की तारीख','Resume date')}<input name="date" type="date" required value={date} onChange={e=>setDate(e.target.value)} min={value.changes.at(-1)?.date??value.start}/></label>
  <button type="button" disabled={disabled} onClick={()=>onChange(!active,date)} aria-label={active?'Stop salary':'Start salary'}>{active?l('✓ চালু · বন্ধ করুন','✓ चालू · रोकें','✓ Active · Stop'):l('বন্ধ · চালু করুন','बंद · शुरू करें','Stopped · Start')}</button>
 </div>;
}
