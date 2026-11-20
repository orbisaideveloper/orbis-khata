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
