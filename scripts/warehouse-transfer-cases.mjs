import assert from 'node:assert/strict';
export async function warehouseTransferCases({query,write,owner,parallel=false,install}){
 const company=crypto.randomUUID(),party=crypto.randomUUID(),from=crypto.randomUUID(),to=crypto.randomUUID();
 await query('insert into public.khata_companies(id,owner_id,name) values($1,$2,$3)',[company,owner,'Transfer fixture']);
 await query("insert into public.khata_parties(id,company_id,name,kind) values($1,$2,'Fixture','both')",[party,company]);
 const command=(kind,id=crypto.randomUUID(),lines=[],date='2026-10-01')=>({id,company,kind,date,code:'',name:'',unit:'',party:null,reference:'',note:'Transfer fixture',lines});
 for(const [id,name] of [[from,'Source'],[to,'Destination']])await write({...command('warehouse',id),code:id,name});
 async function scenario(){const item=crypto.randomUUID();await write({...command('item',item),code:item,name:'Material',unit:'kg'});await write(command('opening',crypto.randomUUID(),[{item,warehouse:from,to:null,quantity:'20000000',rate:'0'}]));return item;}
 const transfer=(item,amount,date='2026-10-02')=>command('transfer',crypto.randomUUID(),[{item,warehouse:from,to,quantity:String(amount),rate:'0'}],date);
 const snapshot=async()=>(await query("select md5(jsonb_build_object('docs',(select jsonb_agg(to_jsonb(d) order by id) from public.khata_inventory_documents d where company_id=$1),'moves',(select jsonb_agg(to_jsonb(m) order by document_id,ordinal) from public.khata_stock_movements m where company_id=$1),'vouchers',(select jsonb_agg(to_jsonb(v) order by id) from public.khata_vouchers v where company_id=$1))::text) as hash",[company])).rows[0].hash;
 const amount=async item=>(await query('select coalesce(sum(quantity),0)::text as qty from public.khata_stock_journal where company_id=$1 and warehouse_id=$2 and item_id=$3',[company,from,item])).rows[0].qty;
 const legacy=await scenario(),legacyState=await snapshot();if(install)await install();assert.equal(await snapshot(),legacyState,'Guard migration must preserve existing documents and movements');
 for(const qty of [15000000,20000000]){const item=qty===15000000?legacy:await scenario(),p=transfer(item,qty);await write(p);assert.equal(await amount(item),String(20000000-qty));const saved=await snapshot();await write(p);assert.equal(await snapshot(),saved,'Same-ID retry must not repeat movements');}
 for(const duplicate of [false,true]){const item=await scenario(),p=transfer(item,30000000);if(duplicate)p.lines=[{...p.lines[0],quantity:'12000000'},{...p.lines[0],quantity:'12000000'}];const before=await snapshot();await assert.rejects(write(p),/INSUFFICIENT_STOCK/);assert.equal(await snapshot(),before,'Rejected transfer is atomic');}
 const historical=await scenario();await write(transfer(historical,15000000,'2026-10-03'));const before=await snapshot();await assert.rejects(write(transfer(historical,10000000,'2026-10-02')),/INSUFFICIENT_STOCK/);assert.equal(await snapshot(),before);
 const saleItem=await scenario();const sale=command('sale',crypto.randomUUID(),[{item:saleItem,warehouse:from,to:null,quantity:'25000000',rate:'100'}]);await write({...sale,party});assert.equal(await amount(saleItem),'-5000000','Negative sales remain allowed');
 if(parallel){const item=await scenario();const results=await Promise.allSettled([write(transfer(item,15000000)),write(transfer(item,15000000))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(String(results.find(r=>r.status==='rejected').reason),/INSUFFICIENT_STOCK/);assert.equal(await amount(item),'5000000');console.log('PASS: native parallel warehouse transfers cannot double-withdraw');}
 console.log('PASS: warehouse 20→15/20 allowed;20→30/duplicate lines rejected;historical guard;atomic failure;retry;negative sales preserved');
}
