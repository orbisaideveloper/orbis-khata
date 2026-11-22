import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db = new PGlite()
try {
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema lottery_private;grant usage on schema lottery_private to service_role;')
 await db.exec(await readFile('supabase/migrations/20261122112424_lottery_live_cache.sql','utf8'))
 await db.exec('set role service_role')
 const first = (await db.query('select public.lottery_live_claim() as value')).rows[0].value
 assert.equal(first.state,'claim')
 assert.match(first.lease,/^[0-9a-f-]{36}$/)
 assert.equal((await db.query('select public.lottery_live_claim() as value')).rows[0].value.state,'wait')
 assert.equal((await db.query("select public.lottery_live_finish('00000000-0000-0000-0000-000000000000',null,false) as saved")).rows[0].saved,false)
 assert.equal((await db.query('select public.lottery_live_finish($1,$2,false) as saved',[first.lease,JSON.stringify({videoId:'test'})])).rows[0].saved,true)
 assert.equal((await db.query('select public.lottery_live_claim() as value')).rows[0].value.payload.videoId,'test')
 await db.exec('reset role;set role anon')
 await assert.rejects(db.query('select public.lottery_live_claim()'),/permission denied/)
 console.log('PASS: live cache lease, stale finish, cache reuse and anonymous denial')
} finally { await db.close() }
