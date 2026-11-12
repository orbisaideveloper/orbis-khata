import { createContext, useContext } from 'react'
import type { DemoItem, DemoParty } from './demo/master-model'
import { requestKhata } from './accounting/api'
import type { ExpenseCommand } from './accounting/expense-model'
import { androidLocalFirst } from './native-local/route'
export type BookServices={
 request:<T>(operation:string,input:unknown)=>Promise<T>;
 saveParty:(party:DemoParty)=>Promise<void>;saveItem:(item:DemoItem)=>Promise<void>;
 deleteParty:(company:string,id:string)=>Promise<void>;deleteItem:(company:string,id:string)=>Promise<void>;
 previous:(company:string,party:string,date:string,kind:string)=>Promise<string>;
 expenseBill:(command:ExpenseCommand,lines:{description:string;quantity:string;unit:string;rate:string;unit_rate?:string}[])=>Promise<void>
}
export const BookServicesContext=createContext<BookServices|null>(null)
export const useBookServices=()=>useContext(BookServicesContext)
/** Device-local routing is Android-specific; deployed PWA stays on its central backend. */
export const liveBookServices:BookServices={
 request:requestKhata,
 saveParty:async party=>{
  if(androidLocalFirst())return (await import('./native-local/runtime')).nativeLocalBooksServices.saveParty(party)
  await requestKhata('party-save',party)
 },
 saveItem:async item=>{
  if(androidLocalFirst())return (await import('./native-local/runtime')).nativeLocalBooksServices.saveItem(item)
  await requestKhata('item-save',item)
 },
 deleteParty:async(company,id)=>{
  if(androidLocalFirst())return (await import('./native-local/runtime')).nativeLocalBooksServices.deleteParty(company,id)
  await requestKhata('party-delete',{company,id})
 },
 deleteItem:async(company,id)=>{
  if(androidLocalFirst())return (await import('./native-local/runtime')).nativeLocalBooksServices.deleteItem(company,id)
  await requestKhata('item-delete',{company,id})
 },
 previous:async(company,party,date,kind)=>{
  if(androidLocalFirst())return (await import('./native-local/runtime')).nativeLocalBooksServices.previous(company,party,date,kind)
  return requestKhata('party-balance',{company,party,date,kind})
 },
 expenseBill:async(command,lines)=>{
  if(androidLocalFirst())return (await import('./native-local/runtime')).nativeLocalBooksServices.expenseBill(command,lines)
  await requestKhata('expense-bill',{command,lines})
 },
}
