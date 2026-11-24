// @vitest-environment node
import kernel from '../../supabase/tests/sync-v2/kernel.sql?raw'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Command, Json } from './command'
import { acceptCommand, type WithSyncTransaction } from './transaction'

const db = new PGlite()
const scope = { kind: 'company', id: 'company', epoch: 'epoch' } as const
const key = ['actor', scope.kind, scope.id, scope.epoch]
const command: Command = {
  protocolVersion: 2, operationId: 'payment-a', actorId: 'actor', deviceRegistrationId: 'registered',
  scope, commandType: 'payment', schemaVersion: 1, entityId: 'payment-a', children: {},
  dependsOn: [], baseRevision: null, clientSequence: '1', createdAt: '2026-11-24T00:00:00Z',
  payload: { amount: '100' },
}

beforeAll(async () => {
  await db.exec(kernel)
  await db.exec(`create table test_ledger (id text primary key, amount bigint not null);
    insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle)
    values ('actor','company','company','epoch','active');`)
})
afterAll(() => db.close())

function transaction(failFinish = false): WithSyncTransaction {
  return work => db.transaction(async sql => work({
    async lockAuthorizedScope(actor, registration, scope) {
      const found = await sql.query(`select 1 from sync_v2.scope
        where actor_id=$1 and kind=$2 and scope_id=$3 and epoch=$4 and lifecycle='active' for update`,
      [actor, scope.kind, scope.id, scope.epoch])
      if (registration !== 'registered' || !found.rows.length) throw new Error('DENIED')
    },
    async findReceipt(operationId) {
      const found = await sql.query<{ digest: string; sequence: string; result: Json }>(
        `select digest, seq::text as sequence, result from sync_v2.receipt
          where actor_id=$1 and kind=$2 and scope_id=$3 and epoch=$4 and operation_id=$5`, [...key, operationId])
      return found.rows[0] ?? null
    },
    async assertPreconditions() { /* Synthetic payment fixture has no dependencies. */ },
    async post(input) {
      await sql.query('insert into test_ledger values ($1, $2)', [input.entityId, '100'])
      return { result: input.entityId, changes: [input.entityId] }
    },
    async finish(id, digest, result, changes) {
      const { rows } = await sql.query<{ sequence: string }>(
        'select sync_v2.finish($1,$2,$3,$4,$5,$6,$7,$8)::text as sequence',
        [...key, id, digest, JSON.stringify(result), JSON.stringify(changes)])
      if (failFinish) throw new Error('INJECTED_FAILURE')
      return { sequence: rows[0].sequence, digest, result }
    },
  }))
}

it('deduplicates retries, rolls back posting and feed together, and keeps equal payments distinct', async () => {
  const first = await acceptCommand('actor', command, transaction())
  const retries = await Promise.all(Array.from({ length: 100 }, () => acceptCommand('actor', command, transaction())))
  expect(retries).toEqual(Array.from({ length: 100 }, () => first))
  await expect(acceptCommand('actor', { ...command, payload: { amount: '200' } }, transaction()))
    .rejects.toThrow('DIGEST_MISMATCH')
  await expect(acceptCommand('actor', { ...command, deviceRegistrationId: 'revoked' }, transaction()))
    .rejects.toThrow('DENIED')
  const second = { ...command, operationId: 'payment-b', entityId: 'payment-b' }
  await expect(acceptCommand('actor', second, transaction(true))).rejects.toThrow('INJECTED_FAILURE')
  expect((await db.query('select id from test_ledger order by id')).rows).toEqual([{ id: 'payment-a' }])
  expect((await acceptCommand('actor', second, transaction())).sequence).toBe('2')
  expect((await db.query('select seq::text from sync_v2.event order by seq')).rows)
    .toEqual([{ seq: '1' }, { seq: '2' }])
  expect((await db.query('select sum(amount)::text as total from test_ledger')).rows)
    .toEqual([{ total: '200' }])
  await db.exec("update sync_v2.scope set lifecycle='retired'")
  await db.transaction(async sql => {
    await sql.exec('delete from test_ledger')
    await sql.query('select sync_v2.record_company_purge($1,$2,$3)', [key[0], scope.id, scope.epoch])
  })
  expect((await db.query("select change from sync_v2.event where seq=3")).rows)
    .toEqual([{ change: { type: 'scope-purged' } }])
  await expect(acceptCommand('actor', command, transaction())).rejects.toThrow('DENIED')

}, 30_000)
