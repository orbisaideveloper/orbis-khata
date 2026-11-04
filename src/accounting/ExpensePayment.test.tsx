import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {BookServicesContext,type BookServices} from '../books-services';
import {ExpensePayment} from './ExpensePayment';
import {profileBalance,runProfiles,type ProfileCommand,type ProfileState} from '../expense-profiles/model';
const company='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',category='33333333-3333-4333-8333-333333333333';
beforeEach(()=>{sessionStorage.clear();vi.spyOn(window,'confirm').mockReturnValue(true);vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-30T12:00:00Z'));});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});
function mount(){
 let state:ProfileState={categories:[{id:category,name:'Salary'}],profiles:[{id,categoryId:category,name:'Worker',opening:'0',openingDate:'2026-11-01',schedule:{kind:'SALARY',mode:'CALENDAR',start:'2026-11-01',amount:'2000000',changes:[]}}],payments:[]};
 const post=vi.fn(async(_input:unknown)=>({})),request=vi.fn(async(operation:string,input:unknown)=>{if(operation==='expense-post')return post(input);state=await runProfiles(state,input as ProfileCommand,post);return structuredClone(state);});
 render(<BookServicesContext.Provider value={{request} as unknown as BookServices}><ExpensePayment company={company} userId="owner" language="en" onChanged={()=>{}}/></BookServicesContext.Provider>);
 return {post,request,state:()=>state};
}
it('posts only the actual salary payment and tracks the remaining schedule without a second bill',async()=>{
 const f=mount();fireEvent.change(await screen.findByLabelText('Paid to'),{target:{value:id}});expect(await screen.findByText('Due: ₹20,000.00')).toBeVisible();
 fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'2000'}});fireEvent.click(screen.getByRole('button',{name:'Review & save'}));await screen.findByText('Payment saved.');
 expect(f.post).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({kind:'charge',amount:'200000',payee:'Worker',category:'Salary',method:'cash'}));expect(profileBalance(f.state(),f.state().profiles[0],'2026-11-30')).toBe(1800000n);
});
it('retries the same uncertain ordinary expense and records its amount only once',async()=>{
 const f=mount();await screen.findByRole('option',{name:'Worker · Salary'});
 fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Driver'}});fireEvent.change(screen.getByLabelText('Category'),{target:{value:'Fuel'}});fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'400'}});
 f.request.mockRejectedValueOnce(Error('network'));fireEvent.click(screen.getByRole('button',{name:'Review & save'}));fireEvent.click(await screen.findByRole('button',{name:'Retry same payment'}));await screen.findByText('Payment saved.');
 const calls=f.request.mock.calls.filter(([op])=>op==='expense-post');expect(calls).toHaveLength(2);expect(calls[0][1]).toEqual(calls[1][1]);expect(f.post).toHaveBeenCalledOnce();
});
it('requires explicit confirmation before advance and keeps cancellation write-free',async()=>{
 const f=mount();fireEvent.change(await screen.findByLabelText('Paid to'),{target:{value:id}});fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'25000'}});
 vi.mocked(window.confirm).mockReturnValue(false);fireEvent.click(screen.getByRole('button',{name:'Review & save'}));expect(f.post).not.toHaveBeenCalled();
 vi.mocked(window.confirm).mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'Review & save'}));await screen.findByText('Payment saved.');await waitFor(()=>expect(screen.getByText('Advance: ₹5,000.00')).toBeVisible());
});
it('recovers an uncertain scheduled payment using the original operation and clears a rejected command',async()=>{
 const command:ProfileCommand={company,action:'pay',operationId:crypto.randomUUID(),payment:{id:crypto.randomUUID(),profileId:id,date:'2026-11-30',amount:'200000',method:'cash'}};
 const key=`orbis.expense-profiles.pending.v1:owner:${company}`;sessionStorage.setItem(key,JSON.stringify(command));const f=mount();await screen.findByRole('option',{name:'Worker · Salary'});
 f.request.mockRejectedValueOnce(Object.assign(Error('rejected'),{code:'P0001'}));fireEvent.click(screen.getByRole('button',{name:'Retry same payment'}));await waitFor(()=>expect(sessionStorage.getItem(key)).toBeNull());expect(f.request).toHaveBeenCalledWith('expense-profiles',command);
});
it('recovers an ordinary expense and keeps corrupted recovery data from executing',async()=>{
 sessionStorage.setItem(`orbis.expense-profiles.pending.v1:owner:${company}`,'bad-json');const f=mount();await screen.findByRole('option',{name:'Worker · Salary'});expect(screen.getByRole('button',{name:'Review & save'})).toBeVisible();expect(f.post).not.toHaveBeenCalled();cleanup();sessionStorage.clear();
 const command={id:crypto.randomUUID(),company,date:'2026-11-30',kind:'charge',amount:'5000',category:'Fuel',payee:'Driver',method:'bank',parent:null,reference:'',note:''};
 sessionStorage.setItem(`khata-expense-pending-v1:owner:${company}`,JSON.stringify(command));const g=mount();await screen.findByRole('option',{name:'Worker · Salary'});fireEvent.click(screen.getByRole('button',{name:'Retry same payment'}));await screen.findByText('Payment saved.');expect(g.post).toHaveBeenCalledExactlyOnceWith(command);
});
it('retries a failed account read and supports ordinary bank payments with explicit dates',async()=>{
 let fail=true;const request=vi.fn(async(operation:string)=>{if(operation==='expense-profiles'){if(fail){fail=false;throw Error('offline');}return {profiles:[],categories:[],payments:[]};}return {};});
 render(<BookServicesContext.Provider value={{request} as unknown as BookServices}><ExpensePayment company={company} userId="owner" language="en" onChanged={()=>{}}/></BookServicesContext.Provider>);
 fireEvent.click(await screen.findByRole('button',{name:'Retry'}));await waitFor(()=>expect(screen.getByLabelText('Amount')).toBeEnabled());
 fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Driver'}});fireEvent.change(screen.getByLabelText('Category'),{target:{value:'Fuel'}});fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'400'}});fireEvent.change(screen.getByLabelText('Date'),{target:{value:'2026-11-29'}});fireEvent.change(screen.getByLabelText('Settlement'),{target:{value:'bank'}});
 fireEvent.click(screen.getByRole('button',{name:'Review & save'}));await screen.findByText('Payment saved.');expect(request).toHaveBeenCalledWith('expense-post',expect.objectContaining({method:'bank',date:'2026-11-29',amount:'40000'}));
});
it('does not post invalid dates, amounts or cancelled ordinary payments',async()=>{
 const f=mount();await screen.findByRole('option',{name:'Worker · Salary'});fireEvent.change(screen.getByLabelText('Category'),{target:{value:'Fuel'}});fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'400'}});
 fireEvent.change(screen.getByLabelText('Date'),{target:{value:'2026-12-01'}});fireEvent.submit(screen.getByLabelText('Amount').closest('form')!);expect(f.post).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Date'),{target:{value:'2026-11-30'}});fireEvent.change(screen.getByLabelText('Category'),{target:{value:' '}});fireEvent.submit(screen.getByLabelText('Amount').closest('form')!);expect(f.post).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Category'),{target:{value:'Fuel'}});vi.mocked(window.confirm).mockReturnValue(false);fireEvent.click(screen.getByRole('button',{name:'Review & save'}));expect(f.post).not.toHaveBeenCalled();
});
it.each(['resolve','reject'] as const)('ignores a late account %s after leaving the company',async outcome=>{
 let resolve!:(value:unknown)=>void,reject!:(error:Error)=>void;
 const request=vi.fn(()=>new Promise((yes,no)=>{resolve=yes;reject=no;}));
 const view=render(<BookServicesContext.Provider value={{request} as unknown as BookServices}><ExpensePayment company={company} userId="owner" language="en" onChanged={()=>{}}/></BookServicesContext.Provider>);view.unmount();
 await act(async()=>{if(outcome==='resolve')resolve({profiles:[],categories:[],payments:[]});else reject(Error('offline'));});
});
it('guards concurrent submissions and removes an ordinary recovery record after rejection',async()=>{
 const f=mount();await screen.findByRole('option',{name:'Worker · Salary'});fireEvent.change(screen.getByLabelText('Category'),{target:{value:'Fuel'}});fireEvent.change(screen.getByLabelText('Amount'),{target:{value:'400'}});
 let reject!:(error:Error)=>void;f.request.mockImplementationOnce(()=>new Promise((_yes,no)=>{reject=no;}));
 const form=screen.getByLabelText('Amount').closest('form')!;fireEvent.submit(form);fireEvent.submit(form);expect(f.request.mock.calls.filter(([op])=>op==='expense-post')).toHaveLength(1);
 await act(async()=>reject(Object.assign(Error('reject'),{code:'P0001'})));expect(sessionStorage.getItem(`khata-expense-pending-v1:owner:${company}`)).toBeNull();
});
