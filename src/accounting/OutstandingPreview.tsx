import type {Language} from '../i18n';
import {inLanguage} from '../localize';
import {minor,money} from './model';
export function OutstandingPreview({due,amount,language,showCurrent=true}:Readonly<{due:bigint;amount:string;language:Language;showCurrent?:boolean}>){
 const l=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en);
 let after:bigint|null=null;try{after=due-BigInt(minor(amount));}catch{/* Draft amount is incomplete. */}
 const value=(n:bigint)=>`${n<0n?l('অগ্রিম','अग्रिम','Advance'):l('বাকি','बकाया','Outstanding')}: ${money(n<0n?-n:n)}`;
 return <div className="outstanding-preview" aria-live="polite">{showCurrent&&<small>{l('বর্তমান','वर्तमान','Current')} · {value(due)}</small>}{after!==null&&<small>{l('এই এন্ট্রির পরে (প্রিভিউ)','इस एंट्री के बाद (पूर्वावलोकन)','After this entry (preview)')} · {value(after)}</small>}</div>;
}
