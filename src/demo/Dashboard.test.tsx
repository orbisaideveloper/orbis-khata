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
it('shows the top three dues, combined liquidity and negative component styling with all drill-downs',()=>{
 const report:Report={balances:{cash:{opening:'0',movement:'-5000',closing:'-5000'},bank:{opening:'0',movement:'1000',closing:'1000'}},ledger_balances:{},parties:[1,4,3,2].map(n=>({id:String(n),name:'Party '+n,kind:'customer',receivable:String(n*10000),payable:'0'})),entries:[],count:0,as_of:'2026-10-29'};const open=vi.fn();const expenses={balances:{},categories:[],bills:[],entries:[],count:0};
 const {container,rerender}=render(<Dashboard language="en" companyName="Shop" report={report} expenses={expenses} onOverview={open} failed={false} onRetry={()=>{}} onOpen={()=>{}} onBill={()=>{}} partyCount={4} itemCount={0}/>);
 expect(container.querySelectorAll('.kh-summary-grid>.kh-metric')).toHaveLength(4);expect(Array.from(container.querySelectorAll('.kh-top-parties>span')).map(row=>row.textContent)).toEqual(['Party 4₹400.00','Party 3₹300.00','Party 2₹200.00']);expect(container.querySelector('.kh-liquidity')).toHaveClass('is-negative');expect(screen.getByRole('button',{name:'Cash'})).toHaveClass('is-negative');fireEvent.click(screen.getByRole('button',{name:'Cash & Bank'}));expect(open).toHaveBeenLastCalledWith('liquidity');fireEvent.click(screen.getByRole('button',{name:'Cash'}));expect(open).toHaveBeenLastCalledWith('cash');fireEvent.click(screen.getByRole('button',{name:'Bank'}));expect(open).toHaveBeenLastCalledWith('bank');fireEvent.click(screen.getByRole('button',{name:'Expense details'}));expect(open).toHaveBeenLastCalledWith('expenses');
 rerender(<Dashboard language="bn" companyName="Shop" report={{...report,balances:{}}} expenses={expenses} onOverview={open} failed={false} onRetry={()=>{}} onOpen={()=>{}} onBill={()=>{}} partyCount={4} itemCount={0}/>);expect(container.querySelector('.kh-liquidity')).toHaveClass('is-positive');
});
