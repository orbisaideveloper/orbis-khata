import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db = new PGlite()
try {
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema lottery_private;grant usage on schema lottery_private to service_role;create schema cron;create table cron.jobs(command text);create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.jobs values($3);select 1::bigint$$;')
 await db.exec(await readFile('supabase/migrations/20261122112424_lottery_live_cache.sql','utf8'))
 await db.exec(await readFile('supabase/migrations/20261122135944_lottery_live_per_draw.sql','utf8'))
 const date = (await db.query("select (now() at time zone 'Asia/Kolkata')::date::text as date")).rows[0].date
 await db.query("insert into lottery_private.live_draw_cache(draw_date,slot,payload) values($1,'1pm',$2)",[date,JSON.stringify({date,slot:'1pm',videoId:'abcdefghijk',channelId:'UCX7bj5Fv2uBpAy1dRC1IhTw',status:'live'})])
 await db.exec('set role service_role')
 const claim = () => db.query("select public.lottery_live_draw_claim($1,'1pm') as value",[date]).then(r=>r.rows[0].value)
 // Actual SQL locking path with 10,000 mocked viewers; no external API traffic.
 const claims = await Promise.all(Array.from({length:10000},claim))
 assert.equal(claims.filter(r=>r.state==='claim').length,1)
 const first=claims.find(r=>r.state==='claim')
 const finish=(lease,payload,failed=false)=>db.query("select public.lottery_live_draw_finish($1,'1pm',$2,$3,$4,0,1,1) as value",[date,lease,payload?JSON.stringify(payload):null,failed]).then(r=>r.rows[0].value)
 assert.equal((await finish('00000000-0000-0000-0000-000000000000',null)).videoId,'abcdefghijk')
 assert.equal((await finish(first.lease,null,true)).videoId,'abcdefghijk')
 assert.equal((await claim()).state,'wait')
 const retry=(await db.query("select extract(epoch from next_attempt-clock_timestamp()) as delay from lottery_private.live_draw_cache")).rows[0].delay
 assert.ok(Number(retry)>15 && Number(retry)<=45)

 await db.exec("update lottery_private.live_draw_cache set next_attempt='-infinity'")
 const expired=await claim()
 await db.exec("update lottery_private.live_draw_cache set lease_until=clock_timestamp()-interval '1 second'")
 const second=await claim()
 assert.notEqual(second.lease,expired.lease)
 assert.equal((await finish(expired.lease,null)).videoId,'abcdefghijk')
 await assert.rejects(finish(second.lease,{date,slot:'6pm',videoId:'abcdefghijk'}),/LIVE_PAYLOAD_INVALID/)
 const video={date,slot:'1pm',channelId:'UCX7bj5Fv2uBpAy1dRC1IhTw',videoId:'abcdefghijk',status:'completed'}
 assert.equal((await finish(second.lease,video)).status,'completed')
 const metrics=(await db.query('select cache_hits,cache_misses,errors,verification_calls from lottery_private.live_draw_cache')).rows[0]
 assert.equal(Number(metrics.cache_misses),3);assert.equal(Number(metrics.errors),1)
 assert.equal(Number(metrics.verification_calls),2)
 await assert.rejects(db.query("select public.lottery_live_draw_claim($1,'7pm')",[date]),/LIVE_DRAW_INVALID/)
 await db.exec('reset role;set role anon')
 await assert.rejects(claim(),/permission denied/)
 await assert.rejects(db.query('select * from lottery_private.live_draw_cache'),/permission denied/)
 await db.exec('reset role;set role authenticated')
 await assert.rejects(claim(),/permission denied/)
 await db.exec('reset role')
 await db.query("insert into lottery_private.live_draw_cache(draw_date,slot) values($1::date-29,'8pm')",[date])
 const retention=(await db.query('select command from cron.jobs')).rows[0].command
 await db.exec(retention)
 assert.equal((await db.query('select count(*)::integer as count from lottery_private.live_draw_cache')).rows[0].count,1)
 console.log('PASS: 10000 SQL claims, one lease, null/stale preservation, exact draw, completed, counters, anon/auth denial')
} finally { await db.close() }
