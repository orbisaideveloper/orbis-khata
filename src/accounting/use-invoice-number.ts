import {useEffect,useState} from 'react';
import {financialYear} from './numbering';
import type {WorkspaceSettings} from './workspace-contract';
import type {BookServices} from '../books-services';
export function useInvoiceNumber({company,id,kind,date,settings,loaded,request,disabled}:Readonly<{company:string;id:string;kind:'sale'|'purchase'|'expense';date:string;settings:WorkspaceSettings;loaded:boolean;request:BookServices['request'];disabled:boolean}>){
 const manual=settings.mode?.[kind]==='manual';
 const [attempt,setAttempt]=useState(0),[result,setResult]=useState({key:'',number:'',failed:false});
 const key=JSON.stringify([company,id,kind,date]);
 useEffect(()=>{
  if(disabled||manual||!loaded)return;
  let alive=true;
  async function allocate(){try{
   financialYear(date);
   const value=await request<unknown>('workspace',{company,action:'number-preview',id,kind,date});
   if(typeof value!=='string'||!(/^[1-9]\d{0,7}$/u).test(value))throw new Error('NUMBER_UNAVAILABLE');
   if(alive)setResult({key,number:value,failed:false});
  }catch{if(alive)setResult({key,number:'',failed:true});}}
  void allocate();return()=>{alive=false;};
 },[company,id,kind,date,key,manual,loaded,request,disabled,attempt]);
 const allocated=result.key===key?result.number:'';
 return {manual,number:manual?undefined:allocated,failed:result.key===key&&result.failed,loading:!manual&&(!loaded||result.key!==key),retry:()=>setAttempt(n=>n+1)};
}
