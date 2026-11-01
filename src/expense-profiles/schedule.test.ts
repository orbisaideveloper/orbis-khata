import {describe,it,expect} from 'vitest';
import {changeWork,schedulePeriods,scheduledAmount,validSchedule,type ExpenseSchedule} from './schedule';
const salary:ExpenseSchedule={kind:'SALARY',mode:'CALENDAR',start:'2026-11-01',amount:'2000000',changes:[]};
describe('salary and bill schedules',()=>{
 it('prorates through last paid day and resumes without charging leave',()=>{
  const stopped=changeWork(salary,'2026-11-10',false);
  expect(scheduledAmount(stopped,'2026-11-20')).toBe(666667n);
  const resumed=changeWork(stopped,'2026-11-21',true);
  expect(scheduledAmount(resumed,'2026-11-30')).toBe(1333333n);
  expect(scheduledAmount(changeWork(resumed,'2026-11-25',false),'2026-11-30')).toBe(1000000n);
 });
 it('uses actual days in a 19th to 18th cycle',()=>{
  const s={...salary,mode:'ANNIVERSARY' as const,start:'2026-10-19'};
  expect(schedulePeriods(s,'2026-11-18')[0]).toEqual({from:'2026-10-19',to:'2026-11-18',days:31,worked:31,amount:'2000000'});
 });
 it('handles leap year and month end anchors',()=>{
  expect(schedulePeriods({...salary,start:'2024-02-01'},'2024-02-29')[0].days).toBe(29);
  const rows=schedulePeriods({...salary,mode:'ANNIVERSARY',start:'2024-01-31'},'2024-03-30');
  expect(rows.map(r=>[r.from,r.to,r.amount])).toEqual([['2024-01-31','2024-02-28','2000000'],['2024-02-29','2024-03-30','2000000']]);
 });
 it('bills charge in full and cannot be paused',()=>{
  const bill={...salary,kind:'BILL' as const};
  expect(scheduledAmount(bill,'2026-11-01')).toBe(2000000n);
  expect(()=>changeWork(bill,'2026-11-10',false)).toThrow();
  expect(validSchedule({...bill,changes:[{date:'2026-11-11',active:false}]})).toBe(false);
 });
 it('rejects invalid dates, duplicate stop and backwards history',()=>{
  expect(validSchedule({...salary,start:'2026-02-30'})).toBe(false);
  const s=changeWork(salary,'2026-11-10',false);
  expect(()=>changeWork(s,'2026-11-11',false)).toThrow();
  expect(()=>changeWork(s,'2026-11-01',true)).toThrow();
  expect(scheduledAmount(salary,'2026-10-31')).toBe(0n);
 });
});
