import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db = new PGlite()
try {
 await db.exec('create role anon;create role authenticated;create role service_role;')
 await db.exec(await readFile('supabase/migrations/20261121145334_lottery_draw_cache.sql','utf8'))
 // PGlite lacks network/cron/Vault: these test doubles validate SQL/registration only.
 await db.exec(`create schema vault;create schema cron;create schema net;
 create table vault.secrets(secret text,name text unique);
 create view vault.decrypted_secrets as select secret as decrypted_secret,name from vault.secrets;
 create function vault.create_secret(text,text,text) returns uuid language plpgsql as $$begin insert into vault.secrets values($1,$2);return gen_random_uuid();end$$;
 create table cron.jobs(name text primary key,schedule text,command text);
 create function cron.schedule(text,text,text) returns bigint language plpgsql as $$begin insert into cron.jobs values($1,$2,$3) on conflict(name) do update set schedule=excluded.schedule,command=excluded.command;return 1;end$$;
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;`)
 const migration=(await readFile('supabase/migrations/20261121145730_lottery_scheduler.sql','utf8')).replace(/^create extension .*;$/gm,'')
 await db.exec(migration)
 assert.equal((await db.query('select count(*)::int as n from cron.jobs')).rows[0].n,0,'Migration must not activate cron before Edge deployment')
 await assert.rejects(db.query("select lottery_private.start_scheduler('http://evil.test')"),/INVALID_PROJECT_URL/)
 await db.exec("select lottery_private.start_scheduler('https://synthetic.supabase.co');select lottery_private.start_scheduler('https://synthetic.supabase.co');")
 const jobs=(await db.query('select * from cron.jobs')).rows
 assert.equal(jobs.length,1)
 assert.equal(jobs[0].schedule,'30 seconds')
 assert.equal(jobs[0].command,'select lottery_private.tick()')
 assert.equal((await db.query('select count(*)::int as n from vault.secrets')).rows[0].n,1,'Activation reuses its dedicated secret')
 const stored=(await db.query('select worker_hash,collector_url from lottery_private.provider_gate')).rows[0]
 assert.match(stored.worker_hash,/^[a-f0-9]{64}$/)
 assert.equal(stored.collector_url,'https://synthetic.supabase.co/functions/v1/orbis-lottery-collector')
 await db.exec('set role anon')
 await assert.rejects(db.query('select lottery_private.tick()'),/permission denied/)
 await db.exec('reset role;set role service_role')
 assert.equal((await db.query("select public.lottery_worker_authorized(repeat('0',64)) as ok")).rows[0].ok,false)
 console.log('PASS scheduler SQL: dormant migration, exact30-second registration, idempotent private Vault setup, endpoint allowlist and authorization. Extensions are test doubles, not live Cron acceptance.')
} finally { await db.close() }
