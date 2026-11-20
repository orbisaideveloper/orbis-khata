import { LotteryLanguage } from './language';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LotterySyncDetails } from './LotterySyncDetails';
import type { AccountingSellerWorkingRecord } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingLocalStore';
import type { LotteryWorkspace } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes';
const record = {key:'isolated-row',partyId:'seller',occurredAt:'2026-11-15',syncState:'ERROR'} as AccountingSellerWorkingRecord;
const workspace = {parties:[{id:'seller',name:'Synthetic seller'}]} as LotteryWorkspace;
afterEach(cleanup);
it('reveals the existing failed local party/date without deleting or retrying records',()=>{
 const before=JSON.stringify(record);
 render(<LotterySyncDetails label="Sync error" records={[record]} workspace={workspace} warning={null}/>);
 const dot=screen.getByRole('button',{name:'Accounting local sync status'});
 expect(dot).toHaveAttribute('data-sync','pending');
 expect(screen.queryByRole('region')).toBeNull();fireEvent.click(dot);
 expect(screen.getByText('Synthetic seller')).toBeInTheDocument();expect(screen.getByText(/2026-11-15 · ERROR/)).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/delete|reset|retry/i})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Close'}));expect(screen.queryByRole('region')).toBeNull();expect(JSON.stringify(record)).toBe(before);
});
it('keeps a genuinely synced indicator green and reports storage warnings without raw error details',()=>{
 const view=render(<LotterySyncDetails label="Synced" records={[]} workspace={workspace} warning={null}/>);
 expect(screen.getByRole('button',{name:'Accounting local sync status'})).toHaveAttribute('data-sync','ok');
 view.rerender(<LotterySyncDetails label="Storage warning" records={[]} workspace={workspace} warning="private-driver-error"/>);
 fireEvent.click(screen.getByRole('button',{name:'Accounting local sync status'}));
 expect(screen.getByText('Local recovery storage needs attention.')).toBeInTheDocument();expect(screen.queryByText('private-driver-error')).toBeNull();
});

it('opens a centered accessible dialog, shows only safe errors, and reviews the exact row',async()=>{
 const review=vi.fn().mockResolvedValue(true);
 render(<LotterySyncDetails label="Sync error" records={[record]} workspace={workspace} warning={null} onReview={review} readFailure={async()=> 'SELLER_DRAFT_CONFLICT'}/>);
 fireEvent.click(screen.getByRole('button',{name:'Accounting local sync status'}));
 const modal=await screen.findByRole('dialog',{name:'Local sync details'});
 expect(modal.parentElement).toBe(document.body);
 expect(await screen.findByText('SELLER_DRAFT_CONFLICT')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Close'}).textContent).toBe('×');
 fireEvent.click(screen.getByRole('button',{name:'Review entry'}));
 await waitFor(()=>expect(review).toHaveBeenCalledWith(record));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
});
it('preserves the dialog when current save blocks review and never exposes unknown raw errors',async()=>{
 render(<LotterySyncDetails label="Sync error" records={[record]} workspace={workspace} warning={null} onReview={async()=>false} readFailure={async()=> 'private payload'}/>);
 fireEvent.click(screen.getByRole('button',{name:'Accounting local sync status'}));
 fireEvent.click(screen.getByRole('button',{name:'Review entry'}));
 await screen.findByRole('status');expect(screen.getByRole('dialog')).toBeInTheDocument();expect(screen.queryByText('private payload')).toBeNull();
 fireEvent(screen.getByRole('dialog'),new Event('cancel',{bubbles:true,cancelable:true}));
 expect(screen.queryByRole('dialog')).toBeNull();
});

it.each([
 ['bn','হিসাবের সিঙ্কের অবস্থা','সিঙ্কের অবস্থা','সিঙ্কে সমস্যা','ত্রুটি'],
 ['hi','खाते की सिंक स्थिति','सिंक की स्थिति','सिंक में समस्या','त्रुटि'],
 ['en','Accounting local sync status','Sync status','Sync error','ERROR'],
] as const)('shows popup heading, summary and row state in selected language %s',(language,button,heading,summary,state)=>{
 render(<LotteryLanguage.Provider value={language}><LotterySyncDetails label="Sync error" records={[record]} workspace={workspace} warning={null}/></LotteryLanguage.Provider>);
 fireEvent.click(screen.getByRole('button',{name:button}));
 expect(screen.getByRole('heading',{name:heading})).toBeInTheDocument();
 expect(screen.getByText(summary,{selector:'.lottery-sync-summary'})).toBeInTheDocument();
 expect(screen.getByText(`2026-11-15 · ${state}`)).toBeInTheDocument();
});
