import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {setup} from './sql-fixture.mjs';

const url = new URL(process.env.KHATA_SYNC_V2_TEST_URL ?? 'http://missing');
assert(url.protocol==='postgres:' && url.hostname==='127.0.0.1' && url.pathname==='/khata_sync_v2_test' && !url.search);
const sql=postgres(url.toString(),{max:6,connection:{statement_timeout:10000}});
const first='11111111-1111-7111-8111-111111111111', second='22222222-2222-7222-8222-222222222222';
const imported=crypto.randomUUID(), company=crypto.randomUUID(), party=crypto.randomUUID();
const file = path=>readFile('supabase/'+path,'utf8');
async function authenticated(tx,actor,verified=true){
  await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:actor,role:'authenticated'})},true),
    set_config('orbis.khata.gateway_verified',${verified?'v1':''},true)`;
  await tx`set local role authenticated`;
}
async function create(tx,id,actor){
  const row={id,name:'Synthetic',owner_id:actor};
  const saved=await tx`insert into public.khata_companies(id,name,owner_id) values(${row.id},${row.name},${row.owner_id})
    on conflict(id) do nothing returning id,name`;
  if(saved.length)return saved[0].id;
  const [existing]=await tx`select id,name,owner_id from public.khata_companies where id=${id}`;
  assert.deepEqual({...existing},row);
  return id;
}
const appCreate=(id,actor,verified=true)=>sql.begin(async tx=>{
  await authenticated(tx,actor,verified);
  return create(tx,id,actor);
});
const expire=id=>sql`update public.khata_companies set deleted_at=now()-interval '31 days',
  purge_after=now()-interval '1 day' where id=${id}`;
const purge=async query=>(await query`select orbis_khata.purge_retired_companies() as n`)[0].n;
const restore=(id,actor)=>sql.begin(async tx=>{
  await authenticated(tx,actor);
  return tx`select public.khata_workspace_v3(${tx.json({company:id,action:'restore',name:'Synthetic'})}::jsonb)`;
});
try{
  assert.equal((await sql`select count(*)::int as n from information_schema.tables where table_schema='public'`)[0].n,0);
  const init=await sql.reserve();
  try{
    await setup({exec:statement=>init.unsafe(statement),query:async(statement,params=[])=>({rows:await init.unsafe(statement,params)})});
    for(const path of ['migrations/20261101144338_expense_profile_schedules.sql',
      'migrations/20261031075245_lottery_row_storage.sql','migrations/20261105101338_safe_retired_company_purge.sql',
      'tests/sync-v2/kernel.sql','tests/sync-v2/khata-writer.sql','tests/sync-v2/grouped-feed.sql',
      'tests/sync-v2/purge-stock-order.sql','tests/sync-v2/voucher-capture.sql']) await init.unsafe(await file(path));
    await init.unsafe('grant usage on schema auth to authenticated');
  }finally{init.release();}
  await sql`insert into orbis_khata.ledger_owners(id,legacy) values(${first},false),(${second},false)`;
  await sql`insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference)
    values(${first},${first},'fixture'),(${second},${second},'fixture')`;
  await assert.rejects(appCreate(imported,first,false),error=>error.code==='42501');
  await appCreate(imported,first);
  await sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle)
    values(${first},'company',${imported},'old','active')`;
  await expire(imported);
  assert.equal(await purge(sql),1);
  assert.equal(await appCreate(imported,second),imported);
  console.log('VERIFIED: original INSERT/ON CONFLICT accepts the same company ID under a different owner after purge.');
  await expire(imported);
  assert.equal(await purge(sql),1);

  await appCreate(company,first);
  const initFence=await sql.reserve();
  try{
    await initFence.unsafe(await file('tests/sync-v2/company-id-fence.sql'));
    await initFence.unsafe(await file('tests/sync-v2/company-lifecycle-capture.sql'));
    await initFence.unsafe(await file('tests/sync-v2/legacy-recovery-policy.sql'));
    await initFence.unsafe(await file('tests/sync-v2/legacy-recovery-plan.sql'));
    await initFence.unsafe(await file('tests/sync-v2/authorized-module-feed.sql'));
    await initFence.unsafe(await file('tests/sync-v2/company-catalog-snapshot.sql'));
  }finally{initFence.release();}
  await sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle)
    values(${first},'account-catalog',${first},'catalog-v1','active')`;
  for(const actor of [first,second])await assert.rejects(appCreate(imported,actor),/SYNC_COMPANY_ID_PURGED/);
  await assert.rejects(sql`insert into public.khata_companies(id,name,owner_id) values(${imported},'Raw import',${second})`,/SYNC_COMPANY_ID_PURGED/);
  await assert.rejects(restore(imported,first),/COMPANY_NOT_ACCESSIBLE/);
  assert.equal(await appCreate(company,first),company);
  await sql`update public.khata_companies set deleted_at=now(),purge_after=now()+interval '30 days' where id=${company}`;
  await restore(company,first);
  assert.equal((await sql`select deleted_at from public.khata_companies where id=${company}`)[0].deleted_at,null);

  await sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle)
    values(${first},'company',${company},'original','active')`;
  await sql`insert into public.khata_parties(id,company_id,name,kind) values(${party},${company},'Party','both')`;
  const classify=async(actor,id,epoch)=>(await sql`select sync_v2.classify_legacy_company(
    ${actor}::uuid,${id}::uuid,${epoch}) as status`)[0].status;
  assert.equal(await classify(first,company,'original'),'reconcile-existing');
  assert.equal(await classify(first,company,'stale'),'local-review');
  assert.equal(await classify(second,company,'original'),'local-review');
  assert.equal(await classify(first,imported,'old'),'local-review');
  assert.equal(await classify(first,crypto.randomUUID(),'original'),'local-review');
  assert.equal((await sql`select has_function_privilege('authenticated','sync_v2.classify_legacy_company(uuid,uuid,text)','EXECUTE') as ok`)[0].ok,false);
  const voucher=crypto.randomUUID();
  const post=(tx,actor,verified,id=voucher)=>authenticated(tx,actor,verified).then(()=>tx`
    insert into public.khata_vouchers(id,company_id,party_id,kind,effective_date,amount_minor,debit_account,credit_account,reference,note)
    values(${id},${company},${party},'receipt','2026-10-01',125,'cash','receivable','','Fixture')`);
  for(const [actor,verified] of [[first,false],[second,true]])await assert.rejects(sql.begin(tx=>post(tx,actor,verified)));
  await sql.begin(tx=>post(tx,first,true));
  assert.equal((await sql`select seq::text from sync_v2.voucher_event where voucher_id=${voucher}`)[0].seq,'1');
  await expire(company);
  // The earlier capture trigger now fails closed for an enrolled retired company
  // even before the later direct-write fence is installed. An old fixture
  // expecting the raw insert to reach its probe is no longer a safe contract.
  await assert.rejects(sql.begin(tx=>post(tx,first,true,crypto.randomUUID())),
    /SYNC_COMPANY_CAPTURE_UNAVAILABLE/);
  assert.equal((await sql`select count(*)::int as n from public.khata_vouchers where company_id=${company}`)[0].n,1);
  for(const name of ['voucher-stock-order.sql','company-direct-write-fence.sql'])
    await sql.unsafe(await file('tests/sync-v2/'+name));
  await assert.rejects(sql.begin(tx=>post(tx,first,true,crypto.randomUUID())),/COMPANY_NOT_ACCESSIBLE/);
  await assert.rejects(sql.begin(async tx=>{
    await authenticated(tx,first);
    await tx`insert into public.khata_parties(id,company_id,name,kind)
      values(${crypto.randomUUID()},${company},'Retired direct party','both')`;
  }),/COMPANY_NOT_ACCESSIBLE/);
  console.log('PASS: retired enrolled company denied by existing capture guard; additional direct-write fence rejects voucher and party.');
  await assert.rejects(sql.begin(async tx=>{ assert.equal(await purge(tx),1);throw new Error('ROLLBACK_PROBE'); }),/ROLLBACK_PROBE/);
  assert.equal((await sql`select purged from sync_v2.company_identity where id=${company}`)[0].purged,false);
  assert.equal((await sql`select count(*)::int as n from sync_v2.event where scope_id=${company}`)[0].n,2);

  const oldView=Promise.withResolvers(), checkOldView=Promise.withResolvers();
  const repeatableRead=sql.begin('isolation level repeatable read',async tx=>{
    await authenticated(tx,first);
    await tx`select id from public.khata_companies where id=${company}`;
    oldView.resolve();
    await checkOldView.promise;
    return create(tx,company,first);
  });
  const oldViewResult=Promise.allSettled([repeatableRead]);
  await Promise.race([oldView.promise,repeatableRead]);
  const held=Promise.withResolvers(), release=Promise.withResolvers(), entering=Promise.withResolvers();
  const p=sql.begin(async tx=>{
    assert.equal(await purge(tx),1);
    held.resolve((await tx`select pg_backend_pid() as pid`)[0].pid);
    await release.promise;
  });
  const stale=Promise.race([held.promise,p]).then(()=>sql.begin(async tx=>{
    await authenticated(tx,first);
    entering.resolve((await tx`select pg_backend_pid() as pid`)[0].pid);
    return create(tx,company,first);
  }));
  const settled=Promise.allSettled([p,stale]);
  try{
    const pid=await Promise.race([held.promise,p]), waiter=await Promise.race([entering.promise,stale]);
    let waiting=false;
    for(let i=0;i<100&&!waiting;i++){
      [{waiting}]=await sql`select ${pid}::int=any(pg_blocking_pids(${waiter}::int)) as waiting`;
      if(!waiting)await sql`select pg_sleep(0.015)`;
    }
    assert(waiting);
  }finally{
    release.resolve();
    await settled;
    checkOldView.resolve();
  }
  const [oldAttempt]=await oldViewResult;
  assert.equal(oldAttempt.status,'rejected');
  assert.equal(oldAttempt.reason.code,'40001');
  await p;
  await assert.rejects(stale,/SYNC_COMPANY_ID_PURGED/);
  await assert.rejects(appCreate(company,second),/SYNC_COMPANY_ID_PURGED/);
  await assert.rejects(restore(company,first),/COMPANY_NOT_ACCESSIBLE/);
  await assert.rejects(sql.begin(tx=>post(tx,first,true)));
  assert.equal(await classify(first,company,'original'),'local-review');
  const [{lifecycle,epoch,head}]=await sql`select lifecycle,epoch,head::text from sync_v2.scope where scope_id=${company}`;
  assert.deepEqual({lifecycle,epoch,head},{lifecycle:'purged',epoch:'original',head:'3'});
  assert.equal((await sql`select count(*)::int as n from public.khata_vouchers where company_id=${company}`)[0].n,0);
  const created=crypto.randomUUID();
  await appCreate(created,first);
  await appCreate(created,first);
  const catalog=await sql`select change from sync_v2.event where actor_id=${first} and scope_id=${first}
    and kind='account-catalog' order by seq`;
  assert.deepEqual(catalog.map(e=>[e.change.companyId,e.change.status]),
    [[company,'retired'],[company,'active'],[company,'retired'],[company,'purged'],[created,'active']]);
  await sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle)
    values(${first},'company',${created},'new-company','active')`;
  const createdParty=crypto.randomUUID();
  await sql.begin(async tx=>{
    await authenticated(tx,first);
    await tx`insert into public.khata_parties(id,company_id,name,kind)
      values(${createdParty},${created},'New direct party','both') on conflict(id) do nothing`;
    await tx`insert into public.khata_parties(id,company_id,name,kind)
      values(${createdParty},${created},'New direct party','both') on conflict(id) do nothing`;
  });
  const partyChanges=await sql`select change from sync_v2.event where scope_id=${created}`;
  assert.equal(partyChanges.length,1);
  assert.equal(JSON.parse(partyChanges[0].change[0].projectionJson).id,createdParty);
  await sql`insert into sync_v2.test_device(actor_id,registration_id)
    values(${first},'test-device'),(${second},'test-device')`;
  const readCatalog=async (owner=first,high=null,after=null)=>(await sql`
    select sync_v2.read_company_catalog(${owner}::uuid,'test-device','catalog-v1',
      ${high}::bigint,${after}::uuid,1,65536) as page`)[0].page;
  let image=await readCatalog(), marker=image.highWater;
  const companyRows=[...image.rows];
  for(let i=0;!image.done&&i<10;i++){
    image=await readCatalog(first,marker,image.next);
    companyRows.push(...image.rows);
  }
  assert(image.done);
  assert.deepEqual(companyRows.map(r=>[r.companyId,r.status]).sort(),
    [[company,'purged'],[imported,'purged'],[created,'active']].sort());
  assert(companyRows.filter(r=>r.status==='purged').every(r=>r.name===null));
  await assert.rejects(readCatalog(second),/SYNC_CATALOG_DENIED/);
  await assert.rejects(readCatalog(first,marker,crypto.randomUUID()),/SYNC_CATALOG_CURSOR_OR_LIMIT/);
  const nextId=crypto.randomUUID();
  await appCreate(nextId,first);
  const [{nextFeed}]=await sql`select sync_v2.read_authorized_module_feed(${first}::uuid,'test-device',
    'account-catalog',${first},'catalog-v1',${marker}::bigint,1) as "nextFeed"`;
  assert.equal(nextFeed.groups[0].events[0].change.companyId,nextId);
  await assert.rejects(sql`select sync_v2.read_authorized_module_feed(${second}::uuid,'test-device',
    'account-catalog',${first},'catalog-v1',0,1)`,/SYNC_MODULE_FEED_DENIED/);
  await assert.rejects(readCatalog(first,marker,image.next),/SYNC_CATALOG_STALE/);
  const ticket=crypto.randomUUID(), cycle=crypto.randomUUID(), parent=crypto.randomUUID(), child=crypto.randomUUID();
  const archiveDigest='a'.repeat(64);
  const manifest=[{id:parent,kind:'invoice',parent:null},{id:child,kind:'payment',parent}];
  const cyclic=[{id:child,kind:'payment',parent:child}];
  for(const [id,digest,rows] of [[ticket,archiveDigest,manifest],[cycle,'b'.repeat(64),cyclic]]){
    await sql`insert into sync_v2.recovery_evidence(ticket,actor,source_company,archive_digest,manifest_digest,expires_at)
      values(${id},${first},${imported},${digest},
        encode(sha256(convert_to((${sql.json(rows)}::jsonb)::text,'UTF8')),'hex'),now()+interval '1 hour')`;
  }
  const prepare=async(actor=first,proof=ticket,rows=manifest)=>(await sql`select sync_v2.prepare_recovery_plan(
    ${actor}::uuid,${proof}::uuid,${sql.json(rows)}::jsonb) as result`)[0].result;
  await assert.rejects(prepare(second),/SYNC_RECOVERY_REVIEW_DENIED/);
  await assert.rejects(prepare(first,crypto.randomUUID()),/SYNC_RECOVERY_REVIEW_DENIED/);
  await assert.rejects(prepare(first,ticket,[...manifest].reverse()),/SYNC_RECOVERY_MANIFEST_NOT_REVIEWED/);
  await assert.rejects(prepare(first,cycle,cyclic),/SYNC_RECOVERY_PARENT_CYCLE/);
  const [plan,retry]=await Promise.all([prepare(),prepare()]);
  assert.deepEqual(retry,plan);
  assert.equal(plan.state,'review-only');
  assert.equal(plan.archiveDigest,archiveDigest);
  assert.notEqual(plan.recoveryCompany,imported);
  assert.equal(plan.entities.find(row=>row.original===child).freshParent,plan.entities.find(row=>row.original===parent).fresh);
  assert(plan.entities.every(row=>row.original!==row.fresh));
  await assert.rejects(prepare(first,ticket,[...manifest].reverse()),/SYNC_RECOVERY_MANIFEST_CHANGED/);
  assert.equal((await sql`select count(*)::int as n from public.khata_companies where id=${plan.recoveryCompany}`)[0].n,0);
  assert.equal((await sql`select count(*)::int as n from public.khata_vouchers where company_id=${plan.recoveryCompany}`)[0].n,0);
  assert.equal((await sql`select count(*)::int as n from sync_v2.recovery_plan where ticket=${cycle}`)[0].n,0);
  await sql`update sync_v2.recovery_evidence set revoked=true where ticket=${ticket}`;
  await assert.rejects(prepare(),/SYNC_RECOVERY_REVIEW_DENIED/);
  console.log('PASS: review-only fresh identity, child mapping, exact retry, actor and revoked proof fences, no financial mutation.');
  console.log('PASS: account catalog observes retire, restore and purge once each; create retry adds no extra event.');
  console.log('PASS: purge rollback, old-client payload, cross-actor retry, raw import, legitimate restore, verified direct voucher capture and concurrent stale replay.');
}finally{await sql.end({timeout:5});}
