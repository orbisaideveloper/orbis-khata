import postgres from 'postgres'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const url = new URL(process.env.KHATA_CONCURRENCY_DATABASE_URL ?? 'http://missing')
assert(['localhost','127.0.0.1'].includes(url.hostname) && url.pathname === '/khata_concurrency_test','Disposable localhost test database required')
const sql = postgres(url.toString(), { max: 32, connection: { statement_timeout: 15000 } })
try {
 assert.equal((await sql`select count(*)::int as n from information_schema.schemata where schema_name='lottery_private'`)[0].n,0,'New isolated cache schema required')
 // Migration contains BEGIN/COMMIT: reserve one connection for the whole script.
 // Keep the pool at32 for the real contention checks below.
 const bootstrap = await sql.reserve()
 try {
  await bootstrap.unsafe(await readFile('supabase/migrations/20261121145334_lottery_draw_cache.sql','utf8'))
 } finally {
  try { await bootstrap.unsafe('rollback') } finally { bootstrap.release() }
 }
 const date=(await sql`select (clock_timestamp() at time zone 'Asia/Kolkata')::date::text as d`)[0].d
 const claim=()=>sql.begin(async tx=>{await tx.unsafe('set local role service_role');return (await tx`select public.lottery_draw_claim(${date}::date,'1pm') as r`)[0].r})
 const results=await Promise.all(Array.from({length:32},claim))
 assert.equal(results.filter(r=>r.state==='claim').length,1,'Exactly one of32 simultaneous requests may fetch provider')
 assert.equal(results.filter(r=>r.state==='wait').length,31)
 const lease=results.find(r=>r.state==='claim').lease
 await sql`select public.lottery_draw_finish(${date}::date,'1pm',${lease}::uuid,'{"fixture":true}'::jsonb,'https://sambad.com/draw.pdf',null,30)`
 const ready=await Promise.all(Array.from({length:32},claim))
 assert(ready.every(r=>r.state==='ready'),'All later requests reuse same persisted result')
 console.log('PASS native PostgreSQL:32 concurrent collectors -> one lease;32 later readers -> one cached draw')
} finally { await sql.end({timeout:5}) }
