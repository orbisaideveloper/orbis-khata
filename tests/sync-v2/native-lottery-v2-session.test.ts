// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { sqliteFixturePort } from '../../scripts/sync-v2-local-storage-fixture.mjs'
import type { NativeRecordCodec } from '../../src/offline-integration/native-transactional-sync-store.ts'
import { runLottery } from '../../src/lottery/service.ts'
import { openSqliteLocalFeedStorage } from '../../src/sync-v2/local-feed-storage.ts'
import { nativeLotteryPaymentContext, verifyNativeLotteryBinding, type NativeLotteryBinding } from '../../src/native-local/lottery-v2-session.ts'

const actor = '11111111-1111-7111-8111-111111111111'
const scope = { kind: 'lottery-organization', id: 'lottery-org-a', epoch: 'epoch-a' } as const
function binding(): NativeLotteryBinding {
  return { actor, client: 'android', registration: 'device-a', scope, canWrite: true,
    expiresAt: '2099-01-01T00:00:00Z', credential: 'a'.repeat(64) }
}
async function envelope(): Promise<NativeRecordCodec> {
  const key = await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt'])
  return {
    async seal(text, context) {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const bytes = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(context)},key,new TextEncoder().encode(text)))
      const result = new Uint8Array(iv.length+bytes.length)
      result.set(iv);result.set(bytes,iv.length)
      return result
    },
    async unseal(value, context) {
      const bytes = new Uint8Array(value)
      return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:new TextEncoder().encode(context)},key,bytes.slice(12)))
    },
  }
}

describe('actual native payment path -> existing typed v2 outbox', () => {
  it('rejects wrong actor, organization, expired proof or removed write permission', () => {
    const valid = binding()
    expect(verifyNativeLotteryBinding(valid, actor, scope.id)).toEqual(valid)
    for (const candidate of [
      {...valid, actor:'other'}, {...valid, canWrite:false}, {...valid, expiresAt:'2020-01-01T00:00:00Z'},
      {...valid, scope:{...scope, id:'foreign'}}, {...valid,credential:'forged'},
    ]) expect(() => verifyNativeLotteryBinding(candidate as NativeLotteryBinding,actor,scope.id)).toThrow('SYNC_LOTTERY_BINDING_UNVERIFIED')
  })

  it('commits real domain payment id, local financial ledger, monotonic sequence and typed outbox together', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      const db = sqliteFixturePort(sqlite)
      sqlite.exec('CREATE TABLE payment_ledger (id TEXT PRIMARY KEY NOT NULL, amount TEXT NOT NULL)')
      const crypt = await envelope()
      const context = nativeLotteryPaymentContext(db,crypt,actor,binding())
      const store = await openSqliteLocalFeedStorage(db)
      await context.feed(store).installSnapshot({epoch:scope.epoch,sequence:'0'},[])
      let state: unknown = {}
      const created = await runLottery(state,{method:'createOrganization',operationId:crypto.randomUUID(),payload:{name:'Synthetic test'}},actor)
      state=created.state
      // The scope must match the authoritative organization identity.
      const organization = (created.result as {id:string}).id
      const linked = {...binding(),scope:{...scope,id:organization}}
      const live = nativeLotteryPaymentContext(db,crypt,actor,linked)
      await live.feed(store).installSnapshot({epoch:scope.epoch,sequence:'0'},[])
      const party=await runLottery(state,{method:'createParty',operationId:crypto.randomUUID(),payload:{organizationId:organization,name:'Seller',partyType:'SELLER',ticketRatePaise:'1000'}},actor)
      state=party.state
      const partyId=(party.result as {id:string}).id
      const make=(operationId:string)=>({method:'recordPayment',operationId,payload:{organizationId:organization,partyId,occurredAt:'2026-11-25',direction:'RECEIPT',totalAmountPaise:'5000',methodSplit:{cashPaise:'5000'}}})
      const paymentIds:string[]=[]
      for (let n=0;n<2;n++) {
        const input=make(crypto.randomUUID())
        let calculated: Awaited<ReturnType<typeof runLottery>> | undefined
        const saved=await live.savePayment(input,async allocateId=>{
          calculated=await runLottery(state,input,actor,()=>new Date('2026-11-25T10:00:00Z'),allocateId)
          return calculated.result
        },async()=>{
          if (!calculated) throw new Error('TEST_PAYMENT_NOT_CALCULATED')
          const id=(calculated.result as {payment:{id:string}}).payment.id
          await db.run('INSERT INTO payment_ledger(id,amount) VALUES(?,?)',[id,'5000'])
        }) as {payment:{id:string}}
        state=calculated!.state
        paymentIds.push(saved.payment.id)
        expect(await live.status(input.operationId)).toBe('pending')
      }
      expect(new Set(paymentIds).size).toBe(2)
      expect(sqlite.prepare('SELECT count(*) AS n FROM payment_ledger').get()).toEqual({n:2})
      const outbox=live.queue(store)
      expect((await outbox.pending()).length).toBe(2)
      // A reopened adapter reads BOTH immutable operations, without losing IDs.
      const restored=nativeLotteryPaymentContext(db,crypt,actor,linked)
      expect((await restored.queue(store).pending()).length).toBe(2)
    } finally {sqlite.close()}
  })

  it('does not save a financial payment if outbox write or command validation fails', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      const db=sqliteFixturePort(sqlite)
      sqlite.exec('CREATE TABLE payment_ledger(id TEXT PRIMARY KEY NOT NULL)')
      const context=nativeLotteryPaymentContext(db,await envelope(),actor,binding())
      const store=await openSqliteLocalFeedStorage(db)
      await context.feed(store).installSnapshot({epoch:scope.epoch,sequence:'0'},[])
      const input={method:'recordPayment',operationId:crypto.randomUUID(),payload:{organizationId:scope.id,partyId:'p',occurredAt:'2026-11-25',direction:'RECEIPT',totalAmountPaise:'5000',methodSplit:{cashPaise:'5000'}}}
      sqlite.exec(`CREATE TRIGGER fail_v2 BEFORE INSERT ON sync_v2_feed_cells
        WHEN NEW.id LIKE '%:pending' BEGIN SELECT RAISE(ABORT, 'outbox unavailable'); END`)
      await expect(context.savePayment(input, async () => ({payment:{id:'wrong'}}),async()=>{
        await db.run('INSERT INTO payment_ledger(id) VALUES(?)',['payment'])
      })).rejects.toThrow('SYNC_LOTTERY_PAYMENT_ID_MISMATCH')
      expect(sqlite.prepare('SELECT count(*) AS n FROM payment_ledger').get()).toEqual({n:0})
      await expect(context.savePayment(input,async allocate=>{
        const id=allocate('foundationLotteryPayment')
        return {payment:{id}}
      },async()=>{await db.run('INSERT INTO payment_ledger(id) VALUES(?)',['payment'])})).rejects.toThrow('outbox unavailable')
      expect(sqlite.prepare('SELECT count(*) AS n FROM payment_ledger').get()).toEqual({n:0})
      expect(await context.status(input.operationId)).toBe('missing')
    } finally {sqlite.close()}
  })
})
