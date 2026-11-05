import {warehouseValues} from './warehouse-value';
import {useEffect,useState} from 'react';
import type {Language} from '../i18n';
import {inLanguage} from '../localize';
import {allPages} from '../accounting/report-pages';
import {useWorkspaceSettings} from '../accounting/use-settings';
import {costOfSales} from '../accounting/business-report';
import {StockTable} from './StockTable';
import {StockTransfer} from './StockTransfer';
import type {InventoryReport} from './model';
export function StockWorkspace({company,userId,language,to,version,onChanged,onSelect,blocked=false,onLock}:Readonly<{company:string;userId:string;language:Language;to:string;version:number;onChanged:()=>void;onSelect:(id:string,name:string)=>void;blocked?:boolean;onLock?:(locked:boolean)=>void}>){
 const {request,settings,loaded}=useWorkspaceSettings(company,false,version),[result,setResult]=useState<{key:string;data:InventoryReport}|null>(null),[failure,setFailure]=useState(''),[retry,setRetry]=useState(0),[search,setSearch]=useState(''),[warehouse,setWarehouse]=useState('');
 const key=JSON.stringify([company,to,version,retry]);
 useEffect(() => {
  let active = true;
  const read = (offset:number) => request<InventoryReport>('inventory-report', {company,from:'0001-01-01',to,offset});
  void read(0).then(first => allPages(first,'documents',read)).then(data => {
   if (data.documents.length !== data.count) {
    if (active) { setFailure(key); }
    return;
   }
   if (active) { setResult({key,data}); }
  }, () => { if (active) { setFailure(key); } });
  return () => { active = false; };
 }, [company,to,key,request]);
 const l=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en);
 if(failure===key)return <output role="alert">{l('সম্পূর্ণ স্টক পড়া যায়নি।','पूरा स्टॉक उपलब्ध नहीं।','Complete stock unavailable.')} <button onClick={()=>setRetry(n=>n+1)}>{l('আবার চেষ্টা','फिर कोशिश','Retry')}</button></output>;
 if(result?.key!==key)return <output>{l('স্টক আসছে…','स्टॉक लोड हो रहा है…','Loading stock…')}</output>;
 const data=result.data,valuation=costOfSales(data,'0001-01-01',to),shown=warehouse?{...data,stocks:data.stocks.filter(s=>s.warehouse===warehouse)}:data,values=warehouse?warehouseValues(data,valuation.closingStock,warehouse):valuation.closingStock;
 return <section className="stock-workspace"><h3>{l('গোডাউন স্টক','गोदाम स्टॉक','Godown stock')} · {to}</h3><label>{l('আইটেম খুঁজুন','आइटम खोजें','Find item')}<input value={search} onChange={e=>setSearch(e.target.value)}/></label><label>{l('গোডাউন','गोदाम','Godown')}<select value={warehouse} onChange={e=>setWarehouse(e.target.value)}><option value="">{l('সব গোডাউন','सभी गोदाम','All godowns')}</option>{data.warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><StockTable data={shown} language={language} search={search} onSelect={onSelect} valuation={values}/><StockTransfer {...{company,userId,language,data,to,onChanged,blocked,onLock}} productionEnabled={loaded&&Boolean(settings.production)}/></section>;
}
