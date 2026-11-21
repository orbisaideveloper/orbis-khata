import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db=new PGlite()
const owner='11111111-1111-7111-8111-111111111111',viewer='22222222-2222-7222-8222-222222222222',other='33333333-3333-7333-8333-333333333333'
const id='44444444-4444-4444-8444-444444444444'
const scope={module:'khata',company:'55555555-5555-4555-8555-555555555555',party:'66666666-6666-4666-8666-666666666666',companyName:'Synthetic books',partyName:'Synthetic party'}
const patch={reset:true,scope,upsert:[],remove:[]}
try {
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema orbis_khata;grant usage on schema orbis_khata to authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table orbis_khata.principals(orbis_identity_id uuid,ledger_owner_id uuid);`)
 for(const actor of [owner,viewer,other]) await db.query('insert into orbis_khata.principals values($1,$1)',[actor])
 await db.exec(`create table orbis_khata.lottery_party_shares(id uuid primary key,owner_id uuid,organization_id text,party_id text,recipient_display_id text,recipient_identity_id uuid,status text,updated_at timestamptz default now());
 create table public.khata_lottery_records(owner_id uuid,model text,id text,value jsonb);`)
 const legacy='99999999-9999-4999-8999-999999999999'
 await db.query('insert into public.khata_lottery_records values($1,\'foundationAccountingOrganization\',$2,$3),($1,\'foundationAccountingParty\',$4,$5)',[owner,scope.company,{name:'Legacy books',status:'ACTIVE'},scope.party,{name:'Legacy party',organizationId:scope.company}])
 await db.query('insert into orbis_khata.lottery_party_shares(id,owner_id,organization_id,party_id,recipient_display_id,status) values($1,$2,$3,$4,\'ORB-U-ABCDEFGH\',\'pending\')',[legacy,owner,scope.company,scope.party])
 const file=(await readdir('supabase/migrations')).find(name=>name.endsWith('_customer_statement_relay.sql'))
 await db.exec(await readFile('supabase/migrations/'+file,'utf8'))
 async function as(actor,display) {
  await db.query("select set_config('orbis.khata.gateway_verified','v1',false),set_config('orbis.khata.identity',$1,false),set_config('request.jwt.claim.sub',$1,false),set_config('orbis.khata.display_id',$2,false)",[actor,display])
 }
 const rpc=async command=>(await db.query('select orbis_khata.statement_relay_v1($1) as r',[command])).rows[0].r
 await as(viewer,'ORB-U-ABCDEFGH')
 assert.equal((await rpc({action:'list'})).find(row=>row.id===legacy).module,'lottery')
 await rpc({action:'accept',id:legacy})
 assert.equal((await db.query('select status from orbis_khata.lottery_party_shares where id=$1',[legacy])).rows[0].status,'accepted')
 await db.query('update orbis_khata.lottery_party_shares set status=\'revoked\' where id=$1',[legacy])
 assert.equal((await rpc({action:'list'})).find(row=>row.id===legacy).status,'revoked')
 await as(owner,'ORB-U-23456789')
 await rpc({action:'invite',id,scope,recipient:'ORB-U-ABCDEFGH'})
 assert.equal((await rpc({action:'invite',id:'88888888-8888-4888-8888-888888888888',scope,recipient:'ORB-U-ABCDEFGH'})).id,id,'Lost invitation response remains idempotent by exact scope')
 await rpc({action:'invite',id,scope,recipient:'ORB-U-ABCDEFGH'})
 await assert.rejects(rpc({action:'publish',id,base:0,patch}),/SHARE_NOT_AVAILABLE/)
 await as(other,'ORB-U-BCDEFGHJ')
 assert.deepEqual(await rpc({action:'list'}),[])
 for(const action of ['accept','pull','resync','revoke','ack']) await assert.rejects(rpc({action,id,revision:1}),/SHARE_NOT_AVAILABLE/)
 await as(viewer,'ORB-U-ABCDEFGH');await rpc({action:'accept',id})
 await as(owner,'ORB-U-23456789')
 await assert.rejects(rpc({action:'publish',id,base:0,patch:{...patch,scope:{...scope,party:'foreign'}}}),/SHARE_INPUT_INVALID/)
 assert.equal((await rpc({action:'publish',id,base:0,patch})).revision,1)
 await assert.rejects(rpc({action:'publish',id,base:1,patch}),/SHARE_DELIVERY_PENDING/)
 await as(viewer,'ORB-U-ABCDEFGH')
 assert.equal((await rpc({action:'pull',id})).revision,1)
 assert.equal((await db.query('select count(*) as n from orbis_khata.statement_mailbox')).rows[0].n,1,'Read is NOT an ACK')
 await rpc({action:'ack',id,revision:1});await rpc({action:'ack',id,revision:1})
 assert.equal(await rpc({action:'pull',id}),null)
 await rpc({action:'resync',id})
 await as(owner,'ORB-U-23456789')
 await assert.rejects(rpc({action:'publish',id,base:0,patch}),/SHARE_VERSION_CONFLICT/)
 await rpc({action:'publish',id,base:1,patch})
 await as(viewer,'ORB-U-ABCDEFGH');await rpc({action:'ack',id,revision:1})
 assert.equal((await rpc({action:'pull',id})).revision,2,'Late ACK cannot erase a newer delivery')
 await assert.rejects(rpc({action:'ack',id,revision:3}),/SHARE_ACK_INVALID/)
 await db.exec("update orbis_khata.statement_mailbox set expires_at=now()-interval '1 second'")
 await rpc({action:'list'});assert.equal(await rpc({action:'pull',id}),null)
 assert.equal((await rpc({action:'list'})).find(row=>row.id===id).resync,true)
 await as(owner,'ORB-U-23456789');await rpc({action:'publish',id,base:2,patch})
 await as(viewer,'ORB-U-ABCDEFGH');await rpc({action:'revoke',id})
 await assert.rejects(rpc({action:'pull',id}),/SHARE_NOT_AVAILABLE/)
 assert.equal((await db.query('select count(*) as n from orbis_khata.statement_mailbox')).rows[0].n,0)
 for(const role of ['anon','authenticated']) {
  await db.exec('set role '+role)
  await assert.rejects(db.query('select * from orbis_khata.statement_mailbox'),/permission denied/)
  await db.exec('reset role')
 }
 console.log('PASS statement relay: exact recipient, consent, scope, CAS, pending backpressure, save/ACK boundary, replay, stale ACK, resync, expiry, revoke, RLS')
} finally {await db.close()}
