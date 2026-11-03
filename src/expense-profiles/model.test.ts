import {it,expect,vi} from 'vitest';
import {emptyProfiles,profileBalance,profileCommand,runProfiles,type ExpenseProfile} from './model';
const id='11111111-1111-4111-8111-111111111111',company='22222222-2222-4222-8222-222222222222',operationId='33333333-3333-4333-8333-333333333333';
const profile:ExpenseProfile={id,categoryId:id,name:'Staff',opening:'10000',openingDate:'2026-10-01',schedule:{kind:'SALARY',mode:'CALENDAR',start:'2026-11-01',amount:'300000',changes:[]}};
it('only payments post to expense journal; debt stays separate and input unchanged',async()=>{
 const post=vi.fn().mockResolvedValue(null),state={...emptyProfiles(),categories:[{id,name:'Salary'}],profiles:[profile]};
 expect(profileBalance(state,profile,'2026-11-10')).toBe(110000n);
 const paid=await runProfiles(state,{company,operationId,action:'pay',payment:{id,profileId:id,date:'2026-11-10',amount:'50000',method:'cash'}},post);
 expect(post).toHaveBeenCalledWith(expect.objectContaining({kind:'charge',amount:'50000',method:'cash'}));
 expect(state.payments).toHaveLength(0);
 expect(profileBalance(paid,profile,'2026-11-10')).toBe(60000n);
 const cancelled=await runProfiles(paid,{company,operationId,action:'void',id,date:'2026-11-20'},post);
 expect(profileBalance(cancelled,profile,'2026-11-10')).toBe(60000n);
 expect(profileBalance(cancelled,profile,'2026-11-20')).toBe(210000n);
 expect(post).toHaveBeenLastCalledWith(expect.objectContaining({kind:'reversal',parent:id}));
});
it('guards category history, duplicate names and schedule rewrites after payment',async()=>{
 const state={...emptyProfiles(),categories:[{id,name:'Salary'}],profiles:[profile]},post=vi.fn();
 await expect(runProfiles(state,{company,action:'category-delete',id},post)).rejects.toThrow('IN_USE');
 await expect(runProfiles(state,{company,action:'category',id:company,name:' salary '},post)).rejects.toThrow('ALREADY_EXISTS');
 await expect(runProfiles(state,{company,action:'pay',payment:{id,profileId:id,date:'2026-11-10',amount:'999999',method:'cash'}},post)).rejects.toThrow('ADVANCE_CONFIRM_REQUIRED');
 expect(post).not.toHaveBeenCalled();
});
it('validates command and tenant ID shapes before dispatch',()=>{
 expect(profileCommand({company,action:'list'})).toBe(true);
 expect(profileCommand({company,operationId,action:'save',id,profile})).toBe(true);
 expect(profileCommand({company,action:'pay',payment:{}})).toBe(false);
 expect(profileCommand({company:'other',action:'list'})).toBe(false);
 expect(profileCommand({company,action:'list',extra:true})).toBe(false);
});
it('rejects duplicate journal IDs and leaves both balance and payment state unchanged on posting failure',async()=>{
 const state={...emptyProfiles(),categories:[{id,name:'Salary'}],profiles:[profile]};
 const command={company,operationId,action:'pay' as const,payment:{id,profileId:id,date:'2026-11-10',amount:'10000',method:'cash' as const}};
 const snapshot=structuredClone(state);
 await expect(runProfiles(state,command,async()=>{throw new Error('BANK_UNAVAILABLE');})).rejects.toThrow('BANK_UNAVAILABLE');
 expect(state).toEqual(snapshot);
 const paid=await runProfiles(state,command,async()=>null),post=vi.fn();
 await expect(runProfiles(paid,command,post)).rejects.toThrow('ALREADY_EXISTS');
 expect(post).not.toHaveBeenCalled();
});

it('creates category and schedule atomically, guards history deletion, and accepts only explicit advances',async()=>{
 const post=vi.fn().mockResolvedValue(null),command={company,operationId,action:'save' as const,id,categoryName:'Delivery',profile:{...profile,opening:'0',subcategory:'Milk'}};expect(profileCommand(command)).toBe(true);const state=await runProfiles(emptyProfiles(),command,post);expect(post).not.toHaveBeenCalled();expect((await runProfiles(state,{company,operationId,action:'delete',id},post)).profiles).toEqual([]);expect(state.profiles).toHaveLength(1);
 const payment={id,profileId:id,date:'2026-11-30',amount:'400000',method:'bank' as const,allowAdvance:true as const};expect(profileCommand({company,operationId,action:'pay',payment})).toBe(true);const paid=await runProfiles(state,{company,operationId,action:'pay',payment},post);expect(profileBalance(paid,paid.profiles[0],'2026-11-30')).toBe(-100000n);expect(post).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({amount:'400000',category:'Delivery › Milk',method:'bank'}));await expect(runProfiles(paid,{company,operationId,action:'delete',id},post)).rejects.toThrow('PROFILE_HISTORY_RETAINED');expect(state.payments).toHaveLength(0);
 expect(profileCommand({company,operationId,action:'pay',payment:{...payment,voided:true}})).toBe(false);
});
it('tracks actual bills without journal entries and preserves as-of balances on cancellation',async()=>{
 const variable={...profile,opening:'0',schedule:{...profile.schedule,kind:'BILL' as const,mode:'VARIABLE' as const,amount:'0'}},state={...emptyProfiles(),categories:[{id,name:'Bills'}],profiles:[variable]},post=vi.fn();const command={company,operationId,action:'bill' as const,bill:{id,profileId:id,date:'2026-11-15',amount:'240000'}};expect(profileCommand(command)).toBe(true);const billed=await runProfiles(state,command,post);expect(profileBalance(billed,variable,'2026-11-30')).toBe(240000n);expect(profileBalance(billed,variable,'2026-11-14')).toBe(0n);expect(post).not.toHaveBeenCalled();await expect(runProfiles(billed,command,post)).rejects.toThrow('INVALID_PROFILE_BILL');
 const cancel={company,operationId,action:'bill-void' as const,id,date:'2026-11-20'};expect(profileCommand(cancel)).toBe(true);const cancelled=await runProfiles(billed,cancel,post);expect(profileBalance(cancelled,variable,'2026-11-19')).toBe(240000n);expect(profileBalance(cancelled,variable,'2026-11-20')).toBe(0n);expect(billed.bills?.[0]).not.toHaveProperty('voided');expect(post).not.toHaveBeenCalled();await expect(runProfiles(billed,{company,operationId,action:'save',id,profile:{...variable,schedule:{...variable.schedule,mode:'CALENDAR',amount:'100'}}},post)).rejects.toThrow('SCHEDULE_HISTORY_LOCKED');
});
