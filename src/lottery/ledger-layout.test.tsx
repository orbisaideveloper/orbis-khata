import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LotteryAccountingWorkspace } from '../../vendor/foundation-lottery/src/admin/dashboard/sections/LotteryAccountingWorkspace';
import type { LotteryAccountingClient } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingClient';
import { runLottery } from './service';
import { accountingToday } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingBusinessDate';
afterEach(()=>{cleanup();sessionStorage.clear();vi.useRealTimers();});
it.each([['2026-11-20T18:29:59Z','2026-11-20'],['2026-11-20T18:30:01Z','2026-11-21']])('keeps dated financial rows without duplicate day headings across IST midnight (%s)',async(now,day)=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(now));expect(accountingToday()).toBe(day);
 let state:unknown={};const owner='11111111-1111-7111-8111-111111111111';
 async function execute(method:string,payload:Record<string,unknown>={}){const next=await runLottery(state,{method,payload,operationId:crypto.randomUUID()},owner);state=next.state;return next.result;}
 const org=await execute('createOrganization',{name:'Synthetic ledger'});
 const party=await execute('createParty',{organizationId:org.id,name:'Synthetic seller',partyType:'SELLER',ticketRatePaise:'1000'});
 await execute('recordPayment',{organizationId:org.id,partyId:party.id,direction:'RECEIPT',occurredAt:accountingToday(),totalAmountPaise:'60000',methodSplit:{cashPaise:'60000'}});
 const api={listOrganizations:()=>execute('listOrganizations'),loadWorkspace:(organizationId:string)=>execute('getWorkspace',{organizationId})} as unknown as LotteryAccountingClient;
 const {container}=render(<LotteryAccountingWorkspace api={api} localStore={null} localScope={{ownerKind:'PUBLIC_USER',ownerId:owner}}/>);
 await screen.findByText('Synthetic ledger');
 fireEvent.click(screen.getByRole('button',{name:'Ledger'}));
 await screen.findByText('Universal Ledger Hub');
 expect(container.querySelector('[data-testid="ledger-date-group"]')).toBeNull();expect(screen.queryByText(/Open day/)).toBeNull();
 const table=screen.getAllByRole('table')[0];expect(within(table).getAllByText(/600\.00/).length).toBeGreaterThan(0);
 expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
});
