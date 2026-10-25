import { expect,it } from 'vitest'
import { khataOperation } from './server-gateway'
import { expenseCommand } from './expense-model'
const base={id:'11111111-1111-4111-8111-111111111111',company:'22222222-2222-4222-8222-222222222222',date:'2026-10-01',kind:'charge',amount:'100',category:'Rent',payee:'Owner',method:'cash',parent:null,reference:'R1',note:''}
const operation=(input:unknown)=>khataOperation({version:'orbis.khata.data.v1',operation:'expense-post',input})
it('accepts direct cash, bank and unpaid expenses and only explicit linked payments',()=>{
  for(const method of ['cash','bank',null])expect(operation({...base,method})).not.toBeNull()
  expect(operation({...base,kind:'payment',parent:base.id})).not.toBeNull()
  expect(operation({...base,kind:'reversal',method:null,parent:base.id,note:'Correction'})).not.toBeNull()
})
it.each([{amount:'0'},{amount:'1.2'},{amount:'-1'},{amount:'1000000000000'},{date:'2026-02-30'},{company:'bad'},{owner_id:'forged'},{kind:'payment'},{kind:'reversal'},{method:'credit-card'},{category:' '},{note:'x'.repeat(501)}])('rejects invalid expense input %j',change=>{
  expect(operation({...base,...change})).toBeNull()
})
it('bounds expense report queries and refuses ownership overrides',()=>{
  const envelope={version:'orbis.khata.data.v1',operation:'expense-report',input:{company:base.company,from:base.date,to:base.date,offset:0}}
  expect(khataOperation(envelope)).not.toBeNull()
  for(const change of [{offset:-1},{offset:1.2},{from:'2026-11-01'},{owner:'forged'}])expect(khataOperation({...envelope,input:{...envelope.input,...change}})).toBeNull()
  expect(expenseCommand(null)).toBeNull()
})
