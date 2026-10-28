import { beforeEach, expect, it, vi } from 'vitest'
import { demoRequest, editDemoItem, resetDemo } from './store'
import { requestKhata } from '../accounting/api'
import type { Report } from '../accounting/model'
import type { InventoryCommand, InventoryReport } from '../inventory/model'
import type { ExpenseReport } from '../accounting/expense-model'
const company='11111111-1111-4111-8111-111111111111',warehouse='22222222-2222-4222-8222-222222222222'
const item='33333333-3333-4333-8333-333333333333',party='44444444-4444-4444-8444-444444444444'
const range={company,from:'2026-10-01',to:'2026-10-25',offset:0}
const master:InventoryCommand={id:item,company,kind:'item',date:'2026-10-25',code:'M1',name:'Milk',unit:'litre',party:null,reference:'',note:'',lines:[]}
beforeEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();resetDemo()})
it('routes every demo operation locally even if a live URL is configured; unknown operations fail closed',async()=>{
 vi.stubEnv('VITE_KHATA_DEMO','true');vi.stubEnv('DEV',true);vi.stubEnv('VITE_KHATA_DATA_URL','https://live.example.test')
 const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No network allowed'))
 try{
  expect(await requestKhata('companies',{})).toEqual([{id:company,name:'ডেমো দোকান'}])
  await expect(requestKhata('unknown',{})).rejects.toThrow('DEMO_OPERATION_UNSUPPORTED')
  expect(fetch).not.toHaveBeenCalled()
 }finally{vi.unstubAllEnvs()}
})
it('supports item creation, name/code edits, purchase/sale with changed rates, expense partial payment and reset',async()=>{
 await demoRequest('create',{table:'khata_parties',row:{id:party,company_id:company,name:'Trader',kind:'both'}})
 await demoRequest('inventory-post',master)
 editDemoItem(item,{name:'দুধ',code:'MILK',unit:'litre'})
 const purchase={...master,id:crypto.randomUUID(),kind:'purchase',code:'',name:'',unit:'',party,lines:[{item,warehouse,to:null,quantity:'10000000',rate:'6000'}]}
 await demoRequest('inventory-post',purchase);await demoRequest('inventory-post',purchase)
 await demoRequest('inventory-post',{...purchase,id:crypto.randomUUID(),kind:'sale',lines:[{item,warehouse,to:null,quantity:'2000000',rate:'8500'}]})
 const inventory=await demoRequest<InventoryReport>('inventory-report',range)
 expect(inventory.items[0]).toMatchObject({name:'দুধ',code:'MILK'})
 expect(inventory.stocks[0].closing).toBe('8000000');expect(inventory.documents).toHaveLength(2)
 expect(inventory.documents[1].total).toBe('17000')
 expect(()=>editDemoItem(item,{name:'দুধ',code:'MILK',unit:'kg'})).toThrow('UNIT_ALREADY_USED')
 await expect(demoRequest('inventory-post',{...purchase,id:crypto.randomUUID(),kind:'sale',lines:[{item,warehouse,to:null,quantity:'9000000',rate:'8000'}]})).resolves.toBeNull()
 const charge={id:crypto.randomUUID(),company,date:'2026-10-25',kind:'charge',amount:'10000',category:'Electricity',payee:'Power',method:null,parent:null,reference:'',note:''}
 await demoRequest('expense-post',charge)
 await demoRequest('expense-post',{...charge,id:crypto.randomUUID(),kind:'payment',method:'bank',amount:'4000',parent:charge.id})
 const expense=await demoRequest<ExpenseReport>('expense-report',range)
 expect(expense.bills[0].due).toBe('6000');expect(expense.categories[0].amount).toBe('10000')
 const report=await demoRequest<Report>('report',range)
 expect(report.parties).toHaveLength(1);expect(report.entries).toHaveLength(3)
 expect(report.balances.expenses?.closing).toBe('10000');expect(report.balances.bank?.closing).toBe('-4000');expect(report.balances.expense_payable?.closing).toBe('-6000')
 resetDemo();expect((await demoRequest<InventoryReport>('inventory-report',range)).items).toHaveLength(0)
 expect((await demoRequest<Report>('report',range)).parties).toHaveLength(0)
})
