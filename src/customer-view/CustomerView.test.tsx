import { StrictMode } from 'react';
import { cleanup, act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CustomerView from './CustomerView';
import { requestKhata } from '../accounting/api';
vi.mock('../accounting/api', () => ({ requestKhata: vi.fn() }));
afterEach(cleanup);
const request = vi.mocked(requestKhata);
const incoming = { id: 'in', organization: 'Original books', party: 'Own party', partyType: 'SELLER', recipient: 'ORB-U-23456789', status: 'pending', outgoing: false };
const outgoing = { ...incoming, id: 'out', party: 'Other party', outgoing: true, status: 'accepted' };
const statement = { party: 'Own party', source: 'Original books', sourceRole: 'Stockist', direction: 'pay', from: '2026-10-01', to: '2026-10-31', opening: '-501', balance: '1000', rows: [{ id: 'payment', date: '2026-10-31', reference: 'P1', kind: 'payment', business: '0', money: '1000', balance: '1000', split: { cashPaise: '500', pwtPaise: '500' } }, { id: 'sale', date: '2026-10-31', reference: 'S1', kind: 'POSTED', business: '2000', money: '0', quantity: '4', returned: '1',netQuantity:'3',gross:'2000', rate: '500', commission: '50', tds: '5', balance: '1000' }], total: 101, next: 100 };
let links: unknown[];
beforeEach(() => {
    links = [];
    request.mockReset().mockImplementation(async (_op, input) => {
        const command = input as {
            action: string;
            id: string;
        };
        if (command.action === 'list')
            return links;
        if (command.action === 'choices')
            return [{ organizationId: 'org', organization: 'Original books', partyId: 'party', party: 'Own party', partyType: 'SELLER' }];
        if (command.action === 'statement')
            return statement;
        return { saved: true };
    });
});
function mount(language: 'en' | 'bn' | 'hi' = 'en') { const onBack = vi.fn(), onBooks = vi.fn(); render(<CustomerView language={language} onBack={onBack} onBooks={onBooks}/>); return { onBack, onBooks }; }
it('opens a lightweight view without any full workspace request and keeps own books separate', async () => { const { onBack, onBooks } = mount(); await screen.findByText(/No links/); expect(request).toHaveBeenCalledExactlyOnceWith('party-sharing', { action: 'list' }); fireEvent.click(screen.getByRole('button', { name: 'Back' })); fireEvent.click(screen.getByRole('button', { name: 'My Lottery books' })); expect(onBack).toHaveBeenCalledOnce(); expect(onBooks).toHaveBeenCalledOnce(); });
it('accepts invitations, shows read-only statements and paginates without edit/payment actions', async () => { links = [incoming, outgoing]; mount(); fireEvent.click(await screen.findByRole('button', { name: 'Accept' })); await waitFor(() => expect(request).toHaveBeenCalledWith('party-sharing', { action: 'accept', id: 'in' })); links = [{ ...incoming, status: 'accepted' }, outgoing]; fireEvent.click(screen.getByRole('button', { name: 'Refresh' })); fireEvent.click(await screen.findByRole('button', { name: 'View statement' })); await screen.findByRole('table'); expect(screen.getByText('−₹5.01')).toBeVisible(); expect(screen.getByText(/Original books · Stockist/)).toBeVisible(); expect(screen.queryByRole('button', { name: /Pay ₹|Save|Edit/ })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Next page' })); await waitFor(() => expect(request).toHaveBeenCalledWith('party-sharing', expect.objectContaining({ action: 'statement', id: 'in', offset: 100 }))); fireEvent.click(screen.getByRole('button', { name: 'Previous page' })); await waitFor(() => expect(request).toHaveBeenLastCalledWith('party-sharing', expect.objectContaining({ offset: 0 }))); });
it('requires confirmation for revoke and removes stale statement on access error', async () => { links = [{ ...incoming, status: 'accepted' }, outgoing]; mount(); fireEvent.click(await screen.findByRole('button', { name: 'Remove link' })); const dialog = screen.getByRole('alertdialog'); fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' })); expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Remove link' })); fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove link' })); await waitFor(() => expect(request).toHaveBeenCalledWith('party-sharing', { action: 'decline', id: 'in' })); fireEvent.click(screen.getByRole('button', { name: 'View statement' })); await screen.findByRole('table'); request.mockRejectedValueOnce(new Error('revoked')); fireEvent.click(screen.getByRole('button', { name: 'Show' })); await screen.findByRole('alert'); expect(screen.queryByRole('table')).not.toBeInTheDocument(); });
it('declines an invitation and supports Bengali/Hindi labels', async () => { links = [incoming]; mount('bn'); fireEvent.click(await screen.findByRole('button', { name: 'বাদ দিন' })); await waitFor(() => expect(request).toHaveBeenCalledWith('party-sharing', { action: 'decline', id: 'in' })); expect(screen.getByRole('heading', { name: 'গ্রাহক ভিউ' })).toBeVisible(); });
it('does not submit twice while a request is pending or retain a response after unmount', async () => { let resolve!: (value: unknown) => void; request.mockReturnValueOnce(new Promise(done => { resolve = done; })); const result = render(<CustomerView language="hi" onBack={() => { }} onBooks={() => { }}/>); expect(screen.getByRole('button', { name: 'रीफ़्रेश' })).toBeDisabled(); result.unmount(); await act(async () => resolve([])); expect(request).toHaveBeenCalledTimes(1); });
it('loads correctly under React StrictMode effect replay', async () => { render(<StrictMode><CustomerView language="en" onBack={() => { }} onBooks={() => { }}/></StrictMode>); await screen.findByText(/No links/); expect(screen.queryByRole('status')).not.toBeInTheDocument(); });

it('shows only incoming personal statements and keeps owner management out of Customer view',async()=>{links=[incoming,outgoing];mount();await screen.findByText('Original books · Own party');expect(screen.queryByText(/Other party/)).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Link account'})).not.toBeInTheDocument();expect(screen.queryByRole('heading',{name:'Accounts you shared'})).not.toBeInTheDocument();});

it('refreshes the open statement from saved source data and returns to page one without changing dates',async()=>{
 links=[{...incoming,status:'accepted'}];mount();fireEvent.click(await screen.findByRole('button',{name:'View statement'}));await screen.findByRole('table');
 const initial=request.mock.calls.find(([,input])=>(input as {action:string}).action==='statement')![1];
 fireEvent.click(screen.getByRole('button',{name:'Next page'}));await waitFor(()=>expect(request).toHaveBeenLastCalledWith('party-sharing',expect.objectContaining({offset:100})));
 const updated=structuredClone(statement);updated.balance='123456';updated.rows[0].money='2500';request.mockImplementation(async(_op,input)=>(input as {action:string}).action==='list'?links:updated);
 fireEvent.click(screen.getByRole('button',{name:'Refresh'}));await screen.findByText('₹25.00');expect(request).toHaveBeenLastCalledWith('party-sharing',{...initial as object,offset:0});expect(screen.getByText('₹1,234.56')).toBeVisible();expect(screen.getByRole('button',{name:'Previous page'})).toBeDisabled();expect(screen.getByText(/Last checked:/)).toBeVisible();
});
it('includes the previous month by default and supports explicit monthly and custom periods',async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
 try{links=[{...incoming,status:'accepted'}];mount();fireEvent.click(await screen.findByRole('button',{name:'View statement'}));await screen.findByRole('table');
 expect(request).toHaveBeenLastCalledWith('party-sharing',{action:'statement',id:'in',from:'2026-10-04',to:'2026-11-02',offset:0});
 for(const [label,from,to] of [['This month','2026-11-01','2026-11-02'],['Previous month','2026-10-01','2026-10-31'],['Last 30 days','2026-10-04','2026-11-02']]){
 fireEvent.click(screen.getByRole('button',{name:label}));expect(screen.queryByRole('table')).not.toBeInTheDocument();expect(screen.queryByText(/Last checked:/)).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Show'}));await screen.findByRole('table');expect(request).toHaveBeenLastCalledWith('party-sharing',expect.objectContaining({from,to}));}
 fireEvent.change(screen.getByLabelText('From'),{target:{value:'2026-10-30'}});fireEvent.change(screen.getByLabelText('To'),{target:{value:'2026-11-01'}});fireEvent.click(screen.getByRole('button',{name:'Show'}));await screen.findByRole('table');expect(request).toHaveBeenLastCalledWith('party-sharing',expect.objectContaining({from:'2026-10-30',to:'2026-11-01'}));
 }finally{vi.useRealTimers();}
});
it('removes a revoked statement on refresh without requesting its financial data',async()=>{
 links=[{...incoming,status:'accepted'}];mount();fireEvent.click(await screen.findByRole('button',{name:'View statement'}));await screen.findByRole('table');links=[{...incoming,status:'revoked'}];request.mockClear();fireEvent.click(screen.getByRole('button',{name:'Refresh'}));await screen.findByText(/Closed/);expect(screen.queryByRole('table')).not.toBeInTheDocument();expect(request).toHaveBeenCalledExactlyOnceWith('party-sharing',{action:'list'});
});
it('returns to account selection before leaving Customer view',async()=>{
 links=[{...incoming,status:'accepted'}];const {onBack}=mount();fireEvent.click(await screen.findByRole('button',{name:'View statement'}));await screen.findByRole('table');fireEvent.click(screen.getByRole('button',{name:'Back'}));expect(screen.queryByRole('table')).not.toBeInTheDocument();expect(onBack).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'View statement'})).toBeVisible();
});
it('hides stale balances and checked time after a failed refresh',async()=>{
 links=[{...incoming,status:'accepted'}];mount();fireEvent.click(await screen.findByRole('button',{name:'View statement'}));await screen.findByRole('table');request.mockImplementation(async(_op,input)=>{if((input as {action:string}).action==='list')return links;throw new Error('offline');});fireEvent.click(screen.getByRole('button',{name:'Refresh'}));await screen.findByRole('alert');expect(screen.queryByRole('table')).not.toBeInTheDocument();expect(screen.queryByText(/Last checked:/)).not.toBeInTheDocument();
});
it('does not fetch financial data after unmount during a refresh',async()=>{
 links=[{...incoming,status:'accepted'}];mount();fireEvent.click(await screen.findByRole('button',{name:'View statement'}));await screen.findByRole('table');let resolve!:(value:unknown)=>void;request.mockReturnValueOnce(new Promise(done=>{resolve=done;}));request.mockClear();fireEvent.click(screen.getByRole('button',{name:'Refresh'}));expect(screen.getByRole('button',{name:'Refresh'})).toBeDisabled();cleanup();await act(async()=>resolve(links));expect(request).toHaveBeenCalledExactlyOnceWith('party-sharing',{action:'list'});
});
