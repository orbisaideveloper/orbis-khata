import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Accounting } from '../accounting/Accounting'
import { inventoryPendingKey } from './pending'
const mocks=vi.hoisted(()=>({companies:vi.fn(),report:vi.fn(),expenseReport:vi.fn(),inventoryReport:vi.fn()}))
vi.mock('../accounting/api',()=>mocks)
vi.mock('./api',()=>({inventoryReport:mocks.inventoryReport,postInventory:vi.fn()}))
afterEach(()=>{cleanup();sessionStorage.clear();vi.resetAllMocks()})
it('reopens the actual company and item panel for an uncertain bill after reload',async()=>{
 const company='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',item='33333333-3333-4333-8333-333333333333'
 mocks.companies.mockResolvedValue([{id:company,name:'First'},{id:other,name:'Pending company'}])
 mocks.report.mockResolvedValue({balances:{},ledger_balances:{},parties:[],entries:[],count:0})
 mocks.expenseReport.mockResolvedValue({balances:{},categories:[],bills:[],entries:[],count:0})
 let finish!: (value:unknown)=>void
 mocks.inventoryReport.mockReturnValue(new Promise(resolve=>{finish=resolve}))
 sessionStorage.setItem(inventoryPendingKey('owner'),JSON.stringify({id:item,company:other,kind:'purchase',date:'2026-10-25',code:'',name:'',unit:'',party:item,reference:'P1',note:'',lines:[{item,warehouse:item,to:null,quantity:'1000000',rate:'100'}]}))
 render(<Accounting userId="owner" language="en"/>)
 await screen.findByText('ORBIS / Pending company')
 expect(screen.getByLabelText('Company')).toBeDisabled()
 await act(async()=>finish({items:[],warehouses:[],stocks:[],documents:[],count:0}))
 expect(await screen.findByRole('button',{name:'Retry same entry'})).toBeInTheDocument()
 expect(screen.getByLabelText('Company')).toHaveValue(other)
 expect(screen.getByLabelText('Company')).toBeDisabled()
 expect(mocks.inventoryReport.mock.calls[0][0]).toBe(other)
})
it('keeps a pending expense visible and locks the company even when its page was not selected',async()=>{
 const company='11111111-1111-4111-8111-111111111111'
 mocks.companies.mockResolvedValue([{id:company,name:'Pending expense company'}])
 mocks.report.mockResolvedValue({balances:{},ledger_balances:{},parties:[],entries:[],count:0})
 mocks.expenseReport.mockResolvedValue({balances:{},categories:[],bills:[],entries:[],count:0})
 sessionStorage.setItem(`khata-expense-pending-v1:owner:${company}`,JSON.stringify({id:crypto.randomUUID(),company,date:'2026-10-25',kind:'charge',amount:'10000',category:'Electricity',payee:'Power',method:null,parent:null,reference:'',note:''}))
 render(<Accounting userId="owner" language="en"/>)
 await screen.findByRole('button',{name:'Retry'})
 expect(screen.getByLabelText('Company')).toBeDisabled()
 await waitFor(()=>expect(mocks.expenseReport).toHaveBeenCalledOnce())
})
