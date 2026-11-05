import type {InventoryReport} from './model';
type Value={id:string;value:bigint;complete:boolean};
/** Allocate a company's known item value to locations, retaining the final minor-unit residual. */
export function warehouseValues(data:InventoryReport,values:Value[],warehouse:string):Value[]{
 return values.map(value=>{
  const stocks=data.stocks.filter(s=>s.item===value.id).sort((a,b)=>a.warehouse.localeCompare(b.warehouse));
  const quantity=stocks.reduce((sum,s)=>sum+BigInt(s.closing),0n);
  if(quantity<=0n||stocks.some(s=>BigInt(s.closing)<0n))return {...value,value:0n,complete:false};
  let allocated=0n,cumulative=0n,result=0n;
  stocks.forEach(stock=>{cumulative+=BigInt(stock.closing);const rounded=(value.value*cumulative+quantity/2n)/quantity,share=rounded-allocated;allocated=rounded;if(stock.warehouse===warehouse)result+=share;});
  return {...value,value:result};
 });
}
