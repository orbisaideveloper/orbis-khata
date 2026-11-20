import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
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
