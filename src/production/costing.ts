import {ReplayCheckpoints} from '../inventory/replay-checkpoint';
import {CostPool,type Withdrawal} from '../inventory/cost-pool';
import {lineTotal,type InventoryReport} from '../inventory/model';
type Doc=InventoryReport['documents'][number];
const rounded=(n:bigint,d:bigint)=>(n+d/2n)/d;
const stockOrder={opening:0,purchase:1,'production-input':2,'production-output':3,sale:4,item:5,warehouse:5,transfer:5};
export function stockDocuments(inventory:InventoryReport,to:string){return inventory.documents.filter(d=>!d.reversed&&d.date<=to).sort((a,b)=>a.date.localeCompare(b.date)||stockOrder[a.kind]-stockOrder[b.kind]||a.id.localeCompare(b.id));}
export function purchaseAllocations(doc:Doc){
 const gross=doc.lines.reduce((n,l)=>n+lineTotal(l),0n);let allocated=0n;
 return doc.lines.map((l,index)=>{const value=index===doc.lines.length-1?BigInt(doc.total)-allocated:rounded(BigInt(doc.total)*lineTotal(l),gross);allocated+=value;return value;});
}
type RawCosts={pools:Map<string,CostPool>;costs:Map<string,Withdrawal>;inputCost:bigint;missing:Set<string>};
function rawLine(doc:Doc,index:number,raw:RawCosts,rawItems:Set<string>,values:bigint[],outputKnown:boolean,average:boolean){
 const line=doc.lines[index];if(!rawItems.has(line.item)){return;}
 const pool=raw.pools.get(line.item)??new CostPool(average);raw.pools.set(line.item,pool);
 if(doc.kind==='purchase'||doc.kind==='opening'||doc.kind==='production-output'){
  pool.receive(BigInt(line.quantity),values[index]??0n,doc.kind!=='opening'&&(doc.kind!=='production-output'||outputKnown));return;
 }
 raw.costs.set(doc.id+':'+index,pool.withdraw(BigInt(line.quantity)));
}
function cloneRaw(raw:RawCosts):RawCosts{
 const copies=new Map<Withdrawal,Withdrawal>();
 const costs=new Map([...raw.costs].map(([key,value])=>{const copy={...value};copies.set(value,copy);return [key,copy] as const;}));
 return {pools:new Map([...raw.pools].map(([key,pool])=>[key,pool.fork(copies)])),costs,inputCost:0n,missing:new Set()};
}
const rawCheckpoints=new ReplayCheckpoints(cloneRaw);
function rawStock(docs:Doc[],rawItems:Set<string>,outputValues=new Map<string,bigint>(),outputKnown=true,average=true){
 const key=JSON.stringify(['average-v2',docs[0]?.company,[...rawItems].sort(),[...outputValues].map(([id,value])=>[id,String(value)]),outputKnown,average]);
 const raw=rawCheckpoints.run(key,docs,()=>({pools:new Map(),costs:new Map(),inputCost:0n,missing:new Set()}), (state,index)=>{
  const doc=docs[index];
  if(!['opening','purchase','sale','production-input','production-output'].includes(doc.kind)){return;}
  let values:bigint[]=[];
  if(doc.kind==='purchase')values=purchaseAllocations(doc);
  if(doc.kind==='production-output')values=[outputValues.get(doc.id)??0n];
  for(let line=0;line<doc.lines.length;line++)rawLine(doc,line,state,rawItems,values,outputKnown,average);
 });
 accumulateInputCosts(docs,raw);
 return raw;
}
function accumulateInputCosts(docs:Doc[],raw:RawCosts){
 for(const doc of docs.filter(d=>d.kind==='production-input')){
  for(const [index,line] of doc.lines.entries()){
   const used=raw.costs.get(doc.id+':'+index);if(!used){continue;}
   raw.inputCost+=used.cost;
   if(!used.known){raw.missing.add(line.item);}
  }
 }
}
function outputAllocations(outputs:Doc[],cost:bigint,quantity:bigint){
 const values=new Map<string,bigint>();let allocated=0n;
 for(const [index,doc] of outputs.entries()){
  const q=doc.lines.reduce((n,l)=>n+BigInt(l.quantity),0n),value=index===outputs.length-1?cost-allocated:rounded(cost*q,quantity);
  values.set(doc.id,value);allocated+=value;
 }
 return values;
}
/** Continuous company pool. Raw materials use moving weighted average; output valuation is as of `to`. */
export function productionCost(inventory:InventoryReport,to:string){
 const docs=stockDocuments(inventory,to),inputs=docs.filter(d=>d.kind==='production-input'),outputs=docs.filter(d=>d.kind==='production-output');
 const rawItems=new Set(inputs.flatMap(d=>d.lines.map(l=>l.item))),raw=rawStock(docs,rawItems);
 const outputQuantity=outputs.reduce((n,d)=>n+d.lines.reduce((sum,l)=>sum+BigInt(l.quantity),0n),0n);
 const outputItems=new Set(outputs.flatMap(d=>d.lines.map(l=>l.item)));
 if(outputItems.size>1||outputs.length>0&&inputs.length===0){for(const item of outputItems)raw.missing.add(item);}
 const outputValues=outputAllocations(outputs,raw.inputCost,outputQuantity),finished=rawStock(docs,outputItems,outputValues,raw.missing.size===0,true);
 return {rawPools:raw.pools,outputPools:finished.pools,outputItems,outputCosts:finished.costs,inputCost:raw.inputCost,outputQuantity,outputItem:[...outputItems][0]??null,rawItems,rawCosts:raw.costs,outputValues,missing:[...raw.missing],inputs,outputs,average:outputQuantity?rounded(raw.inputCost*1000000n,outputQuantity):null};
}
