import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {setup} from './sql-fixture.mjs';
async function verify(){
 const nativeUrl=process.env.KHATA_SYNC_V2_TEST_URL;
 let native, concurrent;
 if(nativeUrl){
  const url=new URL(nativeUrl);
  assert(url.protocol==='postgres:' && url.hostname==='127.0.0.1' && url.pathname==='/khata_sync_v2_test' && !url.search);
  native=postgres(url.toString(),{max:1,connection:{statement_timeout:15000}});
  concurrent=postgres(url.toString(),{max:4,connection:{statement_timeout:15000}});
 }
 try {
 if(native) assert.equal((await native`select count(*)::int as n from information_schema.tables where table_schema='public'`)[0].n,0);
 // Fixtures supply serialized JSON text, so avoid postgres.js JSONB encoding it again.
 const nativeQuery=async(q,p=[])=>({rows:await native.unsafe(q.replace(/(\$\d+)::jsonb/g,'$1::text::jsonb'),p)});
 const db=await setup(native ? {exec:q=>native.unsafe(q),query:nativeQuery} : undefined);
 const owner='11111111-1111-7111-8111-111111111111',company='22222222-2222-4222-8222-222222222222',other='99999999-9999-4999-8999-999999999999',party='33333333-3333-4333-8333-333333333333',warehouse='44444444-4444-4444-8444-444444444444',feed='55555555-5555-4555-8555-555555555555',milk='66666666-6666-4666-8666-666666666666';
 await db.query('insert into auth.users values($1)',[owner]);
 await db.query('insert into orbis_khata.ledger_owners(id,legacy) values($1,false)',[owner]);
 await db.query('insert into khata_companies(id,owner_id,name) values($1,$2,$3)',[company,owner,'Historical owner']);
 await db.query("insert into khata_parties(id,company_id,name,kind,opening_account) values($1,$2,'Old supplier','both','receivable')",[party,company]);
 await db.query("select set_config('request.jwt.claims',$1,false),set_config('orbis.khata.gateway_verified','v1',false)",[JSON.stringify({sub:owner,role:'authenticated'})]);
 for(const [id,kind,code,name,unit] of [[warehouse,'warehouse','MAIN','Main',''],[feed,'item','FEED','Feed','bag'],[milk,'item','MILK','Milk','litre']])await db.query('select public.khata_inventory_post_v1($1::jsonb)',[JSON.stringify({id,company,kind,date:'2026-10-01',code,name,unit,party:null,reference:'',note:'',lines:[]})]);
 const rpc=async p=>(await db.query('select public.khata_workspace_v3($1::jsonb) as result',[JSON.stringify(p)])).rows[0].result;
 const settings=await rpc({company,action:'settings'});
 const bill=(id,production=false)=>({company,action:'invoice-save',...(production?{production:true}:{}),command:{company,action:'bill',bill:{id,company,kind:'purchase',date:'2026-10-01',code:'',name:'',unit:'',party,reference:'',note:'Feed',lines:[{item:feed,warehouse,to:null,quantity:'500000000',rate:'5000'}]},paid:'100000',account:'cash',roundoff:'0'}});
 const old=bill(crypto.randomUUID());await rpc(old);
 const fingerprint=async()=>(await db.query("select jsonb_build_object('users',(select jsonb_agg(to_jsonb(t)) from auth.users t),'companies',(select jsonb_agg(to_jsonb(t)) from khata_companies t),'parties',(select jsonb_agg(to_jsonb(t)) from khata_parties t),'vouchers',(select jsonb_agg(to_jsonb(t)) from khata_vouchers t),'inventory',(select jsonb_agg(to_jsonb(t)) from khata_inventory_documents t)) as state")).rows[0].state;
 const before=await fingerprint();
 await db.exec(await readFile('supabase/migrations/20261031075245_lottery_row_storage.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261031081126_continuous_production.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261105040047_warehouse_transfer_stock_guard.sql','utf8'));
 assert.equal((await db.query("select has_table_privilege('authenticated','public.khata_production_posts','SELECT') as allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('anon','public.khata_workspace_v3(jsonb)','EXECUTE') as allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','orbis_khata.production_post(jsonb)','EXECUTE') as allowed")).rows[0].allowed,false);
 assert.deepEqual(await fingerprint(),before,'Migration must preserve every old account/company/party/voucher/inventory value');
 await rpc({company,action:'settings-save',settings:{...settings,production:true}});
 await db.query("insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference) values($1,$1,'fixture')",[owner]);
 for(const file of ['kernel.sql','voucher-capture.sql','invoice-projection.sql','grouped-feed.sql'])await db.exec(await readFile('supabase/tests/sync-v2/'+file,'utf8'));
 await db.query("insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle) values($1,'company',$2,'fixture','active')",[owner,company]);
 const routed=bill(crypto.randomUUID(),true);
 const output={company,action:'production',id:crypto.randomUUID(),date:'2026-10-01',kind:'output',item:milk,warehouse,quantity:'500000000',note:'Own milk'};
 const operation=crypto.randomUUID(), digest='a'.repeat(64);
 const runInvoice=async(fail=false, operationId=operation, beforeCommit=undefined, purchase=routed, afterStockLock=undefined)=>{
  const args=[owner,company,'fixture',operationId];
  const execute=async transaction=>{
   const activeCompany='select id from public.khata_companies where id=$1 and owner_id=$2 and deleted_at is null';
   const ownership=[company,owner];
   if(!(await transaction.query(activeCompany,ownership)).rows.length)throw new Error('SYNC_INVOICE_COMPANY_INACTIVE');
   await transaction.query("select pg_advisory_xact_lock(hashtextextended('stock-company:'||$1,0))",ownership.slice(0,1));
   await afterStockLock?.(transaction);
   if(!(await transaction.query(activeCompany+' for no key update',ownership)).rows.length)
    throw new Error('SYNC_INVOICE_COMPANY_INACTIVE');
   const {rows:[prior]}=await transaction.query(
    'select digest,result::text as result from sync_v2.receipt where actor_id=$1 and scope_id=$2 and epoch=$3 and operation_id=$4',args);
   if(prior){assert.equal(prior.digest,digest);return JSON.parse(prior.result);}
   await transaction.query("select set_config('request.jwt.claims',$1,true),set_config('orbis.khata.gateway_verified','v1',true)",[JSON.stringify({sub:owner,role:'authenticated'})]);
   await transaction.query('set local role authenticated');
   await transaction.query('select public.khata_workspace_v3($1::text::jsonb)',[JSON.stringify(purchase)]);
   await transaction.query('reset role');
   await transaction.query('select sync_v2.finish_routed_purchase($1,$2,$3,$4,$5,$6)',[...args,digest,purchase.command.bill.id]);
   if(fail)throw new Error('INVOICE_PROJECTION_ROLLBACK');
   const {rows:[receipt]}=await transaction.query('select result::text as result from sync_v2.receipt where operation_id=$1',[operationId]);
   await beforeCommit?.(transaction);
   return JSON.parse(receipt.result);
  };
  if(concurrent)return concurrent.begin(tx=>execute({query:async(q,p)=>({rows:await tx.unsafe(q,p)})}));
  return db.transaction(execute);
 };
 await db.exec('grant usage on schema auth to authenticated');
 const beforeFailedInvoice=await fingerprint();
 await assert.rejects(runInvoice(true),/INVOICE_PROJECTION_ROLLBACK/);
 assert.equal((await db.query('select count(*)::int as n from sync_v2.event')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int as n from sync_v2.receipt')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int as n from khata_inventory_documents where id=$1',[routed.command.bill.id])).rows[0].n,0);
 assert.deepEqual(await fingerprint(),beforeFailedInvoice);
 let receipt;
 let replays=[];
 if(concurrent){
  const ready=Promise.withResolvers();
  const release=Promise.withResolvers();
  const first=runInvoice(false,operation,async()=>{
   ready.resolve();
   await release.promise;
  });
  // Keep the posting open while an independent real production writer waits.
  const production=Promise.race([ready.promise,first]).then(()=>rpc(output));
  const retry=Promise.race([ready.promise,first]).then(()=>runInvoice());
  const settled=Promise.allSettled([first,production,retry]);
  try {
   await Promise.race([ready.promise,first]);
   const lockObserved=await concurrent.begin(async tx=>{
    for(let attempt=0;attempt<100;attempt++){
     await tx`select pg_stat_clear_snapshot()`;
     const [waiting]=await tx`select count(*)::int as blocked
      from pg_stat_activity where datname=current_database() and wait_event_type='Lock'
      and (query like 'select public.khata_workspace_v3%' or query like 'select pg_advisory_xact_lock%')`;
     if(waiting.blocked===2)return true;
     await tx`select pg_sleep(0.02)`;
    }
    return false;
   });
   assert(lockObserved,'Production output and duplicate retry must wait on the invoice transaction');
   assert.equal((await concurrent`select count(*)::int as n from sync_v2.event`)[0].n,0,
    'A separate connection must not observe uncommitted invoice events');
  } finally {
   release.resolve();
   await settled;
  }
  receipt=await first;
  await production;
  replays=[await retry,...await Promise.all(Array.from({length:98},()=>runInvoice()))];
 }else{
  receipt=await runInvoice();
 }
 assert(replays.every(replay=>replay.payment===receipt.payment && replay.productionInputId===receipt.productionInputId));
 const answer=await rpc(routed);
 assert.equal(answer.total,'2500000');
 assert.deepEqual(await runInvoice(),receipt);
 assert.equal(receipt.payment,answer.payment);
 await assert.rejects(runInvoice(false,crypto.randomUUID()), error=>error.code==='23505');
 const {rows:[event]}=await db.query(
  "select change::text as change from sync_v2.event where operation_id=$1",[operation]);
 const [projection]=JSON.parse(event.change);
 assert.equal(projection.productionInputId,receipt.productionInputId);
 assert.equal(JSON.parse(projection.paymentLink).bill_id,routed.command.bill.id);
 assert.equal(JSON.parse(projection.fiscalNumber).reference,answer.reference);
 assert.equal(projection.stockMovements.reduce((sum,row)=>sum+BigInt(JSON.parse(row).quantity),0n),0n);
 assert.equal(projection.stockMovements.length,2);
 assert.equal((await db.query('select count(*)::int as n from sync_v2.event')).rows[0].n,3);
 const groupedPage=(cursor,epoch='fixture')=>db.query(
  "select sync_v2.read_grouped_feed($1,'company',$2,$3,$4,1)::text as page",
  [owner,company,epoch,cursor]).then(({rows})=>JSON.parse(rows[0].page));
 const initialPage=await groupedPage('0');
 assert.equal(initialPage.groups.length,1);
 assert.equal(initialPage.next,'3');
 assert.deepEqual(initialPage.groups[0].events.map(event=>event.seq),['1','2','3']);
 assert.deepEqual(await groupedPage('0'),initialPage,'Retrying a lost page must return the same complete group');
 await assert.rejects(groupedPage('1'),/SYNC_FEED_SPLIT_CURSOR/);
 await assert.rejects(groupedPage('0','stale'),/SYNC_FEED_EPOCH_UNAVAILABLE/);
 assert.deepEqual((await groupedPage(initialPage.next)).groups,[]);
 const paginationScope='pager-fixture';
 await db.query("insert into sync_v2.scope values($1,'company',$2,'fixture','active',2)",[owner,paginationScope]);
 for(const sequence of [1,2]){
  await db.query("insert into sync_v2.event(actor_id,kind,scope_id,epoch,seq,change) values($1,'company',$2,'fixture',$3,jsonb_build_object('fixture',repeat('x',540000)))",
   [owner,paginationScope,sequence]);
 }
 const boundedPage=async cursor=>JSON.parse((await db.query(
  "select sync_v2.read_grouped_feed($1,'company',$2,'fixture',$3,2)::text as page",
  [owner,paginationScope,cursor])).rows[0].page);
 assert.equal((await boundedPage('0')).next,'1','An oversized combined page must still return the first complete group');
 assert.equal((await boundedPage('1')).next,'2');
 await db.query("update sync_v2.scope set retained_after=1 where scope_id=$1",[paginationScope]);
 await db.query("delete from sync_v2.event where scope_id=$1 and seq=1",[paginationScope]);
 await assert.rejects(boundedPage('0'),/SYNC_FEED_CURSOR_EXPIRED/);
 assert.equal((await boundedPage('1')).next,'2','An authoritative snapshot cursor must resume after the retained boundary');
 await db.query("update sync_v2.event set change=jsonb_build_object('fixture',repeat('x',1048576)) where scope_id=$1 and seq=2",[paginationScope]);
 await assert.rejects(boundedPage('1'),/SYNC_FEED_PAGE_TOO_LARGE/);
 const childLineage=async()=> (await db.query(
  'select r.input_id, l.id as payment_id from public.khata_production_routes r join public.khata_payment_links l on l.company_id=r.company_id and l.bill_id=r.invoice_id where r.company_id=$1 and r.invoice_id=$2',
  [company,routed.command.bill.id])).rows;
 const lineage=await childLineage();
 assert.equal(lineage.length,1);
 assert.equal(lineage[0].payment_id,answer.payment);
 assert.notEqual(lineage[0].input_id,lineage[0].payment_id);
 await rpc(routed); // Sender discarded the previous successful response.
 assert.deepEqual(await childLineage(),lineage,'Repeated invoice must keep both persisted child identities');
 const postedInvoiceVouchers=(await db.query('select voucher_id from sync_v2.voucher_event where voucher_id in ($1,$2) order by voucher_id',[routed.command.bill.id,answer.payment])).rows;
 assert.deepEqual(postedInvoiceVouchers.map(row=>row.voucher_id),[routed.command.bill.id,answer.payment].sort());
 await assert.rejects(rpc({...routed,production:false}),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(rpc({...old,production:true}),/IDEMPOTENCY_CONFLICT/);
 const journalBefore=(await db.query('select count(*)::int as n from khata_vouchers where company_id=$1',[company])).rows[0].n;
 await rpc(output);await rpc(output);
 assert.equal((await db.query('select count(*)::int as n from khata_vouchers where company_id=$1',[company])).rows[0].n,journalBefore,'Internal milk must not post another purchase/payable/payment');
 assert.equal((await db.query('select sum(quantity)::text as q from khata_stock_journal where company_id=$1 and item_id=$2',[company,milk])).rows[0].q,'500000000');
 const count=async()=>(await db.query('select count(*)::int as n from khata_inventory_documents')).rows[0].n;
 const n=await count();await assert.rejects(rpc({...output,id:crypto.randomUUID(),kind:'input',item:feed,quantity:'999999999999'}),/INSUFFICIENT_PRODUCTION_STOCK/);assert.equal(await count(),n);
 await assert.rejects(rpc({...output,id:crypto.randomUUID(),item:feed}),/ONE_PRODUCTION_OUTPUT_ITEM_REQUIRED/);
 await assert.rejects(rpc({...output,id:crypto.randomUUID(),kind:'input'}),/PRODUCTION_OUTPUT_CANNOT_BE_INPUT/);
 await assert.rejects(rpc({...output,id:crypto.randomUUID(),date:'2099-01-01'}),/INVALID_PRODUCTION/);
 await assert.rejects(rpc({...output,id:crypto.randomUUID(),quantity:'0'}),/INVALID_QUANTITY/);
 await assert.rejects(rpc({...output,quantity:'1000000'}),/IDEMPOTENCY_CONFLICT/);
 await rpc({company,action:'settings-save',settings:{...settings,production:false}});
 await assert.rejects(rpc({...output,id:crypto.randomUUID()}),/PRODUCTION_DISABLED/);
 // Failed checkbox routing rolls back its purchase, supplier/cash entries and serial.
 const failed=bill(crypto.randomUUID(),true),numberBefore=await rpc({company,action:'number-preview',id:crypto.randomUUID(),kind:'purchase',date:'2026-10-01'});
 await assert.rejects(rpc(failed),/PRODUCTION_DISABLED/);assert.equal(await count(),n);
 assert.equal(await rpc({company,action:'number-preview',id:crypto.randomUUID(),kind:'purchase',date:'2026-10-01'}),numberBefore);
 await assert.rejects(rpc({...output,id:crypto.randomUUID(),company:other}),/COMPANY_NOT_ACCESSIBLE/);
 await db.exec('update khata_write_controls set enabled=false');await assert.rejects(rpc({...output,id:crypto.randomUUID()}),/WRITES_DISABLED/);await db.exec('update khata_write_controls set enabled=true');
 if(concurrent)await rpc({company,action:'settings-save',settings:{...settings,production:true}});
 if(concurrent){
  const faultPurchase=bill(crypto.randomUUID(),true);
  const faultOperation=crypto.randomUUID();
  const beforeFault=await fingerprint();
  const beforeFeed=(await groupedPage('3')).next;
  for(const code of ['40P01','40001']){
   await assert.rejects(runInvoice(false,faultOperation,transaction=>transaction.query(
    `do $$ begin raise exception 'FIXTURE_RETRY_FAULT' using errcode='${code}'; end $$`
   ),faultPurchase),error=>error.code===code);
   assert.deepEqual(await fingerprint(),beforeFault);
   assert.equal((await groupedPage('3')).next,beforeFeed);
   assert.equal((await db.query('select count(*)::int as n from sync_v2.receipt where operation_id=$1',
    [faultOperation])).rows[0].n,0);
  }
  const rebuilt=await runInvoice(false,faultOperation,undefined,faultPurchase);
  assert.deepEqual(await runInvoice(false,faultOperation,undefined,faultPurchase),rebuilt);
  const recovered=(await groupedPage(beforeFeed)).groups[0];
  assert.equal(recovered.events.length,3);
  assert.equal(recovered.events.filter(event=>event.operationId===faultOperation).length,1);
 }
 // Reversal returns the routed input as well; original supplier settlement logic is retained.
 const correction={company,action:'correct',id:crypto.randomUUID(),target:routed.command.bill.id,type:'voucher',reason:'Wrong purchase',replacement:null};
 const beforeCorrection=(await db.query('select head::text from sync_v2.scope where scope_id=$1',[company])).rows[0].head;
 if(concurrent){
  const hold=Promise.withResolvers();
  const release=Promise.withResolvers();
  const reversal=concurrent.begin(async tx=>{
   await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:owner,role:'authenticated'})},true),
    set_config('orbis.khata.gateway_verified','v1',true)`;
   await tx`set local role authenticated`;
   await tx`select public.khata_workspace_v3(${JSON.stringify(correction)}::text::jsonb)`;
   const [{pid}]=await tx`select pg_backend_pid() as pid`;
   hold.resolve(pid);
   await release.promise;
  });
  const ready=Promise.race([hold.promise,reversal]);
  const duplicate=ready.then(()=>runInvoice());
  const stockWrite=ready.then(()=>rpc({...output,id:crypto.randomUUID()}));
  const payment={company,action:'payment',id:crypto.randomUUID(),party,kind:'payment',
   date:'2026-10-01',amount:'100000',account:'cash',reference:'',note:'Independent payment'};
  const paying=ready.then(()=>concurrent.begin(async tx=>{
   await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:owner,role:'authenticated'})},true),
    set_config('orbis.khata.gateway_verified','v1',true)`;
   await tx`set local role authenticated`;
   return (await tx`select public.khata_workspace_v3(${JSON.stringify(payment)}::text::jsonb) as result`)[0].result;
  }));
  const settled=Promise.allSettled([duplicate,stockWrite,reversal,paying]);
  try{
   const pid=await ready;
   let blocked=0;
   for(let attempt=0;attempt<100;attempt++){
    [{blocked}]=await concurrent`select count(*)::int as blocked from pg_stat_activity
     where datname=current_database() and ${pid}::int = any(pg_blocking_pids(pid))`;
    if(blocked===3)break;
    await concurrent`select pg_sleep(0.02)`;
   }
   assert.equal(blocked,3,'The duplicate invoice, stock writer and payment must wait for the reversal');
  } finally {
   release.resolve();
   await settled;
  }
  await reversal;
  assert.deepEqual(await duplicate,receipt);
  await stockWrite;
  assert.deepEqual(await paying,{id:payment.id});
  assert.deepEqual(await rpc(payment),{id:payment.id});
 }else await rpc(correction);
 assert.equal((await db.query("select count(*)::int as n from khata_stock_reversals r join khata_production_routes p on p.input_id=r.original_id where p.company_id=$1 and p.invoice_id=$2",[company,routed.command.bill.id])).rows[0].n,1);
 const reversalEvents=(await groupedPage(beforeCorrection)).groups[0].events.map(event=>event.change[0]);
 assert.deepEqual(reversalEvents.map(event=>JSON.parse(event.projectionJson).reverses_id),[answer.payment,routed.command.bill.id]);
 assert.deepEqual(reversalEvents[0].stockReversals,[]);
 const {rows:stockReversalRows}=await db.query(
  'select to_jsonb(r)::text as row from khata_stock_reversals r where company_id=$1 and voucher_id=$2 order by ordinal',
  [company,reversalEvents[1].entityId]);
 assert.equal(stockReversalRows.length,2);
 assert.deepEqual(reversalEvents[1].stockReversals,stockReversalRows.map(row=>row.row));
 const savedOld=(await db.query('select payload from khata_inventory_documents where id=$1',[old.command.bill.id])).rows[0].payload;assert.equal(savedOld.lines[0].quantity,'500000000');
 if(concurrent){
  const retirement={company,action:'retire',name:'Historical owner'};
  const workspaceCall=async (tx,command)=>{
   await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:owner,role:'authenticated'})},true),
    set_config('orbis.khata.gateway_verified','v1',true)`;
   await tx`set local role authenticated`;
   return (await tx`select public.khata_workspace_v3(${JSON.stringify(command)}::text::jsonb) as result`)[0].result;
  };
  const retirementCall=tx=>workspaceCall(tx,retirement);
  const restorer=()=>rpc({...retirement,action:'restore'});
  const waitForStockFollower=async pid=>{
   for(let poll=0;poll<100;poll++){
    const [row]=await concurrent`select exists(select 1 from pg_stat_activity
     where datname=current_database() and ${pid}::int=any(pg_blocking_pids(pid))
     and wait_event_type='Lock' and wait_event='advisory') as waiting`;
    if(row.waiting)return;
    await concurrent`select pg_sleep(0.02)`;
   }
   assert.fail('Second writer must wait on the stock advisory lock');
  };
  for(const invoiceFirst of [true,false]){
   const held=Promise.withResolvers();
   const release=Promise.withResolvers();
   const purchase=bill(crypto.randomUUID(),true);
   const operationId=crypto.randomUUID();
   const invoice=hook=>runInvoice(false,operationId,undefined,purchase,hook);
   const lead=invoiceFirst ? invoice(async tx=>{
    held.resolve((await tx.query('select pg_backend_pid() as pid')).rows[0].pid);
    await release.promise;
   }) : concurrent.begin(async tx=>{
    const result=await retirementCall(tx);
    held.resolve((await tx`select pg_backend_pid() as pid`)[0].pid);
    await release.promise;
    return result;
   });
   const ready=Promise.race([held.promise,lead]);
   const follower=ready.then(()=>invoiceFirst ? concurrent.begin(retirementCall) : invoice());
   const settled=Promise.allSettled([lead,follower]);
   try{
    await waitForStockFollower(await ready);
   }finally{
    release.resolve();
    await settled;
   }
   assert.deepEqual(await (invoiceFirst ? follower : lead),{ok:true});
   let committedReceipt;
   if(invoiceFirst) committedReceipt=await lead;
   else await assert.rejects(follower,/SYNC_INVOICE_COMPANY_INACTIVE/);
   const [receiptCount]=await concurrent`select count(*)::int as n from sync_v2.receipt where operation_id=${operationId}`;
   assert.equal(receiptCount.n,Number(invoiceFirst));
   await assert.rejects(invoice(),/SYNC_INVOICE_COMPANY_INACTIVE/);
   await restorer();
   const replay=await invoice();
   if(invoiceFirst) assert.deepEqual(replay,committedReceipt);
   assert.deepEqual(await invoice(),replay);
   const [effects]=await concurrent`select
    (select count(*)::int from sync_v2.receipt where operation_id=${operationId}) as receipts,
    (select count(*)::int from public.khata_payment_links where id=${replay.payment}) as payments,
    (select count(*)::int from public.khata_production_posts where id=${replay.productionInputId}) as inputs`;
   assert.deepEqual({...effects},{receipts:1,payments:1,inputs:1});
   console.log('PASS: '+(invoiceFirst?'invoice-first':'retirement-first')+' direct legacy contention and immutable receipt replay.');
  }

  for(const fixed of [false,true]){
   if(fixed)await db.exec(await readFile('supabase/tests/sync-v2/production-stock-authorization.sql','utf8'));
   const held=Promise.withResolvers();
   const release=Promise.withResolvers();
   const command={...output,id:crypto.randomUUID()};
   const retiring=concurrent.begin(async tx=>{
    await retirementCall(tx);
    held.resolve((await tx`select pg_backend_pid() as pid`)[0].pid);
    await release.promise;
   });
   const ready=Promise.race([held.promise,retiring]);
   const writing=ready.then(()=>concurrent.begin(async tx=>{
    await workspaceCall(tx,command);
    throw new Error('FIXTURE_LEGACY_PRODUCTION_ROLLBACK');
   }));
   const settled=Promise.allSettled([retiring,writing]);
   try{
    await waitForStockFollower(await ready);
   }finally{
    release.resolve();
    await settled;
   }
   await retiring;
   await assert.rejects(writing,fixed ? /COMPANY_NOT_ACCESSIBLE/ : /FIXTURE_LEGACY_PRODUCTION_ROLLBACK/);
   assert.equal((await concurrent`select count(*)::int as n from public.khata_production_posts where id=${command.id}`)[0].n,0);
   await restorer();
  }
  console.log('PASS: reproduced stale production authorization after retirement and verified post-lock recheck.');

  await db.exec(await readFile('supabase/tests/sync-v2/production-output-capture.sql','utf8'));
  const outputStart=(await db.query('select head::text from sync_v2.scope where scope_id=$1',[company])).rows[0].head;
  const capturedOutput={...output,id:crypto.randomUUID()};
  await assert.rejects(concurrent.begin(async tx=>{
   await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:owner,role:'authenticated'})},true),
    set_config('orbis.khata.gateway_verified','v1',true)`;
   await tx`set local role authenticated`;
   await tx`select public.khata_workspace_v3(${JSON.stringify(capturedOutput)}::text::jsonb)`;
   throw new Error('FIXTURE_OUTPUT_ROLLBACK');
  }),/FIXTURE_OUTPUT_ROLLBACK/);
  assert.deepEqual((await groupedPage(outputStart)).groups,[]);
  assert.equal((await db.query('select count(*)::int as n from khata_inventory_documents where id=$1',
   [capturedOutput.id])).rows[0].n,0);
  const savedOutput=await rpc(capturedOutput);
  assert.deepEqual(await rpc(capturedOutput),savedOutput);
  const outputPage=await groupedPage(outputStart);
  const [outputGroup]=outputPage.groups;
  assert.equal(outputGroup.events.length,1);
  const [outputProjection]=outputGroup.events[0].change;
  assert.equal(outputProjection.entityId,savedOutput.id);
  assert.equal(JSON.parse(outputProjection.inventoryDocument).id,savedOutput.id);
  assert.equal(JSON.parse(outputProjection.productionPost).id,savedOutput.id);
  const {rows:outputMovements}=await db.query(
   'select to_jsonb(m)::text as row from khata_stock_movements m where company_id=$1 and document_id=$2 order by ordinal',
   [company,savedOutput.id]);
  assert.equal(outputMovements.length,1);
  assert.deepEqual(outputProjection.stockMovements,outputMovements.map(row=>row.row));
  assert.deepEqual((await groupedPage(outputPage.next)).groups,[]);
  console.log('PASS: legacy production output emits exact document and stock movement once.');
 }
 // Retired-company restore must still delegate before the active-company guard.
 await rpc({company,action:'retire',name:'Historical owner'});await rpc({company,action:'restore',name:'Historical owner'});
 await db.exec(await readFile('docs/atomic-invoice.rollback-test.sql','utf8'));
 await db.exec(await readFile('docs/account-details.rollback-test.sql','utf8'));
 if(concurrent){
  await db.exec(await readFile('supabase/migrations/20261101144338_expense_profile_schedules.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261105101338_safe_retired_company_purge.sql','utf8'));
  await db.exec(await readFile('supabase/tests/sync-v2/purge-stock-order.sql','utf8'));
  await db.exec(await readFile('supabase/tests/sync-v2/khata-writer.sql','utf8'));
  await rpc({company,action:'retire',name:'Historical owner'});
  await db.query("update public.khata_companies set purge_after=now()-interval '1 second' where id=$1",[company]);
  const prePurge=(await db.query('select head::text from sync_v2.scope where scope_id=$1',[company])).rows[0].head;
  await concurrent.begin(async tx=>{
   await tx`select pg_advisory_xact_lock(hashtextextended('stock-company:'||${company}::text,0))`;
   const [skip]=await concurrent`select orbis_khata.purge_retired_companies() as count`;
   assert.equal(skip.count,0,'Purge must skip a competing stock lock rather than waiting while holding the row');
   await tx`select id from public.khata_companies where id=${company} for update nowait`;
  });
  assert.deepEqual((await groupedPage(prePurge)).groups,[]);
  await assert.rejects(concurrent.begin(async tx=>{
   const [result]=await tx`select orbis_khata.purge_retired_companies() as count`;
   assert.equal(result.count,1);
   throw new Error('FIXTURE_PURGE_ROLLBACK');
  }),/FIXTURE_PURGE_ROLLBACK/);
  assert.deepEqual((await groupedPage(prePurge)).groups,[]);
  assert.equal((await concurrent`select count(*)::int as n from public.khata_companies where id=${company}`)[0].n,1);
  const purgeReady=Promise.withResolvers();
  const releasePurge=Promise.withResolvers();
  const purging=concurrent.begin(async tx=>{
   const [result]=await tx`select orbis_khata.purge_retired_companies() as count`;
   assert.equal(result.count,1,'Purge must remove the company with routed invoice dependencies');
   purgeReady.resolve();
   await releasePurge.promise;
  });
  const purgeSettled=Promise.allSettled([purging]);
  try {
   await Promise.race([purgeReady.promise,purging]);
   await assert.rejects(runInvoice(),/SYNC_INVOICE_COMPANY_INACTIVE/);
   assert.deepEqual((await groupedPage(prePurge)).groups,[],'Purge tombstone must remain invisible until commit');
  }finally{
   releasePurge.resolve();
   await purgeSettled;
  }
  await purging;
  const tombstones=(await groupedPage(prePurge)).groups.flatMap(group=>group.events.map(event=>event.change));
  assert.deepEqual(tombstones,[{type:'scope-purged'}]);
  await assert.rejects(runInvoice(),/SYNC_INVOICE_COMPANY_INACTIVE/);
  console.log('PASS: real purge of the routed-invoice company, atomic tombstone and invoice replay denial before and after commit.');
 }
 await db.query("select set_config('orbis.khata.gateway_verified','',false)");await assert.rejects(rpc({...output,id:crypto.randomUUID()}),/COMPANY_NOT_ACCESSIBLE/);
 if(!native)await db.close();
 if(concurrent)console.log('PASS: native reversal blocks duplicate invoice, stock and payment; injected 40P01 and 40001 roll back and replay with one receipt.');
 console.log('PASS: old account/ledger fingerprints, atomic routed purchase, internal milk, retry, rollback+serial, stock/tenant/write/mode guards, linked reversal and restore.');
 } finally { await Promise.all([native?.end({timeout:5}),concurrent?.end({timeout:5})]); }
}
try{await verify();}catch(error_){console.error('FAIL:',error_.message,error_.where??'');process.exitCode=1;}
