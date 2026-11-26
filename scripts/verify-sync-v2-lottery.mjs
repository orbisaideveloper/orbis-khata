import {createDevicePairing} from '../src/sync-v2/device-pairing.ts';
import {createPwaCryptoVault} from '../src/local-db/pwa-crypto-vault.ts';
import {createLotteryPaymentOutbox,createLotteryPaymentTransport} from '../src/sync-v2/lottery-payment-outbox.ts';
import {createCentralVerifier,createKhataGateway} from '../src/accounting/server-gateway.ts';
import {createLotterySyncHandler} from '../supabase/functions/orbis-khata-data/lottery-sync.ts';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {createTrustedLotteryPaymentGateway} from '../src/sync-v2/lottery-payment-gateway.ts';
import {createTrustedFeedGateway} from '../src/sync-v2/trusted-voucher-gateway.ts';
import {commandDigest} from '../src/sync-v2/command.ts';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import postgres from 'postgres';
import {fixtureFeedCodec,sqliteFixturePort} from './sync-v2-local-storage-fixture.mjs';
import {IDBFactory} from 'fake-indexeddb';
import {createLocalFeed} from '../src/sync-v2/local-feed.ts';
import {openIndexedDbLocalFeedStorage,openSqliteLocalFeedStorage} from '../src/sync-v2/local-feed-storage.ts';
import {bootstrapLotteryProjection,createLotterySnapshotReader,lotteryLocalRow} from '../src/sync-v2/lottery-local-projection.ts';
import {runLottery} from '../src/lottery/service.ts';
import {setup} from './sql-fixture.mjs';
import {provisionTransfer} from './sync-v2-recovery-fixture.mjs';
import {assembleRecoveryTransfer} from '../src/sync-v2/recovery-assembly.ts';

const url=new URL(process.env.KHATA_SYNC_V2_TEST_URL??'http://missing');
assert(url.protocol==='postgres:' && url.hostname==='127.0.0.1' && url.pathname==='/khata_sync_v2_test' && !url.search);
const sql=postgres(url.toString(),{max:6,connection:{statement_timeout:15000}});
const actor='11111111-1111-7111-8111-111111111111', stranger='22222222-2222-7222-8222-222222222222';
const owner=crypto.randomUUID(), otherOwner=crypto.randomUUID();
const epoch='lottery-fixture', device='lottery-device', occurredAt='2026-10-30';
const clock=()=>new Date('2026-10-31T10:00:00Z');
const byActor=new Map([[actor,owner],[stranger,otherOwner]]);
const payload=(method,data,operationId=crypto.randomUUID())=>({method,payload:data,operationId});
const orgModel='foundationAccountingOrganization';

async function auth(principal,work) {
  return sql.begin(async tx=>{
    await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:byActor.get(principal),role:'authenticated'})},true),
      set_config('orbis.khata.gateway_verified','v1',true)`;
    await tx`set local role authenticated`;
    return work(tx);
  });
}
const rpc=async(tx,p)=>(await tx`select public.khata_lottery_store_v2(${tx.json(p)}::jsonb) as result`)[0].result;
const execute=(request,options={})=>auth(options.actor??actor,async tx=>{
  const load=await rpc(tx,{action:'load',request,operationId:request.operationId});
  if(load.replay)return load.result;
  const calculated=await runLottery(load.state,request,options.actor??actor,clock);
  const result=await rpc(tx,{action:'commit',version:load.version,request,operationId:request.operationId,
    changes:calculated.changes,result:calculated.result});
  await options.beforeCommit?.(tx);
  if(options.abort)throw new Error('LOTTERY_ROLLBACK_PROBE');
  return result;
});
const run=(method,data,options)=>execute(payload(method,data),options);
async function page(org,{after='0',head=null,limit=3,bytes=262144,principal=actor,registration=device,scopeEpoch=epoch}={}){
  return (await sql`select sync_v2.read_lottery_snapshot(${principal}::uuid,${registration},${org},${scopeEpoch},
    ${head}::bigint,${after}::bigint,${limit},${bytes}) as result`)[0].result;
}
async function image(org) {
  const index=new Map();
  let after='0',head=null,done=false,pages=0;
  while(!done){
    assert(++pages<500);
    const next=await page(org,{after,head});
    assert.equal(next.after,after);
    head=next.highWater;
    for(const row of next.rows){
      const key=JSON.stringify([row.model,row.id]);
      assert(!index.has(key));
      index.set(key,row);
    }
    if(!next.done)assert(BigInt(next.next)>BigInt(after));
    ({next:after,done}=next);
  }
  return {index,head};
}
function state(index) {
  const sorted=[...index.values()].sort((a,b)=>BigInt(a.ordinal)<BigInt(b.ordinal)?-1:1);
  const models={};
  for(const row of sorted)(models[row.model]??=[]).push(JSON.parse(row.projectionJson));
  return models;
}
const feed=async(org,after,limit=500,principal=actor)=>(await sql`select sync_v2.read_authorized_module_feed(
  ${principal}::uuid,${device},'lottery-organization',${org},${epoch},${after}::bigint,${limit}) as result`)[0].result;
function apply(index,feedPage) {
  for(const group of feedPage.groups){
    for(const {change} of group.events){
      const key=JSON.stringify([change.model,change.id]);
      if(change.projectionJson===null)index.delete(key);
      else index.set(key,change);
    }
  }
}
async function verifyDurableProjection(org, initial, ordered, complete, removedId, readSnapshot) {
  const factory=new IDBFactory();
  const codec=await fixtureFeedCodec();
  const row=value=>lotteryLocalRow(org,value);
  const connect=async()=>{
    const store=await openIndexedDbLocalFeedStorage(factory,'lottery-postgres-acceptance');
    return {store,feed:createLocalFeed(actor,{kind:'lottery-organization',id:org,epoch},store,codec,event=>[row(event.change)])};
  };
  const first=await connect();
  try{
    if (readSnapshot) await bootstrapLotteryProjection(org,epoch,readSnapshot,first.feed.installSnapshot);
    else await first.feed.installSnapshot({epoch,sequence:initial.head},[...initial.index.values()].map(row));
    await first.feed.apply(ordered);
  }finally{first.store.close();}
  const reopened=await connect();
  try{
    assert.deepEqual(await reopened.feed.cursor(),{epoch,sequence:complete.head});
    const persisted=new Map();
    for(const entry of complete.index.values()){
      const value=await reopened.feed.projection(entry.model,entry.id);
      assert.deepEqual(value,row(entry).value);
      persisted.set(JSON.stringify([entry.model,entry.id]),{...entry,...value});
    }
    const deleted=ordered.groups.flatMap(group=>group.events).find(event=>event.change.id===removedId&&event.change.projectionJson===null);
    if (removedId !== null) assert.equal(await reopened.feed.projection(deleted.change.model,removedId),null);
    await assert.rejects(reopened.feed.apply(ordered),/SYNC_FEED_SCOPE_OR_CURSOR/);
    const request=payload('getWorkspace',{organizationId:org});
    const rebuilt=await runLottery(state(persisted),request,actor,clock);
    const authoritative=await run('getWorkspace',{organizationId:org});
    assert.deepEqual(rebuilt.result.summary,authoritative.summary);
    console.log('PASS native PostgreSQL Lottery snapshot/feed -> encrypted IndexedDB reopen, row identity, deletion and accounting summary');
  }finally{reopened.store.close();}
}
const head=async org=>(await sql`select head::text from sync_v2.scope where actor_id=${actor} and scope_id=${org}`)[0].head;
try{
  assert.equal((await sql`select count(*)::int as n from information_schema.tables where table_schema='public'`)[0].n,0);
  const init=await sql.reserve();
  try{
    await setup({exec:statement=>init.unsafe(statement),query:async(statement,params=[])=>({rows:await init.unsafe(statement,params)})});
    await init.unsafe(await readFile('supabase/migrations/20261031075245_lottery_row_storage.sql','utf8'));
    await init.unsafe('grant usage on schema auth to authenticated');
  }finally{init.release();}
  await sql`insert into orbis_khata.ledger_owners(id,legacy) values(${owner},false),(${otherOwner},false)`;
  await sql`insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference)
    values(${actor},${owner},'fixture'),(${stranger},${otherOwner},'fixture')`;
  const unenrolled=await run('createOrganization',{name:'Legacy before migration'});
  const legacyRows=await sql`select model,id,value from public.khata_lottery_records where owner_id=${owner} order by ordinal`;
  const migration=await sql.reserve();
  try {
    for(const name of ['migrations/20261124173000_private_lottery_sync_payment.sql','migrations/20261125100000_lottery_immutable_feed_recovery.sql','migrations/20261125103000_sync_device_pairing.sql',
      'tests/sync-v2/khata-writer.sql','tests/sync-v2/lottery-snapshot.sql',
      'tests/sync-v2/company-projection-sections.sql','tests/sync-v2/recovery-transfer.sql'])await migration.unsafe(await readFile('supabase/'+name,'utf8'));
    const authFixtures=await readFile('supabase/tests/sync-v2/authorized-module-feed.sql','utf8');
    await migration.unsafe(authFixtures.slice(authFixtures.indexOf('create function sync_v2.authorize_module_read')));
  }finally{migration.release();}
  assert.deepEqual(await sql`select model,id,value from public.khata_lottery_records where owner_id=${owner} order by ordinal`,legacyRows);
  await run('createParty',{organizationId:unenrolled.id,name:'Legacy after migration',partyType:'SELLER',ticketRatePaise:'100'});
  assert.equal((await sql`select count(*)::integer as count from sync_v2.event`)[0].count,0);
  await sql`insert into sync_v2.test_device(actor_id,registration_id) values(${actor},${device}),(${stranger},${device})`;
  const {id:org}=await run('createOrganization',{name:'Lottery test'});
  const {id:sibling}=await run('createOrganization',{name:'Separate book'});
  const {id:foreign}=await run('createOrganization',{name:'Separate owner'},{actor:stranger});
  await sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle) values
    (${actor},'lottery-organization',${org},${epoch},'active'),
    (${actor},'lottery-organization',${sibling},${epoch},'active'),
    (${stranger},'lottery-organization',${foreign},${epoch},'active')`;
  const seller=await run('createParty',{organizationId:org,name:'Seller',partyType:'SELLER',ticketRatePaise:'1000'});
  const stockist=await run('createParty',{organizationId:org,name:'Stockist',partyType:'STOCKIST',ticketRatePaise:'900'});
  const initial=await image(org);
  const initialSibling=await image(sibling);
  const purchase={organizationId:org,partyId:stockist.id,occurredAt,purchaseQuantity:'100',
    morningReturnQuantity:'0',dayReturnQuantity:'0',eveningReturnQuantity:'0',commissionPaise:'4000'};
  const saleInput={organizationId:org,partyId:seller.id,occurredAt,dispatchQuantity:'100',
    morningReturnQuantity:'5',dayReturnQuantity:'10',eveningReturnQuantity:'5',commissionPaise:'4000'};
  const stockOp=payload('saveDailyStockistEntry',purchase);
  await execute(stockOp);
  const saleOp=payload('recordSale',saleInput);
  const [sale,retry]=await Promise.all([execute(saleOp),execute(saleOp)]);
  assert.deepEqual(retry,sale);
  assert.equal(sale.calculated.netPayablePaise,'76080');
  const receive=payload('recordPayment',{organizationId:org,partyId:seller.id,occurredAt,direction:'RECEIPT',
    totalAmountPaise:'5000',methodSplit:{cashPaise:'2000',bankPaise:'2000',pwtPaise:'1000'}});
  const oldHead=await head(org);
  await assert.rejects(execute(receive,{abort:true}),/LOTTERY_ROLLBACK_PROBE/);
  assert.equal(await head(org),oldHead);
  assert.equal((await sql`select count(*)::int as n from sync_v2.lottery_operation_feed where operation_id=${receive.operationId}`)[0].n,0);
  const payment=await execute(receive);
  assert.deepEqual(await execute(receive),payment);
  const otherPayment=await execute({...receive,operationId:crypto.randomUUID()});
  assert.notEqual(otherPayment.payment.id,payment.payment.id);
  await assert.rejects(execute({...receive,payload:{...receive.payload,totalAmountPaise:'5001'}}),/IDEMPOTENCY_CONFLICT/);
  await run('recordSettlement',{organizationId:org,saleId:sale.sale.id,paymentId:payment.payment.id,amountPaise:'5000'});
  await run('recordPayment',{organizationId:org,partyId:stockist.id,occurredAt,direction:'PAYMENT',
    totalAmountPaise:'2000',methodSplit:{pwtPaise:'2000'}});
  await assert.rejects(run('recordPayment',{organizationId:org,partyId:stockist.id,occurredAt,direction:'PAYMENT',
    totalAmountPaise:'1',methodSplit:{pwtPaise:'1'}}),/INVALID_PAYMENT/);
  const workspace=await run('getWorkspace',{organizationId:org});
  const entry=workspace.stockistEntries[0];
  const correction={organizationId:org,entityType:'STOCKIST_ENTRY',entityId:entry.id,
    operationId:crypto.randomUUID(),expectedVersion:0,replacement:{purchaseQuantity:'120',commissionPaise:'3000'},reason:'Correct quantity'};
  const correcting=payload('correctAccountingTransaction',correction,correction.operationId);
  const otherCorrection={...correcting,operationId:crypto.randomUUID()};
  otherCorrection.payload={...correcting.payload,operationId:otherCorrection.operationId};
  const corrections=await Promise.allSettled([execute(correcting),execute(otherCorrection)]);
  assert.equal(corrections.filter(x=>x.status==='fulfilled').length,1);

  const draft=await run('createDailySellerDraft',{...saleInput,occurredAt:'2026-10-31',operationId:crypto.randomUUID(),expectedVersion:0});
  await run('deleteDailySellerDraft',{organizationId:org,saleId:draft.sale.id,operationId:crypto.randomUUID(),expectedVersion:draft.sale.syncVersion});
  const ordered=await feed(org,initial.head);
  assert.equal(ordered.next,await head(org));
  assert.equal(ordered.scopeId,org);
  assert.equal(ordered.scopeKind,'lottery-organization');
  assert(ordered.groups.length>=9);
  const events=ordered.groups.flatMap(g=>g.events);
  assert(events.some(row=>row.change.model==='foundationLotteryLedgerEntry'));
  assert(events.some(row=>row.change.id===draft.sale.id && row.change.projectionJson===null));
  assert(events.every(row=>typeof row.operationId==='string'));
  const nativeLink=await sql`select first_sequence::text,last_sequence::text from sync_v2.lottery_operation_feed where operation_id=${saleOp.operationId}`;
  assert.equal(nativeLink.length,1);
  const saleGroup=ordered.groups.find(g=>g.first===nativeLink[0].first_sequence);
  assert.equal(saleGroup.last,nativeLink[0].last_sequence);
  assert(saleGroup.events.length>1);
  await assert.rejects(feed(org,saleGroup.first),/SYNC_FEED_SPLIT_CURSOR/);
  const complete=await image(org);
  await verifyDurableProjection(org,initial,ordered,complete,draft.sale.id);
  apply(initial.index,ordered);
  assert.deepEqual(state(initial.index),state(complete.index));
  const rebuilt=await runLottery(state(initial.index),payload('getWorkspace',{organizationId:org}),actor,clock);
  const authoritative=await run('getWorkspace',{organizationId:org});
  assert.deepEqual(rebuilt.result.summary,authoritative.summary);
  assert.deepEqual(authoritative.summary.methodBalances,{...authoritative.summary.methodBalances,cashPaise:'4000',bankPaise:'4000',pwtPaise:'0'});
  assert.equal(authoritative.sales[0].outstandingPaise,'71080');
  assert.equal(authoritative.stockistEntries[0].purchaseQuantity,'120');
  assert.equal(authoritative.stockistEntries[0].commissionPaise,'3000');
  assert.equal(await head(sibling),'0');
  assert.deepEqual(state((await image(sibling)).index),state(initialSibling.index));
  await assert.rejects(page(org,{principal:stranger}),/SYNC_LOTTERY_SNAPSHOT_DENIED/);
  await assert.rejects(feed(org,'0',1,stranger),/SYNC_MODULE_FEED_DENIED/);
  await assert.rejects(page(foreign),/SYNC_LOTTERY_SNAPSHOT_DENIED/);
  await assert.rejects(page(org,{scopeEpoch:'stale'}),/SYNC_LOTTERY_SNAPSHOT_DENIED/);
  await assert.rejects(page(org,{registration:'forged'}),/SYNC_LOTTERY_SNAPSHOT_DENIED/);
  await assert.rejects(page(org,{after:'9999',head:complete.head}),/SYNC_LOTTERY_SNAPSHOT_CURSOR_OR_LIMIT/);
  await assert.rejects(page(org,{limit:200,bytes:512}),/SYNC_LOTTERY_SNAPSHOT_PAGE_TOO_LARGE/);
  await assert.rejects(sql`update public.khata_lottery_records set value=value||'{"name":"unsafe"}'::jsonb
    where owner_id=${owner} and model=${orgModel} and id=${org}`,/SYNC_LOTTERY_NATIVE_WRITER_REQUIRED/);

  await assert.rejects(auth(actor,async tx=>{
    const request=payload('updateOrganizationPreferences',{organizationId:org});
    const loaded=await rpc(tx,{action:'load',request,operationId:request.operationId});
    const siblingRow=loaded.state[orgModel].find(r=>r.id===sibling);
    return rpc(tx,{action:'commit',version:loaded.version,request,operationId:request.operationId,result:null,
      changes:[{model:orgModel,id:sibling,value:{...siblingRow,name:'Wrong organization'}}]});
  }),/SYNC_LOTTERY_WRONG_ORGANIZATION/);
  assert.deepEqual(state((await image(sibling)).index),state(initialSibling.index));

  const started=Promise.withResolvers(), continueCommit=Promise.withResolvers();
  const next=execute({...receive,operationId:crypto.randomUUID()},{beforeCommit:async()=>{
    started.resolve();
    await continueCommit.promise;
  }});
  const checked=Promise.allSettled([next]);
  let cursor;
  try {
    await Promise.race([started.promise,next]);
    cursor=await page(org);
    assert.equal(cursor.highWater,complete.head); // Uncommitted effects invisible.
    await page(org,{head:cursor.highWater,after:cursor.next});
  }finally{continueCommit.resolve();await checked;}
  await next;
  await assert.rejects(page(org,{head:cursor.highWater,after:cursor.next}),/SYNC_LOTTERY_SNAPSHOT_STALE/);
  const after=await feed(org,complete.head,1);
  assert.equal(after.groups.length,1);
  assert(after.groups[0].events.length>1);
  apply(complete.index,after);
  assert.deepEqual(state(complete.index),state((await image(org)).index));
  // Generate a deterministic series of distinct payments with replay. The
  // sum of unique amounts, not their position or equality, controls cash.
  let seed=7261n, generatedCash=0n;
  const paymentHead=after.next;
  for(let index=0;index<8;index++){
    seed=(seed*48271n)%2147483647n;
    const amount=seed%17n+1n;
    const req=payload('recordPayment',{organizationId:org,partyId:seller.id,occurredAt,direction:'RECEIPT',
      totalAmountPaise:amount.toString(),methodSplit:{cashPaise:amount.toString()}});
    const first=await execute(req);
    assert.deepEqual(await execute(req),first);
    generatedCash+=amount;
  }
  const changes=await feed(org,paymentHead);
  assert.equal(changes.groups.length,8);
  apply(complete.index,changes);
  const regenerated=await runLottery(state(complete.index),payload('getWorkspace',{organizationId:org}),actor,clock);
  assert.equal(BigInt(regenerated.result.summary.methodBalances.cashPaise),6000n+generatedCash);
  const extendedStart=changes.next;
  const customer=await run('createParty',{organizationId:org,name:'Synthetic customer',partyType:'CUSTOMER'});
  await run('recordStockMovement',{organizationId:org,type:'RECEIPT',quantity:'3',occurredAt});
  await run('recordCustomerBill',{organizationId:org,partyId:customer.id,occurredAt,
    quantity:'2',unitRatePaise:'1000',receivedPaise:'1000'});
  const category=await run('createExpenseCategory',{organizationId:org,name:'Synthetic bills'});
  const profile=await run('createExpenseProfile',{organizationId:org,categoryId:category.id,name:'Synthetic expense',
    usualAmountPaise:'0',scheduleType:'ONE_TIME',openingBalancePaise:'30000',openingBalanceDate:'2026-10-29'});
  await run('recordExpensePayment',{organizationId:org,profileId:profile.id,occurredAt,
    totalAmountPaise:'20000',cashPaise:'10000',bankPaise:'10000'});
  const extra=await feed(org,extendedStart);
  apply(complete.index,extra);
  const more=await runLottery(state(complete.index),payload('getWorkspace',{organizationId:org}),actor,clock);
  assert.equal(more.result.customerBills.length,1);
  assert.equal(state(complete.index).foundationAccountingExpensePayment.length,1);
  assert.deepEqual(state(complete.index),state((await image(org)).index));
  // Exercise the real command adapter over the enrolled owner and domain RPC.
  const scoped={kind:'lottery-organization',id:org,epoch};
  const secret=randomBytes(32).toString('hex');
  const registration='v2-lottery-web';
  const proof=createHash('sha256').update(secret).digest('hex');
  await sql`insert into sync_v2.registered_device values(${actor},${registration},${proof},'web',false,now()+interval '1 hour',null)`;
  await sql`insert into sync_v2.sync_entitlement values(${actor},'sync.web-cross-device',now()+interval '1 hour')`;
  await sql`insert into sync_v2.device_scope_grant values(${actor},${registration},'lottery-organization',${org},${epoch},true)`;
  const central={baseUrl:'https://admin.example.test',verificationKey:'synthetic-service-key',fetchImpl:async(_,options)=>{
    const identity=new Headers(options.headers).get('authorization');
    if(identity!=='Bearer owner'&&identity!=='Bearer other')return new Response(null,{status:401});
    return Response.json({version:'orbis.customer.v1',customer:{
      orbisIdentityId:identity==='Bearer owner'?actor:stranger,displayId:'ORB-U-23456789'}});
  }};
  const begin=work=>sql.begin(tx=>work((statement,parameters=[])=>tx.unsafe(statement,parameters)));
  const submit=createTrustedLotteryPaymentGateway(central,begin);
  const trustedFeed=createTrustedFeedGateway(central,begin);
  const webOrigin='https://khata.example.test';
  const options={origins:[webOrigin],verify:createCentralVerifier(central),
    admit:async()=>({allowed:true,retryAfter:0}),
    execute:async()=>assert.fail('Sync request must not fall through to the legacy writer')};
  const http=createKhataGateway({...options,lotterySync:createLotterySyncHandler(begin)});
  const disabled=createKhataGateway(options);
  const request=(input,token='owner')=>new Request(webOrigin+'/orbis-khata-data',{
    method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',origin:webOrigin},
    body:JSON.stringify({version:'orbis.khata.data.v1',operation:'lottery-sync',input}),
  });
  const command={protocolVersion:2,schemaVersion:1,actorId:actor,deviceRegistrationId:registration,
    scope:scoped,commandType:'lottery-payment',operationId:crypto.randomUUID(),entityId:crypto.randomUUID(),
    children:{},dependsOn:[],baseRevision:null,clientSequence:'1',createdAt:'2026-11-24T00:00:00Z',
    payload:{organizationId:org,partyId:seller.id,occurredAt,direction:'RECEIPT',totalAmountPaise:'125',
      methodSplit:{cashPaise:'100',pwtPaise:'25'}}};
  const beforeImage=await image(org);
  const beforeV2=beforeImage.head;
  const pages=new Map();
  let snapshotAfter='0';
  while(true){
    const response=await http(request({action:'snapshot',credential:secret,organization:org,epoch,registration,
      after:snapshotAfter,head:snapshotAfter==='0'?null:beforeV2,limit:3}));
    assert.equal(response.status,200);
    const {data}=await response.json();
    assert.equal(data.highWater,beforeV2);
    pages.set(snapshotAfter,data);
    if(data.done)break;
    assert(BigInt(data.next)>BigInt(snapshotAfter));
    snapshotAfter=data.next;
  }
  let installed=false;
  await assert.rejects(bootstrapLotteryProjection(org,epoch,async ({after})=>{
    if(after!=='0')throw new Error('SNAPSHOT_INTERRUPTED');
    return pages.get(after);
  },async()=>{installed=true;}),/SNAPSHOT_INTERRUPTED/);
  assert.equal(installed,false);
  assert.equal((await http(request({action:'snapshot',credential:secret,organization:sibling,epoch,
    registration,after:'0',head:null,limit:3}))).status,403);
  const writeRequest={action:'payment',command,credential:secret};
  assert.equal((await disabled(request(writeRequest))).status,404);
  assert.equal((await http(request(writeRequest,'invalid'))).status,401);
  assert.equal((await http(request({...writeRequest,credential:'0'.repeat(64)}))).status,403);
  await sql.begin(async tx=>{
    await tx`set local role authenticated`;
    assert.equal((await tx`select has_schema_privilege(current_user,'sync_v2','usage') as allowed`)[0].allowed,false);
  });
  await assert.rejects(submit('invalid',secret,command),/SYNC_SESSION_DENIED/);
  await assert.rejects(submit('other',secret,command),/SYNC_ACTOR_MISMATCH/);
  await assert.rejects(submit('owner','0'.repeat(64),command),/SYNC_TRUSTED_DEVICE_DENIED/);
  await assert.rejects(submit('owner',secret,{...command,scope:{...scoped,epoch:'stale'}}),/SYNC_DEVICE_SCOPE_DENIED/);
  await assert.rejects(submit('owner',secret,{...command,scope:{...scoped,id:sibling},payload:{...command.payload,organizationId:sibling}}),/SYNC_DEVICE_SCOPE_DENIED/);
  await assert.rejects(submit('owner',secret,{...command,operationId:receive.operationId}),/SYNC_LOTTERY_LEGACY_LINEAGE_REQUIRED/);
  assert.equal(await head(org),beforeV2);

  let rolledBackReceipt;
  const aborting=createTrustedLotteryPaymentGateway(central,work=>sql.begin(async tx=>{
    rolledBackReceipt=await work((statement,parameters=[])=>tx.unsafe(statement,parameters));
    const entries=await tx`select change->>'id' as id from sync_v2.event where operation_id=${command.operationId} order by seq`;
    rolledBackIds=entries.map(entry=>entry.id);
    throw new Error('SYNC_TEST_ABORT');
  }));
  let rolledBackIds;
  await assert.rejects(aborting('owner',secret,command),/SYNC_TEST_ABORT/);
  assert.equal(await head(org),beforeV2);
  assert.equal((await sql`select count(*)::int as count from sync_v2.receipt where operation_id=${command.operationId}`)[0].count,0);
  // Drop the first acknowledgement, then retry the exact original command repeatedly.
  const droppedResponse=await http(request(writeRequest));
  assert.equal(droppedResponse.status,200);
  const resumed=await http(request(writeRequest));
  assert.equal(resumed.status,200);
  const {data:receipt}=await resumed.json();
  for(let retry=1;retry<100;retry++)assert.deepEqual(await submit('owner',secret,command),receipt);
  assert.equal(receipt.digest,await commandDigest(command));
  assert.equal(receipt.result.payment.id,command.entityId);
  assert.equal(rolledBackReceipt.result.payment.id,command.entityId);
  const feedResponse=await http(request({action:'feed',credential:secret,organization:org,epoch,registration,cursor:beforeV2,limit:50}));
  assert.equal(feedResponse.status,200);
  const {data:accepted}=await feedResponse.json();
  assert.equal(accepted.groups.length,1);
  assert.equal(accepted.next,receipt.sequence);
  assert(accepted.groups[0].events.every(event=>event.operationId===command.operationId));
  assert.deepEqual(accepted.groups[0].events.map(event=>event.change.id),rolledBackIds);
  assert.equal((await sql`select count(*)::int as count from public.khata_lottery_operations where owner_id=${owner} and operation_id=${command.operationId}::uuid`)[0].count,1);
  await assert.rejects(submit('owner',secret,{...command,clientSequence:'2'}),/SYNC_OPERATION_DIGEST_MISMATCH/);
  const second=await submit('owner',secret,{...command,operationId:crypto.randomUUID(),entityId:crypto.randomUUID(),clientSequence:'2'});
  assert.notEqual(second.result.payment.id,receipt.result.payment.id);
  const projected=await image(org);
  const acceptedAndSecond=await trustedFeed('owner',secret,registration,scoped,beforeV2,50);
  const affected=acceptedAndSecond.groups.flatMap(group=>group.events).filter(event=>event.change.model==='foundationLotteryPayment');
  assert.deepEqual(affected.map(({change})=>JSON.parse(change.projectionJson).totalAmountPaise.value),['125','125']);
  await verifyDurableProjection(org,beforeImage,acceptedAndSecond,projected,null,async ({after})=>pages.get(after));
  assert.equal((await http(request({action:'snapshot',credential:secret,organization:org,epoch,
    registration,after:'0',head:beforeV2,limit:3}))).status,409);
  // Stage on an encrypted local store, restart twice, then verify real HTTP
  // receipts and feed through both storage backends.
  const transport=createLotteryPaymentTransport(async (operation,input)=>{
    assert.equal(operation,'lottery-sync');
    const response=await http(request(input));
    assert.equal(response.status,200);
    return (await response.json()).data;
  },{scope:scoped,registration,credential:secret});
  const folder=await mkdtemp(join(tmpdir(),'orbis-lottery-outbox-'));
  try {
    for(const backend of ['indexeddb','sqlite']){
      const factory=new IDBFactory();
      const fixtureSqliteCodec=backend==='sqlite'?await fixtureFeedCodec():null;
      const id=crypto.randomUUID();
      const staged={...command,operationId:id,entityId:crypto.randomUUID(),clientSequence:backend==='indexeddb'?'3':'4'};
      const open=async()=>{
        if(backend==='indexeddb')return openIndexedDbLocalFeedStorage(factory,'lottery-outbox');
        const db=new DatabaseSync(join(folder,'outbox.db'));
        const storage=await openSqliteLocalFeedStorage(sqliteFixturePort(db));
        return {...storage,close:()=>db.close()};
      };
      async function withOutbox(work){
        const storage=await open();
        try{
          const codec=fixtureSqliteCodec??await fixtureFeedCodec(
            await createPwaCryptoVault(factory,crypto,'lottery-outbox-vault').keyForAccount(actor));
          const ledger=createLocalFeed(actor,scoped,storage,codec,event=>[lotteryLocalRow(org,event.change)]);
          const outbox=createLotteryPaymentOutbox(actor,scoped,registration,storage,codec,ledger);
          return await work(ledger,outbox);
        }finally{storage.close();}
      }
      await withOutbox(async (ledger,outbox)=>{
        await bootstrapLotteryProjection(org,epoch,async ({after,head})=>{
          const response=await http(request({action:'snapshot',credential:secret,organization:org,epoch,registration,
            after,head,limit:10}));
          assert.equal(response.status,200);
          return (await response.json()).data;
        },ledger.installSnapshot);
        await outbox.enqueue(staged);
        await outbox.enqueue(staged);
        assert.deepEqual(await outbox.pending(),[id]);
        await assert.rejects(outbox.enqueue({...staged,clientSequence:'9'}),/SYNC_OPERATION_DIGEST_MISMATCH/);
        assert.equal(await ledger.projection('foundationLotteryPayment',staged.entityId),undefined);
      });
      await withOutbox(async (_,outbox)=>{
        await assert.rejects(outbox.resume(id,{...transport,submit:async input=>{
          await transport.submit(input);
          throw new Error('ACK_LOST');
        }}),/ACK_LOST/);
        assert.equal(await outbox.status(id),'pending');
      });
      await withOutbox(async (_,outbox)=>{
        await assert.rejects(outbox.resume(id,{...transport,feed:async()=>{throw new Error('FEED_INTERRUPTED');}}),/FEED_INTERRUPTED/);
        assert.equal(await outbox.status(id),'posted-awaiting-ledger');
      });
      await withOutbox(async (ledger,outbox)=>{
        const completed=await outbox.resume(id,{...transport,submit:async()=>assert.fail('a stored receipt must not re-submit')});
        assert.equal(completed.state,'reconciled');
        assert.equal(await ledger.appliedOperation(completed.receipt.sequence),id);
        const row=await ledger.projection('foundationLotteryPayment',staged.entityId);
        assert.equal(JSON.parse(row.projectionJson).totalAmountPaise.value,'125');
        assert.deepEqual(await outbox.pending(),[]);
        assert.equal(await outbox.status(id),'reconciled');
      });
      assert.equal((await sql`select count(*)::int as n from public.khata_lottery_operations
        where owner_id=${owner} and operation_id=${id}::uuid`)[0].n,1);
    }
    console.log('PASS durable encrypted IndexedDB and SQLite outboxes: restart, lost response, interrupted feed, one native payment and committed inbox proof.');
  }finally{await rm(folder,{recursive:true,force:true});}
  console.log('PASS Lottery HTTP snapshot/payment/feed -> native receipt and durable projection, 100 lost-ACK retries, deterministic children, distinct equal receipts, exact amount and denied credentials.');

  // Controlled enrollment of two Android fixture connections and a Web fixture.
  const pairFolder=await mkdtemp(join(tmpdir(),'orbis-paired-'));
  const connections=[];
  try{
    await sql`insert into sync_v2.sync_entitlement values(${actor},'sync.multi-device',now()+interval '1 hour')`;
    const sendHttp=async(operation,input)=>{
      assert.equal(operation,'lottery-sync');
      const response=await http(request(input));
      const body=await response.json();
      if(!response.ok)throw Object.assign(new Error(body.code),{code:body.code});
      return body.data;
    };
    for(const [index,client] of ['android','android','web'].entries()){
      const ticket=randomBytes(32).toString('hex');
      const registration='pair-proof-'+index;
      const digest=createHash('sha256').update(ticket).digest('hex');
      await sql`insert into sync_v2.device_pairing(actor,ticket_sha256,registration,client,kind,scope_id,epoch,
        can_write,redeem_until,device_until) values(${actor},${digest},${registration},${client},'lottery-organization',
        ${org},${epoch},true,now()+interval '5 minute',now()+interval '1 hour')`;
      const db=client==='android'?new DatabaseSync(join(pairFolder,registration+'.db')):null;
      const storage=db?await openSqliteLocalFeedStorage(sqliteFixturePort(db))
        :await openIndexedDbLocalFeedStorage(new IDBFactory(),registration);
      connections.push({close:()=>db?db.close():storage.close()});
      const codec=await fixtureFeedCodec();
      const bad=randomBytes(32).toString('hex');
      const invalidActor=await http(request({action:'pair-device',ticket,credential:bad},'other'));
      assert.equal(invalidActor.status,403);
      const dropResponse=createDevicePairing(actor,client,storage,codec,async (operation,input)=>{
        await sendHttp(operation,input);
        throw new Error('PAIR_RESPONSE_LOST');
      });
      await assert.rejects(dropResponse(ticket),/PAIR_RESPONSE_LOST/);
      const connected=await createDevicePairing(actor,client,storage,codec,sendHttp)(ticket);
      assert.equal(connected.registration,registration);
      assert.equal((await http(request({action:'pair-device',ticket,credential:bad}))).status,403);
      const ledger=createLocalFeed(actor,connected.scope,storage,codec,event=>[lotteryLocalRow(org,event.change)]);
      const snapshot=createLotterySnapshotReader(sendHttp,{organization:org,epoch,registration,credential:connected.credential});
      await bootstrapLotteryProjection(org,epoch,snapshot,ledger.installSnapshot);
      const outbox=createLotteryPaymentOutbox(actor,connected.scope,registration,storage,codec,ledger);
      const transport=createLotteryPaymentTransport(sendHttp,connected);
      Object.assign(connections[index],{ledger,outbox,transport,connected});
    }
    const posted=[];
    for(const [index,source] of connections.entries()){
      const pending={...command,operationId:crypto.randomUUID(),entityId:crypto.randomUUID(),
        deviceRegistrationId:source.connected.registration,clientSequence:String(index+10)};
      await source.outbox.enqueue(pending);
      const localOnly=await source.outbox.pending();
      assert.deepEqual(localOnly,[pending.operationId]);
      const done=await source.outbox.resume(pending.operationId,source.transport);
      assert.equal(done.state,'reconciled');
      posted.push(pending.entityId);
    }
    for(const device of connections){
      const current=(await device.ledger.cursor()).sequence;
      const next=await device.transport.feed(current);
      if(next.next!==current)await device.ledger.apply(next);
      assert.equal((await device.ledger.cursor()).sequence,await head(org));
      for(const id of posted){
        const row=await device.ledger.projection('foundationLotteryPayment',id);
        assert.equal(JSON.parse(row.projectionJson).totalAmountPaise.value,'125');
      }
    }
    console.log('PASS operator-bound enrollment, lost pairing acknowledgement, and payments both ways across two SQLite and one Web fixture.');
  }finally{
    for(const device of connections)device.close();
    await rm(pairFolder,{recursive:true,force:true});
  }
  const oversizedId=crypto.randomUUID(), oversized='A'.repeat(2010000)+'ব'.repeat(1000);
  const beforeOversized=(await page(sibling)).highWater;
  await auth(actor,async tx=>{
    // Synthetic historical record, with the same row schema and native
    // commit path, models an audit payload larger than the Sync envelope.
    const request=payload('getWorkspace',{organizationId:sibling});
    const version=(await rpc(tx,{action:'load',request,operationId:request.operationId})).version;
    await rpc(tx,{action:'commit',version,request,operationId:request.operationId,result:null,
      changes:[{model:'foundationLotteryAuditEvent',id:oversizedId,
        value:{id:oversizedId,organizationId:sibling,syntheticAudit:oversized}}]});
  });
  const [{ordinal}]=await sql`select ordinal::text from public.khata_lottery_records
    where owner_id=${owner} and id=${oversizedId}`;
  const [{prior}]=await sql`select max(ordinal)::text as prior from public.khata_lottery_records
    where owner_id=${owner} and sync_v2.lottery_organization(model,id,value)=${sibling} and ordinal<${ordinal}::bigint`;
  await assert.rejects(page(sibling,{head:await head(sibling),after:prior,limit:1}),/SYNC_LOTTERY_SNAPSHOT_PAGE_TOO_LARGE/);
  assert.equal((await sql`select value->>'syntheticAudit' as audit from public.khata_lottery_records
    where owner_id=${owner} and id=${oversizedId}`)[0].audit,oversized);
  const recoveryInput={action:'recover-group',credential:secret,organization:sibling,epoch,registration,cursor:beforeOversized};
  assert.equal((await http(request(recoveryInput))).status,403);
  await sql`insert into sync_v2.device_scope_grant values(${actor},${registration},'lottery-organization',${sibling},${epoch},false)`;
  const normalFeed=await http(request({...recoveryInput,action:'feed',limit:250}));
  assert.equal(normalFeed.status,409);
  const httpRecovery=createLotteryPaymentTransport(async (operation,input)=>{
    assert.equal(operation,'lottery-sync');
    const response=await http(request(input));
    assert.equal(response.status,200);
    return (await response.json()).data;
  },{scope:{kind:'lottery-organization',id:sibling,epoch},registration,credential:secret});
  const recoveredGroup=await httpRecovery.recoverGroup(beforeOversized);
  assert.equal(recoveredGroup.manifest.scopeId,sibling);
  assert(recoveredGroup.manifest.bytes>2_000_000);
  const httpStorage=await openIndexedDbLocalFeedStorage(new IDBFactory(),'lottery-http-recovery');
  try{
    const ledger=createLocalFeed(actor,{kind:'lottery-organization',id:sibling,epoch},httpStorage,
      await fixtureFeedCodec(),event=>[lotteryLocalRow(sibling,event.change)]);
    await ledger.installSnapshot({epoch,sequence:beforeOversized},[...initialSibling.index.values()].map(row=>lotteryLocalRow(sibling,row)));
    let interrupted=false;
    await assert.rejects(ledger.recoverGroup(recoveredGroup.manifest,async(item,offset)=>{
      if(offset>0){interrupted=true;throw new Error('HTTP_INTERRUPTED');}
      return recoveredGroup.read(item,offset);
    }),/HTTP_INTERRUPTED/);
    assert(interrupted);
    assert.equal((await ledger.cursor()).sequence,beforeOversized);
    await ledger.recoverGroup(recoveredGroup.manifest,recoveredGroup.read);
    assert.equal((await ledger.cursor()).sequence,recoveredGroup.manifest.next);
    const row=await ledger.projection('foundationLotteryAuditEvent',oversizedId);
    assert.equal(JSON.parse(row.projectionJson).syntheticAudit,oversized);
    assert.equal((await http(request({...recoveryInput,item:0,offset:0}))).status,400);
    assert.equal((await http(request({...recoveryInput,item:1,offset:0},'other'))).status,403);
  }finally{httpStorage.close();}
  const snapshotBinding={credential:secret,organization:sibling,epoch,registration};
  let interruptSnapshot=true;
  const snapshotRead=createLotterySnapshotReader(async (operation,input)=>{
    assert.equal(operation,'lottery-sync');
    if(interruptSnapshot&&input.action==='snapshot-part'&&input.offset>0)throw new Error('SNAPSHOT_PART_INTERRUPTED');
    const response=await http(request(input));
    const body=await response.json();
    if(!response.ok)throw Object.assign(new Error(body.code),{code:body.code});
    return body.data;
  }, snapshotBinding);
  const newDeviceStorage=await openIndexedDbLocalFeedStorage(new IDBFactory(),'lottery-http-bootstrap-large');
  try{
    const ledger=createLocalFeed(actor,{kind:'lottery-organization',id:sibling,epoch},newDeviceStorage,
      await fixtureFeedCodec(),event=>[lotteryLocalRow(sibling,event.change)]);
    await assert.rejects(bootstrapLotteryProjection(sibling,epoch,snapshotRead,ledger.installSnapshot),/SNAPSHOT_PART_INTERRUPTED/);
    assert.equal(await ledger.cursor(),null);
    interruptSnapshot=false;
    await bootstrapLotteryProjection(sibling,epoch,snapshotRead,ledger.installSnapshot);
    assert.equal((await ledger.cursor()).sequence,recoveredGroup.manifest.next);
    const row=await ledger.projection('foundationLotteryAuditEvent',oversizedId);
    assert.equal(JSON.parse(row.projectionJson).syntheticAudit,oversized);
    const stale=await http(request({action:'snapshot-part',...snapshotBinding,after:prior,head:beforeOversized,offset:0}));
    assert.equal(stale.status,409);
  }finally{newDeviceStorage.close();}
  console.log(`PASS new device HTTP bootstrap: ${oversized.length} decoded audit characters, exact data with revision and no partial installation.`);
  await sql`update sync_v2.registered_device set revoked_at=now() where registration=${registration}`;
  await assert.rejects(submit('owner',secret,command),/SYNC_TRUSTED_DEVICE_DENIED/);
  await assert.rejects(trustedFeed('owner',secret,registration,scoped,beforeV2,50),/SYNC_TRUSTED_DEVICE_DENIED/);
  assert.equal((await http(request({...recoveryInput,item:1,offset:0}))).status,403);
  console.log('PASS authorized HTTP oversized group recovery, no staged server copy, interrupted delivery and ledger verification.');
  const transfers=await provisionTransfer(sql,actor,'lottery-organization',sibling,epoch);
  await assert.rejects(sql`select sync_v2.read_grouped_feed(${actor},'lottery-organization',${sibling},${epoch},
    ${beforeOversized}::bigint,10)`,/SYNC_FEED_PAGE_TOO_LARGE/);
  const bigGroup=await transfers.open(beforeOversized);
  assert(bigGroup.bytes>2_000_000);
  const first=await transfers.read(bigGroup.transfer,1,0);
  assert.equal(first.offset,0);
  await assert.rejects(transfers.read(bigGroup.transfer,1,0,'0'.repeat(64)),/SYNC_TRUSTED_DEVICE_DENIED/);
  let calls=0;
  await assert.rejects(assembleRecoveryTransfer(bigGroup,bigGroup,(item,offset)=>{
    if(++calls===2)throw new Error('SYNTHETIC_NETWORK_INTERRUPTED');
    return transfers.read(bigGroup.transfer,item,offset);
  }),/SYNTHETIC_NETWORK_INTERRUPTED/);
  assert.deepEqual(await transfers.read(bigGroup.transfer,1,0),first);
  const eventsRecovered=await transfers.download(bigGroup);
  assert.equal(eventsRecovered.at(-1).seq,bigGroup.next);
  const restoredAudit=eventsRecovered.find(row=>row.change.id===oversizedId);
  assert.equal(JSON.parse(restoredAudit.change.projectionJson).syntheticAudit,oversized);
  const recoveryStorage=await openIndexedDbLocalFeedStorage(new IDBFactory(),'lottery-fragment-acceptance');
  try{
    const durable=createLocalFeed(actor,{kind:'lottery-organization',id:sibling,epoch},recoveryStorage,
      await fixtureFeedCodec(),event=>[lotteryLocalRow(sibling,event.change)]);
    await durable.installSnapshot({epoch,sequence:beforeOversized},[...initialSibling.index.values()].map(row=>lotteryLocalRow(sibling,row)));
    let count=0;
    await assert.rejects(durable.recoverGroup(bigGroup,(item,offset)=>{
      if(++count===2)throw new Error('CLIENT_INTERRUPTED');
      return transfers.read(bigGroup.transfer,item,offset);
    }),/CLIENT_INTERRUPTED/);
    assert.equal((await durable.cursor()).sequence,beforeOversized);
    assert.equal(await durable.projection(restoredAudit.change.model,oversizedId),undefined);
    await durable.recoverGroup(bigGroup,(item,offset)=>transfers.read(bigGroup.transfer,item,offset));
    assert.equal((await durable.cursor()).sequence,bigGroup.next);
    const audit=await durable.projection(restoredAudit.change.model,oversizedId);
    assert.equal(JSON.parse(audit.projectionJson).syntheticAudit,oversized);
    console.log('PASS durable oversized recovery: interrupted fragment download retains cursor; resumed apply commits chunked audit exactly.');
  }finally{recoveryStorage.close();}


  // A later device transfer owns its own consistent snapshot. Freeze it
  // before another writer commits, then prove handoff via the next group.
  const opening=Promise.withResolvers(), finishOpen=Promise.withResolvers();
  const digest=(await sql`select credential_sha256 from sync_v2.registered_device
    where registration=${transfers.registration}`)[0].credential_sha256;
  const boot=sql.begin('isolation level repeatable read',async tx=>{
    const [{bundle}]=await tx`select sync_v2.open_recovery_transfer(${actor}::uuid,${transfers.registration},
      ${digest},'lottery-organization',${sibling},${epoch},null) as bundle`;
    opening.resolve(bundle);
    await finishOpen.promise;
    return bundle;
  });
  const bootSettled=Promise.allSettled([boot]);
  let lateParty;
  try{
    await Promise.race([opening.promise,boot]);
    lateParty=await run('createParty',{organizationId:sibling,name:'After snapshot',partyType:'SELLER',ticketRatePaise:'100'});
  }finally{finishOpen.resolve();await bootSettled;}
  const bootBundle=await boot;
  await assert.rejects(transfers.read(bigGroup.transfer,1,0),/SYNC_RECOVERY_TRANSFER_DENIED/);
  const recovered=await transfers.download(bootBundle);
  assert.equal(JSON.parse(recovered.find(r=>r.id===oversizedId).projectionJson).syntheticAudit,oversized);
  assert(!recovered.some(r=>r.id===lateParty.id));
  const lateFeed=await feed(sibling,bootBundle.next,1);
  const reconstructed=new Map(recovered.map(r=>[JSON.stringify([r.model,r.id]),r]));
  apply(reconstructed,lateFeed);
  assert(reconstructed.has(JSON.stringify(['foundationAccountingParty',lateParty.id])));
  assert.equal(reconstructed.size,recovered.length+2); // Party plus audit row.
  await sql`update sync_v2.scope set retained_after=head where actor_id=${actor} and scope_id=${sibling}`;
  await assert.rejects(transfers.read(bootBundle.transfer,1,0),/SYNC_FEED_CURSOR_EXPIRED/);
  const rebootstrap=await transfers.open();
  assert.equal(rebootstrap.next,lateFeed.next);
  const current=await transfers.download(rebootstrap);
  const byKey=rows=>rows.map(({model,id,projectionJson})=>[JSON.stringify([model,id]),projectionJson])
    .sort(([a],[b])=>a.localeCompare(b));
  assert.deepEqual(byKey([...reconstructed.values()]),byKey(current),'REBOOTSTRAP_ROW_ID_OR_VALUE_MISMATCH');
  const restored=await runLottery(state(reconstructed),payload('getWorkspace',{organizationId:sibling}),actor,clock);
  assert.deepEqual(restored.result.summary,(await run('getWorkspace',{organizationId:sibling})).summary);
  console.log('PASS Lottery large snapshot + concurrent feed + expired cursor rebootstrap preserves exact audit, row IDs and summary.');

  const [{size:lotterySizes}]=await sql`select jsonb_build_object(
    'lotteryRows',pg_total_relation_size('public.khata_lottery_records'),
    'events',pg_total_relation_size('sync_v2.event'),
    'transferItems',pg_total_relation_size('sync_v2.recovery_transfer_item'),
    'transferToast',pg_total_relation_size(reltoastrelid)
  ) as size from pg_class where oid='sync_v2.recovery_transfer_item'::regclass`;
  console.log('RECOVERY_METRIC '+JSON.stringify(lotterySizes));
  await sql`update sync_v2.test_device set revoked=true where actor_id=${actor}`;
  await assert.rejects(page(org),/SYNC_LOTTERY_SNAPSHOT_DENIED/);
  await assert.rejects(feed(org,'0'),/SYNC_MODULE_FEED_DENIED/);
  console.log('PASS: Lottery row-store capture, native replay/rollback, PWD and commission, corrections, and bounded authorized snapshot/feed convergence.');
}finally{await sql.end({timeout:5});}
