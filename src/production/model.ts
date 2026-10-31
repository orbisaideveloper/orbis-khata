import type {InventoryCommand,StockLine} from '../inventory/model.ts';
export type ProductionCommand={company:string;action:'production';id:string;date:string;kind:'input'|'output';item:string;warehouse:string;quantity:string;note:string};
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(v);
export function validProduction(p:Record<string,unknown>){
 if(Object.keys(p).length!==9||!['company','id','item','warehouse'].every(k=>uuid(p[k]))||p.action!=='production'||!['input','output'].includes(String(p.kind))||typeof p.quantity!=='string'||!/^[1-9]\d{0,11}$/u.test(p.quantity)||typeof p.note!=='string'||!p.note.trim()||p.note.length>500||(/[<>]/u.test(p.note)||Array.from(p.note).some(c=>(c.codePointAt(0)??0)<32||c.codePointAt(0)===127))||typeof p.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(p.date))return false;
 const date=new Date(p.date+'T00:00:00Z');return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===p.date;
}
export function productionDocument(p:ProductionCommand):InventoryCommand{
 return {id:p.id,company:p.company,kind:p.kind==='input'?'production-input':'production-output',date:p.date,code:'',name:'',unit:'',party:null,reference:'',note:p.note,lines:[{item:p.item,warehouse:p.warehouse,to:null,quantity:p.quantity,rate:'0'}]};
}

/** History summarizes each immutable document by item/godown with a stable key. */
export function historyLines(lines:StockLine[]){
 const groups=new Map<string,{item:string;warehouse:string;quantity:bigint}>();
 for(const line of lines){const key=line.item+':'+line.warehouse,group=groups.get(key)??{item:line.item,warehouse:line.warehouse,quantity:0n};group.quantity+=BigInt(line.quantity);groups.set(key,group);}
 return [...groups.values()];
}
