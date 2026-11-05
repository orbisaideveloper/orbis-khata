import assert from 'node:assert/strict';
// Shared disposable-only acceptance cases; caller owns schema initialization.
export async function phase2SafetyCases(db){
 const identity=crypto.randomUUID().replace(/^(.{14})./,(_match,prefix)=>prefix+'7');
 await db.query('insert into auth.users values($1)',[identity]);
 await db.query('insert into orbis_khata.ledger_owners(id,legacy) values($1,false)',[identity]);
 // Seed this window at the limit: test rejection without timing-sensitive loops.
 await db.query("insert into orbis_khata.gateway_request_windows values($1,date_trunc('minute',clock_timestamp()),600,to_timestamp(floor(extract(epoch from clock_timestamp())/10)*10),120,clock_timestamp())",[identity]);
 const decision=(await db.query('select orbis_khata.admit_gateway_request($1) as d',[identity])).rows[0].d;
 assert.equal(decision.allowed,false);assert(decision.retryAfter>0&&decision.retryAfter<=60);
 await db.query("update orbis_khata.gateway_request_windows set minute_start=now()-interval '2 minutes',burst_start=now()-interval '2 minutes' where identity_id=$1",[identity]);
 assert.equal((await db.query('select orbis_khata.admit_gateway_request($1) as d',[identity])).rows[0].d.allowed,true);
 for(const role of ['anon','authenticated','service_role']){
  await db.exec('set role '+role);
  try{
   await assert.rejects(db.query('select orbis_khata.admit_gateway_request($1)',[identity]),/permission denied/);
   await assert.rejects(db.query('select * from orbis_khata.gateway_request_windows'),/permission denied/);
  }finally{await db.exec('reset role');}
 }
 const ids=Array.from({length:4},()=>crypto.randomUUID());
 for(const [i,id] of ids.entries()) await db.query("insert into public.khata_companies(id,owner_id,name,deleted_at,purge_after) values($1,$2,'Purge fixture',$3,$4)",[id,identity,i===0?null:'2026-01-01',i===0?null:i===1?'2099-01-01':'2026-01-02']);
 for(const id of ids) await db.query('insert into public.khata_expense_profile_state(company_id) values($1)',[id]);
 await db.query("insert into public.khata_expense_profile_operations(company_id,id,request,result) values($1,$2,'{}','{}')",[ids[3],crypto.randomUUID()]);
 // Simulate a future dependency: one blocked tenant must not prevent the next purge.
 await db.exec('create table public.purge_fixture_dependency(company_id uuid references public.khata_companies(id))');
 await db.query('insert into public.purge_fixture_dependency values($1)',[ids[2]]);
 assert.equal((await db.query('select orbis_khata.purge_retired_companies() as n')).rows[0].n,1);
 const remaining=(await db.query('select id from public.khata_companies where owner_id=$1',[identity])).rows.map(r=>r.id);
 assert.deepEqual(new Set(remaining),new Set(ids.slice(0,3)));
 assert.equal((await db.query('select count(*)::int as n from public.khata_expense_profile_state where company_id=any($1::uuid[])',[ids])).rows[0].n,3);
 assert.equal((await db.query('select count(*)::int as n from public.khata_expense_profile_operations where company_id=any($1::uuid[])',[ids])).rows[0].n,0);
}
