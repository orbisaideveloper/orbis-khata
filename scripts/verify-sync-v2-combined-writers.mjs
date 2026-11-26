import assert from 'node:assert/strict';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {IDBFactory} from 'fake-indexeddb';
import {createTrustedVoucherGateway} from '../src/sync-v2/trusted-voucher-gateway.ts';
import {createLocalFeed} from '../src/sync-v2/local-feed.ts';
import {openIndexedDbLocalFeedStorage} from '../src/sync-v2/local-feed-storage.ts';
import {runLottery} from '../src/lottery/service.ts';
import {fixtureFeedCodec} from './sync-v2-local-storage-fixture.mjs';
import {disposableDatabase, initializeDisposableDatabase} from './sync-v2-disposable-db-fixture.mjs';

const {sql} = disposableDatabase();
const actor='11111111-1111-7111-8111-111111111111', foreign='22222222-2222-7222-8222-222222222222';
const owner=randomUUID(), other=randomUUID(), company=randomUUID(), party=randomUUID();
const item=randomUUID(), warehouse=randomUUID(), destination=randomUUID(), outputItem=randomUUID();
const registration='combined-test', epoch='combined-fixture', date='2026-10-30';
const clock=()=>new Date('2026-10-31T10:00:00Z');
const credential=randomBytes(32).toString('hex'), digest=createHash('sha256').update(credential).digest('hex');
const scope={kind:'company',id:company,epoch};
const auth=(work,ledgerOwner=owner)=>sql.begin(async tx=>{
  await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:ledgerOwner,role:'authenticated'})},true),
    set_config('orbis.khata.gateway_verified','v1',true)`;
  await tx`set local role authenticated`;
  return work(tx);
});
const workspace=async(tx,p)=>(await tx`select public.khata_workspace_v3(${tx.json({company,...p})}::jsonb) as data`)[0].data;
const inventory=async(tx,p)=>(await tx`select public.khata_inventory_post_v1(${tx.json({
  company,date,name:p.code??'',code:'',unit:'',party:null,reference:'',note:'Fixture stock',lines:[],...p,
})}::jsonb) as id`)[0].id;
const expense=async(tx,p)=>(await tx`select public.khata_expense_post_v2(${tx.json(p)}::jsonb) as id`)[0].id;
const lotteryCall=async(tx,p)=>(await tx`select public.khata_lottery_store_v2(${tx.json(p)}::jsonb) as data`)[0].data;
const lottery=(method,payload,operationId=randomUUID(),abort=false)=>auth(async tx=>{
  const request={method,payload,operationId};
  const load=await lotteryCall(tx,{action:'load',request,operationId});
  if(load.replay)return load.result;
  const calc=await runLottery(load.state,request,actor,clock);
  if(!calc.changes.length)return calc.result;
  const result=await lotteryCall(tx,{action:'commit',request,operationId,version:load.version,result:calc.result,changes:calc.changes});
  if(abort)throw new Error('COMBINED_LOTTERY_ABORT');
  return result;
});

const send=createTrustedVoucherGateway({
  baseUrl:'https://admin.example.invalid',
  fetchImpl:async(_, init)=>new Headers(init?.headers).get('authorization')==='Bearer fixture'
    ? Response.json({version:'orbis.customer.v1',customer:{orbisIdentityId:actor,displayId:'ORB-U-23456789'}})
    : new Response(null,{status:401}),
},work=>sql.begin(tx=>work((statement,parameters=[])=>tx.unsafe(statement,parameters))));
async function contend(writers) {
  let batches;
  await sql.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtextextended('stock-company:'||${company}::text,0))`;
    const [{pid}]=await tx`select pg_backend_pid() as pid`;
    batches=Promise.allSettled(writers.map(write=>write()));
    for(let attempt=0;attempt<60;attempt++){
      const [{waiting}]=await tx`select count(*)::int as waiting from pg_locks
        where not granted and locktype='advisory' and ${pid}::int=any(pg_blocking_pids(pg_locks.pid))`;
      if(waiting>=2)return;
      await delay(25);
    }
    assert.fail('EXPECTED_TWO_INDEPENDENT_WRITERS_BLOCKED_BY_STOCK_LOCK');
  });
  return (await batches).map(result=>{
    if(result.status==='rejected')throw result.reason;
    return result.value;
  });
}

const legacy=(tx,id)=>tx`select public.khata_post_v1(${id}::uuid,${company}::uuid,${party}::uuid,
    'receipt',${date}::date,'100','cash','','Mixed replay',null)`;
const canonical=(a,b)=>a.localeCompare(b,'en');
const fingerprint=rows=>createHash('sha256').update(JSON.stringify(rows.map(row=>JSON.stringify(row)).sort(canonical))).digest('hex');

async function companySourceRows() {
  const tables=await sql`select c.relname as name, array_agg(a.attname order by k.n) as keys
    from pg_index i join pg_class c on c.oid=i.indrelid
    join pg_namespace ns on ns.oid=c.relnamespace
    cross join lateral unnest(i.indkey) with ordinality k(att,n)
    join pg_attribute a on a.attrelid=c.oid and a.attnum=k.att
    where ns.nspname='public' and i.indisprimary and c.relname<>'khata_report_revisions'
      and (c.relname='khata_companies' or exists
       (select 1 from pg_attribute s where s.attrelid=c.oid and s.attname='company_id' and not s.attisdropped))
    group by c.relname order by c.relname`;
  // Report revision counters are online cache metadata, outside the historical image.
  assert.equal(tables.length,23,tables.map(row=>row.name).join(','));
  const result=[];
  for(const {name,keys} of tables){
    assert.match(name,/^khata_[a-z_]+$/u);
    assert(keys.every(key=>/^[a-z_]+$/u.test(key)));
    const ownerColumn=name==='khata_companies'?'id':'company_id';
    const rows=await sql.unsafe('select $2::text as collection, jsonb_build_array('+
      keys.map(key=>'r.'+key).join(',')+')::text as id, to_jsonb(r)::text as value from public.'+
      name+' r where r.'+ownerColumn+'=$1::uuid',[company,name]);
    result.push(...rows);
  }
  return result;
}

async function readCompany() {
  let cursor={head:null,model:null,key:null}, rows=[];
  for(let n=0;n<200;n++){
    const [{image}]=await sql`select sync_v2.read_trusted_company_snapshot(
      ${actor}::uuid,${registration},${digest},${company}::uuid,${epoch},${cursor.head}::bigint,
      ${cursor.model},${cursor.key},7,32768) as image`;
    assert(cursor.head===null||image.highWater===cursor.head);
    rows.push(...image.rows.map(row=>({collection:row.model,id:row.key,value:row.projectionJson})));
    if(image.done)return {rows,sequence:image.highWater};
    assert(image.nextModel && image.nextKey);
    cursor={head:image.highWater,model:image.nextModel,key:image.nextKey};
  }
  throw new Error('COMPANY_SNAPSHOT_DID_NOT_FINISH');
}

async function readLottery(org) {
  let cursor={head:null,after:'0'}, rows=[];
  for(let n=0;n<200;n++){
    const [{image}]=await sql`select sync_v2.read_trusted_lottery_snapshot(
      ${actor}::uuid,${registration},${digest},${org},${epoch},${cursor.head}::bigint,${cursor.after}::bigint,5,32768) as image`;
    assert(cursor.head===null||image.highWater===cursor.head);
    rows.push(...image.rows.map(row=>({collection:row.model,id:row.id,value:row.projectionJson})));
    if(image.done)return {rows,sequence:image.highWater};
    assert(BigInt(image.next)>BigInt(cursor.after));
    cursor={head:image.highWater,after:image.next};
  }
  throw new Error('LOTTERY_SNAPSHOT_DID_NOT_FINISH');
}

async function restore(companyImage, lotteryScope, lotteryImage) {
  const factory=new IDBFactory(), codec=await fixtureFeedCodec();
  const open=()=>openIndexedDbLocalFeedStorage(factory,'combined-owner-restore');
  let storage=await open();
  const asFeed=(sc)=>createLocalFeed(actor,sc,storage,codec,()=>{throw new Error('RESTORE_ONLY');});
  for(const [sc,image] of [[scope,companyImage],[lotteryScope,lotteryImage]])
    await asFeed(sc).installSnapshot({epoch,sequence:image.sequence},image.rows);
  storage.close();
  storage=await open();
  try {
    const projections=[];
    for(const [sc,image] of [[scope,companyImage],[lotteryScope,lotteryImage]]) {
      const feed=asFeed(sc), results=[];
      assert.deepEqual(await feed.cursor(),{epoch,sequence:image.sequence});
      for(const row of image.rows)results.push({...row,value:await feed.projection(row.collection,row.id)});
      assert.equal(fingerprint(results),fingerprint(image.rows));
      projections.push(results);
    }
    assert.equal(await asFeed(scope).projection(lotteryImage.rows[0].collection,lotteryImage.rows[0].id),undefined);
    return projections;
  } finally {storage.close();}
}

try {
  await initializeDisposableDatabase(sql);
  await sql`insert into orbis_khata.ledger_owners(id,legacy) values(${owner},false),(${other},false)`;
  await sql`insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference)
    values(${actor},${owner},'fixture'),(${foreign},${other},'fixture')`;
  await sql`insert into public.khata_companies(id,owner_id,name) values(${company},${owner},'Combined Khata')`;
  await sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle) values(${actor},'company',${company},${epoch},'active')`;
  await sql`insert into sync_v2.registered_device values(${actor},${registration},${digest},'android',true,now()+interval '1 hour',null)`;
  await sql`insert into sync_v2.sync_entitlement values(${actor},'sync.single-primary',now()+interval '1 hour')`;
  await sql`insert into sync_v2.device_scope_grant values(${actor},${registration},'company',${company},${epoch},true)`;

  const org=(await lottery('createOrganization',{name:'Combined Lottery'})).id;
  const lotteryScope={kind:'lottery-organization',id:org,epoch};
  await sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle) values(${actor},${lotteryScope.kind},${org},${epoch},'active')`;
  await sql`insert into sync_v2.device_scope_grant values(${actor},${registration},${lotteryScope.kind},${org},${epoch},true)`;
  const seller=await lottery('createParty',{organizationId:org,name:'Seller',partyType:'SELLER',ticketRatePaise:'1000'});
  const stockist=await lottery('createParty',{organizationId:org,name:'Stockist',partyType:'STOCKIST',ticketRatePaise:'900'});
  await auth(async tx=>{
    await tx`select public.khata_master_save_v2('party',${tx.json({id:party,company,name:'Combined party',
      kind:'both',opening_amount:'0',opening_side:'none',opening_account:'receivable'})}::jsonb)`;
    for(const p of [{id:item,kind:'item',code:'IN',unit:'kg'},{id:outputItem,kind:'item',code:'OUT',unit:'kg'},
      {id:warehouse,kind:'warehouse',code:'FIRST'},{id:destination,kind:'warehouse',code:'SECOND'}])await inventory(tx,p);
    const settings=await workspace(tx,{action:'settings'});
    await workspace(tx,{action:'settings-save',settings:{...settings,production:true}});
    await inventory(tx,{id:randomUUID(),kind:'opening',lines:[{item,warehouse,to:null,quantity:'5000000',rate:'0'}]});
  });
  const id=randomUUID(), operationId=randomUUID();
  const voucher={protocolVersion:2,schemaVersion:1,operationId,actorId:actor,deviceRegistrationId:registration,
    scope,commandType:'khata-post',entityId:id,children:{},dependsOn:[],baseRevision:null,clientSequence:'1',
    createdAt:date+'T00:00:00Z',payload:{id,company,party,kind:'receipt',date,amount:'100',method:'cash',
      note:'Mixed replay',reference:'',reverses:null}};
  const invoice=randomUUID();
  const command={action:'invoice-save',production:true,command:{company,action:'bill',paid:'2500',account:'cash',roundoff:'0',
    bill:{id:invoice,company,date,kind:'purchase',code:'',name:'',unit:'',party,reference:'',note:'',
      lines:[{item,warehouse,to:null,quantity:'2000000',rate:'5000'}]}}};
  const charge={id:randomUUID(),company,date,kind:'charge',amount:'125',category:'Rent',payee:'',method:'cash',
    parent:null,reference:'',note:''};
  const transfer={id:randomUUID(),kind:'transfer',lines:[{item,warehouse,to:destination,quantity:'1000000',rate:'0'}]};
  const stockEntry={organizationId:org,partyId:stockist.id,occurredAt:date,purchaseQuantity:'100',
    morningReturnQuantity:'0',dayReturnQuantity:'0',eveningReturnQuantity:'0',commissionPaise:'4000'};
  const saleInput={organizationId:org,partyId:seller.id,occurredAt:date,dispatchQuantity:'100',
    morningReturnQuantity:'5',dayReturnQuantity:'10',eveningReturnQuantity:'5',commissionPaise:'4000'};
  await lottery('saveDailyStockistEntry',stockEntry);
  const [,, invoiceResult, , ,sale]=await contend([
    ()=>auth(tx=>legacy(tx,id)),()=>send('fixture',credential,voucher),()=>auth(tx=>workspace(tx,command)),
    ()=>auth(tx=>expense(tx,charge)),()=>auth(tx=>inventory(tx,transfer)),()=>lottery('recordSale',saleInput),
  ]);
  assert.equal(sale.calculated.netPayablePaise,'76080');
  assert.deepEqual(await auth(tx=>workspace(tx,command)),invoiceResult);
  await assert.rejects(auth(tx=>legacy(tx,randomUUID()),other),/COMPANY_NOT_ACCESSIBLE|COMPANY_DENIED/);
  const payment={organizationId:org,partyId:seller.id,occurredAt:date,direction:'RECEIPT',
    totalAmountPaise:'5000',methodSplit:{cashPaise:'2000',bankPaise:'2000',pwtPaise:'1000'}};
  const paymentOp=randomUUID();
  await assert.rejects(lottery('recordPayment',payment,paymentOp,true),/COMBINED_LOTTERY_ABORT/);
  const [received]=await Promise.all([
    lottery('recordPayment',payment,paymentOp),auth(tx=>workspace(tx,{action:'correct',id:randomUUID(),
      type:'voucher',target:invoice,reason:'Combined routed reversal',replacement:null})),
    auth(tx=>expense(tx,{...charge,id:randomUUID(),kind:'reversal',method:null,parent:charge.id,note:'Undo expense'})),
  ]);
  assert.deepEqual(await lottery('recordPayment',payment,paymentOp),received);
  await lottery('recordSettlement',{organizationId:org,saleId:sale.sale.id,paymentId:received.payment.id,amountPaise:'5000'});
  const posted=(await lottery('getWorkspace',{organizationId:org})).stockistEntries[0];
  const correctionId=randomUUID();
  const correction={organizationId:org,entityType:'STOCKIST_ENTRY',entityId:posted.id,
    operationId:correctionId,expectedVersion:0,replacement:{purchaseQuantity:'120',commissionPaise:'3000'},
    reason:'Combined stockist correction'};
  const corrected=await lottery('correctAccountingTransaction',correction,correctionId);
  assert.deepEqual(await lottery('correctAccountingTransaction',correction,correctionId),corrected);
  await auth(tx=>workspace(tx,{action:'production',id:randomUUID(),date,kind:'output',
    item:outputItem,warehouse,quantity:'1500',note:'Combined production output'}));

  // Run a second, independent expense producer with a rollback/replay and
  // an opening payable, so the reconciled copy includes each expense model.
  const bill={...charge,id:randomUUID(),amount:'250'};
  const postBill=tx=>tx`select public.khata_expense_bill_v2(${tx.json(bill)}::jsonb,
    ${tx.json([{description:'Combined rent',quantity:'1000000',unit:'',rate:'250'}])}::jsonb)`;
  await assert.rejects(auth(async tx=>{await postBill(tx);throw new Error('COMBINED_BILL_ABORT');}),/COMBINED_BILL_ABORT/);
  assert.equal((await sql`select count(*)::int as n from public.khata_expense_events where id=${bill.id}`)[0].n,0);
  await auth(postBill);
  await auth(postBill);
  const vendor=randomUUID();
  await auth(tx=>tx`select public.khata_master_save_v2('party',${tx.json({id:vendor,company,name:'Opening vendor',
    kind:'expense',opening_side:'due',opening_amount:'400',opening_date:date,opening_account:'receivable'})}::jsonb)`);
  const opening={...charge,id:randomUUID(),kind:'payment',parent:vendor,amount:'150'};
  await auth(tx=>expense(tx,opening));
  const profileOp=randomUUID(), profileCharge={...charge,id:randomUUID(),amount:'321'};
  const recurring=()=>auth(async tx=>{
    const request={company,action:'post',operationId:profileOp};
    const call=async args=>(await tx`select public.khata_expense_profiles_v1(${tx.json(args)}::jsonb) as data`)[0].data;
    const loaded=await call({...request,action:'load',request});
    if(loaded.replay)return loaded.state;
    await tx`select public.khata_expense_post_v1(${tx.json(profileCharge)}::jsonb)`;
    return (await call({...request,action:'commit',request,version:loaded.version,
      state:{...loaded.state,payments:[{id:profileCharge.id}]}})).state;
  });
  const profile=await recurring();
  assert.deepEqual(await recurring(),profile);
  assert.deepEqual(profile.payments,[{id:profileCharge.id}]);

  const link=randomUUID(), recipient='ORB-U-ABCDEFGH';
  const ledgerHead=await sql`select scope_id,head::text from sync_v2.scope where actor_id=${actor} order by scope_id`;
  await sql`insert into orbis_khata.lottery_party_shares(id,owner_id,organization_id,party_id,recipient_display_id)
    values(${link},${owner},${org},${seller.id},${recipient})`;
  await sql`update orbis_khata.statement_links set status='accepted',recipient_identity=${foreign},resync=false where id=${link}`;
  assert.equal((await sql`select status from orbis_khata.lottery_party_shares where id=${link}`)[0].status,'accepted');
  await sql`insert into orbis_khata.statement_mailbox(link_id,revision,base,patch) values(${link},1,0,'{}')`;
  await sql`update orbis_khata.lottery_party_shares set status='revoked' where id=${link}`;
  assert.equal((await sql`select status from orbis_khata.statement_links where id=${link}`)[0].status,'revoked');
  assert.equal((await sql`select count(*)::int as n from orbis_khata.statement_mailbox where link_id=${link}`)[0].n,0);
  assert.deepEqual(await sql`select scope_id,head::text from sync_v2.scope where actor_id=${actor} order by scope_id`,ledgerHead);

  const spare=randomUUID();
  await auth(tx=>tx`select public.khata_master_save_v2('party',${tx.json({id:spare,company,name:'Transient master',
    kind:'both',opening_side:'none',opening_amount:'0',opening_account:'receivable'})}::jsonb)`);
  await auth(tx=>tx`select public.khata_master_delete_v2('party',${company}::uuid,${spare}::uuid)`);
  assert.equal((await sql`select count(*)::int as n from public.khata_parties where id=${spare}`)[0].n,0);
  await sql`update public.khata_companies set deleted_at=now(),purge_after=now()+interval '30 days' where id=${company}`;
  await assert.rejects(readCompany(),/SYNC_/);
  await auth(tx=>workspace(tx,{action:'restore',name:'Combined Khata'}));
  assert.equal((await sql`select lifecycle from sync_v2.scope where scope_id=${company}`)[0].lifecycle,'active');

  const ledger=await sql`select id,reverses_id,amount_minor::text from public.khata_vouchers where company_id=${company}`;
  assert.equal(ledger.length,5);
  assert.deepEqual(ledger.filter(row=>row.reverses_id).map(row=>row.reverses_id).sort(),[invoice,invoiceResult.payment].sort());
  assert.equal((await sql`select count(*)::int as n from sync_v2.voucher_event where voucher_id=${id}`)[0].n,1);
  assert.equal((await sql`select count(*)::int as n from sync_v2.receipt where operation_id=${operationId}`)[0].n,1);
  const stock=await sql`select coalesce(sum(quantity),0)::text as qty from public.khata_stock_journal
    where company_id=${company} and item_id=${item}`;
  assert.equal(stock[0].qty,'5000000');
  const [{cash}]=await sql`select sum(signed_minor)::text as cash from public.khata_journal where company_id=${company} and account='cash'`;
  assert.equal(cash,'-621');
  const sequences=await sql`select kind,seq::text from sync_v2.event e where actor_id=${actor}
    and scope_id in (${company},${org}) order by e.kind,e.seq`;
  for(const kind of ['company','lottery-organization']){
    const group=sequences.filter(row=>row.kind===kind);
    assert(group.length>4);
    assert.deepEqual(group.map(row=>Number(row.seq)),group.map((_,index)=>index+1));
  }

  await assert.rejects(sql`select sync_v2.read_trusted_company_snapshot(
    ${foreign}::uuid,${registration},${digest},${company}::uuid,${epoch},null,null,null,7,32768)`,/SYNC_DEVICE_DENIED|SYNC_TRUSTED_DEVICE_DENIED/);
  await assert.rejects(sql`select sync_v2.read_trusted_lottery_snapshot(
    ${foreign}::uuid,${registration},${digest},${org},${epoch},null,0,5,32768)`,/SYNC_DEVICE_DENIED|SYNC_TRUSTED_DEVICE_DENIED/);
  const [companyImage,lotteryImage]=await Promise.all([readCompany(),readLottery(org)]);
  const [khata, lotteryRows]=await restore(companyImage,lotteryScope,lotteryImage);
  const [authoritativeKhata,authoritativeLottery]=await Promise.all([
    companySourceRows(),
    sql`select model as collection,id,value::text as value from public.khata_lottery_records where owner_id=${owner}
      and (id=${org} or value->>'organizationId'=${org})`,
  ]);
  assert.equal(fingerprint(khata),fingerprint(authoritativeKhata));
  assert.equal(fingerprint(lotteryRows),fingerprint(authoritativeLottery));
  const rows=(model)=>khata.filter(row=>row.collection===model).map(row=>JSON.parse(row.value));
  const restoredCash=rows('khata_vouchers').reduce((balance,row)=>balance+
    (row.debit_account==='cash'?BigInt(row.amount_minor):0n)-(row.credit_account==='cash'?BigInt(row.amount_minor):0n),0n);
  assert.equal(restoredCash,100n);
  assert.equal(rows('khata_expense_bill_lines').filter(row=>row.id===bill.id).length,1);
  assert.equal(rows('khata_opening_expense_payments').filter(row=>row.id===opening.id).length,1);
  const restoredExpenses=rows('khata_expense_events').reduce((total,row)=>total+
    (row.reverses_id? -BigInt(row.amount_minor):BigInt(row.amount_minor)),0n);
  const restoredOpening=rows('khata_opening_expense_payments').reduce((total,row)=>total+BigInt(row.amount_minor),0n);
  assert.equal(restoredCash-restoredExpenses-restoredOpening,BigInt(cash));
  const restoredStock=[...rows('khata_stock_movements'),...rows('khata_stock_reversals')]
    .filter(row=>row.item_id===item).reduce((total,row)=>total+BigInt(row.quantity),0n);
  assert.equal(restoredStock,BigInt(stock[0].qty));
  assert(rows('khata_fiscal_counters').length>0);
  assert(rows('khata_production_routes').length>0);
  const reconstructed={};
  for(const row of lotteryRows)(reconstructed[row.collection]??=[]).push(JSON.parse(row.value));
  const result=await runLottery(reconstructed,{method:'getWorkspace',payload:{organizationId:org}},actor,clock);
  assert.deepEqual(result.result.summary,(await lottery('getWorkspace',{organizationId:org})).summary);
  const effectsBeforeReplay=await sql`select kind,scope_id,head::text from sync_v2.scope where actor_id=${actor} order by kind,scope_id`;
  await Promise.all([
    auth(tx=>legacy(tx,id)), send('fixture',credential,voucher), auth(tx=>workspace(tx,command)),
    auth(postBill), recurring(), lottery('recordPayment',payment,paymentOp),
    lottery('correctAccountingTransaction',correction,correctionId),
  ]);
  assert.deepEqual(await sql`select kind,scope_id,head::text from sync_v2.scope where actor_id=${actor} order by kind,scope_id`,
    effectsBeforeReplay,'COMBINED_REPLAY_MUST_NOT_ADVANCE_FEED');
  console.log('COMBINED_WRITERS_OK '+JSON.stringify({cash,stock:stock[0].qty,feedEvents:sequences.length,
    companyRows:khata.length,lotteryRows:lotteryRows.length,companyHash:fingerprint(khata),lotteryHash:fingerprint(lotteryRows)}));
} finally { await sql.end({timeout:5}); }
