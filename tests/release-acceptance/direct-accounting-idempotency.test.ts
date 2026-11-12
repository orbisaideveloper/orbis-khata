import {beforeEach,expect,it} from 'vitest'
import {demoRequest,emptyDeviceLocalSnapshot,readDeviceLocalSnapshot,restoreDeviceLocalSnapshot} from '../../src/demo/store'
const ca='11111111-1111-4111-8111-111111111111'
const cb='22222222-2222-4222-8222-222222222222'
const pa='33333333-3333-4333-8333-333333333333'
const pb='44444444-4444-4444-8444-444444444444'
const sale={id:'sale-retry-1',company:ca,party:pa,kind:'sale' as const,date:'2026-11-12',amount:'10000',method:'cash' as const,reference:'1',note:'',reverses:null}
const range=(company:string)=>({company,from:'2026-01-01',to:'2026-12-31',party:null,offset:0})
beforeEach(async()=>{
  restoreDeviceLocalSnapshot(emptyDeviceLocalSnapshot())
  await demoRequest('create',{table:'khata_companies',row:{id:ca,name:'Shop A'}})
  await demoRequest('create',{table:'khata_companies',row:{id:cb,name:'Shop B'}})
  await demoRequest('create',{table:'khata_parties',row:{id:pa,name:'A buyer',company_id:ca,kind:'customer'}})
  await demoRequest('create',{table:'khata_parties',row:{id:pb,name:'B buyer',company_id:cb,kind:'customer'}})
})
it('same event can replay after a simulated restart without doubling receivable',async()=>{
  await demoRequest('post',sale)
  const saved=readDeviceLocalSnapshot()
  restoreDeviceLocalSnapshot(emptyDeviceLocalSnapshot())
  restoreDeviceLocalSnapshot(saved)
  await demoRequest('post',sale)
  const report=await demoRequest<{balances:Record<string,{closing:string}>}>('report',range(ca))
  expect(report.balances.receivable?.closing).toBe('10000')
})
it('same ID with a changed amount fails closed and preserves original balance',async()=>{
  await demoRequest('post',sale)
  await expect(demoRequest('post',{...sale,amount:'50000'})).rejects.toThrow('IDEMPOTENCY_CONFLICT')
  const report=await demoRequest<{balances:Record<string,{closing:string}>}>('report',range(ca))
  expect(report.balances.receivable?.closing).toBe('10000')
})
it('same ID cannot be reused for a different company or payee',async()=>{
  await demoRequest('post',sale)
  await expect(demoRequest('post',{...sale,company:cb,party:pb})).rejects.toThrow('IDEMPOTENCY_CONFLICT')
  const b=await demoRequest<{balances:Record<string,{closing:string}>}>('report',range(cb))
  expect(b.balances.receivable).toBeUndefined()
})
