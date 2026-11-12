import {beforeEach,expect,it} from 'vitest'
import {demoRequest,emptyDeviceLocalSnapshot,readDeviceLocalSnapshot,restoreDeviceLocalSnapshot} from '../demo/store'
const actor='11111111-1111-4111-8111-111111111111'
const party='22222222-2222-4222-8222-222222222222'
beforeEach(()=>restoreDeviceLocalSnapshot(emptyDeviceLocalSnapshot()))
it('starts with no existing company and rejects corrupt snapshots', async()=>{
  expect(await demoRequest('companies',{})).toEqual([])
  expect(()=>restoreDeviceLocalSnapshot({version:9})).toThrow('ANDROID_LOCAL_SNAPSHOT_INVALID')
})
it('preserves local company, party, unpaid sale and later receipt across simulated restart',async()=>{
  await demoRequest('create',{table:'khata_companies',row:{id:actor,name:'Local shop'}})
  await demoRequest('create',{table:'khata_parties',row:{id:party,name:'Customer',kind:'customer',company_id:actor}})
  await demoRequest('post',{id:'sale-1',company:actor,party,kind:'sale',date:'2026-11-12',amount:'10000',method:'cash',reference:'1',note:'',reverses:null})
  const saved=JSON.parse(JSON.stringify(readDeviceLocalSnapshot()))
  restoreDeviceLocalSnapshot(emptyDeviceLocalSnapshot())
  expect(await demoRequest('companies',{})).toEqual([])
  restoreDeviceLocalSnapshot(saved)
  expect((await demoRequest<{balances:Record<string,{closing:string}>}>('report',{company:actor,from:'2026-01-01',to:'2026-12-31',party:null,offset:0})).balances.cash?.closing??'0').toBe('0')
  await demoRequest('post',{id:'receipt-1',company:actor,party,kind:'receipt',date:'2026-11-12',amount:'10000',method:'cash',reference:'2',note:'',reverses:null})
  const report=await demoRequest<{balances:Record<string,{closing:string}>}>('report',{company:actor,from:'2026-01-01',to:'2026-12-31',party:null,offset:0})
  expect(report.balances.cash?.closing).toBe('10000')
  expect(report.balances.receivable?.closing).toBe('0')
  await demoRequest('post',{id:'receipt-1',company:actor,party,kind:'receipt',date:'2026-11-12',amount:'10000',method:'cash',reference:'2',note:'',reverses:null})
  const again=await demoRequest<{balances:Record<string,{closing:string}>}>('report',{company:actor,from:'2026-01-01',to:'2026-12-31',party:null,offset:0})
  expect(again.balances.cash?.closing).toBe('10000')
})
