import { afterEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { resolve } from 'node:path'
import { createLocalSqliteRepository, ensureLocalSchema, type SqlitePort, type SqlParams } from '../../src/local-db/sqlite-repository'
import { queueNew } from '../../src/sync/outbox-state'
import { createNativeTransactionalSyncStore, type NativeRecordCodec } from '../../src/offline-integration/native-transactional-sync-store'
import { createSimulatedKhataServer } from '../../src/offline-batch/b-simulated-server'
import { syncCompanyOnce } from '../../src/offline-batch/sync-coordinator'

const ACTOR = 'actor-a', COMPANY = 'company-a', NOW = 1_780_000_000_000
const ids = ['90fd78c8-9696-4f41-b327-83990f08fc01', '90fd78c8-9696-4f41-b327-83990f08fc02']
const grant = { actorId: ACTOR, allowedCompanyIds: [COMPANY], verifiedOnline: true, localUnlockVerified: true,
  revoked: false, validFromMs: NOW - 1000, validUntilMs: NOW + 10_000 }
const newItem = (id = ids[0], entityId = 'voucher-1') => queueNew({ protocolVersion: 1, actorId: ACTOR,
  companyId: COMPANY, operationId: id, commandType: 'fixture-voucher', baseVersion: null,
  createdAt: '2026-11-12T00:00:00Z', payload: { entityId, action: 'put', amountPaise: 1250 } })

/** Maintains one real SQLite connection across all API calls and transactions. */
function createRealSqliteTestPort(): SqlitePort & { close(): void } {
  const fixture = resolve(process.cwd(), 'tests/offline-integration/sqlite-json-port.py')
  const proc: ChildProcessWithoutNullStreams = spawn('python3', ['-u', fixture], { stdio: ['pipe','pipe','pipe'] })
  let nextId = 0, buffer = ''
  const waiting = new Map<number, { resolve: (x: unknown) => void; reject: (e: Error) => void }>()
  proc.stdout.setEncoding('utf8')
  proc.stdout.on('data', (chunk: string) => {
    buffer += chunk
    let index: number
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1)
      const data = JSON.parse(line) as { id: number; result?: unknown; error?: string }
      const promise = waiting.get(data.id)
      if (!promise) continue
      waiting.delete(data.id)
      if (data.error) promise.reject(Error(data.error))
      else promise.resolve(data.result)
    }
  })
  proc.on('exit', () => { for (const p of waiting.values()) p.reject(Error('PYTHON_SQLITE_CLOSED')); waiting.clear() })
  const send = <T>(command: string, sql = '', params: SqlParams = []): Promise<T> => new Promise((ok, fail) => {
    const id = ++nextId
    waiting.set(id, { resolve: value => ok(value as T), reject: fail })
    proc.stdin.write(JSON.stringify({ id, command, sql, params: params.map(x => x instanceof Uint8Array ? {hex: Buffer.from(x).toString('hex')} : x) })+'\n')
  })
  let inTx = false
  return {
    run(sql, params = []) { return send<{changes:number}>('run', sql, params) },
    get<T extends object>(sql: string, params: SqlParams = []) { return send<T|undefined>('get', sql, params) },
    all<T extends object>(sql: string, params: SqlParams = []) { return send<readonly T[]>('all', sql, params) },
    async transaction<T>(action: () => Promise<T>) {
      if (inTx) throw Error('NESTED_TEST_TRANSACTION')
      inTx = true
      await send('begin')
      try { const result = await action(); await send('commit'); return result }
      catch (error) { await send('rollback'); throw error }
      finally { inTx = false }
    },
    close() { proc.kill('SIGTERM') },
  }
}
async function syntheticCodec(): Promise<NativeRecordCodec> {
  const key = await crypto.subtle.generateKey({name:'AES-GCM',length:256}, false, ['encrypt','decrypt'])
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8',{fatal:true})
  const buffer = (b: Uint8Array): ArrayBuffer => {
    const out = new ArrayBuffer(b.byteLength); new Uint8Array(out).set(b); return out
  }
  return {
    async seal(value, scope) {
      const nonce = crypto.getRandomValues(new Uint8Array(12))
      const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv:buffer(nonce),additionalData:buffer(encoder.encode(scope))},key,buffer(encoder.encode(value)))
      return new Uint8Array([...nonce,...new Uint8Array(cipher)])
    },
    async unseal(value, scope) {
      const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:buffer(value.slice(0,12)),additionalData:buffer(encoder.encode(scope))},key,buffer(value.slice(12)))
      return decoder.decode(plain)
    },
  }
}
const ports: Array<ReturnType<typeof createRealSqliteTestPort>> = []
afterEach(() => { for (const p of ports.splice(0)) p.close() })
const ready = async () => {
  const db = createRealSqliteTestPort(); ports.push(db)
  await ensureLocalSchema(db)
  await createLocalSqliteRepository(db).registerScope(ACTOR, COMPANY, '2026-11-12T00:00:00Z')
  const store = createNativeTransactionalSyncStore(db, await syntheticCodec())
  return {db,store}
}
describe('Step 4–6: REAL SQLite transactions with synthetic platform record cipher', () => {
  it('persists encrypted command, sync receipt and event cursor in SQLite', async () => {
    const { db, store } = await ready()
    expect(await store.append(newItem())).toBe('created')
    const raw = await db.get<{ sealed_hex: string }>('SELECT hex(sealed_record) AS sealed_hex FROM local_outbox')
    expect(Buffer.from(raw!.sealed_hex, 'hex').toString('utf8')).not.toContain('voucher-1')
    const server = createSimulatedKhataServer()
    const result = await syncCompanyOnce({ grant, actorId: ACTOR, companyId: COMPANY, nowMs: NOW,
      store, network: server.forIdentity(ACTOR,[COMPANY]), onlineSessionVerified: true })
    expect(result).toMatchObject({accepted:1,imported:1,nextCursor:1})
    expect((await store.pending(ACTOR,COMPANY)).length).toBe(0)
    expect((await store.readFeed(ACTOR,COMPANY)).length).toBe(1)
    expect(await store.cursor(ACTOR,COMPANY)).toBe(1)
  })
  it('rejects changed payload on same id without mutating first row', async () => {
    const {store} = await ready()
    expect(await store.append(newItem())).toBe('created')
    expect(await store.append(newItem())).toBe('already-present')
    await expect(store.append(newItem(ids[0],'different-voucher'))).rejects.toThrow('LOCAL_IDEMPOTENCY_CONFLICT')
    expect((await store.pending(ACTOR,COMPANY)).length).toBe(1)
  })
  it('server accepted-then-timeout retries same ID without double posting', async () => {
    const {store} = await ready(); await store.append(newItem())
    const s = createSimulatedKhataServer(), endpoint = s.forIdentity(ACTOR,[COMPANY]); let once = true
    const net = { ...endpoint, send: async (v: Parameters<typeof endpoint.send>[0]) => {
      const result = await endpoint.send(v)
      if (once) { once=false; throw Error('SYNTHETIC_TIMEOUT') }
      return result
    } }
    expect((await syncCompanyOnce({grant,actorId:ACTOR,companyId:COMPANY,nowMs:NOW,store,network:net,onlineSessionVerified:true})).uncertain).toBe(1)
    expect((await store.pending(ACTOR,COMPANY))[0].attempts).toBe(1)
    expect((await syncCompanyOnce({grant,actorId:ACTOR,companyId:COMPANY,nowMs:NOW,store,network:net,onlineSessionVerified:true})).accepted).toBe(1)
    expect(s.sequence(COMPANY)).toBe(1)
  })
  it('atomic feed import rolls back duplicate event ID and keeps old cursor', async () => {
    const {store} = await ready()
    const first = {companyId:COMPANY,fromCursor:0,nextCursor:1,events:[{
      eventId:'ev-1',companyId:COMPANY,serverSeq:1,entityType:'voucher',entityId:'x',tombstone:false,change:{version:'v1'} }]}
    await store.commitFeedPage(ACTOR,COMPANY,first)
    await expect(store.commitFeedPage(ACTOR,COMPANY,{...first,fromCursor:1,nextCursor:2,
      events:[{...first.events[0],serverSeq:2}]})).rejects.toThrow()
    expect(await store.cursor(ACTOR,COMPANY)).toBe(1)
    expect((await store.readFeed(ACTOR,COMPANY)).length).toBe(1)
  })
  it('rejects an attempt to read as another company', async () => {
    const {store} = await ready(); await store.append(newItem())
    expect(await store.pending(ACTOR,'company-b')).toEqual([])
    expect(await store.cursor(ACTOR,'company-b')).toBe(0)
  })
  it('cannot decrypt existing rows with lost/different key', async () => {
    const {db,store} = await ready(); await store.append(newItem())
    const wrong = createNativeTransactionalSyncStore(db,await syntheticCodec())
    await expect(wrong.pending(ACTOR,COMPANY)).rejects.toThrow()
    expect((await store.pending(ACTOR,COMPANY)).length).toBe(1)
  })
})
