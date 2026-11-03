import { validSchedule, schedulePeriods } from '../expense-profiles/schedule.ts';
import type { ExpenseSchedule } from '../expense-profiles/schedule.ts';
type Client=Record<string,any>;
export async function saveExpenseSchedule(client:Client,id:string,input:Record<string,unknown>,actor:string) {
 if(input.schedule===undefined) return;
 if(!validSchedule(input.schedule)||input.schedule.mode==='VARIABLE'||input.schedule.end!==undefined||input.schedule.kind==='BILL'&&input.schedule.changes.length>0||input.schedule.amount!==String(input.usualAmountPaise)) throw new Error('INVALID_EXPENSE_SCHEDULE');
 const profile=await client.foundationAccountingExpenseProfile.findUnique({where:{id}});
 if(!profile||profile.organizationId!==input.organizationId) throw new Error('EXPENSE_PROFILE_NOT_FOUND');
 const next=input.schedule, previous=profile.schedule as ExpenseSchedule|undefined;
 if(!previous) {
  const bills=await client.foundationAccountingExpenseBill.findMany({where:{organizationId:profile.organizationId,profileId:id}});
  if(bills.length)throw new Error("EXISTING_EXPENSE_BILLS_REQUIRE_SEPARATE_SCHEDULE_PROFILE");
 }
 if(previous) {
  if(previous.changes.some((row,index)=>JSON.stringify(row)!==JSON.stringify(next.changes[index]))) throw new Error('WORK_HISTORY_IMMUTABLE');
  if(previous.changes.length>next.changes.length) throw new Error('WORK_HISTORY_IMMUTABLE');
  const paid=await client.foundationAccountingExpensePayment.count({where:{organizationId:profile.organizationId,profileId:id}});
  if((paid || previous.changes.length) && ['kind','mode','start','amount'].some(key=>previous[key as keyof ExpenseSchedule]!==next[key as keyof ExpenseSchedule])) throw new Error('SCHEDULE_HISTORY_LOCKED');
 }
 if(JSON.stringify(previous)===JSON.stringify(next))return;
 await client.foundationAccountingExpenseProfile.update({where:{id},data:{schedule:next}});
 await client.foundationLotteryAuditEvent.create({data:{organizationId:profile.organizationId,eventType:'EXPENSE_SCHEDULE_UPDATED',entityType:'EXPENSE_PROFILE',entityId:id,actorAdminId:actor,metadata:{previous:previous??null,schedule:next}}});
}
export function scheduledBills(profile:{id:string;schedule?:ExpenseSchedule},through:string) {
 if(!profile.schedule)return [];
 return schedulePeriods(profile.schedule,through).filter(row=>BigInt(row.amount)>0n).map(row=>({id:`schedule-${profile.id}-${row.from}`,profileId:profile.id,billingMonth:row.from,amountPaise:row.amount,occurredAt:row.from,scheduled:true}));
}
