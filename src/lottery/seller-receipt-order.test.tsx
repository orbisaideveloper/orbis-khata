import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DailySellerEntry, sellerRecoveryFallbackToken, resolveSellerRecoveryFallback } from '../../vendor/foundation-lottery/src/admin/dashboard/sections/DailySellerEntry'
import type { LotteryWorkspace } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes'

afterEach(() => { cleanup(); localStorage.clear() })

it('records payment against an unchanged saved seller row without updating that draft again', async () => {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const party = { id: 'seller', name: 'Synthetic seller', partyType: 'SELLER', ticketRatePaise: '100' }
  const draft = { id: 'sale', partyId: party.id, occurredAt: day, status: 'DRAFT', syncVersion: 2, reference: 'TEST',
    dispatchQuantity: '10', morningReturnQuantity: '0', dayReturnQuantity: '0', eveningReturnQuantity: '0', commissionPaise: '0', partyPayablePaise: '1000' }
  const workspace = { organization: { id: 'org', tdsRateBps: 0, userLedgerStorage: 'CLOUD' }, parties: [party],
    draftSales: [draft], sales: [], payments: [], stockistEntries: [], periods: [] } as unknown as LotteryWorkspace
  const update = vi.fn().mockRejectedValue(new Error('SELLER_DRAFT_CONFLICT'))
  const pay = vi.fn().mockResolvedValue(undefined)
  render(<DailySellerEntry organizationId="org" workspace={workspace} localStore={null} localScope={{ ownerKind: 'PUBLIC_USER', ownerId: 'test-owner' }}
    onSaveDraft={vi.fn()} onUpdateDraft={update} onDeleteDraft={vi.fn()} onCorrectPosted={vi.fn()}
    onUpdateTdsRate={vi.fn()} onSavePayment={pay}/>)
  fireEvent.change(screen.getByLabelText('Receipt Cash'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }))
  await waitFor(() => expect(pay).toHaveBeenCalledOnce(), { timeout: 500 })
  expect(update).not.toHaveBeenCalled()
})

it('retains the original fallback recovery copy and rejects marking a newer fallback as resolved',()=>{
 const key='orbis.khata.lottery.pending-seller-row.org.seller.2026-11-16';
 localStorage.setItem(key,'old pending copy');const token=sellerRecoveryFallbackToken('org','seller','2026-11-16');
 resolveSellerRecoveryFallback('org','seller','2026-11-16',token);expect(localStorage.getItem(key)).toBe('old pending copy');expect(localStorage.getItem(key+':resolved')).toBe(token);
 localStorage.setItem(key,'newer edit');expect(()=>resolveSellerRecoveryFallback('org','seller','2026-11-16',token)).toThrow('RECOVERY_LOCAL_CHANGED');expect(localStorage.getItem(key)).toBe('newer edit');
});

it('does not attach a previous day save acknowledgement to the newly opened day', async () => {
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
 const other='2026-11-15';
 const party={id:'seller',name:'Synthetic seller',partyType:'SELLER',ticketRatePaise:'100'};
 const draft=(id:string,day:string)=>({id,partyId:'seller',occurredAt:day,status:'DRAFT',syncVersion:2,reference:id,dispatchQuantity:10,morningReturnQuantity:0,dayReturnQuantity:0,eveningReturnQuantity:0,commissionPaise:'0',partyPayablePaise:'1000'});
 const workspace={organization:{id:'org',tdsRateBps:0,userLedgerStorage:'CLOUD'},parties:[party],draftSales:[draft('TODAY-BILL',today),draft('OTHER-BILL',other)],sales:[],payments:[],stockistEntries:[],periods:[]} as unknown as LotteryWorkspace;
 let resolveSave:(value:unknown)=>void=()=>undefined;
 const update=vi.fn(()=>new Promise(resolve=>{resolveSave=resolve}));
 render(<DailySellerEntry organizationId="org" workspace={workspace} localStore={null} localScope={{ownerKind:'PUBLIC_USER',ownerId:'test-owner'}} onSaveDraft={vi.fn()} onUpdateDraft={update as never} onDeleteDraft={vi.fn()} onCorrectPosted={vi.fn()} onUpdateTdsRate={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Synthetic seller dispatch'),{target:{value:'12'}});
 fireEvent.click(screen.getByRole('button',{name:'Save row'}));
 await waitFor(()=>expect(update).toHaveBeenCalled());
 fireEvent.change(screen.getByLabelText('Entry date for all sellers'),{target:{value:other}});
 await screen.findByText('OTHER-BILL');
 await act(async()=>{resolveSave({id:'TODAY-BILL',reference:'TODAY-BILL',status:'DRAFT',syncVersion:3});});
 await waitFor(()=>expect(screen.queryByText('TODAY-BILL')).not.toBeInTheDocument());
 expect(screen.getByText('OTHER-BILL')).toBeInTheDocument();
});

it('reloads resolved bill values without clearing a manually typed, unsent receipt',async()=>{
 const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
 const party={id:'seller',name:'Synthetic seller',partyType:'SELLER',ticketRatePaise:'100'};
 const draft={id:'correct-bill',reference:'SERVER-BILL',partyId:'seller',occurredAt:day,status:'DRAFT',syncVersion:2,dispatchQuantity:10,morningReturnQuantity:0,dayReturnQuantity:0,eveningReturnQuantity:0,commissionPaise:'0'};
 const workspace={organization:{id:'org',tdsRateBps:0,userLedgerStorage:'CLOUD'},parties:[party],draftSales:[draft],sales:[],payments:[],stockistEntries:[],periods:[]} as unknown as LotteryWorkspace;
 const props={organizationId:'org',workspace,localStore:null,onSaveDraft:vi.fn(),onUpdateDraft:vi.fn(),onDeleteDraft:vi.fn(),onCorrectPosted:vi.fn(),onUpdateTdsRate:vi.fn(),onSavePayment:vi.fn()};
 const view=render(<DailySellerEntry {...props} recoveryEpoch={0}/>);
 fireEvent.change(screen.getByLabelText('Receipt Cash'),{target:{value:'25'}});
 view.rerender(<DailySellerEntry {...props} workspace={{...workspace,draftSales:[{...draft,reference:'UPDATED-SERVER-BILL'}]} as unknown as LotteryWorkspace} recoveryEpoch={1}/>);
 await screen.findByText('UPDATED-SERVER-BILL');expect(screen.getByLabelText('Receipt Cash')).toHaveValue('25');expect(props.onSavePayment).not.toHaveBeenCalled();
});

it('retains newer same-day edits while carrying the first save identity into the next update',async()=>{
 const party={id:'seller',name:'Synthetic seller',partyType:'SELLER',ticketRatePaise:'100'};
 const workspace={organization:{id:'org',tdsRateBps:0,userLedgerStorage:'CLOUD'},parties:[party],draftSales:[],sales:[],payments:[],stockistEntries:[],periods:[]} as unknown as LotteryWorkspace;
 let finish:(value:unknown)=>void=()=>undefined;
 const create=vi.fn(()=>new Promise(resolve=>{finish=resolve}));
 const update=vi.fn().mockResolvedValue({id:'CREATED',reference:'CREATED',status:'DRAFT',syncVersion:2});
 render(<DailySellerEntry organizationId="org" workspace={workspace} localStore={null} onSaveDraft={create as never} onUpdateDraft={update} onDeleteDraft={vi.fn()} onCorrectPosted={vi.fn()} onUpdateTdsRate={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Synthetic seller dispatch'),{target:{value:'10'}});
 fireEvent.click(screen.getByRole('button',{name:'Save row'}));await waitFor(()=>expect(create).toHaveBeenCalledOnce());
 fireEvent.change(screen.getByLabelText('Synthetic seller dispatch'),{target:{value:'12'}});
 await act(async()=>{finish({id:'CREATED',reference:'CREATED',status:'DRAFT',syncVersion:1});});
 await screen.findByText('CREATED');expect(screen.getByLabelText('Synthetic seller dispatch')).toHaveValue('12');
 fireEvent.click(screen.getByRole('button',{name:'Save row'}));
 await waitFor(()=>expect(update).toHaveBeenCalledWith('CREATED',expect.objectContaining({dispatchQuantity:'12',expectedVersion:1})));
 expect(create).toHaveBeenCalledOnce();
});
