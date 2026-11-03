import {expect,it} from 'vitest';
import {businessReport,costOfSales,type ReportData} from './business-report';
import {productionCost} from '../production/costing';
import type {InventoryReport,InventoryKind} from '../inventory/model';
function doc(id:string,kind:InventoryKind,item:string,quantity:string,rate:string,date:string):InventoryReport['documents'][number]{
 return {id,company:'c',kind,date,code:'',name:'',unit:'',party:null,reference:id,note:'',lines:[{item,warehouse:'w',to:null,quantity,rate}],total:String(BigInt(quantity)*BigInt(rate)/1000000n),reversed:false,party_name:null};
}
function data(documents:InventoryReport['documents']):ReportData{
 return {trade:{entries:[{id:'sale',kind:'sale',effective_date:'2026-11-01',amount_minor:'10000',party_id:'p',party_name:'Buyer',reference:'S1',note:'',debit_account:'receivable',credit_account:'sales',reversed:false}],parties:[],balances:{},ledger_balances:{},count:1,as_of:'2026-11-03'},expenses:{entries:[],bills:[],categories:[],balances:{},count:0},inventory:{documents,stocks:[],warehouses:[],count:documents.length,items:[{id:'feed',name:'Feed',unit:'kg',code:'F'},{id:'milk',name:'Milk',unit:'litre',code:'M'}]}};
}
it('recalculates an earlier sale after batch output, without leaking future entries or changing history',()=>{
 const d=data([doc('sale','sale','milk','1000000','10000','2026-11-01'),doc('buy','purchase','feed','2000000','6000','2026-11-02'),doc('input','production-input','feed','1000000','0','2026-11-02'),doc('output','production-output','milk','1000000','0','2026-11-03')]);
 const before=structuredClone(d);
 const early=businessReport(d,'2026-11-01','2026-11-01');expect(early).toMatchObject({complete:false,profit:10000n,missing:['Milk']});expect(early.closingStock).toContainEqual(expect.objectContaining({name:'Milk',quantity:'-1000000'}));
 const finished=businessReport(d,'2026-11-01','2026-11-03');expect(finished).toMatchObject({complete:true,cost:6000n,profit:4000n,stockValue:6000n,workInProgress:0n});
 expect(finished.closingStock).toContainEqual(expect.objectContaining({name:'Feed',quantity:'1000000',value:6000n}));expect(d).toEqual(before);
});
it('settles negative ordinary goods from later purchases, including a narrow sales period',()=>{
 const d=data([doc('sale','sale','milk','1000000','10000','2026-11-01'),doc('later','purchase','milk','2000000','3000','2026-11-03')]);
 expect(businessReport(d,'2026-11-01','2026-11-02')).toMatchObject({complete:false,missing:['Milk']});
 expect(businessReport(d,'2026-11-01','2026-11-03')).toMatchObject({complete:true,cost:3000n,profit:7000n,stockValue:3000n});
 expect(costOfSales(d.inventory,'2026-11-02','2026-11-03').costs.size).toBe(0);
});
it('reconciles an input entered before its purchase and retains work-in-progress as an asset',()=>{
 const d=data([doc('input','production-input','feed','1000000','0','2026-11-01'),doc('late','purchase','feed','2000000','3000','2026-11-02')]);
 expect(productionCost(d.inventory,'2026-11-01').missing).toEqual(['feed']);
 expect(productionCost(d.inventory,'2026-11-02')).toMatchObject({inputCost:3000n,missing:[]});
 expect(businessReport(d,'2026-11-01','2026-11-02')).toMatchObject({stockValue:3000n,workInProgress:3000n});
});
it('keeps unresolved partial cost provisional and excludes reversed or out-of-cutoff receipts',()=>{
 const d=data([doc('sale','sale','milk','2000000','5000','2026-11-01'),doc('part','purchase','milk','1000000','3000','2026-11-02'),{...doc('void','purchase','milk','2000000','100','2026-11-02'),reversed:true},doc('future','purchase','milk','1000000','4000','2026-11-04')]);
 const r=businessReport(d,'2026-11-01','2026-11-03');expect(r).toMatchObject({complete:false,cost:3000n,profit:7000n,missing:['Milk']});expect(r.closingStock).toContainEqual(expect.objectContaining({quantity:'-1000000',complete:false}));
 expect(businessReport(d,'2026-11-01','2026-11-04')).toMatchObject({complete:true,cost:7000n,profit:3000n});
});
