import {CostPool,type Withdrawal} from '../inventory/cost-pool';
import {productionCost,purchaseAllocations,stockDocuments} from '../production/costing';
import {currentEntries} from './current-entries';
import type {Report} from './model';
import type {ExpenseReport} from './expense-model';
import type {InventoryReport} from '../inventory/model';
import {moneyRows} from './overview-model';
export type ReportData={trade:Report;expenses:ExpenseReport;inventory:InventoryReport};
export type BillRow={id:string;source:'voucher'|'expense';date:string;reference:string;name:string;kind:'sale'|'purchase'|'expense';amount:bigint};
const inPeriod=(date:string,from:string,to:string)=>date>=from&&date<=to;
type Document=InventoryReport['documents'][number];
type SaleCost={id:string;item:string;withdrawal:Withdrawal};
type ValuationContext={production:ReturnType<typeof productionCost>;pools:Map<string,CostPool>;sales:SaleCost[]};
function ordinaryLine(doc:Document,index:number,values:bigint[],pools:Map<string,CostPool>){
 const line=doc.lines[index],pool=pools.get(line.item)??new CostPool(true);pools.set(line.item,pool);
 if(doc.kind==='sale'){return pool.withdraw(BigInt(line.quantity));}
 pool.receive(BigInt(line.quantity),values[index]??0n,doc.kind!=='opening');
 return undefined;
}
function allocateDocument(doc:Document,sale:boolean,context:ValuationContext){
 const {production,pools,sales}=context;
 const values=doc.kind==='purchase'?purchaseAllocations(doc):[];
 for(const [index,line] of doc.lines.entries()){
  const key=doc.id+':'+index,shared=production.rawItems.has(line.item)||production.outputItems.has(line.item);
  const withdrawal=shared?(production.rawCosts.get(key)??production.outputCosts.get(key)):ordinaryLine(doc,index,values,pools);
  if(sale&&withdrawal){sales.push({id:doc.id,item:line.item,withdrawal});}
 }
}
/** Ordinary stock uses moving average; production retains FIFO. Shortages are
 * reconciled by later receipts inside the same as-of snapshot, never by future data. */
export function costOfSales(inventory:InventoryReport,from:string,to:string){
 const production=productionCost(inventory,to),missing=new Set(production.missing),costs=new Map<string,bigint>();
 const pools=new Map<string,CostPool>();
 const sales:SaleCost[]=[];
 for(const doc of stockDocuments(inventory,to)){
  if(!['opening','purchase','sale','production-output'].includes(doc.kind)){continue;}
  const sale=doc.kind==='sale'&&inPeriod(doc.date,from,to);
  if(sale){costs.set(doc.id,0n);}
  allocateDocument(doc,sale,{production,pools,sales});
 }
 for(const row of sales){
  costs.set(row.id,(costs.get(row.id)??0n)+row.withdrawal.cost);
  if(!row.withdrawal.known){missing.add(row.item);}
 }
 const balances=new Map([...pools,...production.rawPools,...production.outputPools]);
 const closingStock=[...balances].map(([id,pool])=>{
  const item=inventory.items.find(i=>i.id===id),balance=pool.balance();
  return {id,name:item?.name??id,unit:item?.unit??'',quantity:String(balance.quantity),value:balance.value,complete:balance.known};
 }).filter(row=>row.quantity!=='0'||row.value!==0n);
 const stockValue=closingStock.reduce((sum,row)=>sum+row.value,0n);
 const workInProgress=production.outputQuantity===0n?production.inputCost:0n;
 const output=inventory.items.find(item=>item.id===production.outputItem);
 const productionSummary={inputCost:production.inputCost,outputQuantity:String(production.outputQuantity),unitCost:production.average,product:output?.name??'',unit:output?.unit??'',complete:production.missing.length===0&&production.outputQuantity>0n,hasHistory:production.inputs.length>0||production.outputs.length>0,asOf:to};
 return {costs,missing:[...missing].map(id=>inventory.items.find(item=>item.id===id)?.name??id),production:productionSummary,closingStock,stockValue,workInProgress,stockComplete:closingStock.every(row=>row.complete)&&production.missing.length===0};
}
export function businessReport(data:ReportData,from:string,to:string){
 const trade=currentEntries(data.trade.entries),expenses=currentEntries(data.expenses.entries);
 const bills:BillRow[]=[...trade.filter(v=>(v.kind==='sale'||v.kind==='purchase')&&inPeriod(v.effective_date,from,to)).map(v=>({id:v.id,source:'voucher' as const,date:v.effective_date,reference:v.reference,name:v.party_name,kind:v.kind as 'sale'|'purchase',amount:BigInt(v.amount_minor)})),...expenses.filter(e=>e.kind==='charge'&&inPeriod(e.effective_date,from,to)).map(e=>({id:e.id,source:'expense' as const,date:e.effective_date,reference:e.reference,name:e.payee||e.category,kind:'expense' as const,amount:BigInt(e.amount)}))].sort((a,b)=>b.date.localeCompare(a.date)||a.reference.localeCompare(b.reference,undefined,{numeric:true})||a.id.localeCompare(b.id));
 const sum=(kind:BillRow['kind'])=>bills.filter(b=>b.kind===kind).reduce((n,b)=>n+b.amount,0n);
 const valuation=costOfSales(data.inventory,from,to);const uncosted=bills.filter(b=>b.kind==='sale'&&!valuation.costs.has(b.id));
 const cost=[...valuation.costs.values()].reduce((n,v)=>n+v,0n),sales=sum('sale'),purchases=sum('purchase');
 const expense=-[...moneyRows({...data.trade,entries:[]},data.expenses,'cash'),...moneyRows({...data.trade,entries:[]},data.expenses,'bank')].filter(row=>inPeriod(row.date,from,to)).reduce((total,row)=>total+BigInt(row.amount),0n);
 const movements=[...moneyRows(data.trade,data.expenses,'cash'),...moneyRows(data.trade,data.expenses,'bank')].filter(m=>inPeriod(m.date,from,to)).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 const received=movements.filter(m=>BigInt(m.amount)>0n).reduce((n,m)=>n+BigInt(m.amount),0n),paid=-movements.filter(m=>BigInt(m.amount)<0n).reduce((n,m)=>n+BigInt(m.amount),0n);
 return {closingStock:valuation.closingStock,stockValue:valuation.stockValue,workInProgress:valuation.workInProgress,stockComplete:valuation.stockComplete,bills,movements,sales,purchases,expense,cost,received,paid,cashChange:received-paid,tradeSurplus:sales-purchases-expense,profit:sales-cost-expense,production:valuation.production,missing:valuation.missing,complete:valuation.missing.length===0&&uncosted.length===0,uncosted:uncosted.length};
}
