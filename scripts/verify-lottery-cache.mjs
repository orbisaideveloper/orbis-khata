import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db = new PGlite()
try {
 await db.exec('create role anon; create role authenticated; create role service_role;')
 await db.exec(await readFile('supabase/migrations/20261121145334_lottery_draw_cache.sql','utf8'))
 const date = (await db.query("select (clock_timestamp() at time zone 'Asia/Kolkata')::date::text as d")).rows[0].d
 for (const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`)
  await assert.rejects(db.query('select public.lottery_draw_claim($1,\'1pm\')',[date]), /permission denied/)
  await assert.rejects(db.query('select * from lottery_private.draw_cache'), /permission denied/)
  await db.exec('reset role')
 }
 await db.exec('set role service_role')
 const claim = async (slot='1pm',pdf=false) => (await db.query('select public.lottery_draw_claim($1,$2,$3) as r',[date,slot,pdf])).rows[0].r
 const first = await claim()
 assert.equal(first.state,'claim')
 assert.equal((await claim()).state,'wait')
 assert.equal((await claim('6pm')).state,'wait','Global gate must cover distinct draws')
 const finish = async lease => (await db.query("select public.lottery_draw_finish($1,'1pm',$2,$3,'https://sambad.com/fixture.pdf',null,30) as r",[date,lease,{date,slot:'1pm'}])).rows[0].r
 assert.equal(await finish(crypto.randomUUID()),false,'Stale lease cannot overwrite')
 assert.equal(await finish(first.lease),true)
 assert.equal((await claim()).state,'ready')
 assert.equal((await claim('1pm',true)).state,'ready')
 assert.equal((await claim()).payload.date,date)
 await assert.rejects(db.query("select public.lottery_draw_claim('2000-01-01','1pm')"), /INVALID_DRAW/)
 await assert.rejects(db.query('select public.lottery_draw_claim($1,\'4pm\')',[date]), /INVALID_DRAW/)
 await db.exec('reset role')
 await db.exec("update lottery_private.provider_gate set next_request='-infinity',active_claim=null,active_until=null;update lottery_private.draw_cache set lease=null,lease_until=null,next_attempt='-infinity';")
 await db.exec('set role service_role')
 const second = await claim('6pm')
 assert.equal(second.state,'claim')
 await db.query("select public.lottery_draw_finish($1,'6pm',$2,null,null,'PROVIDER_LIMIT',300)",[date,second.lease])
 assert.equal((await claim('8pm')).state,'wait','Provider Retry-After must gate every worker')
 const queue=(await db.query('select public.lottery_draw_candidates() as q')).rows[0].q
 assert(queue.length<=1)
 assert(!JSON.stringify(queue).includes('payload'),'Worker queue never exports datasets')
 console.log('PASS private-cache roles, global gate, duplicate admission, stale lease, ready reuse, invalid draws, provider backoff and bounded catch-up queue')
} finally { await db.close() }
