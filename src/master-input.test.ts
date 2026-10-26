import {expect,it} from 'vitest'
import {khataOperation} from './accounting/server-gateway'
import {emptyPartyDetails} from './demo/master-model'
const id='11111111-1111-4111-8111-111111111111'
const party={id,company:id,name:'Customer',kind:'customer',receivable:'0',payable:'0',...emptyPartyDetails}
const item={id,company:id,name:'Milk',unit:'litre',code:'',default_rate:null}
const op=(operation:string,input:unknown)=>khataOperation({version:'orbis.khata.data.v1',operation,input})
it('accepts optional item fields and full party details; refuses injected ownership or invalid identity',()=>{
 expect(op('item-save',item)).not.toBeNull();expect(op('party-save',party)).not.toBeNull()
 for(const value of [{...item,id:'invalid'},{...item,name:''},{...item,unit:''},{...item,default_rate:'-1'},{...item,code:'<script>'},{...item,owner_id:id}])expect(op('item-save',value)).toBeNull()
 for(const value of [{...party,kind:'admin'},{...party,phone:'\u0001'},{...party,credit_days:3651},{...party,credit_limit:'1.1'},{...party,opening_amount:null},{...party,opening_side:'wrong'},{...party,opening_date:'yesterday'},{...party,opening_account:'cash'}])expect(op('party-save',value)).toBeNull()
})
it('bounds each company-scoped master/delete/balance request',()=>{
 expect(op('masters',{company:id})).not.toBeNull();expect(op('masters',{company:id,owner:id})).toBeNull()
 for(const operation of ['party-delete','item-delete']){expect(op(operation,{company:id,id})).not.toBeNull();expect(op(operation,{company:'wrong',id})).toBeNull()}
 expect(op('party-balance',{company:id,party:id,date:'2026-10-25',kind:'sale'})).not.toBeNull();expect(op('party-balance',{company:id,party:id,date:'2026-02-30',kind:'sale'})).toBeNull()
})
it('accepts only expense lines whose precise totals match the command',()=>{
 const input={command:{id,company:id,date:'2026-10-25',kind:'charge',amount:'10000',category:'Rent',payee:'Landlord',method:null,parent:null,reference:'',note:''},lines:[{description:'Rent',quantity:'3000000',unit:'',rate:'3333',unit_rate:'33.33333333'}]}
 expect(op('expense-bill',input)).not.toBeNull();expect(op('expense-bill',{...input,command:{...input.command,amount:'9999'}})).toBeNull();expect(op('expense-bill',{...input,lines:[]})).toBeNull();expect(op('expense-bill',{...input,lines:[{...input.lines[0],extra:true}]})).toBeNull()
})
