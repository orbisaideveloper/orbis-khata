export function financialYear(date:string){
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(date))throw Error('INVALID_DATE');
 const day=new Date(date+'T00:00:00Z');
 if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==date)throw Error('INVALID_DATE');
 return Number(date.slice(0,4))-(Number(date.slice(5,7))<4?1:0);
}
export function fiscalReference(prefix:string,year:number,serial:string){return `${prefix}${year}-${String(year+1).slice(-2)}/${serial}`;}
