import {validDay, validSchedule, scheduledAmount, type ExpenseSchedule} from './schedule.ts';
export type ExpenseProfile = {id:string;categoryId:string;name:string;schedule:ExpenseSchedule;opening:string;openingDate:string};
type ProfilePayment = {id:string;profileId:string;date:string;amount:string;method:'cash'|'bank';voided?:boolean;voidDate?:string};
export type ProfileState = {categories:{id:string;name:string}[];profiles:ExpenseProfile[];payments:ProfilePayment[]};
export const emptyProfiles=():ProfileState=>({categories:[],profiles:[],payments:[]});
const profileId=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(v);
const title=(v:unknown,max:number):v is string=>typeof v==='string'&&Boolean(v.trim())&&v.length<=max;
function validProfile(value:unknown):value is ExpenseProfile {
 if(!value||typeof value!=='object')return false;
 const p=value as ExpenseProfile;
 return profileId(p.id)&&profileId(p.categoryId)&&title(p.name,120)&&validSchedule(p.schedule)&&typeof p.opening==='string'&&/^-?\d{1,12}$/u.test(p.opening)&&validDay(p.openingDate);
}
export type ProfileCommand={company:string;action:'list'|'save'|'category'|'category-delete'|'pay'|'void';operationId?:string;id?:string;profile?:ExpenseProfile;name?:string;payment?:ProfilePayment;date?:string};
export function profileCommand(value:Record<string,unknown>):value is ProfileCommand&Record<string,unknown> {
 if(!profileId(value.company)||(value.action!=='list'&&!profileId(value.operationId)))return false;
 switch(value.action) {
  case 'list': return Object.keys(value).length===2;
  case 'save':return Object.keys(value).length===5&&profileId(value.id)&&validProfile(value.profile);
  case 'category':return Object.keys(value).length===5&&profileId(value.id)&&title(value.name,80);
  case 'category-delete':return Object.keys(value).length===4&&profileId(value.id);
  case 'pay':{const p=value.payment as ProfilePayment|undefined;return Object.keys(value).length===4&&Boolean(p&&profileId(p.id)&&profileId(p.profileId)&&validDay(p.date)&&['cash','bank'].includes(p.method)&&typeof p.amount==='string'&&/^[1-9]\d{0,11}$/u.test(p.amount));}
  case 'void':return Object.keys(value).length===5&&profileId(value.id)&&validDay(value.date);
  default:return false;
 }
}
export function profileBalance(state:ProfileState,profile:ExpenseProfile,date:string):bigint {
 return (profile.openingDate<=date?BigInt(profile.opening):0n)+scheduledAmount(profile.schedule,date)-state.payments.filter(p=>p.profileId===profile.id&&(!p.voided||(p.voidDate!==undefined&&p.voidDate>date))&&p.date<=date).reduce((n,p)=>n+BigInt(p.amount),0n);
}
const profileError=(message:string)=>Object.assign(new Error(message),{code:"P0001"});
export async function runProfiles(state:ProfileState,command:ProfileCommand,post:(p:Record<string,unknown>)=>Promise<unknown>) {
 const next=structuredClone(state);
 const duplicate=(id:string,name:string)=>next.categories.some(c=>c.id!==id&&c.name.normalize('NFKC').trim().toLocaleLowerCase()===name.normalize('NFKC').trim().toLocaleLowerCase());
 if(command.action==='list')return next;
 if(command.action==='category') {
  if(duplicate(command.id!,command.name!))throw profileError('CATEGORY_ALREADY_EXISTS');
  const category=next.categories.find(c=>c.id===command.id);if(category)category.name=command.name!.trim();else next.categories.push({id:command.id!,name:command.name!.trim()});
 } else if(command.action==='category-delete') {
  if(next.profiles.some(p=>p.categoryId===command.id))throw profileError('EXPENSE_CATEGORY_IN_USE');
  next.categories=next.categories.filter(c=>c.id!==command.id);
 } else if(command.action==='save') {
  const profile=command.profile!;
  if(!next.categories.some(c=>c.id===profile.categoryId))throw profileError('EXPENSE_CATEGORY_NOT_FOUND');
  const index=next.profiles.findIndex(p=>p.id===profile.id),old=next.profiles[index];
  if(old) {
   if(old.schedule.changes.some((change,i)=>JSON.stringify(change)!==JSON.stringify(profile.schedule.changes[i])))throw profileError('WORK_HISTORY_IMMUTABLE');
   if((old.schedule.changes.length||next.payments.some(p=>p.profileId===profile.id))&&['kind','mode','start','amount'].some(key=>old.schedule[key as keyof ExpenseSchedule]!==profile.schedule[key as keyof ExpenseSchedule]))throw profileError('SCHEDULE_HISTORY_LOCKED');
   next.profiles[index]=profile;
  }else next.profiles.push(profile);
 } else if(command.action==='pay') {
  const payment=command.payment!,profile=next.profiles.find(p=>p.id===payment.profileId);
  if(next.payments.some(p=>p.id===payment.id))throw profileError("PROFILE_PAYMENT_ALREADY_EXISTS");
  if(!profile||BigInt(payment.amount)>profileBalance(next,profile,payment.date))throw profileError('INVALID_PROFILE_PAYMENT');
  const category=next.categories.find(c=>c.id===profile.categoryId)!;
  await post({id:payment.id,company:command.company,date:payment.date,kind:'charge',amount:payment.amount,category:category.name,payee:profile.name,method:payment.method,parent:null,reference:'',note:'Scheduled account payment'});
  next.payments.push(payment);
 } else if(command.action==='void') {
  const payment=next.payments.find(p=>p.id===command.id&&!p.voided);
  if(!payment)throw profileError('PROFILE_PAYMENT_NOT_FOUND');
  await post({id:crypto.randomUUID(),company:command.company,date:command.date,kind:'reversal',amount:payment.amount,category:'',payee:'',method:null,parent:payment.id,reference:'',note:'Scheduled account payment cancelled'});
  payment.voided=true;payment.voidDate=command.date;
 }
 return next;
}
