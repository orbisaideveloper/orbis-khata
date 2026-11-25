// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { sqliteFixturePort } from '../../scripts/sync-v2-local-storage-fixture.mjs'
import { runLottery } from '../../src/lottery/service.ts'
import { commandDigest } from '../../src/sync-v2/command.ts'
import { createLotteryPaymentIds } from '../../src/sync-v2/lottery-payment-ids.ts'
import { emptyDeviceLocalSnapshot, restoreDeviceLocalSnapshot } from '../../src/demo/store.ts'

const actor = '11111111-1111-7111-8111-111111111111'
const display = 'ORB-U-ABCDEFGH'
vi.hoisted(() => {
  const makeStorage = () => {
    const records = new Map<string,string>()
    return {getItem:(key:string)=>records.get(key)??null,setItem:(key:string,value:string)=>{records.set(key,String(value))},
      removeItem:(key:string)=>{records.delete(key)},clear:()=>records.clear(),key:(index:number)=>[...records.keys()][index]??null,
      get length(){return records.size}}
  }
  Object.defineProperty(globalThis, 'sessionStorage', {configurable:true,value:makeStorage()})
  Object.defineProperty(globalThis, 'localStorage', {configurable:true,value:makeStorage()})
})
const fixture = vi.hoisted(() => ({
  port: undefined as unknown,
  requestSync: vi.fn(),
  lastCommand: undefined as unknown,
}))
vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    async isInConfigEncryption() { return { result: true } }
    async isSecretStored() { return { result: true } }
  },
}))
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({
    deviceLockStatus: async () => ({secure:true}),
    status: async () => ({nativePlatform:'android',hardwareBacked:true,secretPresent:true}),
  }),
}))
vi.mock('../../src/local-db/android-sqlcipher-runtime', () => ({createAndroidSqlcipherRuntime: () => ({})}))
vi.mock('../../src/local-db/native-cipher-gate', () => ({openVerifiedAndroidSqlcipher: async () => fixture.port}))
vi.mock('../../src/offline-integration/android-hardware-codec', () => ({
  createAndroidHardwareRecordCodec: () => ({
    verifyDeviceCredential: async () => true,
    seal: async (text:string) => new TextEncoder().encode(text.padEnd(60)),
    unseal: async (blob:Uint8Array) => new TextDecoder().decode(blob).trimEnd(),
  }),
}))
vi.mock('../../src/accounting/api', () => ({requestOnlineLotterySync: (...args:unknown[])=>fixture.requestSync(...args)}))

let sqlite: DatabaseSync
beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_KHATA_SYNC_V2_LOTTERY_PAYMENT','enabled')
  localStorage.clear()
  restoreDeviceLocalSnapshot(emptyDeviceLocalSnapshot())
  sqlite = new DatabaseSync(':memory:')
  fixture.port = sqliteFixturePort(sqlite)
  fixture.requestSync.mockReset()
  fixture.lastCommand = undefined
})
afterEach(() => { sqlite.close(); vi.unstubAllEnvs() })

it('uses real Android save with central pairing, inbound snapshot, typed local command, server receipt and reconciled UI ledger', async () => {
  let server: unknown = {}
  const created=await runLottery(server,{method:'createOrganization',operationId:crypto.randomUUID(),payload:{name:'Real flow synthetic'}},actor)
  server=created.state
  const organization=(created.result as {id:string}).id
  const party=await runLottery(server,{method:'createParty',operationId:crypto.randomUUID(),payload:{organizationId:organization,name:'Buyer',partyType:'CUSTOMER'}},actor)
  server=party.state
  const partyId=(party.result as {id:string}).id
  const scope={kind:'lottery-organization',id:organization,epoch:'epoch-a'} as const
  const allRows = Object.entries(server as Record<string,unknown[]>).flatMap(([model,rows]) => rows.map(row => ({
    model,id:(row as {id:string}).id,ordinal:'0',projectionJson:JSON.stringify(row),
  })))
  const initialRows = allRows.map((row,index)=>({...row,ordinal:String(index+1)}))
  const initialCursor=String(initialRows.length)
  let feedPage: unknown=null
  let secondDevice = false
  let pairingNumber = 0
  fixture.requestSync.mockImplementation(async (identity:string, input:unknown) => {
    expect(identity).toBe(actor)
    const req=input as {action:string;command?:any;cursor?:string;after?:string}
    if(req.action==='pair-device') return {actor,client:'android',scope,registration:++pairingNumber === 1 ? 'device-a' : 'device-b',canWrite:true,expiresAt:'2099-01-01T00:00:00Z'}
    if(req.action==='snapshot') {
      const records = secondDevice ? Object.entries(server as Record<string,unknown[]>).flatMap(([model,rows]) =>
        rows.map(row => ({model,id:(row as {id:string}).id,projectionJson:JSON.stringify(row)}))) : initialRows
      const rows = records.map((row,index)=>({...row,ordinal:String(index+1)}))
      const highWater = secondDevice ? (feedPage as {next:string}).next : initialCursor
      return {projection:'lottery-organization-v1',scopeId:organization,epoch:scope.epoch,
        highWater,after:'0',next:String(rows.length),done:true,rows}
    }
    if(req.action==='payment') {
      fixture.lastCommand=req.command
      const request={method:'recordPayment',operationId:req.command.operationId,payload:req.command.payload}
      const calculated=await runLottery(server,request,actor,()=>new Date('2026-11-25T10:00:00Z'),await createLotteryPaymentIds(req.command))
      server=calculated.state
      let cursor=BigInt(initialCursor)
      const events=calculated.changes.map(change=>({seq:String(++cursor),operationId:req.command.operationId,
        change:{model:change.model,id:change.id,ordinal:String(cursor),projectionJson:change.value===null?null:JSON.stringify(change.value)}}))
      feedPage={scopeKind:scope.kind,scopeId:organization,epoch:scope.epoch,from:initialCursor,next:String(cursor),groups:[{first:events[0].seq,last:events.at(-1)!.seq,events}]}
      return {digest:await commandDigest(req.command),sequence:String(cursor),result:calculated.result}
    }
    if(req.action==='feed') return feedPage && req.cursor===initialCursor ? feedPage : {
      scopeKind:scope.kind,scopeId:organization,epoch:scope.epoch,from:req.cursor,next:req.cursor,groups:[],
    }
    throw Error('unexpected action '+req.action)
  })
  const runtime=await import('../../src/native-local/runtime')
  await runtime.enrollVerifiedCentralIdentity(actor, display)
  await expect(runtime.enrollNativeLotteryV2(actor,'a'.repeat(64))).resolves.toMatchObject({organization,registration:'device-a'})
  const operationId=crypto.randomUUID()
  const input={method:'recordPayment',operationId,payload:{organizationId:organization,partyId,occurredAt:'2026-11-25',direction:'RECEIPT',totalAmountPaise:'2500',methodSplit:{cashPaise:'2500'}}}
  const result=await runtime.nativeLocalRequest<{payment:{id:string}}>('lottery',input,actor)
  expect(result.payment.id).toMatch(/^[a-f0-9-]{36}$/u)
  expect(fixture.lastCommand).toBeUndefined()
  await expect(runtime.syncNativeLotteryV2Pending(actor)).resolves.toEqual({organizations:1,pending:1})
  expect((fixture.lastCommand as {entityId:string}).entityId).toBe(result.payment.id)
  const workspace=await runtime.nativeLocalRequest<any>('lottery',{method:'getWorkspace',payload:{organizationId:organization}},actor)
  expect(workspace.payments.some((p:{id:string})=>p.id===result.payment.id)).toBe(true)
  await expect(runtime.syncNativeLotteryV2Pending(actor)).resolves.toEqual({organizations:1,pending:0})
  expect(fixture.requestSync.mock.calls.filter(([,r])=>r.action==='payment')).toHaveLength(1)

  // A distinct fresh Android SQL database enrolled after the payment downloads
  // the authoritative server snapshot; no shared local phone state is reused.
  const second = new DatabaseSync(':memory:')
  try {
    secondDevice = true
    fixture.port = sqliteFixturePort(second)
    vi.resetModules()
    const runtimeB=await import('../../src/native-local/runtime')
    await runtimeB.enrollVerifiedCentralIdentity(actor, display)
    await expect(runtimeB.enrollNativeLotteryV2(actor,'b'.repeat(64)))
      .resolves.toMatchObject({organization,registration:'device-b'})
    const onB=await runtimeB.nativeLocalRequest<any>('lottery',
      {method:'getWorkspace',payload:{organizationId:organization}},actor)
    expect(onB.payments.filter((p:{id:string})=>p.id===result.payment.id)).toHaveLength(1)
    const bPending=await runtimeB.syncNativeLotteryV2Pending(actor)
    expect(bPending.pending).toBe(0)
    expect(fixture.requestSync.mock.calls.filter(([,r])=>r.action==='payment')).toHaveLength(1)
  } finally { second.close() }
})

it('refuses to enroll a preexisting local-only organization without erasing its financial records', async () => {
  const runtime=await import('../../src/native-local/runtime')
  await runtime.enrollVerifiedCentralIdentity(actor, display)
  const created=await runtime.nativeLocalRequest<{id:string}>('lottery', {
    method:'createOrganization',operationId:crypto.randomUUID(),payload:{name:'Existing local-only books'},
  },actor)
  const organization=created.id
  const scope={kind:'lottery-organization',id:organization,epoch:'epoch-a'} as const
  fixture.requestSync.mockImplementation(async (_identity:string, input:unknown) => {
    if ((input as {action:string}).action !== 'pair-device') throw Error('unexpected server snapshot for legacy books')
    return {actor,client:'android',scope,registration:'device-local',canWrite:true,expiresAt:'2099-01-01T00:00:00Z'}
  })
  await expect(runtime.enrollNativeLotteryV2(actor,'c'.repeat(64)))
    .rejects.toThrow('SYNC_LOTTERY_LEGACY_MIGRATION_REQUIRED')
  const books=await runtime.nativeLocalRequest<any>('lottery',
    {method:'getWorkspace',payload:{organizationId:organization}},actor)
  expect(books.organization.id).toBe(organization)
  expect(fixture.requestSync.mock.calls.filter(([,request])=>request.action==='snapshot')).toHaveLength(0)
})
