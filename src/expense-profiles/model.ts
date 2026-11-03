import {expenseCategoryName} from '../accounting/expense-category.ts';
import {validDay, validSchedule, scheduledAmount, type ExpenseSchedule} from './schedule.ts';
export type ExpenseProfile = {id:string;categoryId:string;name:string;subcategory?:string;schedule:ExpenseSchedule;opening:string;openingDate:string};
type ProfilePayment = {id:string;profileId:string;date:string;amount:string;method:'cash'|'bank';voided?:boolean;voidDate?:string;allowAdvance?:boolean};
type ProfileBill={id:string;profileId:string;date:string;amount:string;voided?:boolean;voidDate?:string};
export type ProfileState = {categories:{id:string;name:string}[];profiles:ExpenseProfile[];payments:ProfilePayment[];bills?:ProfileBill[]};
export const emptyProfiles=():ProfileState=>({categories:[],profiles:[],payments:[]});
const profileId=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(v);
const title=(v:unknown,max:number):v is string=>typeof v==='string'&&Boolean(v.trim())&&v.length<=max;
function validProfile(value:unknown):value is ExpenseProfile {
 if(!value||typeof value!=='object')return false;
 const p=value as ExpenseProfile;
 return (p.subcategory===undefined||typeof p.subcategory==='string'&&p.subcategory.length<=60)&&profileId(p.id)&&profileId(p.categoryId)&&title(p.name,120)&&validSchedule(p.schedule)&&typeof p.opening==='string'&&/^-?\d{1,12}$/u.test(p.opening)&&validDay(p.openingDate);
}
export type ProfileCommand={company:string;action:'list'|'save'|'category'|'category-delete'|'pay'|'void'|'delete'|'bill'|'bill-void';operationId?:string;id?:string;profile?:ExpenseProfile;name?:string;categoryName?:string;bill?:ProfileBill;payment?:ProfilePayment;date?:string};
function validBill(value:unknown){
 if(!value||typeof value!=='object')return false;
 const b=value as ProfileBill;
 return Object.keys(b).length===4&&profileId(b.id)&&profileId(b.profileId)&&validDay(b.date)&&typeof b.amount==='string'&&/^[1-9]\d{0,11}$/u.test(b.amount);
}
function validPayment(value:unknown){
 if(!value||typeof value!=='object')return false;
 const p=value as ProfilePayment;
 return Object.keys(p).every(key=>['id','profileId','date','amount','method','allowAdvance'].includes(key))&&profileId(p.id)&&profileId(p.profileId)&&validDay(p.date)&&['cash','bank'].includes(p.method)&&typeof p.amount==='string'&&/^[1-9]\d{0,11}$/u.test(p.amount)&&(p.allowAdvance===undefined||p.allowAdvance===true);
}
export function profileCommand(value:Record<string,unknown>):value is ProfileCommand&Record<string,unknown> {
 if(!profileId(value.company)||(value.action!=='list'&&!profileId(value.operationId)))return false;
 switch(value.action) {
  case 'list': return Object.keys(value).length===2;
  case 'save':return (Object.keys(value).length===5||Object.keys(value).length===6&&title(value.categoryName,80))&&profileId(value.id)&&validProfile(value.profile);
  case 'category':return Object.keys(value).length===5&&profileId(value.id)&&title(value.name,80);
  case 'delete':
  case 'category-delete':return Object.keys(value).length===4&&profileId(value.id);
  case 'bill':return Object.keys(value).length===4&&validBill(value.bill);
  case 'pay':return Object.keys(value).length===4&&validPayment(value.payment);
  case 'bill-void':
  case 'void':return Object.keys(value).length===5&&profileId(value.id)&&validDay(value.date);
  default:return false;
 }
}
export function profileBalance(state:ProfileState,profile:ExpenseProfile,date:string):bigint {
 return (profile.openingDate<=date?BigInt(profile.opening):0n)+scheduledAmount(profile.schedule,date)+(state.bills??[]).filter(b=>b.profileId===profile.id&&b.date<=date&&(!b.voided||b.voidDate!==undefined&&b.voidDate>date)).reduce((n,b)=>n+BigInt(b.amount),0n)-state.payments.filter(p=>p.profileId===profile.id&&(!p.voided||(p.voidDate!==undefined&&p.voidDate>date))&&p.date<=date).reduce((n,p)=>n+BigInt(p.amount),0n);
}
const profileError=(message:string)=>Object.assign(new Error(message),{code:"P0001"});
type Post=(payment:Record<string,unknown>)=>Promise<unknown>;
function saveCategory(next:ProfileState,command:ProfileCommand) {
 const normalize=(name:string)=>name.normalize('NFKC').trim().toLocaleLowerCase();
 if(next.categories.some(c=>c.id!==command.id&&normalize(c.name)===normalize(command.name!)))throw profileError('CATEGORY_ALREADY_EXISTS');
 const category=next.categories.find(c=>c.id===command.id);
 if(category){category.name=command.name!.trim();}
 else {next.categories.push({id:command.id!,name:command.name!.trim()});}
}
function removeCategory(next:ProfileState,id:string) {
 if(next.profiles.some(p=>p.categoryId===id))throw profileError('EXPENSE_CATEGORY_IN_USE');
 next.categories=next.categories.filter(c=>c.id!==id);
}
function saveProfile(next:ProfileState,profile:ExpenseProfile) {
 if(!next.categories.some(c=>c.id===profile.categoryId))throw profileError('EXPENSE_CATEGORY_NOT_FOUND');
 const index=next.profiles.findIndex(p=>p.id===profile.id),old=next.profiles[index];
 if(!old){next.profiles.push(profile);return;}
 if(old.schedule.changes.some((change,i)=>JSON.stringify(change)!==JSON.stringify(profile.schedule.changes[i])))throw profileError('WORK_HISTORY_IMMUTABLE');
 const locked=old.schedule.changes.length>0||next.payments.some(p=>p.profileId===profile.id)||(next.bills??[]).some(b=>b.profileId===profile.id);
 if(locked&&['kind','mode','start','amount'].some(key=>old.schedule[key as keyof ExpenseSchedule]!==profile.schedule[key as keyof ExpenseSchedule]))throw profileError('SCHEDULE_HISTORY_LOCKED');
 next.profiles[index]=profile;
}
async function savePayment(next:ProfileState,command:ProfileCommand,post:Post) {
 const payment=command.payment!,profile=next.profiles.find(p=>p.id===payment.profileId);
 if(next.payments.some(p=>p.id===payment.id))throw profileError('PROFILE_PAYMENT_ALREADY_EXISTS');
 if(!profile)throw profileError('INVALID_PROFILE_PAYMENT');
 if(BigInt(payment.amount)>profileBalance(next,profile,payment.date)&&!payment.allowAdvance)throw profileError('ADVANCE_CONFIRM_REQUIRED');
 const category=next.categories.find(c=>c.id===profile.categoryId)!;
 await post({id:payment.id,company:command.company,date:payment.date,kind:'charge',amount:payment.amount,category:expenseCategoryName(category.name,profile.subcategory??''),payee:profile.name,method:payment.method,parent:null,reference:'',note:'Scheduled account payment'});
 next.payments.push(payment);
}
async function voidPayment(next:ProfileState,command:ProfileCommand,post:Post) {
 const payment=next.payments.find(p=>p.id===command.id&&!p.voided);
 if(!payment||command.date!<payment.date)throw profileError('PROFILE_PAYMENT_NOT_FOUND');
 await post({id:crypto.randomUUID(),company:command.company,date:command.date,kind:'reversal',amount:payment.amount,category:'',payee:'',method:null,parent:payment.id,reference:'',note:'Scheduled account payment cancelled'});
 payment.voided=true;payment.voidDate=command.date;
}
function removeProfile(next:ProfileState,id:string){
 const profile=next.profiles.find(p=>p.id===id);if(!profile)throw profileError('PROFILE_NOT_FOUND');
 if(profile.opening!=='0'||profile.schedule.changes.length||next.payments.some(p=>p.profileId===id)||(next.bills??[]).some(b=>b.profileId===id))throw profileError('PROFILE_HISTORY_RETAINED');
 next.profiles=next.profiles.filter(p=>p.id!==id);
}
function saveActualBill(next:ProfileState,bill:ProfileBill){
 const profile=next.profiles.find(p=>p.id===bill.profileId);
 if(profile?.schedule.mode!=='VARIABLE'||bill.date<profile.schedule.start||profile.schedule.end&&bill.date>profile.schedule.end||(next.bills??[]).some(b=>b.id===bill.id))throw profileError('INVALID_PROFILE_BILL');
 if(profile.schedule.changes.findLast(change=>change.date<=bill.date)?.active===false)throw profileError('SCHEDULE_STOPPED');
 next.bills=[...(next.bills??[]),bill];
}
function cancelActualBill(next:ProfileState,command:ProfileCommand){
 const bill=next.bills?.find(b=>b.id===command.id&&!b.voided);
 if(!bill||command.date!<bill.date){throw profileError('PROFILE_BILL_NOT_FOUND');}
 bill.voided=true;bill.voidDate=command.date;
}
export async function runProfiles(state:ProfileState,command:ProfileCommand,post:Post) {
 const next=structuredClone(state);
 switch(command.action) {
  case 'category':saveCategory(next,command);break;
  case 'category-delete':removeCategory(next,command.id!);break;
  case 'save':if(command.categoryName)saveCategory(next,{...command,id:command.profile!.categoryId,name:command.categoryName});saveProfile(next,command.profile!);break;
  case 'delete':removeProfile(next,command.id!);break;
  case 'bill':saveActualBill(next,command.bill!);break;
  case 'bill-void':cancelActualBill(next,command);break;
  case 'pay':await savePayment(next,command,post);break;
  case 'void':await voidPayment(next,command,post);break;
 }
 return next;
}
