import {lineTotal,type InventoryReport} from '../inventory/model';
type Doc=InventoryReport['documents'][number];
type Lot={quantity:bigint;value:bigint;known:boolean};
const rounded=(n:bigint,d:bigint)=>(n+d/2n)/d;
const stockOrder={opening:0,purchase:1,'production-input':2,'production-output':3,sale:4,item:5,warehouse:5,transfer:5};
export function stockDocuments(inventory:InventoryReport,to:string){return inventory.documents.filter(d=>!d.reversed&&d.date<=to).sort((a,b)=>a.date.localeCompare(b.date)||stockOrder[a.kind]-stockOrder[b.kind]||a.id.localeCompare(b.id));}
export function purchaseAllocations(doc:Doc){
 const gross=doc.lines.reduce((n,l)=>n+lineTotal(l),0n);let allocated=0n;
 return doc.lines.map((l,index)=>{const value=index===doc.lines.length-1?BigInt(doc.total)-allocated:rounded(BigInt(doc.total)*lineTotal(l),gross);allocated+=value;return value;});
}
function consume(lots:Lot[],quantity:bigint){
 let cost=0n,known=true;
 while(quantity>0n&&lots.length){const lot=lots[0],used=quantity<lot.quantity?quantity:lot.quantity;
  const value=used===lot.quantity?lot.value:rounded(lot.value*used,lot.quantity);
  cost+=value;known&&=lot.known;quantity-=used;lot.quantity-=used;lot.value-=value;if(lot.quantity===0n)lots.shift();
 }
 return {cost,known:known&&quantity===0n,shortfall:quantity};
}
type RawCosts={pools:Map<string,Lot[]>;deficits:Map<string,bigint>;costs:Map<string,{cost:bigint;known:boolean}>;inputCost:bigint;missing:Set<string>};
function receive(lots:Lot[],quantity:bigint,value:bigint,known:boolean,debt:bigint){
 const settled=quantity<debt?quantity:debt;
 if(settled){value-=rounded(value*settled,quantity);quantity-=settled;}
 if(quantity)lots.push({quantity,value,known});
 return debt-settled;
}
function rawLine(doc:Doc,index:number,raw:RawCosts,rawItems:Set<string>,values:bigint[]){
 const line=doc.lines[index];if(!rawItems.has(line.item)){return;}
 const lots=raw.pools.get(line.item)??[];raw.pools.set(line.item,lots);
 if(doc.kind==='purchase'||doc.kind==='opening'||doc.kind==='production-output'){
  const debt=receive(lots,BigInt(line.quantity),values[index]??0n,doc.kind!=='opening',raw.deficits.get(line.item)??0n);raw.deficits.set(line.item,debt);return;
 }
 const result=consume(lots,BigInt(line.quantity));raw.costs.set(doc.id+':'+index,result);
 if(result.shortfall)raw.deficits.set(line.item,(raw.deficits.get(line.item)??0n)+result.shortfall);
 if(doc.kind==='production-input'){raw.inputCost+=result.cost;if(!result.known)raw.missing.add(line.item);}
}
function rawStock(docs:Doc[],rawItems:Set<string>,outputValues=new Map<string,bigint>()){
 const raw:RawCosts={pools:new Map(),deficits:new Map(),costs:new Map(),inputCost:0n,missing:new Set()};
 for(const doc of docs){
  if(!['opening','purchase','sale','production-input','production-output'].includes(doc.kind)){continue;}
  let values:bigint[]=[];
  if(doc.kind==='purchase')values=purchaseAllocations(doc);
  if(doc.kind==='production-output')values=[outputValues.get(doc.id)??0n];
  for(let index=0;index<doc.lines.length;index++)rawLine(doc,index,raw,rawItems,values);
 }
 return raw;
}
function outputAllocations(outputs:Doc[],cost:bigint,quantity:bigint){
 const values=new Map<string,bigint>();let allocated=0n;
 for(const [index,doc] of outputs.entries()){
  const q=doc.lines.reduce((n,l)=>n+BigInt(l.quantity),0n),value=index===outputs.length-1?cost-allocated:rounded(cost*q,quantity);
  values.set(doc.id,value);allocated+=value;
 }
 return values;
}
/** Continuous company pool. Raw materials use FIFO; output valuation is as of `to`. */
export function productionCost(inventory:InventoryReport,to:string){
 const docs=stockDocuments(inventory,to),inputs=docs.filter(d=>d.kind==='production-input'),outputs=docs.filter(d=>d.kind==='production-output');
 const rawItems=new Set(inputs.flatMap(d=>d.lines.map(l=>l.item))),raw=rawStock(docs,rawItems);
 const outputQuantity=outputs.reduce((n,d)=>n+d.lines.reduce((sum,l)=>sum+BigInt(l.quantity),0n),0n);
 const outputItems=new Set(outputs.flatMap(d=>d.lines.map(l=>l.item)));
 if(outputItems.size>1||outputs.length>0&&inputs.length===0){for(const item of outputItems)raw.missing.add(item);}
 const outputValues=outputAllocations(outputs,raw.inputCost,outputQuantity),finished=rawStock(docs,outputItems,outputValues);
 return {outputItems,outputCosts:finished.costs,inputCost:raw.inputCost,outputQuantity,outputItem:[...outputItems][0]??null,rawItems,rawCosts:raw.costs,outputValues,missing:[...raw.missing],inputs,outputs,average:outputQuantity?rounded(raw.inputCost*1000000n,outputQuantity):null};
}
