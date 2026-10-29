import {useEffect,useState} from 'react';
import {useWorkspaceSettings} from './use-settings';
import {allPages} from './report-pages';
import type {ReportData} from './business-report';
import type {Report} from './model';
import type {ExpenseReport} from './expense-model';
import type {InventoryReport} from '../inventory/model';
export function useBusinessReport(company:string,to:string,version:number){
 const {request}=useWorkspaceSettings(company,true),[retry,setRetry]=useState(0),[result,setResult]=useState<{key:string;data:ReportData}|null>(null),[failure,setFailure]=useState('');
 const key=JSON.stringify([company,to,version,retry]);
 useEffect(()=>{let alive=true;
  const input={company,from:'0001-01-01',to,offset:0};
  async function load(){
   try{
    const [trade,expenses,inventory]=await Promise.all([request<Report>('report',{...input,party:null}),request<ExpenseReport>('expense-report',input),request<InventoryReport>('inventory-report',input)]);
    const [r,e,i]=await Promise.all([allPages(trade,'entries',offset=>request<Report>('report',{...input,party:null,offset})),allPages(expenses,'entries',offset=>request<ExpenseReport>('expense-report',{...input,offset})),allPages(inventory,'documents',offset=>request<InventoryReport>('inventory-report',{...input,offset}))]);
    if(alive)setResult({key,data:{trade:r,expenses:e,inventory:i}});
   }catch{if(alive)setFailure(key);}
  }
  void load();return()=>{alive=false;};
 },[company,to,key,request]);
 return {data:result?.key===key?result.data:null,failed:failure===key,retry:()=>setRetry(n=>n+1)};
}
