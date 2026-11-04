import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {recentPartyBill,PartyActivity} from './PartyActivity';
import {BookServicesContext,type BookServices} from '../books-services';
afterEach(cleanup);
it('loads only on request, walks past payment-only pages and scopes every request',async()=>{
 const request=vi.fn(async(_operation,input)=>({count:51,entries:input.offset?[{id:'bill',kind:'sale',effective_date:'2026-10-01',reference:'S1',amount_minor:'20000'},{id:'older',kind:'purchase',effective_date:'2026-09-01',reference:'P1',amount_minor:'10000'}]:[{kind:'payment',effective_date:'2026-11-01'}]}));
 render(<BookServicesContext.Provider value={{request} as unknown as BookServices}><PartyActivity company="c" id="p" language="en"/></BookServicesContext.Provider>);
 expect(request).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Recent bills'}));expect(await screen.findByText(/S1/)).toHaveTextContent('₹200.00');expect(request).toHaveBeenCalledTimes(2);expect(request.mock.calls.every(([,p])=>p.company==='c'&&p.party==='p')).toBe(true);
});
it('returns no bill after exhausting history and reports read failures',async()=>{
 expect(await recentPartyBill(vi.fn(async()=>({count:0,entries:[]})) as never,'c','p')).toBeNull();
 const request=vi.fn().mockRejectedValue(Error('offline'));render(<BookServicesContext.Provider value={{request} as unknown as BookServices}><PartyActivity company="c" id="p" language="en"/></BookServicesContext.Provider>);fireEvent.click(screen.getByRole('button',{name:'Recent bills'}));expect(await screen.findByText('Could not read. Retry.')).toBeVisible();
});
it('explicitly identifies a party with no active sales or purchase bills',async()=>{
 const request=vi.fn(async()=>({count:0,entries:[]}));render(<BookServicesContext.Provider value={{request} as unknown as BookServices}><PartyActivity company="c" id="p" language="en"/></BookServicesContext.Provider>);fireEvent.click(screen.getByRole('button',{name:'Recent bills'}));expect(await screen.findByText('No active sales/purchase bills.')).toBeVisible();
});
