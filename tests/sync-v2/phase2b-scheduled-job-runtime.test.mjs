/** Execute the ACTUAL captured scheduled SQL (not mock business effects) in
 * an isolated PGlite database. Still NOT equivalent to a real pg_cron worker.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const source=async p=>readFile(p,'utf8');
const draw=await source('supabase/migrations/20261122142011_lottery_live_per_draw.sql');
const relay=await source('supabase/migrations/20261121182053_customer_statement_relay.sql');
const retention=draw.match(/cron\.schedule\('lottery-live-retention','17 0 \* \* \*',\$job\$([\s\S]*?)\$job\$\)/)?.[1];
assert(retention,'EXACT_RETENTION_SQL_NOT_FOUND');
const cleanup=relay.match(/create function orbis_khata\.statement_relay_cleanup_v1\(\) returns void\s*language sql security invoker set search_path='' as \$cleanup\$([\s\S]*?)\$cleanup\$;/)?.[1];
assert(cleanup,'EXACT_CLEANUP_SQL_NOT_FOUND');
const db=async()=>new PGlite();

test('native execution of scheduled live retention keeps recent draws and all company money untouched',async()=>{
 const pg=await db();try{
  await pg.exec(`create schema lottery_private;
    create table lottery_private.live_draw_cache(draw_date date,slot text,payload jsonb);
    create table lottery_private.live_cache(payload jsonb);
    create table public.khata_vouchers(id integer primary key,amount_minor bigint);
    insert into public.khata_vouchers values(1,500),(2,2000);
    insert into lottery_private.live_draw_cache(draw_date,slot,payload) values
      (current_date-50,'1pm','{"status":"old"}'),(current_date,'6pm','{"status":"fresh"}');
    insert into lottery_private.live_cache(payload) values
      (jsonb_build_object('date',(current_date-50)::text,'status','old')),
      (jsonb_build_object('date',current_date::text,'status','fresh'));`);
  await pg.exec(retention);
  const rows=await pg.query('select draw_date,slot from lottery_private.live_draw_cache');
  assert.equal(rows.rows.length,1);assert.equal(rows.rows[0].slot,'6pm');
  const payloads=await pg.query('select payload from lottery_private.live_cache order by payload nulls first');
  assert.equal(payloads.rows.filter(x=>x.payload===null).length,1);
  assert.equal((await pg.query('select sum(amount_minor)::integer as total,count(*)::integer as n from public.khata_vouchers')).rows[0].total,2500);
  assert.equal((await pg.query('select count(*)::integer as n from public.khata_vouchers')).rows[0].n,2);
  await pg.exec(retention);
  assert.equal((await pg.query('select count(*)::integer as n from lottery_private.live_draw_cache')).rows[0].n,1);
 }finally{await pg.close()}
});

test('native scheduled mailbox cleanup removes only expired recipient data and marks resync',async()=>{
 const pg=await db();try{
  await pg.exec(`create schema orbis_khata;
    create table orbis_khata.statement_links(id text primary key,resync boolean not null default false);
    create table orbis_khata.statement_mailbox(link_id text,expires_at timestamptz);
    create table public.khata_vouchers(id integer primary key,amount_minor bigint);
    insert into public.khata_vouchers values(1,999);
    insert into orbis_khata.statement_links(id) values('expired'),('fresh');
    insert into orbis_khata.statement_mailbox values('expired',now()-interval '10 minutes'),('fresh',now()+interval '10 days');`);
  await pg.exec(cleanup);
  const rows=await pg.query('select id,resync from orbis_khata.statement_links order by id');
  assert.deepEqual(rows.rows,[{id:'expired',resync:true},{id:'fresh',resync:false}]);
  assert.deepEqual((await pg.query('select link_id from orbis_khata.statement_mailbox')).rows,[{link_id:'fresh'}]);
  assert.equal((await pg.query('select sum(amount_minor)::integer as n from public.khata_vouchers')).rows[0].n,999);
  await pg.exec(cleanup);
  assert.equal((await pg.query('select count(*)::integer as n from orbis_khata.statement_mailbox')).rows[0].n,1);
 }finally{await pg.close()}
});

test('malformed or unrelated scheduled SQL does not silently replace frozen job source',()=>{
  assert(retention.includes('lottery_private.live_draw_cache'));
  assert(cleanup.includes('orbis_khata.statement_mailbox'));
  assert(!/khata_vouchers|khata_lottery_records|sync_v2\.receipt/i.test(retention+cleanup));
});
