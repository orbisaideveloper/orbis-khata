import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {lockPartySave} from '../supabase/functions/orbis-khata-data/party-save-lock.ts';
import {setup} from './sql-fixture.mjs';

const url = new URL(process.env.KHATA_SYNC_V2_TEST_URL ?? 'http://missing');
assert(url.protocol === 'postgres:' && url.hostname === '127.0.0.1' &&
  url.pathname === '/khata_sync_v2_test' && !url.search);
const sql = postgres(url.toString(), {max: 6, connection: {statement_timeout: 10000}});
const owner = '11111111-1111-7111-8111-111111111111', company = crypto.randomUUID(), stranger = crypto.randomUUID();
const stock = 'stock-company:', expense = 'expense-company:', master = 'master:';

async function fixtureTransaction(work, actor = owner) {
  return sql.begin(async tx => {
    await tx`set local deadlock_timeout = '125ms'`;
    const [{pid}] = await tx`select pg_backend_pid() as pid`;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:actor,role:'authenticated'})},true),
      set_config('orbis.khata.gateway_verified','v1',true)`;
    await tx`set local role authenticated`;
    return work(tx, pid);
  });
}

async function race(leader, waiter) {
  const held = Promise.withResolvers(), release = Promise.withResolvers(), entering = Promise.withResolvers();
  const lead = fixtureTransaction((tx,pid) => leader(tx, async () => {
    held.resolve(pid);
    await release.promise;
  }));
  const follow = Promise.race([held.promise, lead]).then(() => fixtureTransaction((tx,pid) => {
    entering.resolve(pid);
    return waiter(tx);
  }));
  const settled = Promise.allSettled([lead,follow]);
  try {
    const leaderPid = await Promise.race([held.promise, lead]);
    const waiterPid = await Promise.race([entering.promise, follow]);
    let seen = false;
    for (let i=0; i<100 && !seen; i++) {
      const [row] = await sql`select ${leaderPid}::int=any(pg_blocking_pids(${waiterPid}::int)) as waiting`;
      seen = row.waiting;
      if (!seen) await sql`select pg_sleep(0.015)`;
    }
    assert(seen, 'Expected real transaction wait');
  } finally {
    release.resolve();
    await settled;
  }
  return settled;
}
const lock = (tx, key) => tx`select pg_advisory_xact_lock(hashtextextended(${key}||${company}::uuid::text,0))`;
const party = id => ({id,company,name:'Synthetic '+id,kind:'customer',opening_side:'none',opening_amount:'0'});
const save = (tx, payload) => tx`select public.khata_master_save_v2('party',${tx.json(payload)}::jsonb)`;
const post = (tx, payload) => tx`select public.khata_expense_post_v1(${tx.json(payload)}::jsonb)`;
const postV2 = (tx, payload) => tx`select public.khata_expense_post_v2(${tx.json(payload)}::jsonb)`;
const profile = (tx, payload) => tx`select public.khata_expense_profiles_v1(${tx.json(payload)}::jsonb) as result`;
const charge = id => ({id,company,date:'2026-10-01',kind:'charge',amount:'125',category:'Feed',payee:'',
  method:'cash',parent:null,reference:'',note:''});
const rolledBack = async work => {
  await work();
  throw new Error('ROLLBACK_PROBE');
};
function assertOriginalCycle(outcomes) {
  assert(outcomes.every(row => row.status === 'rejected'));
  assert.deepEqual(outcomes.map(row=>row.reason.code ?? row.reason.message).sort(), ['40P01','ROLLBACK_PROBE']);
}
function assertBothCommitted(outcomes) {
  for (const row of outcomes) if (row.status === 'rejected') throw row.reason;
}

try {
  assert.equal((await sql`select count(*)::int as n from information_schema.tables where table_schema='public'`)[0].n,0);
  const init = await sql.reserve();
  try {
    await setup({exec: statement=>init.unsafe(statement), query: async (statement, params=[])=>({rows:await init.unsafe(statement,params)})});
    await init.unsafe(await readFile('supabase/migrations/20261101144338_expense_profile_schedules.sql','utf8'));
    await init.unsafe('grant usage on schema auth to authenticated');
  } finally { init.release(); }
  await sql`insert into orbis_khata.ledger_owners(id,legacy) values(${owner},false),(${stranger},false)`;
  await sql`insert into public.khata_companies(id,owner_id,name) values(${company},${owner},'Synthetic locks')`;

  const oldEdge = party(crypto.randomUUID()), oldDirect = party(crypto.randomUUID());
  assertOriginalCycle(await race(async (tx,hold)=>{
    await lock(tx,master);
    await hold();
    return rolledBack(()=>save(tx,oldEdge));
  }, async tx=>{
    await lock(tx,stock);
    return rolledBack(()=>save(tx,oldDirect));
  }));
  const oldProfileCharge = charge(crypto.randomUUID()), oldExpense = charge(crypto.randomUUID());
  assertOriginalCycle(await race(async (tx,hold)=>{
    await profile(tx,{company,action:'load'});
    await hold();
    return rolledBack(()=>post(tx,oldProfileCharge));
  }, async tx=>{
    await lock(tx,expense);
    return rolledBack(()=>post(tx,oldExpense));
  }));
  assert.equal((await sql`select count(*)::int as n from public.khata_parties`)[0].n,0);
  assert.equal((await sql`select count(*)::int as n from public.khata_expense_events`)[0].n,0);
  console.log('VERIFIED: native 40P01 on old Edge/master and profile/expense orders; both probes rolled back.');

  for(const fixed of [false,true]) {
    if(fixed) await sql.unsafe(await readFile('supabase/tests/sync-v2/expense-master-lock-order.sql','utf8'));
    const warehouse=crypto.randomUUID();
    const document={id:warehouse,company,kind:'warehouse',date:'2026-10-01',code:'LOCKS',
      name:'Stock authorization probe',unit:'',party:null,reference:'',note:'',lines:[]};
    const lifecycle=(tx,action)=>tx`select public.khata_workspace_v3(
      ${tx.json({company,action,name:'Synthetic locks'})}::jsonb)`;
    const [retiring,posting]=await race(async(tx,hold)=>{await lifecycle(tx,'retire');await hold();}, tx=>
      rolledBack(()=>tx`select public.khata_inventory_post_v1(${tx.json(document)}::jsonb)`));
    assert.equal(retiring.status,'fulfilled');
    assert.equal(posting.status,'rejected');
    assert.match(posting.reason.message,fixed ? /COMPANY_NOT_ACCESSIBLE/ : /ROLLBACK_PROBE/);
    assert.equal((await sql`select count(*)::int as n from public.khata_inventory_documents where id=${warehouse}`)[0].n,0);
    await fixtureTransaction(tx=>lifecycle(tx,'restore'));
  }
  console.log('PASS: native direct inventory writer rechecks active company after stock wait.');
  for (const edgeFirst of [true,false]) {
    const edge = party(crypto.randomUUID()), direct = party(crypto.randomUUID());
    const edgeSave = async tx=>{
      await lockPartySave((statement,params)=>tx.unsafe(statement,params), company);
      return save(tx,edge);
    };
    const directSave = tx=>save(tx,direct);
    const first = edgeFirst ? edgeSave : directSave;
    assertBothCommitted(await race(async(tx,hold)=>{await first(tx); await hold();}, edgeFirst ? directSave : edgeSave));
    assert.equal((await sql`select count(*)::int as n from public.khata_parties where id in (${edge.id},${direct.id})`)[0].n,2);
  }

  for (const profileFirst of [true,false]) {
    const operationId = crypto.randomUUID(), profileCharge = charge(crypto.randomUUID()), directCharge = charge(crypto.randomUUID());
    const request = {operationId,company};
    const profilePost = async (tx, abort=false) => {
      const [{result}] = await profile(tx,{company,action:'load',operationId,request});
      if (result.replay) return result.state;
      await post(tx,profileCharge);
      if (abort) throw new Error('ROLLBACK_PROBE');
      const state={...result.state,payments:[...result.state.payments,{id:profileCharge.id}]};
      return (await profile(tx,{company,action:'commit',operationId,request,state,version:result.version}))[0].result.state;
    };
    await assert.rejects(fixtureTransaction(tx=>profilePost(tx,true)), /ROLLBACK_PROBE/);
    assert.equal((await sql`select count(*)::int as n from public.khata_expense_events where id=${profileCharge.id}`)[0].n,0);
    const directPost = tx=>postV2(tx,directCharge);
    const first = profileFirst ? profilePost : directPost;
    assertBothCommitted(await race(async(tx,hold)=>{await first(tx); await hold();}, profileFirst ? directPost : profilePost));
    assert((await fixtureTransaction(profilePost)).payments.some(row=>row.id===profileCharge.id));
    assert.equal((await sql`select count(*)::int as n from public.khata_expense_profile_operations where id=${operationId}`)[0].n,1);
    const [effects] = await sql`select count(*)::int as n,sum(amount_minor)::text as amount
      from public.khata_expense_events where id in (${profileCharge.id},${directCharge.id})`;
    assert.deepEqual({...effects},{n:2,amount:'250'});
  }
  await assert.rejects(fixtureTransaction(tx=>profile(tx,{company,action:'load'}),stranger),/COMPANY_NOT_ACCESSIBLE/);
  await assert.rejects(fixtureTransaction(tx=>postV2(tx,charge(crypto.randomUUID())),stranger),/COMPANY_NOT_ACCESSIBLE/);
  await assert.rejects(fixtureTransaction(tx=>save(tx,party(crypto.randomUUID())),stranger),/COMPANY_NOT_ACCESSIBLE/);
  console.log('PASS: both Master and Expense winner orders, operation replay, exact charges, rollback and wrong-tenant rejection.');
  const purgeSetup = await sql.reserve();
  try {
    for (const file of ['supabase/migrations/20261105101338_safe_retired_company_purge.sql',
    'supabase/tests/sync-v2/kernel.sql','supabase/tests/sync-v2/khata-writer.sql',
    'supabase/tests/sync-v2/purge-stock-order.sql','supabase/tests/sync-v2/purge-sweep.sql']) {
      await purgeSetup.unsafe(await readFile(file,'utf8'));
    }
  } finally { purgeSetup.release(); }
  const early = Array.from({length:50},()=>crypto.randomUUID());
  const later = crypto.randomUUID(), future = crypto.randomUUID();
  await sql`insert into public.khata_companies(id,owner_id,name,deleted_at,purge_after)
    select id,${owner}::uuid,'Retired fixture',now()-interval '31 days',now()-interval '2 days'
    from unnest(${early}::uuid[]) id`;
  await sql`insert into public.khata_companies(id,owner_id,name,deleted_at,purge_after)
    values(${later},${owner},'Eligible later',now()-interval '30 days',now()-interval '1 day'),
      (${future},${owner},'Future',now(),now()+interval '30 days')`;
  await sql`insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference) values(${owner},${owner},'fixture')`;
  await sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle)
    values(${owner},'company',${later},'original','active')`;
  const purge = async query => (await query`select orbis_khata.purge_retired_companies() as n`)[0].n;
  const cursor = async()=> (await sql`select after_id from orbis_khata.fixture_purge_sweep`)[0].after_id;

  await sql.begin(async busy=>{
    for (const id of early) await busy`select pg_advisory_xact_lock(hashtextextended(${stock}||${id}::uuid::text,0))`;
    const initialCursor = await cursor();
    await assert.rejects(sql.begin(async tx=>{
      assert.equal(await purge(tx),0);
      await tx`select pg_cancel_backend(pg_backend_pid())`;
      await tx`select pg_sleep(1)`;
    }),error=>error.code==='57014');
    assert.equal(await cursor(),initialCursor);
    assert.equal(await purge(sql),0);
    assert(await cursor());
    await assert.rejects(sql.begin(async tx=>{
      assert.equal(await purge(tx),1);
      assert.equal(await purge(sql),0,'Concurrent sweep may not take over an uncommitted cursor');
      assert.equal((await sql`select count(*)::int as n from sync_v2.event where scope_id=${later}`)[0].n,0);
      throw new Error('ROLLBACK_PROBE');
    }),/ROLLBACK_PROBE/);
    assert((await sql`select id from public.khata_companies where id=${later}`).length);
    assert.equal(await purge(sql),1);
    const [tombstone]=await sql`select lifecycle,head::text,epoch from sync_v2.scope where scope_id=${later}`;
    assert.deepEqual({...tombstone},{lifecycle:'purged',head:'1',epoch:'original'});
    assert.equal((await sql`select change from sync_v2.event where scope_id=${later}`)[0].change.type,'scope-purged');
    assert.equal(await purge(sql),0);
  });
  assert.equal(await purge(sql),0); // Complete the prior sweep before revisiting its locked rows.
  assert.equal(await purge(sql),50);
  assert((await sql`select id from public.khata_companies where id=${future}`).length);
  console.log('PASS: bounded purge advances beyond 50 busy candidates, revisits them, and rolls back cursor and tombstone on abort.');
  // The snapshot applies only to immutable voucher rows in a fixture scope.
  const partyId = crypto.randomUUID(), first = crypto.randomUUID(), second = crypto.randomUUID(), third = crypto.randomUUID();
  const postVoucher = (tx,id) => tx`select public.khata_post_v1(${id}::uuid,${company}::uuid,${partyId}::uuid,
    'receipt','2026-10-01','100','cash','','Fixture',null)`;
  await sql`insert into public.khata_parties(id,company_id,name,kind) values(${partyId},${company},'Voucher fixture','both')`;
  await fixtureTransaction(tx=>postVoucher(tx,first)); // Existing before enrolment.
  for (const file of ['voucher-capture.sql','grouped-feed.sql','voucher-stock-order.sql','voucher-snapshot.sql']) {
    await sql.unsafe(await readFile('supabase/tests/sync-v2/'+file,'utf8'));
  }
  await sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle)
    values(${owner},'company',${company},'snapshot-epoch','active')`;
  await sql`insert into sync_v2.test_device(actor_id,registration_id) values(${owner},'phone')`;
  await fixtureTransaction(tx=>postVoucher(tx,second));
  const opening = (query,actor=owner,epoch='snapshot-epoch') => query`select sync_v2.open_voucher_snapshot(
    ${actor}::uuid,'phone',${company}::uuid,${epoch}) as result`;
  const read = async (session,position=0,pageSize=1,maxBytes=262144,actor=owner,device='phone') => (await sql`
    select sync_v2.read_voucher_snapshot(${actor}::uuid,${device},${company}::uuid,'snapshot-epoch',
      ${session.snapshot}::uuid,${session.highWater}::bigint,${position},${pageSize},${maxBytes}) as result`)[0].result;
  const fourth = crypto.randomUUID();
  const held = Promise.withResolvers(), release = Promise.withResolvers();
  const waitingWriter=Promise.withResolvers();
  const boot = sql.begin(async tx=>{
    const [{pid}]=await tx`select pg_backend_pid() as pid`;
    const [{result}]=await opening(tx);
    held.resolve({pid,result});
    await release.promise;
    return result;
  });
  const writer = held.promise.then(()=>fixtureTransaction(async (tx,pid)=>{
    waitingWriter.resolve(pid);
    await postVoucher(tx,third);
    await postVoucher(tx,fourth);
  }));
  const bootSettled=Promise.allSettled([boot,writer]);
  let session;
  try {
    const {pid,result}=await Promise.race([held.promise,boot]);
    session=result;
    const waiter=await Promise.race([waitingWriter.promise,writer]);
    let blocked=false;
    for(let poll=0;poll<100 && !blocked;poll++){
      [{blocked}]=await sql`select ${pid}::int=any(pg_blocking_pids(${waiter}::int)) as blocked`;
      if(!blocked)await sql`select pg_sleep(0.015)`;
    }
    assert(blocked,'Writer must wait until snapshot and high-water commit');
    assert.equal(session.highWater,'1');
    assert.equal(session.count,2);
    assert.equal((await sql`select head::text from sync_v2.scope where scope_id=${company}`)[0].head,'1');
  } finally { release.resolve(); }
  assertBothCommitted(await bootSettled);
  const p1=await read(session), p2=await read(session,p1.next);
  assert(p2.done);
  assert.deepEqual(await read(session),p1);
  assert.deepEqual([...p1.rows,...p2.rows].map(row=>JSON.parse(row).id).sort(),[first,second].sort());
  const [{feed}]=await sql`select sync_v2.read_grouped_feed(${owner},'company',${company},
    'snapshot-epoch',${session.highWater}::bigint,1) as feed`;
  assert.equal(feed.groups.length,1);
  assert.deepEqual(feed.groups[0].events.map(i=>i.change[0].entityId),[third,fourth]);
  await assert.rejects(opening(sql,stranger),/SYNC_SNAPSHOT_DENIED/);
  await assert.rejects(opening(sql,owner,'stale-epoch'),/SYNC_SNAPSHOT_DENIED/);
  await assert.rejects(fixtureTransaction(tx=>opening(tx)),error=>error.code==='42501');
  await assert.rejects(read(session,0,1,262144,owner,'unregistered'),/SYNC_SNAPSHOT_DENIED/);
  await assert.rejects(read({...session,highWater:'2'}),/SYNC_SNAPSHOT_STALE/);
  await assert.rejects(read(session,0,201),/SYNC_SNAPSHOT_CURSOR_OR_LIMIT/);
  await assert.rejects(read(session,0,2,512),/SYNC_SNAPSHOT_PAGE_TOO_LARGE/);
  await sql`update sync_v2.scope set retained_after=3 where scope_id=${company}`;
  await assert.rejects(sql`select sync_v2.read_grouped_feed(${owner},'company',${company},'snapshot-epoch',1,1)`,/SYNC_FEED_CURSOR_EXPIRED/);
  const [{result: refreshed}]=await opening(sql);
  assert.equal(refreshed.highWater,'3');
  assert.equal(refreshed.count,4);
  await assert.rejects(read(session),/SYNC_SNAPSHOT_STALE/);
  await sql`update sync_v2.test_device set expires_at=now()-interval '1 second' where actor_id=${owner}`;
  await assert.rejects(read(refreshed),/SYNC_SNAPSHOT_DENIED/);
  await sql`update sync_v2.test_device set expires_at=null,revoked=true where actor_id=${owner}`;
  await assert.rejects(read(refreshed),/SYNC_SNAPSHOT_DENIED/);
  console.log('PASS: private voucher snapshot handoff to a complete feed group, rebootstrap, size bounds and device reauthorization.');
} finally { await sql.end({timeout:5}); }
