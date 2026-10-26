import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { Dashboard } from './Dashboard'
import type { Report } from '../accounting/model'
afterEach(cleanup)
it('includes supplier and expense dues in the total to pay without calling them profit',()=>{
 const report:Report={balances:{payable:{opening:'0',movement:'-50000',closing:'-50000'},expense_payable:{opening:'0',movement:'-20000',closing:'-20000'}},ledger_balances:{},parties:[],entries:[],count:0,as_of:'2026-10-26'}
 render(<Dashboard language="en" companyName="Shop" report={report} failed={false} onRetry={()=>{}} onOpen={()=>{}} onBill={()=>{}} partyCount={0} itemCount={0}/>)
 expect(screen.getByText('₹700.00')).toBeInTheDocument();expect(screen.queryByText(/profit/i)).toBeNull()
})
