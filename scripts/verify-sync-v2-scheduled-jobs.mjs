/** Native PostgreSQL 17 scheduled SQL body acceptance, disposable localhost ONLY.
 * This runs the exact checked-in SQL bodies. It does not claim pg_cron clock
 * scheduling, remote HTTP/Edge or production role entitlements are certified.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';

const raw=process.env.KHATA_SYNC_V2_TEST_URL??'';
const url=new URL(raw);
assert.equal(url.protocol,'postgres:','DISPOSABLE_LOCAL_POSTGRES_ONLY');
assert.equal(url.hostname,'127.0.0.1','DISPOSABLE_LOCAL_POSTGRES_ONLY');
assert.equal(url.port,'5432','DISPOSABLE_LOCAL_POSTGRES_ONLY');
assert.equal(url.pathname,'/khata_sync_v2_test','DISPOSABLE_LOCAL_POSTGRES_ONLY');
assert.equal(url.search,'','DISPOSABLE_LOCAL_POSTGRES_ONLY');
const draw=await readFile('supabase/migrations/20261122142011_lottery_live_per_draw.sql','utf8');
const statement=await readFile('supabase/migrations/20261121182053_customer_statement_relay.sql','utf8');
const retention=draw.match(/cron\.schedule\('lottery-live-retention','17 0 \* \* \*',\$job\$([\s\S]*?)\$job\$\)/)?.[1];
const cleanup=statement.match(/create function orbis_khata\.statement_relay_cleanup_v1\(\) returns void\s*language sql security invoker set search_path='' as \$cleanup\$([\s\S]*?)\$cleanup\$;/)?.[1];
assert(retention&&cleanup,'EXACT_SCHEDULED_SQL_SOURCE_MISSING');
assert(!/khata_vouchers|sync_v2\.receipt/i.test(retention+cleanup),'SCHEDULED_SQL_FINANCE_SIDE_EFFECT_RISK');
const sql=postgres(raw,{max:2,connection:{application_name:'phase2b-scheduled-jobs-disposable',statement_timeout:15000}});
try{
  await sql.unsafe(`create schema lottery_private; create schema orbis_khata;
    create table lottery_private.live_draw_cache(draw_date date,slot text,payload jsonb);
    create table lottery_private.live_cache(payload jsonb);
    create table orbis_khata.statement_links(id text primary key,resync boolean not null default false);
    create table orbis_khata.statement_mailbox(link_id text,expires_at timestamptz);
    create table public.khata_vouchers(id integer primary key,amount_minor bigint);
    insert into public.khata_vouchers values(1,500),(2,2000);
    insert into lottery_private.live_draw_cache(draw_date,slot,payload) values
      (current_date-50,'1pm','{"status":"old"}'),(current_date,'6pm','{"status":"fresh"}');
    insert into lottery_private.live_cache(payload) values
      (jsonb_build_object('date',(current_date-50)::text,'status','old')),
      (jsonb_build_object('date',current_date::text,'status','fresh'));
    insert into orbis_khata.statement_links(id) values('expired'),('fresh');
    insert into orbis_khata.statement_mailbox values
      ('expired',now()-interval '10 minutes'),('fresh',now()+interval '10 days');`);
  const money=async()=>sql.unsafe('select count(*)::integer as n,sum(amount_minor)::text as total from public.khata_vouchers');
  assert.deepEqual((await money())[0],{n:2,total:'2500'});
  await sql.begin(async tx=>{
    await tx.unsafe(retention);
    await tx.unsafe(cleanup);
  });
  let old=await sql.unsafe('select draw_date,slot from lottery_private.live_draw_cache');
  assert.equal(old.length,1);assert.equal(old[0].slot,'6pm');
  let c=await sql.unsafe('select count(*)::int as n from lottery_private.live_cache where payload is null');
  assert.equal(c[0].n,1);
  let links=await sql.unsafe('select id,resync from orbis_khata.statement_links order by id');
  assert.deepEqual(links.map(x=>[x.id,x.resync]),[['expired',true],['fresh',false]]);
  let mailbox=await sql.unsafe('select link_id from orbis_khata.statement_mailbox');
  assert.deepEqual(mailbox.map(x=>x.link_id),['fresh']);
  assert.deepEqual((await money())[0],{n:2,total:'2500'});
  console.log('PASS PG17: two scheduled SQL bodies execute; old cache/mailbox expire, money unchanged');
  await sql.begin(async tx=>{await tx.unsafe(retention);await tx.unsafe(cleanup)});
  assert.equal((await sql.unsafe('select count(*)::int as n from lottery_private.live_draw_cache'))[0].n,1);
  assert.equal((await sql.unsafe('select count(*)::int as n from orbis_khata.statement_mailbox'))[0].n,1);
  assert.deepEqual((await money())[0],{n:2,total:'2500'});
  console.log('PASS PG17: scheduler SQL is idempotent, financial amounts and record counts unchanged');
  await assert.rejects(sql.begin(async tx=>{
    await tx.unsafe('delete from public.khata_vouchers where id=1');
    throw Error('ABORT_ROLLBACK_PROBE');
  }),/ABORT_ROLLBACK_PROBE/);
  assert.deepEqual((await money())[0],{n:2,total:'2500'});
  console.log('PASS PG17: simulated failed transaction rolls back financial mutation');
  console.log('LIMITATION: this asserts scheduled SQL bodies, NOT actual pg_cron clock/role execution');
}finally{await sql.end({timeout:5})}
