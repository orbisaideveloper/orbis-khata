import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {Language} from '../i18n';
import {inLanguage} from '../localize';
import {useWorkspaceSettings} from '../accounting/use-settings';
import {today} from '../accounting/model';
import {billError} from '../accounting/business-error';
import {rejected} from '../accounting/api';
import {readWorkspacePending,saveWorkspacePending,clearWorkspacePending} from '../accounting/workspace-pending';
import {inventoryPendingKey,restoreInventory} from './pending';
import {inventoryCommand,quantity,displayQuantity,type InventoryReport,type InventoryCommand} from './model';
import {validProduction,type ProductionCommand} from '../production/model';
type Pending={operation:'workspace';command:ProductionCommand}|{operation:'inventory-post';command:InventoryCommand};
function restore(user:string,company:string):Pending|null{
 const input=readWorkspacePending(user,company);if(input&&validProduction(input))return {operation:'workspace',command:input as ProductionCommand};
 const inventory=restoreInventory(user);return inventory?.company===company?{operation:'inventory-post',command:inventory}:null;
}
export function StockTransfer({company,userId,language,data,to,onChanged,productionEnabled,blocked,onLock}:Readonly<{company:string;userId:string;language:Language;data:InventoryReport;to:string;onChanged:()=>void;productionEnabled:boolean;blocked:boolean;onLock?:(locked:boolean)=>void}>){
 const scope=userId+':stock-transfer',l=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en),{request}=useWorkspaceSettings(company,true);
 const [pending,setPending]=useState<Pending|null>(()=>restore(scope,company)),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),guard=useRef(false);
 const [targetChoice,setTarget]=useState<string|null>(null),[item,setItem]=useState(''),[source,setSource]=useState(data.warehouses[0]?.id??''),[destination,setDestination]=useState(''),[amount,setAmount]=useState(''),[date,setDate]=useState(to>today()?today():to);
 useEffect(()=>{onLock?.(busy||Boolean(pending));return()=>onLock?.(false);},[busy,pending,onLock]);
 const target=productionEnabled?(targetChoice??'production'):'warehouse';
 function clear(){sessionStorage.removeItem(inventoryPendingKey(scope));clearWorkspacePending(scope,company);setPending(null);}
 async function save(next:Pending){
  if(guard.current||blocked)return;guard.current=true;setBusy(true);setMessage('');
  try{if(next.operation==='workspace')saveWorkspacePending(scope,company,next.command);else sessionStorage.setItem(inventoryPendingKey(scope),JSON.stringify(next.command));setPending(next);await request(next.operation,next.command);clear();setAmount('');setMessage(l('সেভ হয়েছে।','सहेजा गया।','Saved.'));onChanged();}
  catch(error){if(rejected(error))clear();setMessage(billError(error,language,l('সেভ নিশ্চিত নয়। একই এন্ট্রি আবার পাঠান।','सहेजना अनिश्चित है। वही एंट्री फिर भेजें।','Save not confirmed. Retry the same entry.')));}
  finally{guard.current=false;setBusy(false);}
 }
 function transfer(event:FormEvent){event.preventDefault();try{
  const id=crypto.randomUUID(),scaled=quantity(amount),note=l('স্টক ট্রান্সফার','स्टॉक ट्रांसफर','Stock transfer');
  if(target==='production'){
   const command:ProductionCommand={company,action:'production',id,kind:'input',date,item,warehouse:source,quantity:scaled,note};
   if(!productionEnabled||!validProduction(command))throw new Error('INVALID_PRODUCTION');void save({operation:'workspace',command});
  }else{
   const command=inventoryCommand({id,company,kind:'transfer',date,code:'',name:'',unit:'',party:null,reference:'',note,lines:[{item,warehouse:source,to:destination,quantity:scaled,rate:'0'}]});
   if(!command)throw new Error('INVALID_TRANSFER');void save({operation:'inventory-post',command});
  }
 }catch(error){setMessage(billError(error,language,l('আইটেম, গোডাউন ও পরিমাণ পরীক্ষা করুন।','आइटम, गोदाम और मात्रा जाँचें।','Check item, godown and quantity.')));}}
 function createWarehouse(event:FormEvent<HTMLFormElement>){event.preventDefault();const name=String(new FormData(event.currentTarget).get('godown-name')??'').trim(),id=crypto.randomUUID();const command=inventoryCommand({id,company,kind:'warehouse',date:today(),code:'G-'+id.slice(0,8),name,unit:'',party:null,reference:'',note:'',lines:[]});if(command)void save({operation:'inventory-post',command});}
 const available=data.stocks.find(s=>s.item===item&&s.warehouse===source)?.closing??'0',unit=data.items.find(i=>i.id===item)?.unit??'';
 return <section className="stock-transfer"><h3>{l('স্টক ট্রান্সফার','स्टॉक ट्रांसफर','Stock transfer')}</h3>
 {pending?<div><output>{l('আগের সেভ নিশ্চিত করুন।','पिछली सेव की पुष्टि करें।','Confirm the previous save.')}</output><button disabled={busy||blocked} onClick={()=>{void save(pending);}}>{l('একই এন্ট্রি আবার পাঠান','वही एंट्री फिर भेजें','Retry same entry')}</button></div>:<>
 <form className="books-form" onSubmit={transfer}><fieldset disabled={busy||blocked}><label>{l('কোথায় পাঠাবেন','कहाँ भेजें','Send to')}<select value={target} onChange={e=>setTarget(e.target.value)}>{productionEnabled&&<option value="production">{l('প্রোডাকশন','उत्पादन','Production')}</option>}<option value="warehouse">{l('অন্য গোডাউন','दूसरा गोदाम','Another godown')}</option></select></label>
 <label>{l('যে গোডাউন থেকে','स्रोत गोदाम','Source godown')}<select required value={source} onChange={e=>{setSource(e.target.value);setDestination('');}}>{data.warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
 {target==='warehouse'&&<label>{l('যে গোডাউনে যাবে','गंतव्य गोदाम','Destination godown')}<select required value={destination} onChange={e=>setDestination(e.target.value)}><option value="">{l('বেছে নিন','चुनें','Choose')}</option>{data.warehouses.filter(w=>w.id!==source).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}
 <label>{l('আইটেম','आइटम','Item')}<select required value={item} onChange={e=>setItem(e.target.value)}><option value="">{l('বেছে নিন','चुनें','Choose')}</option>{data.items.map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select></label>
 {item&&<small>{l('বর্তমান স্টক','वर्तमान स्टॉक','Current stock')}: {displayQuantity(available)} {unit}</small>}
 <label>{l('পরিমাণ','मात्रा','Quantity')}<input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>{l('তারিখ','तारीख','Date')}<input required type="date" max={today()} value={date} onChange={e=>setDate(e.target.value)}/></label><button type="submit">{l('সেভ করুন','सहेजें','Save')}</button></fieldset></form>
 <details><summary>{l('+ গোডাউন তৈরি করুন','+ गोदाम बनाएँ','+ Create godown')}</summary><form className="books-form" onSubmit={createWarehouse}><label>{l('গোডাউনের নাম','गोदाम का नाम','Godown name')}<input name="godown-name" required maxLength={120} disabled={busy||blocked}/></label><button disabled={busy||blocked} type="submit">{l('গোডাউন যোগ করুন','गोदाम जोड़ें','Add godown')}</button></form></details></>}
 {message&&<output aria-live="polite">{message}</output>}</section>;
}
