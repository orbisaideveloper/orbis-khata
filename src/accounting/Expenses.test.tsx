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
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();vi.mocked(api.expenseReport).mockResolvedValue(empty);vi.mocked(api.postExpense).mockResolvedValue(undefined)})
afterEach(cleanup)
async function draft() {
  fireEvent.click(await screen.findByRole('button',{name:'＋ Add expense'}))
  fireEvent.change(screen.getByLabelText('Expense account'),{target:{value:'Rent'}})
  fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'100.25'}})
  fireEvent.change(screen.getByLabelText('Settlement'),{target:{value:'bank'}})
  fireEvent.click(screen.getByRole('button',{name:'Review'}))
}
it('reviews a direct bank expense before posting exact minor units and refreshing parent balances',async()=>{
  render(<Expenses {...props}/>);await draft()
  expect(api.postExpense).not.toHaveBeenCalled();expect(screen.getByText('My Shop · '+new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}))).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Confirm'}))
  await screen.findByText('Expense records saved.')
  expect(api.postExpense).toHaveBeenCalledWith(expect.objectContaining({company,kind:'charge',amount:'10025',method:'bank',category:'Rent',parent:null}))
  expect(props.onChanged).toHaveBeenCalledTimes(1)
})
it('keeps an uncertain save and retries the identical ID and payload',async()=>{
  vi.mocked(api.postExpense).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
  render(<Expenses {...props}/>);await draft();fireEvent.click(screen.getByRole('button',{name:'Confirm'}))
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
  fireEvent.click(screen.getByRole('button',{name:'Review'}));fireEvent.click(screen.getByRole('button',{name:'Confirm'}))
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
    fireEvent.click(screen.getByRole('button',{name:'Confirm'}))
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
    fireEvent.click(screen.getByRole('button',{name:'Review'}));fireEvent.click(screen.getByRole('button',{name:'Confirm'}))
    expect(api.postExpense).not.toHaveBeenCalled()
    confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'Confirm'}))
    await screen.findByText('Expense records saved.')
    expect(api.postExpense).toHaveBeenCalledWith(expect.objectContaining({kind:'reversal',parent:bill,method:null,amount:'100'}))
  } finally {confirm.mockRestore()}
})
