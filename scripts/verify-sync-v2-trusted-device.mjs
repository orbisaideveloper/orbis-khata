import {IDBFactory} from 'fake-indexeddb';
import {createLocalFeed} from '../src/sync-v2/local-feed.ts';
import {openIndexedDbLocalFeedStorage} from '../src/sync-v2/local-feed-storage.ts';
import {confirmVoucherProjection} from '../src/sync-v2/voucher-lineage.ts';
import {fixtureFeedCodec} from './sync-v2-local-storage-fixture.mjs';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {createTrustedVoucherGateway,createTrustedFeedGateway} from '../src/sync-v2/trusted-voucher-gateway.ts';
import {setup} from './sql-fixture.mjs';

const url=new URL(process.env.KHATA_SYNC_V2_TEST_URL??'http://missing');
assert(url.protocol==='postgres:' && url.hostname==='127.0.0.1' && url.pathname==='/khata_sync_v2_test' && !url.search);
const sql=postgres(url.toString(),{max:6,connection:{statement_timeout:10000}});
const actor='11111111-1111-7111-8111-111111111111', stranger='22222222-2222-7222-8222-222222222222';
const owner=crypto.randomUUID(),otherOwner=crypto.randomUUID(),company=crypto.randomUUID(),party=crypto.randomUUID();
const scope={kind:'company',id:company,epoch:'fixture-v1'};
const credential=()=>randomBytes(32).toString('hex');
const phone=credential(),web=credential(),second=credential(),readonly=credential();
const central={baseUrl:'https://admin.example.test',verificationKey:'synthetic-service-key',fetchImpl:async(url,options)=>{
  assert.equal(url,'https://admin.example.test/api/v1/service/customer/session');
  const headers=new Headers(options.headers);
  assert.equal(headers.get('x-orbis-verification-key'),'synthetic-service-key');
  const auth=headers.get('authorization');
  if(auth==='Bearer unavailable')return new Response(null,{status:503});
  if(auth!=='Bearer owner' && auth!=='Bearer stranger')return new Response(null,{status:401});
  return Response.json({version:'orbis.customer.v1',customer:{
    orbisIdentityId:auth==='Bearer owner'?actor:stranger,displayId:'ORB-U-23456789'}});
}};
const begin=fn=>sql.begin(tx=>fn((query,params=[])=>tx.unsafe(query,params)));
const send=createTrustedVoucherGateway(central,begin), read=createTrustedFeedGateway(central,begin);
function command(registration='phone'){
  const id=crypto.randomUUID();
  return {protocolVersion:2,schemaVersion:1,actorId:actor,deviceRegistrationId:registration,
    scope,commandType:'khata-post',operationId:crypto.randomUUID(),entityId:id,baseRevision:null,dependsOn:[],
    children:{},createdAt:'2026-11-24T00:00:00Z',clientSequence:'1',
    payload:{id,company,party,kind:'receipt',date:'2026-10-30',amount:'125',method:'cash',reference:'',note:'',reverses:null}};
}
try{
  assert.equal((await sql`select count(*)::int as n from information_schema.tables where table_schema='public'`)[0].n,0);
  const init=await sql.reserve();
  try{
    await setup({exec:s=>init.unsafe(s),query:async(s,p=[])=>({rows:await init.unsafe(s,p)})});
    for(const file of ['migrations/20261031075245_lottery_row_storage.sql','tests/sync-v2/kernel.sql',
      'tests/sync-v2/grouped-feed.sql','tests/sync-v2/khata-writer.sql','tests/sync-v2/voucher-capture.sql',
      'tests/sync-v2/voucher-stock-order.sql','tests/sync-v2/authorized-module-feed.sql','tests/sync-v2/trusted-device-authority.sql']){
      await init.unsafe(await readFile('supabase/'+file,'utf8'));
    }
    await init.unsafe('grant usage on schema auth to authenticated');
  }finally{init.release();}
  await sql`insert into orbis_khata.ledger_owners(id,legacy) values(${owner},false),(${otherOwner},false)`;
  await sql`insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference)
    values(${actor},${owner},'fixture'),(${stranger},${otherOwner},'fixture')`;
  await sql`insert into public.khata_companies(id,name,owner_id) values(${company},'Fixture',${owner})`;
  await sql`insert into public.khata_parties(id,company_id,name,kind) values(${party},${company},'Fixture','both')`;
  await sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle)
    values(${actor},'company',${company},${scope.epoch},'active')`;
  for(const [id,secret,client,primary] of [['phone',phone,'android',true],['web',web,'web',false],
    ['second',second,'android',false],['readonly',readonly,'web',false]]){
    const digest=createHash('sha256').update(secret).digest('hex');
    await sql`insert into sync_v2.registered_device values(${actor},${id},${digest},${client},${primary},now()+interval '1 hour',null)`;
    await sql`insert into sync_v2.device_scope_grant values(${actor},${id},'company',${company},${scope.epoch},${id!=='readonly'})`;
  }
  const grant=feature=>sql`insert into sync_v2.sync_entitlement values(${actor},${feature},now()+interval '1 hour')`;
  await grant('sync.single-primary');
  const op=command();
  await assert.rejects(send('invalid',phone,op),/SYNC_SESSION_DENIED/);
  await assert.rejects(send('unavailable',phone,op),/CENTRAL_UNAVAILABLE/);
  await assert.rejects(send('stranger',phone,op),/SYNC_ACTOR_MISMATCH/);
  await assert.rejects(send('stranger',phone,{...op,actorId:stranger}),/COMPANY_DENIED/);
  await assert.rejects(send('owner',credential(),op),/SYNC_TRUSTED_DEVICE_DENIED/);
  await assert.rejects(send('owner',web,command('web')),/SYNC_ENTITLEMENT_DENIED/);
  await assert.rejects(read('owner',second,'second',scope,'0',1),/SYNC_ENTITLEMENT_DENIED/);
  await assert.rejects(send('owner',phone,{...op,plan:'Premium'}),/SYNC_COMMAND_INVALID/);
  await assert.rejects(send('owner',phone,{...op,scope:{...scope,epoch:'stale'}}),/SYNC_DEVICE_SCOPE_DENIED/);
  assert.equal((await sql`select count(*)::int as n from public.khata_vouchers`)[0].n,0);
  const first=await send('owner',phone,op);
  assert.deepEqual(await send('owner',phone,op),first);
  assert.equal((await read('owner',phone,'phone',scope,'0',1)).next,'1');
  const page=await read('owner',phone,'phone',scope,'0',1);
  const ledgerStore=await openIndexedDbLocalFeedStorage(new IDBFactory(),'khata-receipt-lineage');
  try{
    const ledger=createLocalFeed(actor,scope,ledgerStore,await fixtureFeedCodec(),event=>
      event.change.map(row=>({collection:row.entityType,id:row.entityId,value:row.projectionJson})));
    await ledger.installSnapshot({epoch:scope.epoch,sequence:'0'},[]);
    assert.equal(await confirmVoucherProjection(op,first,ledger),false);
    await ledger.apply(page);
    assert.equal(await ledger.appliedOperation(first.sequence),null);
    assert.equal(await confirmVoucherProjection(op,first,ledger),true);
    assert.equal(await confirmVoucherProjection(op,first,{
      appliedEvent:async sequence=>{
        const event=await ledger.appliedEvent(sequence);
        const voucher=JSON.parse(event.change[0].projectionJson);
        return {...event,change:[{...event.change[0],projectionJson:JSON.stringify({...voucher,amount_minor:124})}]};
      },
    }),false);
    await assert.rejects(confirmVoucherProjection(op,{...first,result:{entityId:crypto.randomUUID()}},ledger),/SYNC_VOUCHER_RECEIPT_MISMATCH/);
    console.log('PASS native Khata receipt lineage verified against durable scoped voucher, including legacy null operation ID.');
  }finally{ledgerStore.close();}


  await grant('sync.web-cross-device');
  await grant('sync.multi-device');
  await send('owner',web,command('web'));
  await send('owner',second,command('second'));
  await assert.rejects(send('owner',readonly,command('readonly')),/SYNC_DEVICE_SCOPE_DENIED/);
  assert.equal((await read('owner',readonly,'readonly',scope,'0',10)).next,'3');
  await assert.rejects(read('stranger',web,'web',scope,'0',10),/SYNC_TRUSTED_DEVICE_DENIED/);
  await sql`update sync_v2.registered_device set expires_at=now()-interval '1 second' where registration='second'`;
  await assert.rejects(read('owner',second,'second',scope,'0',1),/SYNC_TRUSTED_DEVICE_DENIED/);
  await sql`update sync_v2.sync_entitlement set expires_at=now()-interval '1 second' where capability='sync.web-cross-device'`;
  await assert.rejects(read('owner',web,'web',scope,'0',1),/SYNC_ENTITLEMENT_DENIED/);

  // Device row share lock prevents revocation from returning before an
  // already admitted operation commits. Subsequent retries are denied.
  const started=Promise.withResolvers(), release=Promise.withResolvers();
  const locked=createTrustedVoucherGateway(central,fn=>sql.begin(async tx=>{
    const result=await fn((s,p=[])=>tx.unsafe(s,p));
    started.resolve((await tx`select pg_backend_pid() as pid`)[0].pid);
    await release.promise;
    return result;
  }));
  const revocable=command();
  const sending=locked('owner',phone,revocable);
  const revokePid=Promise.withResolvers();
  const revoking=Promise.race([started.promise,sending]).then(()=>sql.begin(async tx=>{
    revokePid.resolve((await tx`select pg_backend_pid() as pid`)[0].pid);
    await tx`update sync_v2.registered_device set revoked_at=now() where registration='phone'`;
  }));
  const settled=Promise.allSettled([sending,revoking]);
  try{
    const pid=await Promise.race([started.promise,sending]);
    const waiter=await Promise.race([revokePid.promise,revoking]);
    let waiting=false;
    for(let pass=0;pass<100&&!waiting;pass++){
      [{waiting}]=await sql`select ${pid}::int=any(pg_blocking_pids(${waiter}::int)) as waiting`;
      if(!waiting)await sql`select pg_sleep(0.015)`;
    }
    assert(waiting);
  }finally{release.resolve();await settled;}
  await Promise.all([sending,revoking]);
  await assert.rejects(send('owner',phone,revocable),/SYNC_TRUSTED_DEVICE_DENIED/);
  assert.equal((await sql`select count(*)::int as n from sync_v2.receipt`)[0].n,4);
  assert.equal((await sql`select sum(amount_minor)::text as total from public.khata_vouchers`)[0].total,'500');
  console.log('PASS: Central verifier shape, credential possession, scoped Basic/Premium grants, downgrade, revocation ordering and four exact writes.');

  // An old authenticated client still uses the v1 RPC. Its legacy projection
  // must appear in the feed, but it must not be accepted as a v2 request.
  const legacyId=crypto.randomUUID();
  const legacyPost=ledgerOwner=>sql.begin(async tx=>{
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({sub:ledgerOwner,role:'authenticated'})},true),
      set_config('orbis.khata.gateway_verified','v1',true)`;
    await tx`set local role authenticated`;
    await tx`select public.khata_post_v1(${legacyId}::uuid,${company}::uuid,${party}::uuid,
      'receipt','2026-10-30','125','cash','','Legacy reconnect',null)`;
  });
  await assert.rejects(legacyPost(otherOwner),/COMPANY_NOT_ACCESSIBLE/);
  await legacyPost(owner);
  await legacyPost(owner);

  // Simulate reconnect after reauthorizing the second Android device.
  const offlineCommand=command('second');
  await assert.rejects(send('owner',second,offlineCommand),/SYNC_TRUSTED_DEVICE_DENIED/);
  await sql`update sync_v2.registered_device set expires_at=now()+interval '1 hour' where registration='second'`;
  await assert.rejects(send('owner',second,{...offlineCommand,protocolVersion:1}),/SYNC_VERSION_UNSUPPORTED/);
  await assert.rejects(send('owner',second,{...offlineCommand,schemaVersion:99}),/SYNC_VERSION_UNSUPPORTED/);
  await assert.rejects(send('stranger',second,offlineCommand),/SYNC_ACTOR_MISMATCH/);
  const replayed=await send('owner',second,offlineCommand);
  assert.deepEqual(await send('owner',second,offlineCommand),replayed);
  await assert.rejects(send('owner',phone,command()),/SYNC_TRUSTED_DEVICE_DENIED/);
  await assert.rejects(read('owner',web,'web',scope,'4',10),/SYNC_ENTITLEMENT_DENIED/);
  await sql`update sync_v2.sync_entitlement set expires_at=now()+interval '1 hour' where capability='sync.web-cross-device'`;
  const afterReconnect=await read('owner',web,'web',scope,'4',10);
  assert.equal(afterReconnect.next,'6');
  assert.deepEqual(afterReconnect.groups.flatMap(group=>group.events.flatMap(event=>event.change.map(change=>change.entityId))),
    [legacyId,offlineCommand.entityId]);
  assert.equal((await sql`select count(*)::int as n from sync_v2.receipt`)[0].n,5);
  assert.equal((await sql`select sum(amount_minor)::text as total from public.khata_vouchers`)[0].total,'750');
  console.log('PASS native mixed v1/v2 authority: retired credential remains denied, Android reconnect replays once, renewed Web sees both exact identities');

}finally{await sql.end({timeout:5});}
