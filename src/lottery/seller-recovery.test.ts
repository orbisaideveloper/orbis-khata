import { readOnlineLotteryExport } from '../accounting/api';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { recoverSellerEntry, readSellerRecoveryWorkspace } from './seller-recovery';
import { runLottery } from './service';
import type { LotteryWorkspace } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes';
import type { LotteryAccountingClient } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingClient';

vi.mock('../accounting/api',()=>({readOnlineLotteryExport:vi.fn()}));
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
const actor='11111111-1111-7111-8111-111111111111';
beforeEach(()=>{vi.resetModules();vi.stubGlobal('indexedDB',new IDBFactory());});
async function fixture(){
 let state:unknown={};
 async function run(method:string,payload:Record<string,unknown>={}){const answer=await runLottery(state,{method,payload,operationId:crypto.randomUUID()},actor);state=answer.state;return answer.result;}
 const org=await run('createOrganization',{name:'Synthetic recovery'});
 const party=await run('createParty',{organizationId:org.id,name:'Synthetic seller',partyType:'SELLER',ticketRatePaise:'1000'});
 const scope={ownerKind:'PUBLIC_USER' as const,ownerId:actor,organizationId:org.id};
 const {getLotteryAccountingLocalStore}=await import('../../vendor/foundation-lottery/src/admin/models/lotteryAccountingLocalStore');
 const store=getLotteryAccountingLocalStore()!;
 const row={partyId:party.id,dispatchQuantity:'10',morningReturnQuantity:'1',dayReturnQuantity:'0',eveningReturnQuantity:'0',commissionRupees:'2'};
 await store.stageSellerRow(scope,'2026-11-16',row);await store.markSellerRowSyncError!(scope,'2026-11-16',row,'SELLER DRAFT CONFLICT');
 const record=(await store.listSellerRows(scope))[0];
 const api={saveDailySellerDraft:vi.fn(async payload=>(await run('createDailySellerDraft',payload)).sale),updateDailySellerDraft:vi.fn(async (id,payload)=>(await run('updateDailySellerDraft',{...payload,saleId:id})).sale)} as unknown as LotteryAccountingClient;
 const read=()=>run('getWorkspace',{organizationId:org.id}) as Promise<LotteryWorkspace>;
 return {store,scope,row,record,api,read,run,getState:()=>state,context:{store,scope,api,read,active:()=>true}};
}
it('retries the original operation once, verifies server readback and retains a recovery copy',async()=>{
 const f=await fixture();const op=await f.store.getSellerSyncOperation!(f.scope,f.record.occurredAt,f.record.partyId);
 await expect(recoverSellerEntry(f.context,f.record,'retry')).resolves.toBe('confirmed');
 expect(f.api.saveDailySellerDraft).toHaveBeenCalledWith(expect.objectContaining({operationId:op!.operationId,expectedVersion:0}));
 expect((await f.read()).draftSales).toHaveLength(1);
 expect(await f.store.listSellerRows(f.scope)).toEqual([]);expect(await f.store.listPendingOutbox(f.scope)).toEqual([]);
 expect(await f.store.listSellerRecoveryCopies!(f.scope)).toHaveLength(1);
 await expect(recoverSellerEntry(f.context,f.record,'retry')).rejects.toThrow('RECOVERY_LOCAL_CHANGED');
 expect(f.api.saveDailySellerDraft).toHaveBeenCalledOnce();
});
it('acknowledges an already saved identical draft without posting again',async()=>{
 const f=await fixture();const operation=await f.store.getSellerSyncOperation!(f.scope,f.record.occurredAt,f.record.partyId);
 await f.run('createDailySellerDraft',{organizationId:f.scope.organizationId,partyId:f.row.partyId,occurredAt:'2026-11-16',dispatchQuantity:'10',morningReturnQuantity:'1',dayReturnQuantity:'0',eveningReturnQuantity:'0',commissionPaise:'200',operationId:operation!.operationId,expectedVersion:0});
 const before=await f.read();await recoverSellerEntry(f.context,f.record,'retry');
 expect(f.api.saveDailySellerDraft).not.toHaveBeenCalled();expect(await f.read()).toEqual(before);
});
it('discards only the selected local change and archives it, preserving server accounting and other owner/company rows',async()=>{
 const f=await fixture();const other={...f.scope,organizationId:'other-company'};await f.store.stageSellerRow(other,'2026-11-16',f.row);
 const foreign={...f.scope,ownerId:'other-owner'};await f.store.stageSellerRow(foreign,'2026-11-16',f.row);
 await f.run('recordStockMovement',{organizationId:f.scope.organizationId,type:'RECEIPT',quantity:100});
 await f.run('recordSale',{organizationId:f.scope.organizationId,partyId:f.row.partyId,occurredAt:'2026-11-16',dispatchQuantity:'15',morningReturnQuantity:'0',dayReturnQuantity:'0',eveningReturnQuantity:'0',commissionPaise:'0'});
 await f.run('recordPayment',{organizationId:f.scope.organizationId,partyId:f.row.partyId,occurredAt:'2026-11-16',direction:'RECEIPT',totalAmountPaise:'6000',methodSplit:{cashPaise:'6000'}});
 const before=await f.read();expect(before.payments).toHaveLength(1);expect(before.ledgerEntries.length).toBeGreaterThan(0);
 await recoverSellerEntry(f.context,f.record,'discard');
 expect(await f.read()).toEqual(before);expect(await f.store.listSellerRows(other)).toHaveLength(1);expect(await f.store.listSellerRows(foreign)).toHaveLength(1);
 expect(await f.store.listSellerRecoveryCopies!(f.scope)).toHaveLength(1);expect(f.api.saveDailySellerDraft).not.toHaveBeenCalled();
});
it('preserves local data on offline read, switched actor or newer local edits',async()=>{
 const f=await fixture();await expect(recoverSellerEntry({...f.context,read:async()=>{throw Error('offline')}},f.record,'discard')).rejects.toThrow('offline');
 await expect(recoverSellerEntry({...f.context,active:()=>false},f.record,'retry')).rejects.toThrow('RECOVERY_SCOPE_INVALID');
 const changedRead=async()=>{await f.store.stageSellerRow(f.scope,f.record.occurredAt,{...f.row,dispatchQuantity:'12'});return f.read();};
 await expect(recoverSellerEntry({...f.context,read:changedRead},f.record,'discard')).rejects.toThrow('RECOVERY_LOCAL_CHANGED');
 expect((await f.store.listSellerRows(f.scope))[0].row.dispatchQuantity).toBe('12');expect(await f.store.listPendingOutbox(f.scope)).toHaveLength(1);
});
it('does not silently replace a different server entry',async()=>{
 const f=await fixture();await f.run('createDailySellerDraft',{organizationId:f.scope.organizationId,partyId:f.row.partyId,occurredAt:'2026-11-16',dispatchQuantity:'15',morningReturnQuantity:'0',dayReturnQuantity:'0',eveningReturnQuantity:'0',commissionPaise:'0'});
 const before=await f.read();await expect(recoverSellerEntry(f.context,f.record,'retry')).rejects.toThrow('RECOVERY_SERVER_DIFFERS');
 expect(await f.read()).toEqual(before);expect(await f.store.listSellerRows(f.scope)).toHaveLength(1);expect(f.api.updateDailySellerDraft).not.toHaveBeenCalled();
});

it('rolls back local resolution if recovery-copy storage fails',async()=>{
 const f=await fixture();const outbox=await f.store.getSellerSyncOperation!(f.scope,f.record.occurredAt,f.record.partyId);
 const original=IDBObjectStore.prototype.put;
 vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,value,...rest){
   if(value?.entityType==='SELLER_RECOVERY')throw Error('copy write failed');
   return original.call(this,value,...rest);
 });
 await expect(f.store.resolveSellerRecovery!(f.scope,f.record,outbox,'discarded')).rejects.toThrow('copy write failed');
 expect(await f.store.listSellerRows(f.scope)).toEqual([f.record]);expect(await f.store.listPendingOutbox(f.scope)).toHaveLength(1);expect(await f.store.listSellerRecoveryCopies!(f.scope)).toEqual([]);
});
it('loads a verified read-only owner export and refuses a mismatched export actor',async()=>{
 const f=await fixture();const state=f.getState();const before=JSON.stringify(state);
 vi.mocked(readOnlineLotteryExport).mockResolvedValue({actor,version:1,state});
 expect((await readSellerRecoveryWorkspace(actor,f.scope.organizationId)).organization.id).toBe(f.scope.organizationId);expect(JSON.stringify(state)).toBe(before);
 vi.mocked(readOnlineLotteryExport).mockResolvedValue({actor:'other',version:1,state});
 await expect(readSellerRecoveryWorkspace(actor,f.scope.organizationId)).rejects.toThrow('RECOVERY_SCOPE_INVALID');
});
it('keeps the outbox after an uncertain server acknowledgement and safely confirms on the next retry',async()=>{
 const f=await fixture();let count=0;
 const read=async()=>{count++;if(count===2)throw Error('confirmation offline');return f.read();};
 await expect(recoverSellerEntry({...f.context,read},f.record,'retry')).rejects.toThrow('confirmation offline');
 expect(await f.store.listPendingOutbox(f.scope)).toHaveLength(1);
 await recoverSellerEntry(f.context,f.record,'retry');expect(f.api.saveDailySellerDraft).toHaveBeenCalledOnce();expect((await f.read()).draftSales).toHaveLength(1);
});

it('atomically rejects a competing recovery from a second browser connection',async()=>{
 const f=await fixture();const operation=await f.store.getSellerSyncOperation!(f.scope,f.record.occurredAt,f.record.partyId);
 vi.resetModules();const {getLotteryAccountingLocalStore}=await import('../../vendor/foundation-lottery/src/admin/models/lotteryAccountingLocalStore');
 const second=getLotteryAccountingLocalStore()!;
 const results=await Promise.allSettled([
  f.store.resolveSellerRecovery!(f.scope,f.record,operation,'discarded'),
  second.resolveSellerRecovery!(f.scope,f.record,operation,'discarded'),
 ]);
 expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
 expect(results.filter(result=>result.status==='rejected')).toHaveLength(1);
 expect(await f.store.listSellerRecoveryCopies!(f.scope)).toHaveLength(1);
});

it('updates a genuinely unsent edit using its original draft ID and expected revision',async()=>{
 const f=await fixture();const sale=await f.run('createDailySellerDraft',{organizationId:f.scope.organizationId,partyId:f.row.partyId,occurredAt:'2026-11-16',dispatchQuantity:'10',morningReturnQuantity:'1',dayReturnQuantity:'0',eveningReturnQuantity:'0',commissionPaise:'200'});
 const saved=sale.sale;
 const edited={...f.row,saleId:saved.id,status:'DRAFT' as const,syncVersion:saved.syncVersion,dispatchQuantity:'12'};
 await f.store.stageSellerRow(f.scope,f.record.occurredAt,edited);
 const pending=(await f.store.listSellerRows(f.scope))[0];const operation=await f.store.getSellerSyncOperation!(f.scope,pending.occurredAt,pending.partyId);
 await recoverSellerEntry(f.context,pending,'retry');
 expect(f.api.updateDailySellerDraft).toHaveBeenCalledWith(saved.id,expect.objectContaining({operationId:operation!.operationId,expectedVersion:operation!.expectedVersion}));
 const after=await f.read();expect(after.draftSales).toHaveLength(1);expect(after.draftSales[0].dispatchQuantity).toBe(12);
});

it('retains pending recovery when fallback storage cannot be marked, even after server save',async()=>{
 const f=await fixture();await expect(recoverSellerEntry({...f.context,beforeResolve:()=>{throw Error('fallback unavailable')}},f.record,'retry')).rejects.toThrow('fallback unavailable');
 expect(await f.store.listPendingOutbox(f.scope)).toHaveLength(1);expect((await f.read()).draftSales).toHaveLength(1);
 await recoverSellerEntry(f.context,f.record,'retry');expect(f.api.saveDailySellerDraft).toHaveBeenCalledOnce();
});
