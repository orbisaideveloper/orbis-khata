import {beforeEach,expect,it} from 'vitest';
import {demoRequest,resetDemo,saveDemoItem,saveDemoParty} from '../demo/store';
import {emptyPartyDetails} from '../demo/master-model';
import {defaultSettings} from '../accounting/workspace-contract';
import {businessReport} from '../accounting/business-report';
import type {Report} from '../accounting/model';
import type {ExpenseReport} from '../accounting/expense-model';
import type {InventoryReport} from '../inventory/model';
const company='11111111-1111-4111-8111-111111111111',warehouse='22222222-2222-4222-8222-222222222222',feed='33333333-3333-4333-8333-333333333333',milk='44444444-4444-4444-8444-444444444444',party='55555555-5555-4555-8555-555555555555',date='2026-10-01';
const entry=(kind:'input'|'output',item=feed,q='1000000')=>({company,action:'production',id:crypto.randomUUID(),date,kind,item,warehouse,quantity:q,note:'Production'});
const invoice=(kind:'sale'|'purchase',production=false)=>({company,action:'invoice-save',...(production?{production:true}:{}),command:{company,action:'bill',bill:{id:crypto.randomUUID(),company,kind,date,code:'',name:'',unit:'',party,reference:'',note:'',lines:[{item:kind==='sale'?milk:feed,warehouse,to:null,quantity:kind==='sale'?'100000000':'500000000',rate:kind==='sale'?'6000':'5000'}]},paid:'0',account:'cash',roundoff:'0'}});
const inventory=()=>demoRequest<InventoryReport>('inventory-report',{company,from:'0001-01-01',to:'2026-10-31',offset:0});
beforeEach(async()=>{resetDemo();saveDemoParty({id:party,company,name:'Trader',kind:'both',receivable:'0',payable:'0',...emptyPartyDetails});for(const [id,name,unit] of [[feed,'Feed','bag'],[milk,'Milk','litre']]){saveDemoItem({id,company,name,unit,code:'',default_rate:null});}await demoRequest('workspace',{company,action:'settings-save',settings:{...defaultSettings(),production:true}});});
it('preserves ledgers and calculates date-selected profit from a continuous pool without expensing purchases twice',async()=>{
 await demoRequest('workspace',invoice('purchase',true));const out=entry('output',milk,'500000000');await demoRequest('workspace',out);await demoRequest('workspace',out);await demoRequest('workspace',invoice('sale'));
 async function report(){return businessReport({trade:await demoRequest<Report>('report',{company,from:'0001-01-01',to:'2026-10-31',offset:0,party:null}),expenses:await demoRequest<ExpenseReport>('expense-report',{company,from:'0001-01-01',to:'2026-10-31',offset:0}),inventory:await inventory()},'2026-10-01','2026-10-31');}
 expect(await report()).toMatchObject({profit:100000n,cost:500000n,complete:true,purchases:2500000n});
 await demoRequest('workspace',{...entry('output',milk,'200000000'),date:'2026-10-02'});expect(await report()).toMatchObject({profit:242857n,cost:357143n,complete:true});
 await demoRequest('workspace',{company,action:'settings-save',settings:defaultSettings()});expect(await report()).toMatchObject({profit:242857n,complete:true});expect((await inventory()).documents).toHaveLength(5);
});
it('rejects unsafe entries and conflicting retries, and allows retry of the exact original entry',async()=>{
 await demoRequest('workspace',invoice('purchase'));
 const input=entry('input');await demoRequest('workspace',input);await demoRequest('workspace',input);
 await expect(demoRequest('workspace',{...input,quantity:'2000000'})).rejects.toThrow('IDEMPOTENCY_CONFLICT');
 for(const [change,error] of [[{warehouse:crypto.randomUUID()},'STOCK_MASTER_NOT_ACCESSIBLE'],[{quantity:'999999999999'},'INSUFFICIENT_PRODUCTION_STOCK'],[{date:'2099-01-01'},'INVALID_PRODUCTION'],[{quantity:'0'},'INVALID_PRODUCTION']] as const)await expect(demoRequest('workspace',{...entry('input'),...change})).rejects.toThrow(error);
 await demoRequest('workspace',entry('output',milk));await expect(demoRequest('workspace',entry('output',feed))).rejects.toThrow('ONE_PRODUCTION_OUTPUT_ITEM_REQUIRED');await expect(demoRequest('workspace',entry('input',milk))).rejects.toThrow('PRODUCTION_OUTPUT_CANNOT_BE_INPUT');
 await demoRequest('workspace',{company,action:'settings-save',settings:defaultSettings()});await expect(demoRequest('workspace',entry('output',milk))).rejects.toThrow('PRODUCTION_DISABLED');
});
it('rolls back a disabled routed purchase and reverses a routed input with its supplier bill',async()=>{
 await demoRequest('workspace',{company,action:'settings-save',settings:defaultSettings()});await expect(demoRequest('workspace',invoice('purchase',true))).rejects.toThrow('PRODUCTION_DISABLED');expect((await inventory()).documents).toHaveLength(0);
 await demoRequest('workspace',{company,action:'settings-save',settings:{...defaultSettings(),production:true}});const purchase=invoice('purchase',true);await demoRequest('workspace',purchase);await demoRequest('workspace',{company,action:'correct',id:crypto.randomUUID(),target:purchase.command.bill.id,type:'voucher',reason:'Wrong purchase',replacement:null});
 const result=await inventory();expect(result.documents.every(d=>d.reversed)).toBe(true);expect(result.stocks.every(s=>s.closing==='0')).toBe(true);
});
