import {useState} from 'react';
import type { Language } from '../i18n';
import { inLanguage } from '../localize';
import { rateMinor } from '../billing/amounts';
import { money } from './model';
export type RecordLine = {key:string;item:string;warehouse:string;quantity:string;rate:string};
import {lineAmount} from './record-line-amount';
function shownRate(rate:string){try{return money(rateMinor(rate)).replace('₹','').replaceAll(',','');}catch{return rate;}}
export function RecordLines({lines,names,language,onChange}:Readonly<{lines:RecordLine[];names:Record<string,string>;language:Language;onChange:(index:number,field:'quantity'|'rate',value:string)=>void}>){
 const [focused,setFocused]=useState<number|null>(null);
 const qty=inLanguage(language,'পরিমাণ','मात्रा','Quantity'),rate=inLanguage(language,'দর','दर','Rate');
 return <div className="record-items record-edit-lines"><table><thead><tr><th>#</th><th>{inLanguage(language,'আইটেম','आइटम','Item')}</th><th>{qty}</th><th>{rate}</th><th>{inLanguage(language,'টাকা','रकम','Amount')}</th></tr></thead><tbody>{lines.map((line,index)=><tr key={line.key}><td>{index+1}</td><td>{names[line.item]??line.item}</td><td><input aria-label={qty} inputMode="decimal" value={line.quantity} onChange={e=>onChange(index,'quantity',e.target.value)}/></td><td><input aria-label={rate} inputMode="decimal" value={focused===index?line.rate:shownRate(line.rate)} onFocus={()=>setFocused(index)} onBlur={()=>setFocused(null)} onChange={e=>onChange(index,'rate',e.target.value)}/></td><td>{money(lineAmount(line))}</td></tr>)}</tbody></table></div>;
}
