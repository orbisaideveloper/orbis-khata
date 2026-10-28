import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import DemoApp from './DemoApp'
import { ItemMaster, PartyMaster } from './Masters'
import { InvoicePage } from './InvoicePage'
import { Accounting } from '../accounting/Accounting'
import { Expenses } from '../accounting/Expenses'
import { demoRequest, demoMasters, resetDemo } from './store'
import { today, type Report } from '../accounting/model'
import type { InventoryReport } from '../inventory/model'
import type { ExpenseReport } from '../accounting/expense-model'
let company='',warehouse='',supplier='',customer='',power='',item=''
const query=()=>({company,from:'2026-09-01',to:today(),offset:0,party:null})
function change(label:string,value:string){fireEvent.change(label==='Party'&&document.querySelector('form select[name=party]')?document.querySelector('form select[name=party]')!:screen.getByLabelText(label),{target:{value}})}
async function addParty(name:string,kind:'supplier'|'customer'|'expense',side:'due'|'advance',amount:string){
 render(<PartyMaster language="en" company={company} parties={demoMasters(company).parties} onChanged={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:/Add party/}))
 change('Name',name);change('Category',kind);change('Phone number','9876543210');change('Opening balance',side);change('Amount',amount);change('Balance date','2026-09-30')
 fireEvent.click(screen.getByRole('button',{name:'Save'}));return demoMasters(company).parties.find(p=>p.name===name)!.id
}
async function bill(kind:'sale'|'purchase'|'expense',party:string,qty:string,rate:string){
 render(<InvoicePage language="en" kind={kind} company={company} companyName="Trial business" {...demoMasters(company)} warehouses={[{id:warehouse,name:'Main'}]} onSaved={()=>{}} onBack={()=>{}}/> )
 change('Party',party);if(kind==='expense')change('Description 1','Electricity usage');else change('Item name 1',item)
 change('Quantity 1',qty);change('Rate 1',rate)
 fireEvent.click(screen.getByRole('button',{name:'Review bill'}));expect(screen.getByRole('article')).toHaveTextContent(kind==='sale'?'Trial customer':kind==='purchase'?'Trial supplier':'Trial power')
 if(kind==='purchase')for(const label of ['Blue memo','Office bill','Modern']){fireEvent.click(screen.getByLabelText(label));fireEvent.click(screen.getByRole('button',{name:'Print / PDF'}))}
 fireEvent.click(screen.getByRole('button',{name:'Confirm & save'}));await screen.findByText('Bill saved.')
}
describe.sequential('A–Z through actual demo React controls (DOM, no live account)',()=>{
 beforeAll(()=>{resetDemo();vi.stubEnv('DEV',true);vi.stubEnv('VITE_KHATA_DEMO','true');vi.stubEnv('VITE_KHATA_PREVIEW','true');vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Network forbidden'));vi.spyOn(window,'scrollTo').mockImplementation(()=>{});vi.spyOn(window,'print').mockImplementation(()=>{})})
 afterEach(cleanup);afterAll(()=>{expect(globalThis.fetch).not.toHaveBeenCalled();vi.unstubAllEnvs();vi.restoreAllMocks()})
 it('01 creates a business from the app and gets its default warehouse',async()=>{
  render(<DemoApp/>);change('ভাষা','en');fireEvent.click(screen.getByRole('button',{name:/Create \/ switch company/}));fireEvent.click(await screen.findByRole('button',{name:/New company/}));change('Company name','Trial business');fireEvent.click(screen.getByRole('button',{name:'Create'}));await screen.findByText('ORBIS / Trial business')
  company=(await demoRequest<{id:string;name:string}[]>('companies',{})).find(c=>c.name==='Trial business')!.id
  warehouse=(await demoRequest<InventoryReport>('inventory-report',query())).warehouses[0].id;expect(warehouse).toBeTruthy()
 })
 it('02 creates a supplier with old due and contact',async()=>{supplier=await addParty('Trial supplier','supplier','due','200');expect(supplier).toBeTruthy()})
 it('03 creates a customer with an old advance',async()=>{customer=await addParty('Trial customer','customer','advance','100');expect(customer).toBeTruthy()})
 it('04 creates an expense party with old payable',async()=>{power=await addParty('Trial power','expense','due','50');expect(power).toBeTruthy()})
 it('05 creates a litre item with optional code and rate blank',()=>{
  render(<ItemMaster language="en" company={company} items={[]} onChanged={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:/Add item/}));change('Name','Trial milk');change('Unit','litre');fireEvent.click(screen.getByRole('button',{name:'Save'}));const value=demoMasters(company).items[0];item=value.id;expect(value).toMatchObject({code:'',default_rate:null})
 })
 it('06 buys 10 litres at 60, previews all three designs and confirms once',async()=>{await bill('purchase',supplier,'10','60');expect(window.print).toHaveBeenCalledTimes(3)})
 it('07 sells 4 litres at 90',async()=>{await bill('sale',customer,'4','90')})
 it('08 receives 200 cash through Accounts while preserving the chosen company',async()=>{
  render(<Accounting userId="demo-owner" language="en" initialCompany={company}/>);const receive=await screen.findByRole('button',{name:'Receive money'});expect(receive).toBeInTheDocument();fireEvent.click(receive);expect(screen.getByLabelText('Company')).toHaveValue(company)
  change('Party',customer);change('Amount (INR)','200');fireEvent.click(screen.getByRole('button',{name:'Review entry'}));fireEvent.click(screen.getByRole('button',{name:'Confirm & save'}));expect(await screen.findByText('Saved successfully.')).toBeInTheDocument()
 })
 it('09 pays supplier 500 through Bank',async()=>{
  render(<Accounting userId="demo-owner" language="en" initialCompany={company}/>);fireEvent.click(await screen.findByRole('button',{name:'Pay money'}));change('Party',supplier);change('Amount (INR)','500');change('Paid into / from','bank');fireEvent.click(screen.getByRole('button',{name:'Review entry'}));fireEvent.click(screen.getByRole('button',{name:'Confirm & save'}));expect(await screen.findByText('Saved successfully.')).toBeInTheDocument()
 })
 it('10 creates a due expense bill for 120 through the invoice',async()=>{await bill('expense',power,'1','120')})
 it('11 partially settles the 120 expense bill with a 70 bank payment',async()=>{
  render(<Expenses userId="demo-owner" language="en" company={company} companyName="Trial business" from="2026-09-01" to={today()} version={0} payees={['Trial power']} onLock={()=>{}} onChanged={()=>{}} blocked={false}/> )
  await screen.findAllByRole('button',{name:'Pay outstanding'})
  const label=screen.getByText(/Trial power.*Unpaid: ₹120.00/);fireEvent.click(within(label.parentElement!).getByRole('button',{name:'Pay outstanding'}));change('Amount','70');change('Settlement','bank');fireEvent.click(screen.getByRole('button',{name:'Review'}));fireEvent.click(screen.getByRole('button',{name:'Confirm'}));expect(await screen.findByText('Expense records saved.')).toBeInTheDocument()
 })
 it('12 verifies final ledgers, inventory and cross-company separation after all UI entries',async()=>{
  const r=await demoRequest<Report>('report',query()),inv=await demoRequest<InventoryReport>('inventory-report',query()),e=await demoRequest<ExpenseReport>('expense-report',query())
  expect(inv.stocks[0].closing).toBe('6000000');expect(r.parties.find(p=>p.id===customer)?.receivable).toBe('6000');expect(r.parties.find(p=>p.id===supplier)?.payable).toBe('30000');expect(r.balances.cash?.closing).toBe('20000');expect(r.balances.bank?.closing).toBe('-57000');expect(r.balances.expenses?.closing).toBe('12000');expect(r.balances.expense_payable?.closing).toBe('-10000');expect(e.bills.reduce((s,b)=>s+BigInt(b.due),0n)).toBe(10000n);expect(Object.values(r.balances).reduce((s,b)=>s+BigInt(b!.closing),0n)).toBe(0n)
  const other=await demoRequest<Report>('report',{...query(),company:'11111111-1111-4111-8111-111111111111'});expect(other.entries).toHaveLength(0);expect(other.parties).toHaveLength(0)
 })
})
