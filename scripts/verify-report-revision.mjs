// Disposable PostgreSQL fixtures only. No production connection or real identities.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {setup} from './sql-fixture.mjs';
const db=await setup();
const owner='11111111-1111-7111-8111-111111111111',other='22222222-2222-7222-8222-222222222222',company='33333333-3333-4333-8333-333333333333',foreign='44444444-4444-4444-8444-444444444444',party='55555555-5555-4555-8555-555555555555',sale='66666666-6666-4666-8666-666666666666';
await db.query('insert into auth.users values($1),($2)',[owner,other]);
await db.query('insert into orbis_khata.ledger_owners(id,legacy) values($1,false),($2,false)',[owner,other]);
await db.query("insert into public.khata_companies(id,owner_id,name) values($1,$2,'Fixture'),($3,$4,'Other')",[company,owner,foreign,other]);
await db.query("insert into public.khata_parties(id,company_id,name,kind) values($1,$2,'Fixture customer','both')",[party,company]);
await db.query("select set_config('request.jwt.claims',$1,false),set_config('orbis.khata.gateway_verified','v1',false)",[JSON.stringify({sub:owner,role:'authenticated'})]);
async function post(id,kind,date,amount='10000',reverses=null){return db.query("select public.khata_post_v1($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$6,'cash','','Fixture',$7::uuid)",[id,company,party,kind,date,amount,reverses]);}
await post(sale,'sale','2026-10-01');await post(crypto.randomUUID(),'reversal','2026-10-02','10000',sale);
async function report(to){return (await db.query("select public.khata_report_v1($1::uuid,'2026-10-01'::date,$2::date,null,0) as result",[company,to])).rows[0].result;}
assert.equal((await report('2026-10-01')).entries.find(row=>row.id===sale).reversed,true,'Confirm the old future-reversal defect before correction');
async function fingerprint(){return (await db.query("select md5(jsonb_build_object('companies',(select jsonb_agg(to_jsonb(t) order by id) from public.khata_companies t),'parties',(select jsonb_agg(to_jsonb(t) order by id) from public.khata_parties t),'vouchers',(select jsonb_agg(to_jsonb(t) order by id) from public.khata_vouchers t),'inventory',(select jsonb_agg(to_jsonb(t) order by id) from public.khata_inventory_documents t),'expenses',(select jsonb_agg(to_jsonb(t) order by id) from public.khata_expense_events t))::text) as hash")).rows[0].hash;}
const before=await fingerprint();
await db.exec(await readFile('supabase/migrations/20261104122849_report_revision_and_party_lookup.sql','utf8'));
assert.equal(await fingerprint(),before,'Migration must not modify original entries or master rows');
assert.equal((await report('2026-10-01')).entries.find(row=>row.id===sale).reversed,false);
assert.equal((await report('2026-10-02')).entries.find(row=>row.id===sale).reversed,true);
const revision=async cid=>(await db.query('select public.khata_report_revision_v1($1::uuid) as value',[cid])).rows[0].value;
assert.equal(await revision(company),'1');await assert.rejects(revision(foreign),/COMPANY_NOT_ACCESSIBLE/);
assert.equal((await db.query("select has_table_privilege('authenticated','public.khata_report_revisions','SELECT') as allowed")).rows[0].allowed,false);
assert.equal((await db.query("select has_function_privilege('anon','public.khata_report_revision_v1(uuid)','EXECUTE') as allowed")).rows[0].allowed,false);
const payment=crypto.randomUUID();await post(payment,'receipt','2026-10-03');const changed=await revision(company);assert.notEqual(changed,'1');
await post(payment,'receipt','2026-10-03');assert.equal(await revision(company),changed,'Same-ID replay cannot post or revise twice');
await assert.rejects(post(payment,'receipt','2026-10-03','20000'),/IDEMPOTENCY_CONFLICT/);assert.equal(await revision(company),changed);
await db.exec('begin');await post(crypto.randomUUID(),'receipt','2026-10-03');await db.exec('rollback');assert.equal(await revision(company),changed,'Failed/rolled-back save must not advance revision');
await db.query("insert into public.khata_parties(id,company_id,name,kind) select gen_random_uuid(),$1::uuid,'Client '||n,'customer' from generate_series(1,20000)n",[company]);
await db.exec('analyze public.khata_parties');
const plan=await db.query("explain (analyze,buffers) select id,name,phone from public.khata_parties where company_id=$1::uuid and lower(btrim(regexp_replace(normalize(name,NFKC),'[[:space:]]+',' ','g')))=$2",[company,'client 19000']);
assert.match(JSON.stringify(plan.rows),/khata_party_normalized_name_idx/);
const afterLoad=await fingerprint();await db.exec(await readFile('docs/report-revision.rollback-test.sql','utf8'));assert.equal(await fingerprint(),afterLoad,'Rollback must preserve every source entry');
await db.close();console.log('PASS: additive migration/rollback preserve financial fingerprints; cutoff reversal fixed; tenant/role guards; exact retry/rollback revision integrity; indexed 20000-party lookup. Real multi-connection contention is not simulated by PGlite.');
