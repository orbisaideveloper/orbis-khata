// Real PostgreSQL, disposable CI database only. Never accepts hosted URLs.
import postgres from 'postgres'
import { readFile, readdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
const value=process.env.KHATA_CONCURRENCY_DATABASE_URL
if(!value) throw new Error('DISPOSABLE_DATABASE_REQUIRED')
const url=new URL(value)
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/khata_concurrency_test') throw new Error('DISPOSABLE_DATABASE_REQUIRED')
const sql=postgres(value,{max:32,prepare:false})
const owner='77777777-7777-7777-8777-777777777771',recipient='77777777-7777-7777-8777-777777777772',id='77777777-7777-4777-8777-777777777773'
const scope={module:'khata',company:'77777777-7777-4777-8777-777777777774',party:'77777777-7777-4777-8777-777777777775',companyName:'Disposable relay',partyName:'Synthetic party'}
try {
 const file=(await readdir('supabase/migrations')).find(name=>name.endsWith('_customer_statement_relay.sql'))
 const reserved=await sql.reserve()
 try {await reserved.unsafe(await readFile('supabase/migrations/'+file,'utf8'))}
 finally {try{await reserved.unsafe('rollback')}finally{reserved.release()}}
 for(const actor of [owner,recipient]) {
  await sql`insert into auth.users(id) values(${actor})`
  await sql`insert into orbis_khata.ledger_owners(id,legacy) values(${actor},false)`
  await sql`insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference) values(${actor},${actor},'disposable-statement-relay')`
 }
 const rpc=(actor,command)=>sql.begin(async tx=>{
  const display=actor===owner?'ORB-U-23456789':'ORB-U-ABCDEFGH'
  await tx`select set_config('orbis.khata.gateway_verified','v1',true),set_config('orbis.khata.identity',${actor},true),set_config('orbis.khata.display_id',${display},true),set_config('request.jwt.claim.sub',${actor},true)`
  await tx`set local role authenticated`
  return (await tx`select orbis_khata.statement_relay_v1(${tx.json(command)}) as data`)[0].data
 })
 await rpc(owner,{action:'invite',id,scope,recipient:'ORB-U-ABCDEFGH'})
 await rpc(recipient,{action:'accept',id})
 const patch={reset:true,scope,upsert:[],remove:[]}
 const racers=await Promise.allSettled(Array.from({length:32},()=>rpc(owner,{action:'publish',id,base:0,patch})))
 assert.equal(racers.filter(r=>r.status==='fulfilled').length,1)
 assert(racers.filter(r=>r.status==='rejected').every(r=>r.reason.message.includes('SHARE_VERSION_CONFLICT')))
 const copies=await Promise.all(Array.from({length:32},()=>rpc(recipient,{action:'pull',id})))
 assert(copies.every(copy=>copy.revision===1))
 await Promise.all(Array.from({length:32},()=>rpc(recipient,{action:'ack',id,revision:1})))
 assert.equal(await rpc(recipient,{action:'pull',id}),null)
 await Promise.all([rpc(owner,{action:'publish',id,base:1,patch}),...Array.from({length:16},()=>rpc(recipient,{action:'ack',id,revision:1}))])
 assert.equal((await rpc(recipient,{action:'pull',id})).revision,2)
 console.log('PASS native PostgreSQL statement relay: 32 publishers, 32 receivers, duplicate ACKs and late ACK/new publication race')
} finally {await sql.end({timeout:5})}
