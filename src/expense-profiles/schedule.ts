type WorkChange = { date: string; active: boolean };
export type ExpenseSchedule = {
  kind: 'SALARY' | 'BILL'; mode: 'ONCE' | 'CALENDAR' | 'ANNIVERSARY' | 'VARIABLE';
  start: string; end?: string; amount: string; changes: WorkChange[];
};
export type SchedulePeriod = { from: string; to: string; days: number; worked: number; amount: string };
const dayMs = 86400000;
export function validDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) && value>='0100-01-01' && value<='9998-12-31' && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
}
function shiftDay(day: string, count: number): string { return new Date(Date.parse(day+'T00:00:00Z')+count*dayMs).toISOString().slice(0,10); }
function monthDay(year: number, month: number, day: number): string {
  const last = new Date(Date.UTC(year,month+1,0)).getUTCDate();
  return new Date(Date.UTC(year,month,Math.min(day,last))).toISOString().slice(0,10);
}
export function validSchedule(value: unknown): value is ExpenseSchedule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s=value as ExpenseSchedule;
  if (!['SALARY','BILL'].includes(s.kind) || !['ONCE','CALENDAR','ANNIVERSARY','VARIABLE'].includes(s.mode) || !validDay(s.start) || typeof s.amount !== 'string' || !/^\d{1,12}$/u.test(s.amount) || (s.mode==='VARIABLE'?s.amount!=='0':BigInt(s.amount)<=0n) || !Array.isArray(s.changes) || s.changes.length>1000) return false;
  if (s.kind==='SALARY' && (s.mode==='ONCE'||s.mode==='VARIABLE')) return false;
  if (s.end!==undefined && (!validDay(s.end)||s.end<s.start)) return false;
  let previous=s.start;
  let active=true;
  for (const change of s.changes) {
    if (!change || !validDay(change.date) || change.date<previous || typeof change.active!=='boolean' || change.active===active) return false;
    previous=change.date; active=change.active;
  }
  return true;
}
function activeDays(s: ExpenseSchedule, first: string, last: string): number {
  let count=0, cursor=first, active=true, index=0;
  while (index<s.changes.length && s.changes[index].date<=cursor) {active=s.changes[index].active;index++;}
  while (cursor<=last) {
    while (index<s.changes.length && s.changes[index].date<=cursor) {active=s.changes[index].active;index++;}
    if(active && cursor>=s.start) count++;
    cursor=shiftDay(cursor,1);
  }
  return count;
}
function accruedPeriod(s:ExpenseSchedule,from:string,next:string,through:string):SchedulePeriod {
 const to=shiftDay(next,-1),days=Math.round((Date.parse(next)-Date.parse(from))/dayMs);
 const worked=activeDays(s,from,to<through?to:through);
 let amount=(BigInt(s.amount)*BigInt(worked)+BigInt(Math.floor(days/2)))/BigInt(days);
 if(s.kind==='BILL')amount=worked>0?BigInt(s.amount):0n;
 return {from:from<s.start?s.start:from,to,days,worked,amount:amount.toString()};
}
export function schedulePeriods(s: ExpenseSchedule, through: string): SchedulePeriod[] {
  if (!validSchedule(s) || !validDay(through)) throw new Error('INVALID_EXPENSE_SCHEDULE');
  if (s.end && through>s.end) through=s.end;
  if (through<s.start || s.mode==='VARIABLE') return [];
  if(s.mode==='ONCE') return [{from:s.start,to:s.start,days:1,worked:1,amount:s.amount}];
  const date=new Date(s.start+'T00:00:00Z'), year=date.getUTCFullYear(), month=date.getUTCMonth(), anchor=s.mode==='CALENDAR'?1:date.getUTCDate();
  const periods:SchedulePeriod[]=[];
  for(let n=0;n<1200;n++) {
    const from=monthDay(year,month+n,anchor), next=monthDay(year,month+n+1,anchor), to=shiftDay(next,-1);
    if(from>through) return periods;
    periods.push(accruedPeriod(s,from,next,through));
    if(to>=through) return periods;
  }
  throw new Error('SCHEDULE_RANGE_TOO_LONG');
}
export function scheduledAmount(s: ExpenseSchedule, through: string): bigint { return schedulePeriods(s,through).reduce((sum,row)=>sum+BigInt(row.amount),0n); }
/** Stop date is the last paid work day; resume date is the first paid work day. */
export function changeWork(s: ExpenseSchedule, date: string, active: boolean): ExpenseSchedule {
  if (s.mode==='ONCE' || !validDay(date)) throw new Error('SALARY_SCHEDULE_REQUIRED');
  const next={...s,changes:[...s.changes,{date:active?date:shiftDay(date,1),active}]};
  if(!validSchedule(next)) throw new Error('INVALID_WORK_DATE');
  return next;
}
