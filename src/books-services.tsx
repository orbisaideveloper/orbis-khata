import { createContext, useContext } from 'react'
import type { DemoItem, DemoParty } from './demo/master-model'
import { requestKhata } from './accounting/api'
import type { ExpenseCommand } from './accounting/expense-model'
export type BookServices={
 request:<T>(operation:string,input:unknown)=>Promise<T>;
 saveParty:(party:DemoParty)=>Promise<void>;saveItem:(item:DemoItem)=>Promise<void>;
 deleteParty:(company:string,id:string)=>Promise<void>;deleteItem:(company:string,id:string)=>Promise<void>;
 previous:(company:string,party:string,date:string,kind:string)=>Promise<string>;
 expenseBill:(command:ExpenseCommand,lines:{description:string;quantity:string;unit:string;rate:string;unit_rate?:string}[])=>Promise<void>
}
export const BookServicesContext=createContext<BookServices|null>(null)
export const useBookServices=()=>useContext(BookServicesContext)
export const liveBookServices:BookServices={request:requestKhata,
 saveParty:async party=>{await requestKhata('party-save',party)},saveItem:async item=>{await requestKhata('item-save',item)},
 deleteParty:async(company,id)=>{await requestKhata('party-delete',{company,id})},deleteItem:async(company,id)=>{await requestKhata('item-delete',{company,id})},
 previous:(company,party,date,kind)=>requestKhata('party-balance',{company,party,date,kind}),
 expenseBill:async(command,lines)=>{await requestKhata('expense-bill',{command,lines})}
}
