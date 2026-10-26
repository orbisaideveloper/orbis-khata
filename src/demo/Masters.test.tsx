import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ItemMaster, PartyMaster } from './Masters'
import { demoMasters, demoRequest, resetDemo, saveDemoItem, saveDemoParty, deleteDemoParty, deleteDemoItem } from './store'
import { emptyPartyDetails, type DemoParty } from './master-model'
import type { Report } from '../accounting/model'
const company='11111111-1111-4111-8111-111111111111'
beforeEach(resetDemo);afterEach(()=>{cleanup();vi.restoreAllMocks()})
it('requires only item name and unit; optional code/rate stay empty and the list shows the name once',()=>{
 const changed=vi.fn(),props={language:'en' as const,company,onChanged:changed}
 const view=render(<ItemMaster {...props} items={[]}/>)
 fireEvent.click(screen.getByRole('button',{name:/Add item/}))
 expect(screen.getByLabelText('Name')).toBeRequired();expect(screen.getByLabelText('Unit')).toBeRequired()
 expect(screen.getByLabelText('Code (optional)')).not.toBeRequired();expect(screen.getByLabelText('Rate (optional)')).not.toBeRequired()
 fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Milk'}});fireEvent.change(screen.getByLabelText('Unit'),{target:{value:'litre'}})
 fireEvent.click(screen.getByRole('button',{name:'Save'}))
 const items=demoMasters(company).items;expect(items).toHaveLength(1);expect(items[0]).toMatchObject({name:'Milk',code:'',default_rate:null})
 view.rerender(<ItemMaster {...props} items={items}/>);expect(screen.getAllByText('Milk')).toHaveLength(1)
})
it('adds optional code and default rate later without making another item',()=>{
 const item={id:crypto.randomUUID(),company,name:'Milk',unit:'litre',code:'',default_rate:null};saveDemoItem(item)
 render(<ItemMaster language="en" company={company} items={demoMasters(company).items} onChanged={()=>{}}/>)
 fireEvent.click(screen.getByRole('button',{name:'Edit: Milk'}))
 fireEvent.change(screen.getByLabelText('Code (optional)'),{target:{value:'M1'}});fireEvent.change(screen.getByLabelText('Rate (optional)'),{target:{value:'75'}})
 fireEvent.click(screen.getByRole('button',{name:'Save'}))
 expect(demoMasters(company).items).toEqual([{...item,code:'M1',default_rate:'7500'}])
})
it('saves contact, credit terms and an old balance without recording new income',async()=>{
 render(<PartyMaster language="en" company={company} parties={[]} onChanged={()=>{}}/>)
 fireEvent.click(screen.getByRole('button',{name:/Add party/}))
 for(const [label,value]of [['Name','Trader'],['Phone number','9876543210'],['Address','Krishnanagar'],['Credit limit (optional)','10000'],['Credit days (optional)','30']]as const)fireEvent.change(screen.getByLabelText(label),{target:{value}})
 fireEvent.change(screen.getByLabelText('Opening balance'),{target:{value:'due'}})
 fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'500'}})
 fireEvent.click(screen.getByRole('button',{name:'Save'}))
 const party=demoMasters(company).parties[0];expect(party).toMatchObject({phone:'9876543210',address:'Krishnanagar',credit_limit:'1000000',credit_days:30,opening_amount:'50000',opening_side:'due'})
 const report=await demoRequest<Report>('report',{company,from:'2026-01-01',to:'2099-12-31',offset:0,party:party.id})
 expect(report.parties[0].receivable).toBe('50000');expect(report.entries).toHaveLength(0);expect(report.balances.sales).toBeUndefined();expect(report.opening_entries).toHaveLength(1)
 expect(Object.values(report.balances).reduce((n,r)=>n+BigInt(r!.closing),0n)).toBe(0n)
})
it.each([['customer','due','receivable','50000'],['customer','advance','receivable','-50000'],['supplier','due','payable','-50000'],['supplier','advance','payable','50000']]as const)('keeps %s %s on the correct side',async(kind,side,account,amount)=>{
 const party:DemoParty={id:crypto.randomUUID(),company,name:'Trader',kind,receivable:'0',payable:'0',...emptyPartyDetails,opening_side:side,opening_amount:'50000',opening_date:'2026-10-01'};saveDemoParty(party)
 const report=await demoRequest<Report>('report',{company,from:'2026-10-01',to:'2026-10-25',offset:0,party:party.id})
 expect(report.balances[account]?.closing).toBe(amount);expect(report.balances.sales).toBeUndefined();expect(report.balances.purchases).toBeUndefined()
})
it('settles an old expense payable without recognizing that old expense again',async()=>{
 const party:DemoParty={id:crypto.randomUUID(),company,name:'Power',kind:'expense',receivable:'0',payable:'0',...emptyPartyDetails,opening_side:'due',opening_amount:'10000',opening_date:'2026-10-01'};saveDemoParty(party)
 await demoRequest('expense-post',{id:crypto.randomUUID(),company,date:'2026-10-25',kind:'payment',amount:'4000',category:'Power',payee:'Power',method:'bank',parent:party.id,reference:'',note:''})
 const report=await demoRequest<Report>('report',{company,from:'2026-10-01',to:'2026-10-25',offset:0,party:null})
 expect(report.balances.expenses).toBeUndefined();expect(report.balances.expense_payable?.closing).toBe('-6000');expect(report.balances.bank?.closing).toBe('-4000')
})

it('requires two confirmations before deleting unused demo masters and keeps used parties',async()=>{
 const party:DemoParty={id:crypto.randomUUID(),company,name:'Unused customer',kind:'customer',receivable:'0',payable:'0',...emptyPartyDetails};saveDemoParty(party)
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false),changed=vi.fn();render(<PartyMaster language="en" company={company} parties={demoMasters(company).parties} onChanged={changed}/>)
 fireEvent.click(screen.getByRole('button',{name:'Delete: Unused customer'}));expect(demoMasters(company).parties).toHaveLength(1);confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'Delete: Unused customer'}));expect(demoMasters(company).parties).toHaveLength(0);expect(changed).toHaveBeenCalledOnce();cleanup()
 const used={...party,id:crypto.randomUUID(),name:'Used customer'};saveDemoParty(used);await demoRequest('post',{id:crypto.randomUUID(),company,party:used.id,kind:'sale',date:'2026-10-25',amount:'100',method:'cash',reference:'',note:'',reverses:null})
 render(<PartyMaster language="en" company={company} parties={demoMasters(company).parties} onChanged={changed}/>);fireEvent.click(screen.getByRole('button',{name:'Delete: Used customer'}));expect(screen.getByRole('alert')).toBeInTheDocument();expect(demoMasters(company).parties).toHaveLength(1)
 expect(()=>deleteDemoParty('other',used.id)).toThrow('PARTY_NOT_ACCESSIBLE')
})
it('deletes unused items but rejects an item with stock history',async()=>{
 const item={id:crypto.randomUUID(),company,name:'Unused item',unit:'piece',code:'',default_rate:null};saveDemoItem(item);vi.spyOn(window,'confirm').mockReturnValue(true);render(<ItemMaster language="en" company={company} items={demoMasters(company).items} onChanged={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Delete: Unused item'}));expect(demoMasters(company).items).toHaveLength(0);cleanup()
 const used={...item,id:crypto.randomUUID(),name:'Stock item'};saveDemoItem(used);const supplier:DemoParty={id:crypto.randomUUID(),company,name:'Supplier',kind:'supplier',receivable:'0',payable:'0',...emptyPartyDetails};saveDemoParty(supplier)
 const report=await demoRequest<{warehouses:{id:string}[]}>('inventory-report',{company,from:'2026-10-01',to:'2026-10-25',offset:0});await demoRequest('inventory-post',{id:crypto.randomUUID(),company,kind:'purchase',date:'2026-10-25',code:'',name:'',unit:'',party:supplier.id,reference:'',note:'',lines:[{item:used.id,warehouse:report.warehouses[0].id,to:null,quantity:'1000000',rate:'100'}]})
 expect(()=>deleteDemoItem(company,used.id)).toThrow('ITEM_IN_USE');expect(()=>deleteDemoItem('other',used.id)).toThrow('ITEM_NOT_ACCESSIBLE')
})
