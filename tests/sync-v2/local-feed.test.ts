import { describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { DatabaseSync } from 'node:sqlite'
import { sqliteFixturePort } from '../../scripts/sync-v2-local-storage-fixture.mjs'
import { createLocalFeed } from '../../src/sync-v2/local-feed'
import { createLocalFeedCodec, openIndexedDbLocalFeedStorage, openSqliteLocalFeedStorage, withSqliteLocalFeedTransaction } from '../../src/sync-v2/local-feed-storage'
import type { GroupedPage } from '../../src/sync-v2/grouped-feed'
import { createLotteryPaymentOutbox } from '../../src/sync-v2/lottery-payment-outbox'
import type { PaymentCommand } from '../../src/sync-v2/lottery-payment-command'

const epoch = 'test-epoch'
const cut = { epoch, sequence: '9007199254740992' }
const before = { collection: 'projection', id: 'first', value: '200.00' }
const scope = { kind: 'company', id: 'org', epoch } as const
const changes = { first: '9007199254740993', last: '9007199254740994', events: [
  { seq: '9007199254740993', operationId: 'payment-op', change: { id: 'first', value: '123.00' } },
  { seq: '9007199254740994', operationId: 'payment-op', change: { id: 'second', value: '77.00' } },
] }
const page = { epoch, scopeKind: scope.kind, scopeId: scope.id, from: cut.sequence, next: changes.last, groups: [changes] }

async function codec() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const encoder = new TextEncoder()
  const options = (iv: Uint8Array<ArrayBuffer>, aad: string) =>
    ({ name: 'AES-GCM', iv, additionalData: encoder.encode(aad) })
  return createLocalFeedCodec({
    async seal(value, aad) {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const encrypted = new Uint8Array(await crypto.subtle.encrypt(options(iv, aad), key, encoder.encode(value)))
      const result = new Uint8Array(iv.length + encrypted.length)
      result.set(iv)
      result.set(encrypted, iv.length)
      return result
    },
    async unseal(value, aad) {
      const buffer = new Uint8Array(value)
      return new TextDecoder().decode(await crypto.subtle.decrypt(
        options(buffer.slice(0, 12), aad), key, buffer.slice(12)))
    },
  })
}

function project(event: GroupedPage['groups'][number]['events'][number]) {
  const { id, value } = event.change as { id: string; value: string }
  return [{ collection: 'projection', id, value }]
}

describe('durable v2 feed boundary', () => {
  it('rolls back partial SQLite writes and applies the whole group on retry', async () => {
    const db = new DatabaseSync(':memory:')
    try {
      const store = await openSqliteLocalFeedStorage(sqliteFixturePort(db))
      const cipher = await codec()
      const feed = createLocalFeed('actor', scope, store, cipher, project)
      await expect(feed.apply(page)).rejects.toThrow('SYNC_LOCAL_SNAPSHOT_REQUIRED')
      await feed.installSnapshot(cut, [before])
      db.exec(`CREATE TRIGGER fail_write BEFORE INSERT ON sync_v2_feed_cells
        WHEN NEW.id LIKE '%:second' BEGIN SELECT RAISE(ABORT, 'fault'); END`)
      await expect(feed.apply(page)).rejects.toThrow('fault')
      expect(await feed.cursor()).toEqual(cut)
      expect(await feed.projection('projection', 'first')).toBe('200.00')
      expect(db.prepare("SELECT count(*) AS n FROM sync_v2_feed_cells WHERE id LIKE '%:inbox:%'").get()?.n).toBe(0)
      db.exec('DROP TRIGGER fail_write')
      await feed.apply(page)
      expect(await feed.projection('projection', 'first')).toBe('123.00')
      expect(await feed.projection('projection', 'second')).toBe('77.00')
      expect(await feed.cursor()).toEqual({ epoch, sequence: changes.last })
      const cipherRows = db.prepare('SELECT sealed FROM sync_v2_feed_cells').all()
      expect(cipherRows.every(row => /^[A-Za-z0-9+/]+=*$/u.test(String(row.sealed)))).toBe(true)
      expect(db.prepare("SELECT count(*) AS n FROM sync_v2_feed_cells WHERE id LIKE '%:inbox:%'").get()?.n).toBe(2)
    } finally {
      db.close()
    }
  })

  it('serializes tabs, recovers after reopen, isolates accounts and replaces a stale image', async () => {
    const factory = new IDBFactory()
    const first = await openIndexedDbLocalFeedStorage(factory, 'test')
    const second = await openIndexedDbLocalFeedStorage(factory, 'test')
    const cipher = await codec()
    try {
      const a = createLocalFeed('actor', scope, first, cipher, project)
      const b = createLocalFeed('actor', scope, second, cipher, project)
      await a.installSnapshot(cut, [before])
      const results = await Promise.allSettled([a.apply(page), b.apply(page)])
      expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected'])
      expect(await b.cursor()).toEqual({ epoch, sequence: changes.last })
      const other = createLocalFeed('actor', { ...scope, kind: 'lottery-organization' }, second, cipher, project)
      const stranger = createLocalFeed('other', scope, second, cipher, project)
      expect(await other.cursor()).toBeNull()
      expect(await stranger.cursor()).toBeNull()
      await expect(b.installSnapshot(cut, [before], cut)).rejects.toThrow('SYNC_LOCAL_SNAPSHOT_STALE')
      await expect(b.apply({ ...page, scopeId: 'other' })).rejects.toThrow('SYNC_LOCAL_WRONG_SCOPE')
      await b.installSnapshot({ epoch, sequence: '9007199254740995' }, [before], { epoch, sequence: changes.last })
      expect(await a.projection('projection', 'second')).toBeUndefined()
    } finally {
      first.close()
      second.close()
    }
    const reopened = await openIndexedDbLocalFeedStorage(factory, 'test')
    try {
      const durable = createLocalFeed('actor', scope, reopened, cipher, project)
      expect(await durable.cursor()).toEqual({ epoch, sequence: '9007199254740995' })
      expect(await durable.projection('projection', 'first')).toBe('200.00')
      await expect(durable.apply(page)).rejects.toThrow('SYNC_FEED_SCOPE_OR_CURSOR')
    } finally {
      reopened.close()
    }
  })

  it('commits a large encrypted SQLite snapshot in bounded parts and rolls back on a part failure', async () => {
    const db = new DatabaseSync(':memory:')
    try {
      const store = await openSqliteLocalFeedStorage(sqliteFixturePort(db))
      const feed = createLocalFeed('actor', scope, store, await codec(), project)
      await feed.installSnapshot(cut, [before])
      const big = '💰ব'.repeat(155_000)
      const next = { epoch, sequence: changes.last }
      db.exec(`CREATE TRIGGER fail_chunk BEFORE INSERT ON sync_v2_feed_cells
        WHEN NEW.id LIKE '%:1' BEGIN SELECT RAISE(ABORT, 'part write failed'); END`)
      await expect(feed.installSnapshot(next, [{ ...before, value: big }], cut)).rejects.toThrow('part write failed')
      expect(await feed.cursor()).toEqual(cut)
      expect(await feed.projection('projection', before.id)).toBe(before.value)
      expect(db.prepare('SELECT count(*) AS n FROM sync_v2_feed_cells').get()?.n).toBe(2)
      db.exec('DROP TRIGGER fail_chunk')
      await feed.installSnapshot(next, [{ ...before, value: big }], cut)
      expect(await feed.cursor()).toEqual(next)
      expect(await feed.projection('projection', before.id)).toBe(big)
      expect(Number(db.prepare('SELECT max(length(sealed)) AS n FROM sync_v2_feed_cells').get()?.n)).toBeLessThan(300_000)
    } finally {
      db.close()
    }
  })

  it('applies a recovered 510-event transaction and keeps the cursor on interrupted download', async () => {
    const store = await openIndexedDbLocalFeedStorage(new IDBFactory(), 'recovered')
    try {
      const durable = createLocalFeed('actor', scope, store, await codec(), project)
      await durable.installSnapshot({ epoch, sequence: '0' }, [])
      const events = Array.from({ length: 510 }, (_, index) => ({
        seq: String(index + 1), operationId: 'bulk', change: { id: 'total', value: String(index + 1) },
      }))
      const blocks = await Promise.all(events.map(async event => {
        const bytes = new TextEncoder().encode(JSON.stringify(event))
        const toHex = (data: Uint8Array) => Array.from(data, byte => byte.toString(16).padStart(2, '0')).join('')
        return { size: bytes.length, sha256: toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))), hex: toHex(bytes) }
      }))
      const manifest = { version: 1, purpose: 'group', scopeKind: scope.kind, scopeId: scope.id,
        epoch, transfer: 'batch', from: '0', next: '510', items: blocks.length,
        bytes: blocks.reduce((total, block) => total + block.size, 0) } as const
      const fragment = async (item: number, offset: number) => ({
        ...blocks[item - 1], transfer: manifest.transfer, item, offset, nextOffset: blocks[item - 1].size,
      })
      await expect(durable.apply({ ...page, from: '0', next: '510', groups: [
        { first: '1', last: '510', events },
      ] })).rejects.toThrow('SYNC_FEED_GROUP_INVALID')
      await expect(durable.recoverGroup(manifest, async (item, offset) => {
        if (item === 510) throw new Error('interrupted')
        return fragment(item, offset)
      })).rejects.toThrow('interrupted')
      expect(await durable.cursor()).toEqual({ epoch, sequence: '0' })
      expect(await durable.projection('projection', 'total')).toBeUndefined()
      await durable.recoverGroup(manifest, fragment)
      expect(await durable.cursor()).toEqual({ epoch, sequence: '510' })
      expect(await durable.projection('projection', 'total')).toBe('510')
    } finally {
      store.close()
    }
  })

  it('leaves the prior image and cursor intact when a projection is unsupported', async () => {
    const store = await openIndexedDbLocalFeedStorage(new IDBFactory(), 'test')
    try {
      const feed = createLocalFeed('actor', scope, store, await codec(), event =>
        event.seq === changes.last ? [] : project(event))
      await feed.installSnapshot(cut, [before])
      await expect(feed.apply(page)).rejects.toThrow('SYNC_LOCAL_PROJECTION_UNSUPPORTED')
      await expect(feed.installSnapshot({ epoch, sequence: changes.last }, [
        before, { ...before, id: 'large', value: 'x'.repeat(2_100_000) },
      ], cut)).rejects.toThrow('SYNC_LOCAL_RECORD_SIZE')
      expect(await feed.cursor()).toEqual(cut)
      expect(await feed.projection('projection', 'first')).toBe('200.00')
    } finally {
      store.close()
    }
  })
})


describe('native financial state and typed v2 payment outbox atomic boundary', () => {
  const actor = 'actor-a'
  const paymentScope = { kind: 'lottery-organization', id: 'lottery-org-a', epoch: 'epoch-a' } as const
  const registration = 'registered-device-a'
  const command = (): PaymentCommand => ({
    protocolVersion: 2, schemaVersion: 1, commandType: 'lottery-payment', actorId: actor,
    deviceRegistrationId: registration, scope: paymentScope, baseRevision: null,
    children: {}, dependsOn: [], createdAt: '2026-11-25T00:00:00Z',
    clientSequence: '1', operationId: crypto.randomUUID(), entityId: crypto.randomUUID(),
    payload: { organizationId: paymentScope.id, partyId: 'party-a', occurredAt: '2026-11-25',
      direction: 'RECEIPT', totalAmountPaise: '100', methodSplit: { cashPaise: '100' } },
  })
  const proof = {
    cursor: async () => ({ epoch: paymentScope.epoch, sequence: '0' }),
    apply: async () => {}, appliedOperation: async () => null,
  }

  it('saves a financial row and the existing typed v2 payment command in one SQLite transaction', async () => {
    const db = new DatabaseSync(':memory:')
    try {
      const port = sqliteFixturePort(db)
      db.exec('CREATE TABLE payment_ledger(id TEXT PRIMARY KEY NOT NULL, amount TEXT NOT NULL)')
      const cmd = command()
      const cipher = await codec()
      await withSqliteLocalFeedTransaction(port, async storage => {
        await port.run('INSERT INTO payment_ledger(id,amount) VALUES(?,?)', [cmd.entityId, '100'])
        await createLotteryPaymentOutbox(actor, paymentScope, registration, storage, cipher, proof).enqueue(cmd)
      })
      const durable = await openSqliteLocalFeedStorage(port)
      const outbox = createLotteryPaymentOutbox(actor, paymentScope, registration, durable, cipher, proof)
      expect(await outbox.pending()).toEqual([cmd.operationId])
      expect(db.prepare('SELECT amount FROM payment_ledger WHERE id=?').get(cmd.entityId)).toEqual({ amount: '100' })
    } finally { db.close() }
  })

  it('rolls back the payment row when the existing v2 outbox cannot be persisted', async () => {
    const db = new DatabaseSync(':memory:')
    try {
      const port = sqliteFixturePort(db)
      db.exec('CREATE TABLE payment_ledger(id TEXT PRIMARY KEY NOT NULL, amount TEXT NOT NULL)')
      const cmd = command()
      db.exec(`CREATE TABLE sync_v2_feed_cells(id TEXT PRIMARY KEY NOT NULL, sealed TEXT NOT NULL);
        CREATE TRIGGER fail_outbox BEFORE INSERT ON sync_v2_feed_cells BEGIN SELECT RAISE(ABORT, 'outbox unavailable'); END`)
      const cipher = await codec()
      await expect(withSqliteLocalFeedTransaction(port, async storage => {
        await port.run('INSERT INTO payment_ledger(id,amount) VALUES(?,?)', [cmd.entityId, '100'])
        await createLotteryPaymentOutbox(actor, paymentScope, registration, storage, cipher, proof).enqueue(cmd)
      })).rejects.toThrow('outbox unavailable')
      expect(db.prepare('SELECT count(*) AS n FROM payment_ledger').get()).toEqual({ n: 0 })
      expect(db.prepare('SELECT count(*) AS n FROM sync_v2_feed_cells').get()).toEqual({ n: 0 })
      db.exec('DROP TRIGGER fail_outbox')
      await withSqliteLocalFeedTransaction(port, async storage => {
        await port.run('INSERT INTO payment_ledger(id,amount) VALUES(?,?)', [cmd.entityId, '100'])
        await createLotteryPaymentOutbox(actor, paymentScope, registration, storage, cipher, proof).enqueue(cmd)
      })
      expect(db.prepare('SELECT count(*) AS n FROM payment_ledger').get()).toEqual({ n: 1 })
      const store = await openSqliteLocalFeedStorage(port)
      expect(await createLotteryPaymentOutbox(actor, paymentScope, registration, store, cipher, proof).pending()).toEqual([cmd.operationId])
    } finally { db.close() }
  })

  it('rejects post-transaction access to scoped storage instead of silently writing outside the financial transaction', async () => {
    const db = new DatabaseSync(':memory:')
    try {
      const port = sqliteFixturePort(db)
      let leaked: Parameters<Parameters<typeof withSqliteLocalFeedTransaction>[1]>[0] | undefined
      await withSqliteLocalFeedTransaction(port, async storage => { leaked = storage })
      await expect(leaked!.read('any-id')).rejects.toThrow('SYNC_LOCAL_TRANSACTION_CLOSED')
      await expect(leaked!.commit('any-id', null, [])).rejects.toThrow('SYNC_LOCAL_TRANSACTION_CLOSED')
    } finally { db.close() }
  })

  it('rolls back the typed outbox when the financial projection fails after enqueue', async () => {
    const db = new DatabaseSync(':memory:')
    try {
      const port = sqliteFixturePort(db)
      db.exec(`CREATE TABLE payment_ledger(id TEXT PRIMARY KEY NOT NULL, amount TEXT NOT NULL);
        CREATE TRIGGER fail_payment BEFORE INSERT ON payment_ledger BEGIN SELECT RAISE(ABORT, 'payment not committed'); END`)
      const cmd = command()
      const cipher = await codec()
      await expect(withSqliteLocalFeedTransaction(port, async storage => {
        await createLotteryPaymentOutbox(actor, paymentScope, registration, storage, cipher, proof).enqueue(cmd)
        await port.run('INSERT INTO payment_ledger(id,amount) VALUES(?,?)', [cmd.entityId, '100'])
      })).rejects.toThrow('payment not committed')
      const durable = await openSqliteLocalFeedStorage(port)
      expect(await createLotteryPaymentOutbox(actor, paymentScope, registration, durable, cipher, proof).pending()).toEqual([])
      expect(db.prepare('SELECT count(*) AS n FROM payment_ledger').get()).toEqual({ n: 0 })
    } finally { db.close() }
  })

  it('retains the exact payment identity across reopen and rejects changed payload replay atomically', async () => {
    const db = new DatabaseSync(':memory:')
    try {
      const port = sqliteFixturePort(db)
      db.exec('CREATE TABLE payment_ledger(id TEXT PRIMARY KEY NOT NULL, amount TEXT NOT NULL)')
      const cipher = await codec()
      const cmd = command()
      const save = (current: PaymentCommand) => withSqliteLocalFeedTransaction(port, async storage => {
        const outbox = createLotteryPaymentOutbox(actor, paymentScope, registration, storage, cipher, proof)
        await outbox.enqueue(current)
        const saved = await port.run('INSERT INTO payment_ledger(id,amount) VALUES(?,?) ON CONFLICT(id) DO NOTHING',
          [current.entityId, (current.payload as { totalAmountPaise: string }).totalAmountPaise])
        if (saved.changes !== 1) {
          const prior = db.prepare('SELECT amount FROM payment_ledger WHERE id=?').get(current.entityId) as { amount?: string }
          if (prior?.amount !== (current.payload as { totalAmountPaise: string }).totalAmountPaise) {
            throw new Error('PAYMENT_LOCAL_IDEMPOTENCY_CONFLICT')
          }
        }
      })
      await save(cmd)
      await save(structuredClone(cmd))
      const changed = { ...cmd, payload: { ...cmd.payload as object, totalAmountPaise: '200', methodSplit: { cashPaise: '200' } } }
      await expect(save(changed)).rejects.toThrow('SYNC_OPERATION_DIGEST_MISMATCH')
      const other = { ...cmd, operationId: crypto.randomUUID(), entityId: crypto.randomUUID() }
      await save(other)
      const store = await openSqliteLocalFeedStorage(port)
      const outbox = createLotteryPaymentOutbox(actor, paymentScope, registration, store, cipher, proof)
      expect(new Set(await outbox.pending())).toEqual(new Set([cmd.operationId, other.operationId]))
      expect(db.prepare('SELECT count(*) AS n FROM payment_ledger').get()).toEqual({ n: 2 })
    } finally { db.close() }
  })

})
