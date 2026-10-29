export function financialYear(date:string){
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(date))throw new Error('INVALID_DATE');
 const day=new Date(date+'T00:00:00Z');
 if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==date)throw new Error('INVALID_DATE');
 return Number(date.slice(0,4))-(Number(date.slice(5,7))<4?1:0);
}
