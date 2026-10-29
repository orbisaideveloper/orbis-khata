import type {Language} from '../i18n';
import {inLanguage} from '../localize';
import {money} from './model';
import {settlementMinor} from './record-line-amount';
export function RecordSettlement({total,paid,onPaid,language}:Readonly<{total:bigint;paid:string;onPaid:(value:string)=>void;language:Language}>){
 let balance:bigint|null=null;try{balance=total-BigInt(settlementMinor(paid));}catch{/* Keep invalid input visible for correction. */}
 return <div className="record-settlement"><p>{inLanguage(language,'বিলের মোট','बिल का कुल','Bill total')} <strong>{money(total)}</strong></p><label>{inLanguage(language,'জমা / দেওয়া','जमा / भुगतान','Received / paid')}<input inputMode="decimal" value={paid} onChange={e=>onPaid(e.target.value)}/></label><p>{inLanguage(language,'বাকি','बाकी','Remaining')} <strong>{balance===null?'—':money(balance)}</strong></p></div>;
}
