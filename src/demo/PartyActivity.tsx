import {useState} from 'react';
import type {Language} from '../i18n';
import {inLanguage} from '../localize';
import {useWorkspaceSettings} from '../accounting/use-settings';
import {today,money,type Report} from '../accounting/model';
type Request=<T>(operation:string,input:unknown)=>Promise<T>;
export async function recentPartyBill(request:Request,company:string,id:string,offset=0):Promise<Report['entries'][number]|null>{
 const report=await request<Report>('report',{company,party:id,from:'0001-01-01',to:today(),offset});
 const latest=report.entries.filter(row=>!row.reversed&&(row.kind==='sale'||row.kind==='purchase')).sort((a,b)=>b.effective_date.localeCompare(a.effective_date))[0];
 if(latest)return latest;
 return offset+50<report.count?recentPartyBill(request,company,id,offset+50):null;
}
export function PartyActivity({company,id,language}:Readonly<{company:string;id:string;language:Language}>){
 const {request}=useWorkspaceSettings(company,true),[value,setValue]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const l=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en);
 async function read(){
  setBusy(true);
  try{
   const latest=await recentPartyBill(request,company,id);
   setValue(latest?`${latest.effective_date} · ${latest.reference} · ${money(latest.amount_minor)}`:l('সক্রিয় বিক্রয়/ক্রয় বিল নেই।','सक्रिय बिक्री/खरीद बिल नहीं।','No active sales/purchase bills.'));
  }catch{setValue(l('পড়া যায়নি। আবার চেষ্টা করুন।','जानकारी नहीं मिली। फिर कोशिश करें।','Could not read. Retry.'));}
  finally{setBusy(false);}
 }
 return <div className="party-activity"><button type="button" disabled={busy} onClick={()=>void read()}>{l('সাম্প্রতিক বিল দেখুন','हाल का बिल देखें','Recent bills')}</button>{value&&<small aria-live="polite">{value}</small>}</div>;
}
