import {beforeEach,expect,it} from 'vitest'
import {deviceLottery,demoRequest,emptyDeviceLocalSnapshot,readDeviceLocalSnapshot,restoreDeviceLocalSnapshot} from '../demo/store'
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
  const outstanding = { company: actor, party, date: '2026-11-12', kind: 'sale' }
  await expect(demoRequest('party-balance', outstanding)).resolves.toBe('10000')
  const saved=JSON.parse(JSON.stringify(readDeviceLocalSnapshot()))
  restoreDeviceLocalSnapshot(emptyDeviceLocalSnapshot())
  expect(await demoRequest('companies',{})).toEqual([])
  restoreDeviceLocalSnapshot(saved)
  expect((await demoRequest<{balances:Record<string,{closing:string}>}>('report',{company:actor,from:'2026-01-01',to:'2026-12-31',party:null,offset:0})).balances.cash?.closing??'0').toBe('0')
  await demoRequest('post',{id:'receipt-1',company:actor,party,kind:'receipt',date:'2026-11-12',amount:'10000',method:'cash',reference:'2',note:'',reverses:null})
  const report=await demoRequest<{balances:Record<string,{closing:string}>}>('report',{company:actor,from:'2026-01-01',to:'2026-12-31',party:null,offset:0})
  expect(report.balances.cash?.closing).toBe('10000')
  expect(report.balances.receivable?.closing).toBe('0')
  await expect(demoRequest('party-balance', outstanding)).resolves.toBe('0')
  await expect(demoRequest('party-balance', { ...outstanding, company: party })).rejects.toThrow('PARTY_NOT_ACCESSIBLE')

  await demoRequest('post',{id:'receipt-1',company:actor,party,kind:'receipt',date:'2026-11-12',amount:'10000',method:'cash',reference:'2',note:'',reverses:null})
  const again=await demoRequest<{balances:Record<string,{closing:string}>}>('report',{company:actor,from:'2026-01-01',to:'2026-12-31',party:null,offset:0})
  expect(again.balances.cash?.closing).toBe('10000')
})

it('keeps expense profiles and a single payment across snapshot reopen and retry', async () => {
  const company = actor
  const paymentId = '33333333-3333-4333-8333-333333333333'
  const profileOperation = '44444444-4444-4444-8444-444444444444'
  const paymentOperation = '55555555-5555-4555-8555-555555555555'
  await demoRequest('create', { table: 'khata_companies', row: { id: company, name: 'Local shop' } })
  await demoRequest('expense-profiles', {
    company, action: 'save', operationId: profileOperation, id: party, categoryName: 'Salary',
    profile: { id: party, categoryId: party, name: 'Staff', opening: '10000', openingDate: '2026-11-01',
      schedule: { kind: 'SALARY', mode: 'CALENDAR', start: '2026-11-01', amount: '30000', changes: [] } },
  })
  const payment = { company, action: 'pay', operationId: paymentOperation,
    payment: { id: paymentId, profileId: party, date: '2026-11-12', amount: '5000', method: 'cash' } }
  await demoRequest('expense-profiles', payment)
  const saved = readDeviceLocalSnapshot()
  restoreDeviceLocalSnapshot(emptyDeviceLocalSnapshot())
  restoreDeviceLocalSnapshot(saved)
  await demoRequest('expense-profiles', payment)
  await expect(demoRequest('expense-profiles', { company, action: 'list' })).resolves.toMatchObject({
    profiles: [expect.objectContaining({ id: party })], payments: [expect.objectContaining({ id: paymentId })],
  })
  await expect(demoRequest('expense-report', { company, from: '2026-11-01', to: '2026-11-30', offset: 0 }))
    .resolves.toMatchObject({ count: 1 })
})

it('preserves one Lottery organization and its receipt across snapshot reopen without touching old Khata books', async () => {
  await demoRequest('create', { table: 'khata_companies', row: { id: actor, name: 'Existing shop' } })
  const input = { method: 'createOrganization', payload: { name: 'Lottery shop' }, operationId: crypto.randomUUID() }
  expect(await deviceLottery({ method: 'listOrganizations', payload: {} }, actor)).toEqual([])
  const created = await deviceLottery(input, actor)
  const saved = JSON.parse(JSON.stringify(readDeviceLocalSnapshot()))
  restoreDeviceLocalSnapshot(emptyDeviceLocalSnapshot())
  expect(await deviceLottery({ method: 'listOrganizations', payload: {} }, party)).toEqual([])
  restoreDeviceLocalSnapshot(saved)
  expect(await deviceLottery(input, actor)).toEqual(created)
  await expect(deviceLottery({ ...input, payload: { name: 'Changed' } }, actor)).rejects.toThrow('IDEMPOTENCY_CONFLICT')
  expect(await deviceLottery({ method: 'listOrganizations', payload: {} }, actor)).toHaveLength(1)
  expect(await demoRequest('companies', {})).toEqual([{ id: actor, name: 'Existing shop' }])
})
