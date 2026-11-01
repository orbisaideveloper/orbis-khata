import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Expenses } from './Expenses'
import * as api from './api'
import type { ExpenseReport } from './expense-model'
vi.mock('./api',()=>({expenseReport:vi.fn(),postExpense:vi.fn(),rejected:(error: {code?:string})=>error?.code==='P0001'}))
const company='11111111-1111-4111-8111-111111111111', userId='22222222-2222-7222-8222-222222222222'
const bill='33333333-3333-4333-8333-333333333333'
const props={company,userId,companyName:'My Shop',language:'en' as const,from:'2026-10-01',to:'2026-10-24',version:0,onChanged:vi.fn(),onLock:vi.fn(),blocked:false}
const empty: ExpenseReport={balances:{},categories:[],bills:[],entries:[],count:0}
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();localStorage.clear();vi.mocked(api.expenseReport).mockResolvedValue(empty);vi.mocked(api.postExpense).mockResolvedValue(undefined)})
afterEach(cleanup)
async function draft() {
  fireEvent.click(await screen.findByRole('button',{name:'＋ Add expense'}))
  fireEvent.change(screen.getByLabelText('Category'),{target:{value:'Rent'}})
  fireEvent.focus(screen.getByLabelText('Description / correction reason'))
  fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'100.25'}})
  fireEvent.change(screen.getByLabelText('Settlement'),{target:{value:'bank'}})
  fireEvent.click(screen.getByRole('button',{name:'Review & save'}))
}
it('reviews a direct bank expense before posting exact minor units and refreshing parent balances',async()=>{
  render(<Expenses {...props}/>);await draft()
  expect(api.postExpense).not.toHaveBeenCalled();expect(screen.getByText('My Shop · '+new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}))).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Save'}))
  await screen.findByText('Expense records saved.')
  expect(api.postExpense).toHaveBeenCalledWith(expect.objectContaining({company,kind:'charge',amount:'10025',method:'bank',category:'Rent',parent:null}))
  expect(props.onChanged).toHaveBeenCalledTimes(1)
})
it('keeps an uncertain save and retries the identical ID and payload',async()=>{
  vi.mocked(api.postExpense).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
  render(<Expenses {...props}/>);await draft();fireEvent.click(screen.getByRole('button',{name:'Save'}))
  await screen.findByText(/Outcome unknown/)
  const original=vi.mocked(api.postExpense).mock.calls[0][0]
  expect(JSON.parse(sessionStorage.getItem(`khata-expense-pending-v1:${userId}:${company}`)!)).toEqual(original)
  fireEvent.click(screen.getByRole('button',{name:'Retry'}));await screen.findByText('Expense records saved.')
  expect(vi.mocked(api.postExpense).mock.calls[1][0]).toEqual(original)
  expect(sessionStorage.getItem(`khata-expense-pending-v1:${userId}:${company}`)).toBeNull()
})
it('settles a bill without creating another expense and shows distinct expense, cash and outstanding totals',async()=>{
  vi.mocked(api.expenseReport).mockResolvedValue({...empty,balances:{expenses:{opening:'0',movement:'10000',closing:'10000'},cash:{opening:'0',movement:'-4000',closing:'-4000'},expense_payable:{opening:'0',movement:'-6000',closing:'-6000'}},bills:[{id:bill,effective_date:'2026-10-01',category:'Rent',payee:'Owner',amount:'10000',due:'6000'}]})
  render(<Expenses {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'Pay outstanding'}))
  expect(screen.getByLabelText('Amount')).toHaveValue('60.00')
  fireEvent.click(screen.getByRole('button',{name:'Review & save'}));fireEvent.click(screen.getByRole('button',{name:'Save'}))
  await waitFor(()=>expect(api.postExpense).toHaveBeenCalledWith(expect.objectContaining({kind:'payment',parent:bill,amount:'6000'})))
})
it.each(['bn','hi'] as const)('offers expense entry and reports in %s',async language=>{
  render(<Expenses {...props} language={language}/>);await waitFor(()=>expect(api.expenseReport).toHaveBeenCalled())
  expect(screen.getByRole('heading',{name:language==='bn'?'ব্যবসার খরচ':'व्यवसाय के खर्च'})).toBeInTheDocument()
})
it('does not allow a new expense while a voucher is pending',async()=>{
  render(<Expenses {...props} blocked/>);expect(await screen.findByRole('button',{name:'＋ Add expense'})).toBeDisabled()
})

it('blocks posting when safe retry storage is unavailable',async()=>{
  render(<Expenses {...props}/>);await draft()
  const blocked=vi.spyOn(Object.getPrototypeOf(sessionStorage),'setItem').mockImplementation(()=>{throw new Error('quota')})
  try {
    fireEvent.click(screen.getByRole('button',{name:'Save'}))
    expect(screen.getByText('Cannot preserve a safe retry entry. Saving is blocked.')).toBeInTheDocument()
    expect(api.postExpense).not.toHaveBeenCalled()
  } finally {blocked.mockRestore()}
})

it('restores a pending retry in the same company and does not invent a fresh ID',async()=>{
  const command={id:bill,company,date:'2026-10-01',kind:'charge',amount:'100',category:'Rent',payee:'',method:'cash',parent:null,reference:'',note:''}
  sessionStorage.setItem(`khata-expense-pending-v1:${userId}:${company}`,JSON.stringify(command))
  render(<Expenses {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'Retry'}))
  await screen.findByText('Expense records saved.')
  expect(api.postExpense).toHaveBeenCalledWith(command)
})

it('requires both review and a second explicit confirmation before reversing an entry',async()=>{
  vi.mocked(api.expenseReport).mockResolvedValue({...empty,entries:[{id:bill,kind:'charge',amount:'100',category:'Rent',payee:'',method:'cash',parent_id:null,reverses_id:null,reference:'',note:'',effective_date:'2026-10-01',reversed:false}]})
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
  try {
    render(<Expenses {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'Reverse incorrect entry'}))
    fireEvent.change(screen.getByLabelText('Description / correction reason'),{target:{value:'Wrong expense'}})
    fireEvent.click(screen.getByRole('button',{name:'Review & save'}));fireEvent.click(screen.getByRole('button',{name:'Save'}))
    expect(api.postExpense).not.toHaveBeenCalled()
    confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'Save'}))
    await screen.findByText('Expense records saved.')
    expect(api.postExpense).toHaveBeenCalledWith(expect.objectContaining({kind:'reversal',parent:bill,method:null,amount:'100'}))
  } finally {confirm.mockRestore()}
})
it('opens a simple category/subcategory/payee expense without invoice rows and posts exactly once',async()=>{render(<Expenses {...props} startOpen/>);expect(screen.queryByLabelText('Quantity')).toBeNull();fireEvent.change(screen.getByLabelText('Category'),{target:{value:'Salary'}});fireEvent.change(screen.getByLabelText('Subcategory'),{target:{value:'Permanent'}});fireEvent.change(screen.getByLabelText('Paid to / owed to'),{target:{value:'Arko'}});fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'150'}});fireEvent.click(screen.getByRole('button',{name:'Review & save'}));fireEvent.click(screen.getByRole('button',{name:'Save'}));await waitFor(()=>expect(api.postExpense).toHaveBeenCalledWith(expect.objectContaining({category:'Salary › Permanent',payee:'Arko',amount:'15000',method:'cash'})));expect(api.postExpense).toHaveBeenCalledOnce();});

it('searches category, nested category and payee across all report pages without changing totals or posting',async()=>{
 const base={kind:'charge' as const,amount:'100',payee:'Other',method:'cash' as const,parent_id:null,reverses_id:null,reference:'',note:'',effective_date:'2026-10-01',reversed:false};
 const first=Array.from({length:50},(_,i)=>({...base,id:String(i),category:'Salary › Permanent'}));const last={...base,id:'last',category:'Transport › Access',payee:'Arko',note:'Evening trip',reference:'REF-51'};
 vi.mocked(api.expenseReport).mockImplementation(async(_company,from,_to,offset)=>from==='0001-01-01'?empty:{...empty,balances:{expenses:{opening:'0',movement:'5100',closing:'5100'}},entries:offset?[last]:first,count:51});
 render(<Expenses {...props}/>);const input=await screen.findByRole('searchbox',{name:'Search expenses'});await screen.findByRole('button',{name:'Next'});fireEvent.change(input,{target:{value:'transport access arko'}});await screen.findByText('Evening trip');expect(screen.queryByText('Salary › Permanent')).not.toBeInTheDocument();expect(screen.getByText('₹51.00')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Next'})).toBeDisabled();fireEvent.change(input,{target:{value:'REF-51'}});expect(screen.getByText('Evening trip')).toBeInTheDocument();fireEvent.change(input,{target:{value:'Salary'}});expect(screen.getAllByText('Salary › Permanent')).toHaveLength(50);expect(api.postExpense).not.toHaveBeenCalled();
});
