import type {Language} from '../i18n';
import {inLanguage} from '../localize';
import type {useInvoiceNumber} from './use-invoice-number';
export function InvoiceNumberField({numbering,reference,onReference,label,language,settingsFailed,onRetry}:Readonly<{numbering:ReturnType<typeof useInvoiceNumber>;reference:string;onReference:(value:string)=>void;label:string;language:Language;settingsFailed:boolean;onRetry:()=>void}>){
 return <div><label>{label}<input required readOnly={!numbering.manual} value={numbering.manual?reference:numbering.number} placeholder={numbering.loading?inLanguage(language,'নম্বর আসছে…','नंबर आ रहा है…','Getting number…'):''} maxLength={80} onChange={e=>onReference(e.target.value)}/></label>{(numbering.failed||settingsFailed)&&<output role="alert">{inLanguage(language,'বিল নম্বর বা সেটিংস পাওয়া যায়নি। আবার চেষ্টা করুন।','बिल नंबर या सेटिंग्स नहीं मिलीं। फिर कोशिश करें।','Bill number or settings unavailable. Retry.')}<button type="button" onClick={onRetry}>{inLanguage(language,'আবার চেষ্টা','पुनः प्रयास','Retry number')}</button></output>}</div>;
}
