import {expect,it} from 'vitest'
import {emptyDeviceLocalSnapshot,restoreDeviceLocalSnapshot,readDeviceLocalSnapshot} from '../demo/store'
it('does not allow forged state mutation by reference',()=>{
  const empty=emptyDeviceLocalSnapshot();restoreDeviceLocalSnapshot(empty)
  empty.companies.push({id:'example',name:'malicious'})
  expect(readDeviceLocalSnapshot().companies).toEqual([])
})
it('snapshot includes every business state collection for ledger, inventory and production',()=>{
  const state=emptyDeviceLocalSnapshot()
  expect(Object.keys(state).sort()).toEqual(['version','workspaceSettings','fiscalCounters','workspaceEvents','paymentLinks','retired','companies','parties','entries','expenses','expenseBillLines','documents','reversals','items','warehouses'].sort())
})
