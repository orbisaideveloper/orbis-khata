import {cleanup,fireEvent,render,screen,waitFor,act} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {RecordDetail} from './RecordDetail';
import {ExpenseRecordDetail} from './ExpenseRecordDetail';
import {BookServicesContext,type BookServices} from '../books-services';
import {defaultSettings} from './workspace-contract';
afterEach(cleanup);
const company='company-fixture',party='party-fixture',item='item-fixture',date='2026-10-30';
const expense={id:'expense',kind:'charge',date,effective_date:date,amount:'1000',category:'Rent',payee:'Landlord',method:'cash',parent:null,parent_id:null,reverses_id:null,reference:'E1',note:'',reversed:false};
function setup(cost=false){
 const request=vi.fn(async(op:string,input:unknown)=>{const p=input as {action:string};if(p.action==='settings')return defaultSettings();if(p.action==='detail')return cost?{expense,lines:[]}:{company_name:'Fixture shop',party_name:'Buyer',voucher:{id:'bill',party_id:party,party_name:'Buyer',kind:'sale',effective_date:date,amount_minor:'1000',reference:'S1',note:'',debit_account:'receivable',credit_account:'sales',reversed:false},item_names:{[item]:'Milk'},payments:[],bill:{party,kind:'sale',total:'1000',lines:[{item,warehouse:'w',quantity:'1000000',rate:'1000'}]}};
 if(op==='report')return {balances:{},ledger_balances:{receivable:{closing:'1234',opening:'0'}},parties:[],entries:[],count:0};
 if(op==='inventory-report')return {items:[{id:item,name:'Milk',code:'M1',unit:'L'}],warehouses:[{id:'w',name:'Main'}],stocks:[{item,warehouse:'w',opening:'0',incoming:'2000000',outgoing:'1000000',closing:'1000000'}],documents:[],count:0};
 if(op==='expense-report')return {entries:[expense],categories:[{name:'Rent',amount:'1000'}],bills:[],balances:{},count:1};throw Error('Unexpected request');});
 const close=vi.fn();const Component=cost?ExpenseRecordDetail:RecordDetail;render(<BookServicesContext.Provider value={{request} as unknown as BookServices}><Component company={company} id={cost?'expense':'bill'} mode="view" language="en" onClose={close} onChanged={vi.fn()}/></BookServicesContext.Provider>);return {request,close};
}
it('opens the exact bill item and party ledgers within company/date scope and returns to the same bill without writes',async()=>{
 const {request,close}=setup();fireEvent.click(await screen.findByRole('button',{name:'Milk'}));await screen.findByText('Unit: L');expect(request).toHaveBeenCalledWith('inventory-report',{company,from:'0001-01-01',to:date,offset:0});
 await act(async()=>{window.dispatchEvent(new Event('khata-back',{cancelable:true}));});expect(close).not.toHaveBeenCalled();fireEvent.click(await screen.findByRole('button',{name:'Buyer'}));await screen.findByText(/₹12.34/);expect(request).toHaveBeenCalledWith('report',{company,from:'0001-01-01',to:date,party,offset:0});fireEvent.click(screen.getByRole('button',{name:'Back to list'}));await screen.findByRole('button',{name:'Milk'});expect(request.mock.calls.filter(([op,input])=>op==='workspace'&&(input as {action:string}).action==='correct')).toHaveLength(0);
});
it('opens the expense payee ledger without treating a free-text expense description as a stock item',async()=>{
 const {request}=setup(true);fireEvent.click(await screen.findByRole('button',{name:'Landlord'}));await screen.findByRole('heading',{name:'Landlord'});await waitFor(()=>expect(request).toHaveBeenCalledWith('expense-report',{company,from:'0001-01-01',to:date,offset:0}));expect(request.mock.calls.some(([op])=>op==='inventory-report')).toBe(false);fireEvent.click(screen.getByRole('button',{name:'Back to list'}));await screen.findByRole('button',{name:'Landlord'});
});
