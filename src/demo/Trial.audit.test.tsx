import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { demoRequest, resetDemo, saveDemoItem, saveDemoParty, demoPreviousBalance } from './store'
import { emptyPartyDetails, type DemoParty } from './master-model'
import type { InventoryCommand, InventoryReport } from '../inventory/model'
import type { Report } from '../accounting/model'
import type { ExpenseCommand, ExpenseReport } from '../accounting/expense-model'
const company='11111111-1111-4111-8111-111111111111',warehouse='22222222-2222-4222-8222-222222222222',date='2026-10-20'
const range={company,from:'2026-10-01',to:'2026-10-26',offset:0,party:null}
function party(name:string,kind:DemoParty['kind'],side:'none'|'due'|'advance'='none',amount='0'){
 const p:DemoParty={id:crypto.randomUUID(),company,name,kind,receivable:'0',payable:'0',...emptyPartyDetails,opening_side:side,opening_amount:amount,opening_date:side==='none'?'':'2026-09-30'};saveDemoParty(p);return p
}
function expense(p:Partial<ExpenseCommand>):ExpenseCommand{return {id:crypto.randomUUID(),company,date,kind:'charge',amount:'12000',category:'Power',payee:'Power',method:null,parent:null,reference:'E-1',note:'',...p}}
function trade(kind:'sale'|'purchase',id:string,item:string,q:string,rate:string):InventoryCommand{return {id:crypto.randomUUID(),company,kind,date,code:'',name:'',unit:'',party:id,reference:'',note:'',lines:[{item,warehouse,to:null,quantity:q,rate}]}}
beforeEach(()=>{resetDemo();vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Real network forbidden'))})
afterEach(()=>{expect(globalThis.fetch).not.toHaveBeenCalled();vi.restoreAllMocks()})
it('A–Z: opens old balances, buys, sells, receives, pays and reconciles stock, parties, expenses and trial balance',async()=>{
 const supplier=party('Supplier','supplier','due','20000'),customer=party('Customer','customer','advance','10000');party('Power','expense','due','5000')
 const item=crypto.randomUUID();saveDemoItem({id:item,company,name:'Milk',unit:'litre',code:'',default_rate:null})
 const purchase=trade('purchase',supplier.id,item,'10000000','6000');await demoRequest('inventory-post',purchase);await demoRequest('inventory-post',purchase)
 await demoRequest('inventory-post',trade('sale',customer.id,item,'4000000','9000'))
 for(const [kind,p,amount,method]of [['receipt',customer,'20000','cash'],['payment',supplier,'50000','bank']]as const)await demoRequest('post',{id:crypto.randomUUID(),company,kind,party:p.id,date,amount,method,reference:'',note:'',reverses:null})
 const bill=expense({});await demoRequest('expense-post',bill);await demoRequest('expense-post',expense({kind:'payment',amount:'7000',method:'bank',parent:bill.id}))
 await demoRequest('expense-post',expense({amount:'3000',category:'Transport',payee:'Courier',method:'cash'}))
 const inventory=await demoRequest<InventoryReport>('inventory-report',range),r=await demoRequest<Report>('report',range),e=await demoRequest<ExpenseReport>('expense-report',range)
 expect(inventory.documents).toHaveLength(2);expect(inventory.stocks[0].closing).toBe('6000000')
 expect(r.parties.find(p=>p.id===customer.id)?.receivable).toBe('6000');expect(r.parties.find(p=>p.id===supplier.id)?.payable).toBe('30000')
 for(const [account,value]of Object.entries({cash:'17000',bank:'-57000',sales:'-36000',purchases:'60000',expenses:'15000',expense_payable:'-10000'}))expect(r.balances[account as keyof typeof r.balances]?.closing).toBe(value)
 expect(Object.values(r.balances).reduce((sum,b)=>sum+BigInt(b!.closing),0n)).toBe(0n)
 expect(e.bills.reduce((sum,b)=>sum+BigInt(b.due),0n)).toBe(10000n)
 expect(demoPreviousBalance(company,customer.id,date,'sale')).toBe('6000')
 expect(demoPreviousBalance(company,supplier.id,date,'purchase')).toBe('30000')
 console.log('AUDIT A–Z: purchase600 sale360 stock6L receive200 pay500 expenses150 cash170 bank-570 receivable60 payable300 expenseDue100 trialBalance0')
})
it('new company can immediately create a bill in its own default godown',async()=>{
 const id=crypto.randomUUID();await demoRequest('create',{table:'khata_companies',row:{id,name:'Second company'}})
 const inventory=await demoRequest<InventoryReport>('inventory-report',{...range,company:id})
 expect(inventory.warehouses).toHaveLength(1)
})
it('rejected inaccessible-party purchase leaves no inventory or accounting mutation',async()=>{
 const item=crypto.randomUUID();saveDemoItem({id:item,company,name:'Milk',unit:'litre',code:'',default_rate:null})
 await expect(demoRequest('inventory-post',trade('purchase',crypto.randomUUID(),item,'1000000','6000'))).rejects.toThrow()
 const inventory=await demoRequest<InventoryReport>('inventory-report',range);expect(inventory.documents).toHaveLength(0);expect(inventory.stocks[0].closing).toBe('0')
})
it('allows a bill payment again after reversing the earlier partial payment',async()=>{
 party('Power','expense');const bill=expense({});await demoRequest('expense-post',bill)
 const paid=expense({kind:'payment',amount:'7000',method:'bank',parent:bill.id});await demoRequest('expense-post',paid)
 await demoRequest('expense-post',expense({kind:'reversal',amount:'7000',parent:paid.id,note:'Wrong payment'}))
 await demoRequest('expense-post',expense({kind:'payment',amount:'12000',method:'bank',parent:bill.id}))
 const r=await demoRequest<ExpenseReport>('expense-report',range);expect(r.bills).toHaveLength(0)
})
it('rejects a backdated sale that would make a later stock balance negative',async()=>{
 const p=party('Trader','both'),item=crypto.randomUUID();saveDemoItem({id:item,company,name:'Milk',unit:'litre',code:'',default_rate:null})
 await demoRequest('inventory-post',trade('purchase',p.id,item,'10000000','6000'))
 await demoRequest('inventory-post',{...trade('sale',p.id,item,'10000000','9000'),date:'2026-10-21'})
 await expect(demoRequest('inventory-post',trade('sale',p.id,item,'1000000','9000'))).rejects.toThrow('INSUFFICIENT_STOCK')
 expect((await demoRequest<InventoryReport>('inventory-report',range)).stocks[0].closing).toBe('0')
})
it('preserves historical stock before the date of a sale reversal',async()=>{
 const p=party('Trader','both'),item=crypto.randomUUID();saveDemoItem({id:item,company,name:'Milk',unit:'litre',code:'',default_rate:null})
 await demoRequest('inventory-post',trade('purchase',p.id,item,'10000000','6000'))
 const sale={...trade('sale',p.id,item,'4000000','9000'),date:'2026-10-21'};await demoRequest('inventory-post',sale)
 await demoRequest('post',{id:crypto.randomUUID(),company,party:p.id,kind:'reversal',date:'2026-10-22',amount:'36000',method:'cash',reference:'',note:'Wrong bill',reverses:sale.id})
 expect((await demoRequest<InventoryReport>('inventory-report',{...range,to:'2026-10-21'})).stocks[0].closing).toBe('6000000')
 expect((await demoRequest<InventoryReport>('inventory-report',range)).stocks[0].closing).toBe('10000000')
})
it('shows an expense payment reversal in its own reporting period and in the party ledger',async()=>{
 const p=party('Power','expense');const bill=expense({date:'2026-09-28'});await demoRequest('expense-post',bill)
 const payment=expense({kind:'payment',date:'2026-09-29',amount:'7000',method:'bank',parent:bill.id});await demoRequest('expense-post',payment)
 await demoRequest('expense-post',expense({kind:'reversal',date:'2026-10-20',amount:'7000',parent:payment.id,note:'Correction'}))
 const e=await demoRequest<ExpenseReport>('expense-report',range),r=await demoRequest<Report>('report',{...range,party:p.id})
 expect(e.balances.bank.movement).toBe('7000');expect(e.balances.expenses.movement).toBe('0')
 expect(r.ledger_balances.expense_payable?.closing).toBe('-12000')
})
