// Isolated PostgreSQL-compatible acceptance test. No network or production credentials.
// KHATA_PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node scripts/verify-lottery-rows.mjs
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import { loadCompactLottery, readLotteryHistory } from '../supabase/functions/orbis-khata-data/lottery-workspace-read.ts';
const {PGlite}=await import(process.env.KHATA_PGLITE_MODULE??'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.khata_write_controls(singleton boolean primary key,enabled boolean);insert into public.khata_write_controls values(true,true);`);
await db.exec(await readFile('supabase/migrations/20261030031036_independent_lottery.sql','utf8'));
const model='foundationAccountingOrganization';
const legacy={[model]:[{id:'old',name:'Existing history',large:'x'.repeat(1600000)},{id:'related',name:'Related'}]};
await db.query('insert into khata_lottery_state(owner_id,state,version) values($1,$2,7)',[owner,legacy]);
await db.exec(await readFile('supabase/migrations/20261031075245_lottery_row_storage.sql','utf8'));
const rpc=async p=>(await db.query('select public.khata_lottery_store_v2($1::jsonb) as result',[JSON.stringify(p)])).rows[0].result;
const config=async id=>{await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('orbis.khata.gateway_verified','v1',false)",[id]);};
await config(owner);
assert.deepEqual((await rpc({action:'load'})).state,legacy);
// Row writes must never touch unrelated records, even beyond the old owner size limit.
await db.exec(`create function reject_old_update() returns trigger language plpgsql as $$begin if old.id='old' then raise exception 'UNRELATED_RECORD_REWRITTEN';end if;return new;end$$;
create trigger protect_old before update or delete on khata_lottery_records for each row execute function reject_old_update();`);
const request={action:'party-save',name:'Changed'},op='33333333-3333-4333-8333-333333333333';
const commit={action:'commit',operationId:op,request,version:7,changes:[{model,id:'related',value:{id:'related',name:'Changed'}},{model,id:'new',value:{id:'new',name:'Linked result'}}],result:{saved:true}};
assert.deepEqual(await rpc(commit),{saved:true});
assert.deepEqual(await rpc({action:'load',operationId:op,request}),{replay:true,result:{saved:true}});
assert.deepEqual(await rpc(commit),{saved:true});
await assert.rejects(rpc({...commit,request:{different:true}}),/IDEMPOTENCY_CONFLICT/);
await assert.rejects(rpc({...commit,operationId:'44444444-4444-4444-8444-444444444444'}),/LOTTERY_VERSION_CONFLICT/);
const version=(await rpc({action:'load'})).version;
await assert.rejects(rpc({...commit,version,operationId:'55555555-5555-4555-8555-555555555555',changes:[{model,id:'related',value:{id:'related',name:'Must roll back'}},{model:'forbidden',id:'bad',value:{id:'bad'}}]}),/INVALID_LOTTERY_CHANGE/);
assert.equal((await rpc({action:'load'})).state[model].find(r=>r.id==='related').name,'Changed');
await db.exec('update khata_write_controls set enabled=false');
await assert.rejects(rpc({...commit,version,operationId:'66666666-6666-4666-8666-666666666666'}),/WRITES_DISABLED/);
await config(other);assert.deepEqual((await rpc({action:'load'})).state,{});
await config(owner);await db.exec("select set_config('orbis.khata.gateway_verified','',false)");
await assert.rejects(rpc({action:'load'}),/LOTTERY_ACCESS_DENIED/);
assert.deepEqual((await db.query('select state from khata_lottery_state where owner_id=$1',[owner])).rows[0].state,legacy);
await assert.rejects(db.query('select khata_lottery_store_v1($1)',[{}]),/LOTTERY_GATEWAY_UPGRADE_REQUIRED/);
const historyModel = 'foundationLotteryAuditEvent';
const ledgerModel = 'foundationLotteryLedgerEntry';
const savedAudit = [
  ...Array.from({length: 31}, (_, i) => ({id: `audit-${i}`, organizationId:'archive', note:`exact marker ${i}`})),
  {id:'large-audit', organizationId:'archive', note:'ব'.repeat(72000)},
];
const insertRecord = (actor, kind, value) => db.query(
  'insert into public.khata_lottery_records(owner_id,model,id,value) values ($1,$2,$3,$4)',
  [actor, kind, value.id, value],
);
for (const actor of [owner,other]) {
  await insertRecord(actor,model,{id:'archive',status:'ACTIVE'});
  await insertRecord(actor,ledgerModel,{id:'ledger-1',organizationId:'archive',amountPaise:'17500'});
}
await insertRecord(owner,historyModel,{id:'unrelated',organizationId:'other-org',note:'not mine'});
for (const record of savedAudit) await insertRecord(owner,historyModel,record);
const tx = async (chunks,...args) => (await db.query(chunks.map((chunk,i)=>i?`$${i}`+chunk:chunk).join(''),args)).rows;
const compact = await loadCompactLottery(tx,owner,'archive');
assert.deepEqual(compact.state,{[model]:[{id:'archive',status:'ACTIVE'}]});
const req = {organizationId:'archive',kind:'audit',search:''};
const firstPage = await readLotteryHistory(tx,owner,req);
assert.deepEqual(await readLotteryHistory(tx,owner,req),firstPage);
assert.deepEqual(await readLotteryHistory(tx,other,req),{entries:[],next:null});
assert.deepEqual(await readLotteryHistory(tx,other,{...req,organizationId:'old'}),{lotteryError:'ORGANIZATION_NOT_FOUND'});
const assembled = new Map();
let page = firstPage;
let count = 0;
for (;;) {
  assert(++count <= 20);
  assert(JSON.stringify(page).length < 2_000_000);
  for (const entry of page.entries) {
    const previous = assembled.get(entry.id) ?? {json:'',complete:false};
    assert.equal([...previous.json].length,entry.offset);
    assert.equal(previous.complete,false);
    assembled.set(entry.id,{json:previous.json+entry.json,complete:entry.complete});
  }
  if (!page.next) break;
  page = await readLotteryHistory(tx,owner,{...req,cursor:page.next});
}
assert.deepEqual([...assembled.values()].map(row=>{assert(row.complete);return JSON.parse(row.json);}),savedAudit);
const searched = await readLotteryHistory(tx,owner,{...req,search:'exact marker 30'});
assert.deepEqual(searched.entries.map(({id})=>id),['audit-30']);
const ledger = await readLotteryHistory(tx,owner,{...req,kind:'ledger'});
assert.equal(JSON.parse(ledger.entries[0].json).amountPaise,'17500');
await db.exec('update khata_write_controls set enabled=true');
await config(owner);
const nextWrite = await rpc({ action:'commit',operationId:'77777777-7777-4777-8777-777777777777',
  version:compact.version,request:{action:'correction'},result:{saved:true},changes:[
    {model:ledgerModel,id:'ledger-1',value:{id:'ledger-1',organizationId:'archive',amountPaise:'-17500'}},
  ] });
assert.deepEqual(nextWrite,{saved:true});
assert.deepEqual(await readLotteryHistory(tx,owner,{...req,cursor:firstPage.next}),{lotteryError:'LOTTERY_HISTORY_CHANGED'});
assert.equal(JSON.parse((await readLotteryHistory(tx,owner,{...req,kind:'ledger'})).entries[0].json).amountPaise,'-17500');
await db.close();console.log('PASS: legacy preservation, write isolation, bounded history, exact IDs and fragments, tenant isolation and correction invalidation.');
