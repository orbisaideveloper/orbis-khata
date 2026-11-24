import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import postgres from 'postgres';
import {fixtureFeedCodec,sqliteFixturePort} from './sync-v2-local-storage-fixture.mjs';
import {createLocalFeed} from '../src/sync-v2/local-feed.ts';
import {openSqliteLocalFeedStorage} from '../src/sync-v2/local-feed-storage.ts';
import {setup} from './sql-fixture.mjs';
import {provisionTransfer} from './sync-v2-recovery-fixture.mjs';

const url=new URL(process.env.KHATA_SYNC_V2_TEST_URL??'http://missing');
assert(url.protocol==='postgres:' && url.hostname==='127.0.0.1' && url.pathname==='/khata_sync_v2_test' && !url.search);
const sql=postgres(url.toString(),{max:5,connection:{statement_timeout:10000}});
const owner='11111111-1111-7111-8111-111111111111', company=crypto.randomUUID(), party=crypto.randomUUID();
const item=crypto.randomUUID(), warehouse=crypto.randomUUID(), epoch='settlement';
const date='2026-10-01';
const workspace=async(tx,p)=>(await tx`select public.khata_workspace_v3(${tx.json(p)}::jsonb) as r`)[0].r;
const profile=async(tx,p)=>(await tx`select public.khata_expense_profiles_v1(${tx.json(p)}::jsonb) as r`)[0].r;
const auth=work=>sql.begin(async tx=>{
  await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:owner,role:'authenticated'})},true),
    set_config('orbis.khata.gateway_verified','v1',true)`;
  await tx`set local role authenticated`;
  return work(tx);
});
const input=(id,kind)=>({id,company,date,kind,name:'Fixture',code:kind,unit:kind==='item'?'kg':'',party:null,reference:'',note:'',lines:[]});
const charge=id=>({id,company,date,kind:'charge',amount:'125',category:'Feed',payee:'',method:'cash',parent:null,reference:'',note:''});
const head=async()=>(await sql`select head::text from sync_v2.scope where scope_id=${company}`)[0].head;
async function group(from){
  const [{page}]=await sql`select sync_v2.read_grouped_feed(${owner},'company',${company},${epoch},${from},1) as page`;
  assert.equal(page.groups.length,1);
  return page.groups[0].events.flatMap(event=>event.change.map(record=>[record.entityType,JSON.parse(record.projectionJson)]));
}
const rows=(changes,type)=>changes.filter(([kind])=>kind===type).map(([,row])=>row);
async function verifyDurableSettlement(snapshot, pages, registration, expenseId, expectedCash) {
  const folder=await mkdtemp(join(tmpdir(),'sync-settlement-'));
  const path=join(folder,'settlement.db');
  const codec=await fixtureFeedCodec();
  const naturalKeys={
    'expense-profile-state':['company_id'],
    'stock-movement':['document_id','ordinal'],
    'stock-reversal':['voucher_id','ordinal'],
    'fiscal-number':['kind','fiscal_year','draft_id'],
    'fiscal-counter':['kind','fiscal_year'],
  };
  const project=change=>{
    const row=JSON.parse(change.projectionJson);
    assert.equal(row.company_id,company);
    const keys=(naturalKeys[change.entityType]??['id']).map(key=>{
      assert(typeof row[key]==='string'||Number.isSafeInteger(row[key]));
      return String(row[key]);
    });
    return {collection:change.entityType,id:keys.length===1?keys[0]:JSON.stringify(keys),value:change.projectionJson};
  };
  async function withStore(work) {
    const sqlite=new DatabaseSync(path);
    try{
      const store=await openSqliteLocalFeedStorage(sqliteFixturePort(sqlite));
      const feed=createLocalFeed(owner,{kind:'company',id:company,epoch},store,codec,event=>event.change.map(project));
      return await work(feed);
    }finally{sqlite.close();}
  }
  try{
    const [{page}]=await sql`select sync_v2.read_authorized_module_feed(
      ${owner}::uuid,${registration},'company',${company},${epoch},${snapshot.highWater}::bigint,1) as page`;
    const entries=pages.map(project);
    await withStore(async feed=>{
      await feed.installSnapshot({epoch,sequence:snapshot.highWater},entries);
      await feed.apply(page);
    });
    await withStore(async feed=>{
      assert.deepEqual(await feed.cursor(),{epoch,sequence:page.next});
      let cash=0n;
      let stock=0n;
      for(const entry of entries){
        const stored=await feed.projection(entry.collection,entry.id);
        assert.equal(stored,entry.value);
        const row=JSON.parse(stored);
        if(entry.collection==='voucher'){
          cash+=(row.debit_account==='cash'?BigInt(row.amount_minor):0n)-(row.credit_account==='cash'?BigInt(row.amount_minor):0n);
        }
        if(entry.collection==='stock-movement')stock+=BigInt(row.quantity);
      }
      assert.equal(cash,expectedCash);
      assert.equal(stock,2000000n);
      const expense=JSON.parse(await feed.projection('expense',expenseId));
      assert.equal(expense.id,expenseId);
      assert.equal(expense.company_id,company);
      assert.equal(String(expense.amount_minor),'125');
    });
    console.log('PASS native PostgreSQL Khata settlement snapshot/feed -> encrypted SQLite reopen, cash/stock and expense identity');
  }finally{await rm(folder,{recursive:true,force:true});}
}
try{
  assert.equal((await sql`select count(*)::int as n from information_schema.tables where table_schema='public'`)[0].n,0);
  const init=await sql.reserve();
  try{
    await setup({exec:statement=>init.unsafe(statement),query:async(statement,params=[])=>({rows:await init.unsafe(statement,params)})});
    for(const path of ['migrations/20261031075245_lottery_row_storage.sql','migrations/20261031081126_continuous_production.sql',
      'migrations/20261101144338_expense_profile_schedules.sql','tests/sync-v2/kernel.sql',
      'tests/sync-v2/voucher-capture.sql','tests/sync-v2/grouped-feed.sql','tests/sync-v2/voucher-stock-order.sql',
      'tests/sync-v2/company-id-fence.sql','tests/sync-v2/company-direct-write-fence.sql',
      'tests/sync-v2/expense-master-lock-order.sql','tests/sync-v2/settlement-expense-capture.sql',
      'tests/sync-v2/khata-writer.sql','tests/sync-v2/voucher-snapshot.sql','tests/sync-v2/company-projection-sections.sql',
      'tests/sync-v2/settlement-snapshot.sql','tests/sync-v2/authorized-module-feed.sql','tests/sync-v2/trusted-device-authority.sql',
      'tests/sync-v2/recovery-transfer.sql']){
      await init.unsafe(await readFile('supabase/'+path,'utf8'));
    }
    await init.unsafe('grant usage on schema auth to authenticated');
  }finally{init.release();}
  await sql`insert into orbis_khata.ledger_owners(id,legacy) values(${owner},false)`;
  await sql`insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference) values(${owner},${owner},'fixture')`;
  await sql`insert into public.khata_companies(id,name,owner_id) values(${company},'Synthetic settlement',${owner})`;
  await sql`insert into public.khata_parties(id,company_id,name,kind) values(${party},${company},'Counterparty','both')`;
  await auth(async tx=>{
    for(const fixture of [input(item,'item'),input(warehouse,'warehouse')])
      await tx`select public.khata_inventory_post_v1(${tx.json(fixture)}::jsonb)`;
  });
  await sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle)
    values(${owner},'company',${company},${epoch},'active')`;

  const invoice=crypto.randomUUID();
  const bill={...input(invoice,'purchase'),code:'',name:'',unit:'',party,
    lines:[{item,warehouse,to:null,quantity:'2000000',rate:'5000'}]};
  const save={company,action:'invoice-save',command:{company,action:'bill',bill,paid:'2500',account:'cash',roundoff:'0'}};
  await assert.rejects(auth(async tx=>{await workspace(tx,save);throw new Error('ROLLBACK_PROBE');}),/ROLLBACK_PROBE/);
  assert.equal(await head(),'0');
  const [result, retry]=await Promise.all([auth(tx=>workspace(tx,save)),auth(tx=>workspace(tx,save))]);
  assert.deepEqual(retry,result);
  assert.deepEqual({total:result.total,paid:result.paid,due:result.due},{total:'10000',paid:'2500',due:'7500'});
  assert.deepEqual(await auth(tx=>workspace(tx,save)),result); // Lost ACK replay.
  const initial=await group('0');
  assert.deepEqual(rows(initial,'voucher').map(r=>r.id).sort(),[invoice,result.payment].sort());
  assert.deepEqual(rows(initial,'payment-link').map(r=>[r.id,r.bill_id]),[[result.payment,invoice]]);
  assert.deepEqual(rows(initial,'invoice')[0].result,result);
  assert.equal(rows(initial,'fiscal-number')[0].reference,result.reference);
  assert.equal(rows(initial,'inventory-document').length,1);
  assert.equal(rows(initial,'stock-movement').length,1);
  const [stock]=await sql`select sum(quantity)::text as n from public.khata_stock_journal where company_id=${company}`;
  assert.equal(stock.n,'2000000');
  assert.equal(String(rows(initial,'stock-movement')[0].quantity),stock.n);

  const independent=Array.from({length:2},()=>({company,action:'payment',id:crypto.randomUUID(),
    party,date,amount:'500',kind:'payment',account:'cash',reference:'',note:'Independent'}));
  const beforePayments=await head();
  assert.deepEqual((await Promise.all(independent.map(p=>auth(tx=>workspace(tx,p))))).map(p=>p.id),independent.map(p=>p.id));
  const [[{page}],end]=await Promise.all([sql`select sync_v2.read_grouped_feed(${owner},'company',${company},${epoch},${beforePayments},500) as page`,head()]);
  assert.equal(page.groups.length,2);
  assert.equal(page.next,end);
  for(const txn of page.groups){
    const changes=txn.events.flatMap(e=>e.change.map(r=>[r.entityType,JSON.parse(r.projectionJson)]));
    assert.equal(rows(changes,'voucher')[0].id,rows(changes,'payment-link')[0].id);
    assert.equal(rows(changes,'payment-link')[0].bill_id,null);
  }
  const [{balance}]=await sql`select sum(signed_minor)::text as balance from public.khata_journal where company_id=${company} and account='cash'`;
  assert.equal(balance,'-3500');

  const recurring=charge(crypto.randomUUID()), operationId=crypto.randomUUID();
  const request={company,action:'post',operationId};
  async function recurringPost(tx,abort=false){
    const loaded=await profile(tx,{...request,action:'load',request});
    if(loaded.replay)return loaded.state;
    await tx`select public.khata_expense_post_v1(${tx.json(recurring)}::jsonb)`;
    const state={...loaded.state,payments:[{id:recurring.id}]};
    const committed=await profile(tx,{...request,action:'commit',request,state,version:loaded.version});
    if(abort)throw new Error('ROLLBACK_PROBE');
    return committed.state;
  }
  await assert.rejects(auth(tx=>recurringPost(tx,true)),/ROLLBACK_PROBE/);
  assert.equal(await head(),end);
  const state=await auth(recurringPost);
  assert.deepEqual(await auth(recurringPost),state);
  const effects=await group(end);
  assert.deepEqual(rows(effects,'expense').map(r=>[r.id,r.amount_minor]),[[recurring.id,125]]);
  assert.deepEqual(rows(effects,'expense-profile-operation').map(r=>[r.id,r.result.payments[0].id]),[[operationId,recurring.id]]);
  const prior=await head(), reversal={...recurring,id:crypto.randomUUID(),kind:'reversal',method:null,parent:recurring.id,note:'Correction'};
  const corrections=await Promise.allSettled([reversal,{...reversal,id:crypto.randomUUID()}].map(
    p=>auth(tx=>tx`select public.khata_expense_post_v2(${tx.json(p)}::jsonb)`)));
  assert.equal(corrections.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(rows(await group(prior),'expense')[0].reverses_id,recurring.id);
  assert.equal((await sql`select sum(signed_minor)::text as n from public.khata_expense_journal where company_id=${company} and account='cash'`)[0].n,'0');
  console.log('PASS: grouped invoice settlement and exact ledger/stock, lost ACK, equal payments, recurring charge rollback/replay and concurrent correction.');
  const registration='synthetic-registration';
  await sql`insert into sync_v2.test_device(actor_id,registration_id) values(${owner},${registration})`;
  const [{snapshot}]=await sql`select sync_v2.open_settlement_snapshot(${owner}::uuid,
    ${registration},${company}::uuid,${epoch}) as snapshot`;
  assert.equal(snapshot.projection,'settlement-expense-v1');
  assert.equal(snapshot.highWater,await head());
  const pages=[];
  let offset=0;
  do{
    const [{page}]=await sql`select sync_v2.read_voucher_snapshot(${owner}::uuid,${registration},
      ${company}::uuid,${epoch},${snapshot.snapshot}::uuid,${snapshot.highWater}::bigint,${offset},2,262144) as page`;
    assert.equal(page.from,offset);
    assert.equal(page.projection,'settlement-expense-v1');
    assert(page.next>offset);
    pages.push(...page.rows);
    offset=page.next;
  }while(offset<snapshot.count);
  const image=pages.map(r=>[r.entityType,JSON.parse(r.projectionJson)]);
  assert.deepEqual(rows(image,'invoice').map(r=>r.result),[result]);
  assert.equal(rows(image,'payment-link').length,3);
  assert.deepEqual(rows(image,'expense-profile-state')[0].state,state);
  assert.equal(rows(image,'stock-movement').reduce((total,row)=>total+BigInt(row.quantity),0n),2000000n);
  const restoredCash=rows(image,'voucher').reduce((amount,row)=>amount+
    (row.debit_account==='cash'?BigInt(row.amount_minor):0n)-(row.credit_account==='cash'?BigInt(row.amount_minor):0n),0n);
  assert.equal(restoredCash,-3500n);
  const after=charge(crypto.randomUUID());
  await auth(tx=>tx`select public.khata_expense_post_v2(${tx.json(after)}::jsonb)`);
  assert.deepEqual(rows(await group(snapshot.highWater),'expense').map(r=>r.id),[after.id]);
  const [{page:oldPage}]=await sql`select sync_v2.read_voucher_snapshot(${owner}::uuid,${registration},
    ${company}::uuid,${epoch},${snapshot.snapshot}::uuid,${snapshot.highWater}::bigint,0,200,262144) as page`;
  assert(!oldPage.rows.some(row=>row.projectionJson.includes(after.id)));
  await verifyDurableSettlement(snapshot,pages,registration,after.id,restoredCash);
  console.log('PASS: bounded settlement/expense image reconstructs exact cash and stock, with post-image mutation in feed only.');
  await sql.unsafe(await readFile('supabase/tests/sync-v2/company-operational-capture.sql','utf8'));
  const spare=crypto.randomUUID();
  const saveMaster=tx=>tx`select public.khata_master_save_v2('party', ${tx.json({
    id:spare,company,name:'Disposable master',kind:'customer',opening_amount:'0',opening_side:'none',
  })}::jsonb)`;
  const masterStart=await head();
  await auth(saveMaster);
  const master=await group(masterStart);
  assert.deepEqual(rows(master,'party').map(r=>r.id),[spare]);
  const deleteStart=await head();
  await auth(tx=>tx`select public.khata_master_delete_v2('party',${company}::uuid,${spare}::uuid)`);
  const deleted=await group(deleteStart);
  assert.deepEqual(rows(deleted,'party'),[{id:spare,company_id:company,deleted:true}]);
  assert.equal(rows(deleted,'master-audit')[0].entity_id,spare);

  const outputItem=crypto.randomUUID();
  await auth(tx=>tx`select public.khata_inventory_post_v1(${tx.json({...input(outputItem,'item'),code:'OUT'})}::jsonb)`);
  const settings=await auth(tx=>workspace(tx,{company,action:'settings'}));
  const settingsHead=await head();
  await auth(tx=>workspace(tx,{company,action:'settings-save',settings:{...settings,production:true}}));
  assert.equal(rows(await group(settingsHead),'workspace-settings')[0].settings.production,true);
  const routedId=crypto.randomUUID();
  const routed={...save,production:true,command:{...save.command,bill:{...save.command.bill,id:routedId}}};
  const beforeRoute=await head();
  const routedResult=await auth(tx=>workspace(tx,routed));
  assert.deepEqual(await auth(tx=>workspace(tx,routed)),routedResult);
  const routeChanges=await group(beforeRoute);
  const [recordedRoute]=rows(routeChanges,'production-route');
  assert.equal(recordedRoute.invoice_id,routedId);
  assert.equal(rows(routeChanges,'production-post')[0].id,recordedRoute.input_id);
  assert.equal(rows(routeChanges,'payment-link')[0].id,routedResult.payment);
  assert.equal(rows(routeChanges,'stock-movement').reduce((n,r)=>n+BigInt(r.quantity),0n),0n);
  const standalone={company,action:'production',id:crypto.randomUUID(),date,kind:'output',
    item:outputItem,warehouse,quantity:'1500',note:'Output fixture'};
  const beforeOutput=await head();
  await auth(tx=>workspace(tx,standalone));
  assert.equal(rows(await group(beforeOutput),'production-post')[0].id,standalone.id);
  const beforeCorrection=await head();
  await auth(tx=>workspace(tx,{company,action:'correct',id:crypto.randomUUID(),type:'voucher',
    target:routedId,reason:'Undo purchase',replacement:null}));
  const corrected=await group(beforeCorrection);
  assert.deepEqual(rows(corrected,'voucher').map(r=>r.reverses_id),[routedResult.payment,routedId]);
  assert.equal(rows(corrected,'workspace-operation').length,1);
  const [net]=await sql`select sum(quantity)::text as amount from public.khata_stock_journal where company_id=${company} and item_id=${item}`;
  assert.equal(net.amount,'2000000');

  const [{snapshot:operational}]=await sql`select sync_v2.open_settlement_snapshot(${owner}::uuid,
    ${registration},${company}::uuid,${epoch},'company-operational-v1') as snapshot`;
  assert.equal(operational.projection,'company-operational-v1');
  const [{page:opPage}]=await sql`select sync_v2.read_voucher_snapshot(${owner}::uuid,${registration},
    ${company}::uuid,${epoch},${operational.snapshot}::uuid,${operational.highWater}::bigint,0,200,262144) as page`;
  assert.equal(opPage.done,true);
  const opRows=opPage.rows.map(row=>[row.entityType,JSON.parse(row.projectionJson)]);
  assert.equal(rows(opRows,'production-route')[0].input_id,recordedRoute.input_id);
  assert.equal(rows(opRows,'workspace-settings')[0].settings.production,true);
  assert(rows(opRows,'master-audit').some(r=>r.entity_id===spare));
  assert(!rows(opRows,'party').some(r=>r.id===spare));
  assert.equal(rows(opRows,'stock-reversal').reduce((n,r)=>n+BigInt(r.quantity),0n),0n);
  assert.equal((await sql`select sync_v2.close_company_snapshot(${owner}::uuid,${registration},
    ${company}::uuid,${epoch},${operational.snapshot}::uuid) as removed`)[0].removed,true);
  assert.equal((await sql`select sync_v2.close_company_snapshot(${owner}::uuid,${registration},
    ${company}::uuid,${epoch},${operational.snapshot}::uuid) as removed`)[0].removed,false);
  await assert.rejects(sql`select sync_v2.read_voucher_snapshot(${owner}::uuid,${registration},
    ${company}::uuid,${epoch},${operational.snapshot}::uuid,${operational.highWater}::bigint,0,2,262144)`,
    /SYNC_SNAPSHOT_STALE/);
  const [{snapshot:aged}]=await sql`select sync_v2.open_settlement_snapshot(${owner}::uuid,
    ${registration},${company}::uuid,${epoch},'company-operational-v1') as snapshot`;
  await sql`update sync_v2.voucher_snapshot set opened_at=now()-interval '1 day' where id=${aged.snapshot}`;
  await assert.rejects(sql`select sync_v2.dispose_company_snapshots(now()+interval '1 second',1)`,
    /SYNC_SNAPSHOT_DISPOSAL_INVALID/);
  assert.equal((await sql`select sync_v2.dispose_company_snapshots(now(),1) as removed`)[0].removed,1);
  assert.equal((await sql`select sync_v2.dispose_company_snapshots(now(),1) as removed`)[0].removed,0);
  const largeProfile='ব'.repeat(360000);
  const at=await head(), largeCharge=charge(crypto.randomUUID()), largeOperation=crypto.randomUUID();
  const largeRequest={operationId:largeOperation,company};
  await auth(async tx=>{
    const loaded=await profile(tx,{...largeRequest,action:'load',request:largeRequest});
    await tx`select public.khata_expense_post_v1(${tx.json(largeCharge)}::jsonb)`;
    await profile(tx,{...largeRequest,action:'commit',request:largeRequest,version:loaded.version,
      state:{...loaded.state,payments:[...loaded.state.payments,{id:largeCharge.id,syntheticNote:largeProfile}]}});
  });
  await assert.rejects(group(at),/SYNC_FEED_PAGE_TOO_LARGE/);
  const transfers=await provisionTransfer(sql,owner,'company',company,epoch);
  const startBudget=await head();
  const bigGroup=await transfers.open(at);
  assert(bigGroup.bytes>1048576);
  const groupItems=await transfers.download(bigGroup);
  assert.equal(groupItems.at(-1).seq,startBudget);
  assert.equal(rows(groupItems.flatMap(e=>e.change.map(r=>[r.entityType,JSON.parse(r.projectionJson)])),
    'expense')[0].id,largeCharge.id);
  const recovery=await transfers.open();
  const restored=(await transfers.download(recovery)).map(r=>[r.entityType,JSON.parse(r.projectionJson)]);
  assert(rows(restored,'expense-profile-state')[0].state.payments.some(p=>p.syntheticNote===largeProfile));
  const frozenStock=rows(restored,'stock-movement').filter(r=>r.item_id===item).reduce((n,r)=>n+BigInt(r.quantity),0n)
    +rows(restored,'stock-reversal').filter(r=>r.item_id===item).reduce((n,r)=>n+BigInt(r.quantity),0n);
  assert.equal(frozenStock,BigInt(net.amount));
  const cash=rows(restored,'voucher').reduce((sum,r)=>sum+
    (r.debit_account==='cash'?BigInt(r.amount_minor):0n)-(r.credit_account==='cash'?BigInt(r.amount_minor):0n),0n);
  assert.equal(cash,-3500n);
  assert.equal((await sql`select sync_v2.dispose_recovery_transfers(now()+interval '1 hour',1) as count`
    .catch(error=>({error})) ).error?.message,'SYNC_RECOVERY_DISPOSAL_INVALID');
  await sql`update sync_v2.recovery_transfer set opened_at=now()-interval '1 day' where id=${recovery.transfer}`;
  assert.equal((await sql`select sync_v2.dispose_recovery_transfers(now(),1) as removed`)[0].removed,1);
  assert.equal((await sql`select count(*)::int as n from sync_v2.recovery_transfer_item`)[0].n,0);
  await assert.rejects(transfers.read(recovery.transfer,1,0),/SYNC_RECOVERY_TRANSFER_DENIED/);
  console.log('PASS: master tombstone, settings, routed purchase and output, linked correction and expanded company bootstrap.');
}finally{await sql.end({timeout:5});}
