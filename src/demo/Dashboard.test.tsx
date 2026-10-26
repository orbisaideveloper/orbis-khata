import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Dashboard } from './Dashboard'
import type { Report } from '../accounting/model'
afterEach(cleanup)
it('includes supplier and expense dues in the total to pay without calling them profit',()=>{
 const report:Report={balances:{payable:{opening:'0',movement:'-50000',closing:'-50000'},expense_payable:{opening:'0',movement:'-20000',closing:'-20000'}},ledger_balances:{},parties:[{id:'s',name:'Supplier',kind:'supplier',receivable:'0',payable:'50000'}],entries:[],count:0,as_of:'2026-10-26'}
 const expenses={balances:{},categories:[],entries:[],count:0,bills:[{id:'e',effective_date:'2026-10-01',category:'Rent',payee:'Landlord',amount:'20000',due:'20000'}]}
 const open=vi.fn(),refresh=vi.fn()
 render(<Dashboard language="en" companyName="Shop" report={report} expenses={expenses} onOverview={open} failed={false} onRetry={refresh} onOpen={()=>{}} onBill={()=>{}} partyCount={0} itemCount={0}/>)
 expect(screen.getByText('₹700.00')).toBeInTheDocument();expect(screen.queryByText(/profit/i)).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'To pay'}));expect(open).toHaveBeenCalledWith('payable')
 fireEvent.click(screen.getByRole('button',{name:'Refresh balances'}));expect(refresh).toHaveBeenCalledOnce()
})
