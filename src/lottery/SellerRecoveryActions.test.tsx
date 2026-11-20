import { LotteryLanguage } from './language';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SellerRecoveryActions } from './SellerRecoveryActions';
import type { AccountingSellerWorkingRecord } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingLocalStore';
const record={partyId:'synthetic',occurredAt:'2026-11-16',row:{dispatchQuantity:'10',morningReturnQuantity:'1',dayReturnQuantity:'0',eveningReturnQuantity:'0',commissionRupees:'2'}} as AccountingSellerWorkingRecord;
afterEach(cleanup);
it('shows pending values and retries only after the explicit button press',async()=>{
 const recover=vi.fn().mockResolvedValue('confirmed'),complete=vi.fn();
 render(<SellerRecoveryActions record={record} recover={recover} onComplete={complete}/>);
 expect(screen.getByText('₹2')).toBeInTheDocument();expect(recover).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Retry save'}));await waitFor(()=>expect(recover).toHaveBeenCalledWith(record,'retry'));expect(complete).toHaveBeenCalledWith('confirmed');
});
it('requires explicit confirmation before discarding a local change and preserves it on failure',async()=>{
 const recover=vi.fn().mockRejectedValue(Error('RECOVERY_LOCAL_CHANGED'));
 render(<SellerRecoveryActions record={record} recover={recover} onComplete={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Discard pending changes'}));expect(recover).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(recover).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Discard pending changes'}));fireEvent.click(screen.getByRole('button',{name:'Confirm discard'}));
 await screen.findByRole('status');expect(recover).toHaveBeenCalledWith(record,'discard');
});

it('shows the server values when safe retry detects a different version',async()=>{
 const {SellerRecoveryConflict}=await import('./seller-recovery');
 const conflict=new SellerRecoveryConflict({dispatchQuantity:15,morningReturnQuantity:2,dayReturnQuantity:1,eveningReturnQuantity:0,commissionPaise:'300'});
 render(<SellerRecoveryActions record={record} recover={async()=>{throw conflict}} onComplete={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Retry save'}));
 await screen.findByText('Saved on server');expect(screen.getByText('Dispatch: 15')).toBeInTheDocument();expect(screen.getByText('Returns: 2 / 1 / 0')).toBeInTheDocument();
});
it('prevents repeat clicks during confirmation and completes a confirmed local discard',async()=>{
 let finish:(value:'discarded')=>void=()=>undefined;
 const recover=vi.fn(()=>new Promise<'discarded'>(resolve=>{finish=resolve}));const completed=vi.fn();
 render(<SellerRecoveryActions record={record} recover={recover} onComplete={completed}/>);
 fireEvent.click(screen.getByRole('button',{name:'Discard pending changes'}));fireEvent.click(screen.getByRole('button',{name:'Confirm discard'}));
 expect(screen.getByRole('button',{name:'Retry save'})).toBeDisabled();expect(recover).toHaveBeenCalledOnce();
 finish('discarded');await waitFor(()=>expect(completed).toHaveBeenCalledWith('discarded'));
});

it('compares the correct server day with a wrongly linked old bill before confirming phone values',async()=>{
 const target={id:'new',partyId:'synthetic',reference:'DAY16',occurredAt:'2026-11-16',status:'DRAFT',syncVersion:4,dispatchQuantity:10,morningReturnQuantity:1,dayReturnQuantity:0,eveningReturnQuantity:0,commissionPaise:'0'};
 const snapshot={organization:{id:'org',userLedgerStorage:'CLOUD'},partyId:'synthetic',occurredAt:'2026-11-16',draftSales:[target],sales:[],referencedSale:{...target,id:'old',reference:'DAY15',occurredAt:'2026-11-15'}};
 const recover=vi.fn().mockResolvedValue('confirmed');
 render(<SellerRecoveryActions record={record} inspect={async()=>snapshot} recover={recover} onComplete={vi.fn()}/>);
 await screen.findByText('Phone and server comparison');
 expect(screen.getByRole('table')).toHaveTextContent('DAY16');expect(screen.getByText(/DAY15 · 2026-11-15/)).toBeInTheDocument();
 expect(recover).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Keep phone values'}));expect(recover).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Confirm phone values'}));
 await waitFor(()=>expect(recover).toHaveBeenCalledWith(record,'keep-local',target));
});

it('reports a busy autosave distinctly and never exposes an arbitrary backend error',async()=>{
 const recover=vi.fn().mockRejectedValueOnce(Error('RECOVERY_BUSY')).mockRejectedValueOnce(Error('private SQL token'));
 render(<SellerRecoveryActions record={record} recover={recover} onComplete={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Retry save'}));await screen.findByText('Autosave is running. Wait for it to finish, then retry.');
 fireEvent.click(screen.getByRole('button',{name:'Retry save'}));await screen.findByText(/Save was not confirmed/);expect(screen.queryByText('private SQL token')).not.toBeInTheDocument();
});

it.each([
 ['bn','আবার সেভ করুন','অপেক্ষমান পরিবর্তন বাদ দিন','অটোসেভ চলছে। শেষ হলে আবার চেষ্টা করুন।'],
 ['hi','फिर सेव करें','स्थानीय बदलाव हटाएँ','ऑटोसेव जारी है। पूरा होने पर फिर करें।'],
 ['en','Retry save','Discard pending changes','Autosave is running. Wait for it to finish, then retry.'],
] as const)('renders recovery controls and failures in selected language %s',async(language,retry,discard,message)=>{
 render(<LotteryLanguage.Provider value={language}><SellerRecoveryActions record={record} recover={async()=>{throw Error('RECOVERY_BUSY')}} onComplete={vi.fn()}/></LotteryLanguage.Provider>);
 expect(screen.getByRole('button',{name:discard})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:retry}));await screen.findByText(message);
});
