import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import postgres from 'postgres'
import { createPostgresVoucherTransaction } from '../src/sync-v2/postgres-voucher.ts'
import { createVoucherSyncGateway } from '../src/sync-v2/voucher-gateway.ts'
import { setup } from './sql-fixture.mjs'

const url = new URL(process.env.KHATA_SYNC_V2_TEST_URL ?? 'http://missing')
assert.equal(url.protocol, 'postgres:')
assert.equal(url.hostname, '127.0.0.1')
assert.equal(url.pathname, '/khata_sync_v2_test')
assert.equal(url.search, '')
const sql = postgres(url.toString(), { max: 12, connection: { statement_timeout: 15000 } })
const owner = '11111111-1111-7111-8111-111111111111'
const other = '22222222-2222-7222-8222-222222222222'
const ledgerOwner = crypto.randomUUID(), otherLedgerOwner = crypto.randomUUID()
const company = crypto.randomUUID(), party = crypto.randomUUID()
const scope = [owner, 'company', company, 'fixture-epoch']

async function send(op, id, { actor = owner, device = 'phone', amount = '100', fail = false,
  kind = 'receipt', reverses = null, note = 'Fixture', beforeLock = undefined, beforeCommit = undefined } = {}) {
  const command = {
    protocolVersion: 2, operationId: op, actorId: actor, deviceRegistrationId: device,
    scope: { kind: 'company', id: company, epoch: scope[3] }, commandType: 'khata-post',
    schemaVersion: 1, entityId: id, children: {}, dependsOn: [], baseRevision: null,
    clientSequence: '1', createdAt: '2026-11-24T00:00:00Z',
    payload: { id, company, party, amount, kind, reverses, date: '2026-11-24', method: 'cash', reference: '', note },
  }
  const transaction = createPostgresVoucherTransaction(
    work => sql.begin(async tx => {
      const result = await work(async (statement, params = []) => {
        if (statement.includes('pg_advisory_xact_lock')) await beforeLock?.(tx)
        return tx.unsafe(statement, params)
      })
      await beforeCommit?.(tx)
      if (fail) throw new Error('INJECTED_LOST_TRANSACTION')
      return result
    }),
    async (query, principal, registration) => {
      const allowed = await query(
        'select registration_id from sync_v2.test_device where actor_id=$1 and registration_id=$2 and not revoked and (expires_at is null or expires_at > now()) for share',
        [principal, registration])
      if (!allowed.length) throw new Error('DEVICE_DENIED')
    },
  )
  const gateway = createVoucherSyncGateway({
    baseUrl: 'https://admin.example.test',
    fetchImpl: async (_, init) => new Headers(init?.headers).get('authorization') === 'Bearer isolated-session'
      ? Response.json({ version: 'orbis.customer.v1', customer: { orbisIdentityId: actor, displayId: 'ORB-U-23456789' } })
      : new Response(null, { status: 401 }),
  }, transaction)
  return (await gateway('isolated-session', command)).result
}

try {
  assert.equal((await sql`select count(*)::int as n from information_schema.tables where table_schema='public'`)[0].n, 0)
  const init = await sql.reserve()
  try {
    await setup({exec: text => init.unsafe(text), query: async (text, params=[]) => ({rows:await init.unsafe(text,params)})})
    for (const file of [
      'supabase/migrations/20261101144338_expense_profile_schedules.sql',
      'supabase/migrations/20261105101338_safe_retired_company_purge.sql',
      'supabase/tests/sync-v2/voucher-stock-order.sql',
      'supabase/tests/sync-v2/purge-stock-order.sql',
      'supabase/tests/sync-v2/kernel.sql', 'supabase/tests/sync-v2/khata-writer.sql', 'supabase/tests/sync-v2/voucher-capture.sql',
    ]) await init.unsafe(await readFile(file, 'utf8'))
    await init.unsafe('grant usage on schema auth to authenticated')
  } finally { init.release() }
  await sql`insert into orbis_khata.ledger_owners(id,legacy) values (${ledgerOwner},false),(${otherLedgerOwner},false)`
  await sql`insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference)
    values (${owner},${ledgerOwner},'fixture'),(${other},${otherLedgerOwner},'fixture')`
  await sql`insert into public.khata_companies(id,owner_id,name) values (${company},${ledgerOwner},'Fixture')`
  await sql`insert into public.khata_parties(id,company_id,name,kind) values (${party},${company},'Fixture','both')`
  await sql.unsafe("insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle) values ($1,$2,$3,$4,'active')",scope)
  await sql`insert into sync_v2.test_device values (${owner},'phone',false,null),(${owner},'revoked',true,null),(${owner},'expired',false,now()-interval '1 second')`
  const sessions = await Promise.all(Array.from({length:8},()=>sql`select pg_backend_pid() as pid, clock_timestamp() as started, pg_sleep(1), clock_timestamp() as ended`))
  assert.equal(new Set(sessions.map(([x])=>x.pid)).size,8)
  assert(Math.max(...sessions.map(([x])=>+new Date(x.started))) < Math.min(...sessions.map(([x])=>+new Date(x.ended))))
  const operation = crypto.randomUUID(), first = crypto.randomUUID(), second = crypto.randomUUID()
  await Promise.all(Array.from({length:100},()=>send(operation,first)))
  assert.deepEqual(await send(operation,first),{entityId:first})
  await assert.rejects(send(operation,first,{amount:'200'}),/SYNC_OPERATION_DIGEST_MISMATCH/)
  await assert.rejects(send(crypto.randomUUID(),second,{actor:other}),/COMPANY_DENIED/)
  await assert.rejects(send(crypto.randomUUID(),second,{device:'revoked'}),/DEVICE_DENIED/)
  await assert.rejects(send(crypto.randomUUID(),second,{device:'expired'}),/DEVICE_DENIED/)
  await assert.rejects(send(crypto.randomUUID(),second,{fail:true}),/INJECTED_LOST_TRANSACTION/)
  const secondOperation = crypto.randomUUID()
  let attempts = 0
  const faulted = await send(secondOperation,second,{beforeCommit:async tx=>{
    attempts++
    if (attempts === 1) await tx.unsafe("do $$ begin raise exception using errcode='40P01'; end $$")
    if (attempts === 2) await tx.unsafe("do $$ begin raise exception using errcode='40001'; end $$")
  }})
  assert.equal(attempts,3)
  assert.deepEqual(faulted,{entityId:second})
  assert.deepEqual(await send(secondOperation,second),faulted)
  const exhaustedOperation = crypto.randomUUID(), exhaustedVoucher = crypto.randomUUID()
  let exhausted = 0
  await assert.rejects(send(exhaustedOperation,exhaustedVoucher,{beforeCommit:async tx=>{
    exhausted++
    await tx.unsafe("do $$ begin raise exception using errcode='40001'; end $$")
  }}),error=>error.code==='40001')
  assert.equal(exhausted,3)
  assert.equal((await sql`select count(*)::int as n from public.khata_vouchers where id=${exhaustedVoucher}`)[0].n,0)
  assert.equal((await sql`select count(*)::int as n from sync_v2.receipt where operation_id=${exhaustedOperation}`)[0].n,0)
  console.log('PASS: native 40P01/40001 retry preserves operation identity and exhausted retries leave no effect.')
  assert.equal((await sql`select count(*)::int as n from sync_v2.receipt`)[0].n,2)
  assert.equal((await sql`select sum(amount_minor)::text as total from public.khata_vouchers`)[0].total,'200')
  assert.deepEqual((await sql`select seq::text from sync_v2.event as e order by e.seq`).map(x=>x.seq),['1','2'])
  const firstFeed = (await sql`select change::text from sync_v2.event where seq=1`)[0]
  const [event] = JSON.parse(firstFeed.change)
  const voucher = JSON.parse(event.projectionJson)
  assert.equal(event.entityId, first)
  assert.equal(voucher.company_id, company)
  assert.equal(voucher.amount_minor, 100)
  // Legacy posting must emit before commit. A rolled-back probe consumes no sequence.
  const legacy = crypto.randomUUID()
  const legacyPost = (id, { rollback = false, kind = 'receipt', reverses = null, beforePost, afterPost } = {}) => sql.begin(async tx => {
    await beforePost?.(tx)
    await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:ledgerOwner,role:'authenticated'})},true),
      set_config('orbis.khata.gateway_verified','v1',true)`
    await tx`set local role authenticated`
    await tx`select public.khata_post_v1(${id}::uuid,${company}::uuid,${party}::uuid,
      ${kind},'2026-11-24','100','cash','','Legacy fixture',${reverses}::uuid)`
    assert.equal((await tx`select count(*)::int as n from public.khata_vouchers where id=${id}`)[0].n, 1)
    await tx`reset role`
    assert.equal((await tx`select count(*)::int as n from sync_v2.voucher_event where voucher_id=${id}`)[0].n, 1)
    await afterPost?.(tx)
    if (rollback) throw new Error('LEGACY_CAPTURE_ROLLBACK')
  })
  await assert.rejects(legacyPost(crypto.randomUUID(), { rollback: true }), /LEGACY_CAPTURE_ROLLBACK/)
  await legacyPost(legacy)
  await legacyPost(legacy)
  await send(crypto.randomUUID(), legacy, { note: 'Legacy fixture' })
  assert.deepEqual((await sql`select seq::text from sync_v2.event as e order by e.seq`).map(x => x.seq), ['1','2','3'])

  const corrections = await Promise.allSettled(Array.from({ length: 2 }, () =>
    send(crypto.randomUUID(), crypto.randomUUID(), { kind: 'reversal', reverses: first })))
  assert.equal(corrections.filter(x => x.status === 'fulfilled').length, 1)
  assert.equal(corrections.find(x => x.status === 'rejected')?.reason.code, '23505')
  await Promise.all(Array.from({length: 12}, (_, index) => {
    const voucherId = crypto.randomUUID()
    return index % 2 === 0 ? legacyPost(voucherId) : send(crypto.randomUUID(), voucherId)
  }))
  // Direct v1 and v2 must share stock -> voucher ID -> feed even for
  // the same reversal, whose trigger would otherwise acquire stock too late.
  for (const legacyFirst of [true, false]) {
    const id = crypto.randomUUID(), op = crypto.randomUUID()
    const original = legacyFirst ? second : legacy
    const held = Promise.withResolvers(), release = Promise.withResolvers()
    const hold = async tx => {
      const [row] = await tx`select pg_backend_pid() as pid`
      held.resolve(row.pid)
      await release.promise
    }
    const direct = options => legacyPost(id, {kind:'reversal', reverses:original, ...options})
    const sync = options => send(op,id,{kind:'reversal',reverses:original,note:'Legacy fixture',...options})
    const lead = legacyFirst ? direct({afterPost:hold}) : sync({beforeLock:async tx=>{
      await tx`select pg_advisory_xact_lock(hashtextextended('stock-company:'||${company}::text,0))`
      await hold(tx)
    }})
    const ready = Promise.race([held.promise, lead])
    const follow = ready.then(() => legacyFirst ? sync() : direct())
    const sent = Promise.allSettled([lead,follow])
    try {
      const pid = await ready
      let observed = false
      for(let poll=0;poll<100;poll++){
        const [row]=await sql`select exists(select 1 from pg_stat_activity
          where datname=current_database() and ${pid}::int=any(pg_blocking_pids(pid))
          and wait_event='advisory') as waiting`
        if(row.waiting){observed=true;break}
        await sql`select pg_sleep(0.02)`
      }
      assert(observed,'Second caller must wait on stock before taking the voucher ID')
    } finally {
      release.resolve()
      await sent
    }
    await Promise.all([lead,follow])
    assert.deepEqual(await sync(),{entityId:id})
    assert.equal((await sql`select count(*)::int as n from sync_v2.voucher_event where voucher_id=${id}`)[0].n,1)
    assert.equal((await sql`select count(*)::int as n from sync_v2.receipt where operation_id=${op}`)[0].n,1)
  }
  console.log('PASS: both direct legacy/v2 reversal winner orders adopt one event and one receipt.')
  const committedSequences = (await sql`select seq::text from sync_v2.event as e order by e.seq`).map(row => row.seq)
  assert.deepEqual(committedSequences, Array.from({length:18}, (_, i) => String(i+1)))
  assert.equal((await sql`select count(*)::int as n from sync_v2.voucher_event`)[0].n,18)
  await sql`update public.khata_companies set deleted_at=now(),purge_after=now()-interval '1 second' where id=${company}`
  await assert.rejects(sql.begin(async tx=>{
    assert.equal((await tx`select orbis_khata.purge_retired_companies() as n`)[0].n,1)
    throw new Error('PURGE_ROLLBACK')
  }),/PURGE_ROLLBACK/)
  assert.equal((await sql`select count(*)::int as n from public.khata_vouchers`)[0].n,18)
  assert.equal((await sql`select count(*)::int as n from sync_v2.event`)[0].n,18)
  await sql.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtextextended('stock-company:'||${company}::text,0))`
    assert.equal((await sql`select orbis_khata.purge_retired_companies() as n`)[0].n, 0)
    await tx`select id from public.khata_companies where id=${company} for update nowait`
  })
  assert.equal((await sql`select orbis_khata.purge_retired_companies() as n`)[0].n,1)
  assert.deepEqual((await sql`select seq::text,change::text from sync_v2.event as e order by e.seq desc limit 1`)[0],
    {seq:'19',change:'{"type": "scope-purged"}'})
  await assert.rejects(send(operation,first),/COMPANY_DENIED/)
  console.log('PASS: 8 PostgreSQL sessions, 100 retries, real vouchers, authorization, rollback and real purge tombstone')
} finally { await sql.end({timeout:5}) }
