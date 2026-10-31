import {productionCost,stockDocuments} from '../production/costing';
import {currentEntries} from './current-entries';
import type {Report} from './model';
import type {ExpenseReport} from './expense-model';
import {lineTotal,type InventoryReport} from '../inventory/model';
import {moneyRows} from './overview-model';
export type ReportData={trade:Report;expenses:ExpenseReport;inventory:InventoryReport};
export type BillRow={id:string;source:'voucher'|'expense';date:string;reference:string;name:string;kind:'sale'|'purchase'|'expense';amount:bigint};
type Stock={quantity:bigint;value:bigint;known:boolean};
const inPeriod=(date:string,from:string,to:string)=>date>=from&&date<=to;
const rounded=(value:bigint,divisor:bigint)=>(value+divisor/2n)/divisor;
type Document=InventoryReport['documents'][number];
function purchaseValue(doc:Document,index:number,gross:bigint,allocated:bigint){
 if(doc.kind!=='purchase')return 0n;
 if(index===doc.lines.length-1)return BigInt(doc.total)-allocated;
 return rounded(BigInt(doc.total)*lineTotal(doc.lines[index]),gross);
}
function moveStock(state:Stock,kind:Document['kind'],quantity:bigint,value:bigint){
 let cost=0n,known=state.known;
 if(kind==='sale'){
  known=state.known&&state.quantity>=quantity;
  if(known)cost=rounded(state.value*quantity,state.quantity);
  state.value-=cost;state.quantity-=quantity;state.known=known;
 }else{
  state.quantity+=quantity;state.value+=value;
  if(kind==='opening')state.known=false;
 }
 if(state.quantity===0n){state.value=0n;state.known=true;}
 return {cost,known};
}
type CostContext={stock:Map<string,Stock>;missing:Set<string>;production:ReturnType<typeof productionCost>};
function rawSaleCost(raw:{cost:bigint;known:boolean}|undefined,sale:boolean,item:string,missing:Set<string>){
 if(!sale||!raw){return 0n;}
 if(!raw.known){missing.add(item);}
 return raw.cost;
}
function applyCostDocument(doc:Document,sale:boolean,context:CostContext){
 const {stock,missing,production}=context;
 const gross=doc.lines.reduce((sum,line)=>sum+lineTotal(line),0n);let allocated=0n,cost=0n;
 for(const [index,line] of doc.lines.entries()){
  if(production.rawItems.has(line.item)||production.outputItems.has(line.item)){
   const raw=production.rawCosts.get(doc.id+':'+index)??production.outputCosts.get(doc.id+':'+index);
   cost+=rawSaleCost(raw,sale,line.item,missing);
   continue;
  }
  const state=stock.get(line.item)??{quantity:0n,value:0n,known:true};
  const output=doc.kind==='production-output';
  const value=output?(production.outputValues.get(doc.id)??0n):purchaseValue(doc,index,gross,allocated);allocated+=value;
  const movement=moveStock(state,output?'purchase':doc.kind,BigInt(line.quantity),value);cost+=movement.cost;
  if(sale&&!movement.known){missing.add(line.item);}stock.set(line.item,state);
 }
 return cost;
}
/** Moving average for ordinary stock; FIFO raw inputs and cumulative production output. */
export function costOfSales(inventory:InventoryReport,from:string,to:string){
 const production=productionCost(inventory,to),missing=new Set(production.missing),costs=new Map<string,bigint>();
 const context:CostContext={stock:new Map(),missing,production};
 for(const doc of stockDocuments(inventory,to)){
  if(!['opening','purchase','sale','production-output'].includes(doc.kind)){continue;}
  const sale=doc.kind==='sale'&&inPeriod(doc.date,from,to),cost=applyCostDocument(doc,sale,context);
  if(sale)costs.set(doc.id,cost);
 }
 return {costs,missing:[...missing].map(id=>inventory.items.find(item=>item.id===id)?.name??id)};
}
export function businessReport(data:ReportData,from:string,to:string){
 const trade=currentEntries(data.trade.entries),expenses=currentEntries(data.expenses.entries);
 const bills:BillRow[]=[...trade.filter(v=>(v.kind==='sale'||v.kind==='purchase')&&inPeriod(v.effective_date,from,to)).map(v=>({id:v.id,source:'voucher' as const,date:v.effective_date,reference:v.reference,name:v.party_name,kind:v.kind as 'sale'|'purchase',amount:BigInt(v.amount_minor)})),...expenses.filter(e=>e.kind==='charge'&&inPeriod(e.effective_date,from,to)).map(e=>({id:e.id,source:'expense' as const,date:e.effective_date,reference:e.reference,name:e.payee||e.category,kind:'expense' as const,amount:BigInt(e.amount)}))].sort((a,b)=>b.date.localeCompare(a.date)||a.reference.localeCompare(b.reference,undefined,{numeric:true})||a.id.localeCompare(b.id));
 const sum=(kind:BillRow['kind'])=>bills.filter(b=>b.kind===kind).reduce((n,b)=>n+b.amount,0n);
 const valuation=costOfSales(data.inventory,from,to);const uncosted=bills.filter(b=>b.kind==='sale'&&!valuation.costs.has(b.id));
 const cost=[...valuation.costs.values()].reduce((n,v)=>n+v,0n),sales=sum('sale'),purchases=sum('purchase'),expense=sum('expense');
 const movements=[...moneyRows(data.trade,data.expenses,'cash'),...moneyRows(data.trade,data.expenses,'bank')].filter(m=>inPeriod(m.date,from,to)).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 const received=movements.filter(m=>BigInt(m.amount)>0n).reduce((n,m)=>n+BigInt(m.amount),0n),paid=-movements.filter(m=>BigInt(m.amount)<0n).reduce((n,m)=>n+BigInt(m.amount),0n);
 return {bills,movements,sales,purchases,expense,cost,received,paid,cashChange:received-paid,tradeSurplus:sales-purchases-expense,profit:sales-cost-expense,missing:valuation.missing,complete:valuation.missing.length===0&&uncosted.length===0,uncosted:uncosted.length};
}
