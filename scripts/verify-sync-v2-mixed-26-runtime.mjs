/** All 26 original trigger cases + concurrent legacy/v2 writes in ONE native PG17 dataset. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {disposableDatabase,initializeDisposableDatabase} from './sync-v2-disposable-db-fixture.mjs';
import {verifyTriggerBehavior} from './sync-v2-trigger-behavior-fixture.mjs';

const expected=[
'orbis_khata.lottery_party_shares.statement_permission_from_legacy',
'orbis_khata.statement_links.statement_permission_to_legacy',
'public.khata_companies.khata_report_revision_watch',
'public.khata_expense_bill_lines.immutable',
'public.khata_expense_events.expense_immutable',
'public.khata_expense_events.khata_report_revision_watch',
'public.khata_inventory_documents.inventory_immutable',
'public.khata_inventory_documents.khata_report_revision_watch',
'public.khata_inventory_documents.khata_warehouse_transfer_guard',
'public.khata_items.khata_report_revision_watch',
'public.khata_items.master_guard',
'public.khata_master_audit.immutable',
'public.khata_opening_expense_payments.immutable',
'public.khata_opening_expense_payments.khata_report_revision_watch',
'public.khata_parties.khata_report_revision_watch',
'public.khata_parties.master_guard',
'public.khata_stock_movements.inventory_immutable',
'public.khata_stock_movements.khata_report_revision_watch',
'public.khata_stock_reversals.inventory_immutable',
'public.khata_stock_reversals.khata_report_revision_watch',
'public.khata_vouchers.inventory_voucher_reversal',
'public.khata_vouchers.khata_production_purchase_reverse',
'public.khata_vouchers.khata_report_revision_watch',
'public.khata_vouchers.khata_voucher_validate',
'public.khata_warehouses.inventory_immutable',
'public.khata_warehouses.khata_report_revision_watch',
].map(x=>'trigger:'+x);
assert.equal(new Set(expected).size,26);
const {sql}=disposableDatabase();
const evidence={git_sha:process.env.GITHUB_SHA??'LOCAL_UNVERIFIED',status:'NOT_RUN',native_postgres_17:false,
  concurrent_v1_v2_writers:false,cash_stock_receipt_feed_reconciled:false,
  rollback_replay_isolation_verified:false,trigger_receipts:[],independent_review:'NOT_DONE'};
const seen=new Map();
const log=console.log;
let combined=false;
try {
  const [{v}]=await sql`select current_setting('server_version_num')::int as v`;
  assert(v>=170000 && v<180000,'REAL_NATIVE_POSTGRES_17_REQUIRED');
  evidence.native_postgres_17=true;
  await initializeDisposableDatabase(sql);
  console.log=(...args)=>{
    const line=String(args[0]??'');
    if(line.startsWith('EXECUTED_CASE ')){
      const item=JSON.parse(line.slice('EXECUTED_CASE '.length));
      if(item.id.startsWith('trigger:')){
        assert(!seen.has(item.id),`DUPLICATE_TRIGGER_CASE:${item.id}`);
        assert.equal(item.outcome,'PASS',`TRIGGER_NOT_PASS:${item.id}`);
        assert(typeof item.observed==='string'&&item.observed.length>12,'TRIGGER_ASSERTIONS_MISSING');
        seen.set(item.id,item.observed);
      }
    }
    log(...args);
  };
  await verifyTriggerBehavior(sql, async ({session,owner,other,company,party,actor})=>{
    assert.deepEqual(new Set(seen.keys()),new Set(expected),'ALL_26_SAME_DATASET_REQUIRED');
    // The legacy trigger fixture deliberately keeps its company UNENROLLED:
    // existing v1 writers must continue without a v2 feed before activation.
    // Enroll this same company only after proving the 26 legacy effects.
    // Without an active scope capture_voucher intentionally returns NEW and
    // emits no event; an assertion of two v2 events would otherwise be invalid.
    const epoch=randomUUID();
    await sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle)
      values(${actor},'company',${company},${epoch},'active')`;
    const [enrollment]=await sql`select s.actor_id,s.epoch,s.lifecycle,s.head::bigint as head
      from sync_v2.scope s where s.kind='company' and s.scope_id=${company}`;
    assert.equal(enrollment.actor_id,actor,'CAPTURE_MUST_USE_VERIFIED_OWNER_IDENTITY');
    assert.equal(enrollment.epoch,epoch,'CAPTURE_MUST_USE_EXACT_SYNTHETIC_EPOCH');
    assert.equal(enrollment.lifecycle,'active','CAPTURE_SCOPE_MUST_BE_ACTIVE');
    const first=randomUUID(),second=randomUUID(),aborted=randomUUID();
    const date='2026-10-01';
    const current=async()=>({
      vouchers: (await sql`select count(*)::int as n from public.khata_vouchers where company_id=${company}`)[0].n,
      events: (await sql`select count(*)::int as n from sync_v2.voucher_event`)[0].n,
      cash: (await sql`select coalesce(sum(signed_minor),0)::text as n from public.khata_journal where company_id=${company} and account='cash'`)[0].n,
      revision:(await sql`select revision::bigint as n from public.khata_report_revisions where company_id=${company}`)[0].n,
    });
    const legacy=(tx,id=first)=>tx`select public.khata_post_v1(${id}::uuid,${company}::uuid,${party}::uuid,
      'receipt',${date}::date,'17','cash','','Combined legacy receipt',null)`;
    const newV2=(tx,id=second)=>tx`select public.khata_workspace_v3(${tx.json({
      company,action:'payment',id,party,kind:'receipt',date,amount:'29',account:'cash',reference:'',note:'Combined v2 receipt',
    })}::jsonb)`;
    const before=await current();
    // Separate transactions start together and contend on the real company stock/advisory locks.
    const [a,b]=await Promise.all([session(owner,tx=>legacy(tx)),session(owner,tx=>newV2(tx))]);
    assert(a.length===1&&b.length===1);
    const after=await current();
    assert.equal(after.vouchers,before.vouchers+2,'MIXED_WRITERS_MUST_ADD_EXACTLY_TWO_VOUCHERS');
    assert.equal(after.events,before.events+2,'MIXED_CAPTURE_MUST_ADD_EXACTLY_TWO_EVENTS');
    const captured=await sql`select e.scope_id,e.epoch,e.seq::bigint as seq,v.voucher_id
      from sync_v2.event e join sync_v2.voucher_event v
      on (e.actor_id,e.kind,e.scope_id,e.epoch,e.seq)=
         (v.actor_id,v.kind,v.scope_id,v.epoch,v.seq)
      where v.voucher_id in (${first},${second}) order by e.seq`;
    assert.equal(captured.length,2,'EXACT_TWO_VOUCHER_TO_FEED_LINKS');
    assert(captured.every(row=>row.scope_id===company&&row.epoch===epoch),
      'WRONG_SCOPE_OR_EPOCH_IN_MIXED_CAPTURE');
    assert.deepEqual(captured.map(row=>BigInt(row.seq)),[1n,2n],
      'NONCONTIGUOUS_FIRST_TWO_CAPTURE_SEQUENCES');
    const inserted=await sql`select id,amount_minor::text as amount from public.khata_vouchers
      where id in (${first},${second}) order by id`;
    assert.deepEqual(new Map(inserted.map(x=>[x.id,x.amount])),new Map([[first,'17'],[second,'29']]));
    assert.equal(BigInt(after.cash)-BigInt(before.cash),46n,'EXACT_CASH_MINOR_UNIT_DELTA');
    evidence.concurrent_v1_v2_writers=true;
    await Promise.all([session(owner,tx=>legacy(tx)),session(owner,tx=>newV2(tx))]);
    assert.deepEqual(await current(),after,'REPLAY_CHANGED_LEDGER_FEED_OR_REVISION');
    await session(owner,tx=>legacy(tx,aborted),true);
    assert.deepEqual(await current(),after,'ROLLBACK_CHANGED_LEDGER_FEED_OR_REVISION');
    await assert.rejects(session(other,tx=>legacy(tx,randomUUID())),/COMPANY_NOT_ACCESSIBLE/);
    assert.deepEqual(await current(),after,'FOREIGN_OWNER_CHANGED_LEDGER');
    evidence.rollback_replay_isolation_verified=true;
    evidence.cash_stock_receipt_feed_reconciled=true;
    combined=true;
    log('MIXED_26_SAME_DATASET '+JSON.stringify({trigger_count:seen.size,distinct_vouchers:2,cash_delta_minor:'46',
      feed_delta:after.events-before.events,rollback_replay_isolation:true}));
  });
  assert.equal(seen.size,26,'ALL_26_TRIGGER_BEHAVIORS_NOT_EXECUTED');
  assert(combined,'MIXED_WRITER_CONTENDED_TEST_NOT_EXECUTED');
  evidence.trigger_receipts=expected.map(id=>({id,executed_in_same_dataset:true,effect_asserted:true,
    rollback_or_negative_asserted:true,observed:seen.get(id)}));
  evidence.status='LOCAL_DISPOSABLE_RUNTIME_PASSED_NO_INDEPENDENT_REVIEW';
} finally {
  console.log=log;
  await mkdir('quality-reports/phase2b',{recursive:true});
  await writeFile('quality-reports/phase2b/mixed-26.json',JSON.stringify(evidence,null,2));
  await sql.end({timeout:5});
}
