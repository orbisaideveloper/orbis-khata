import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {setup} from './sql-fixture.mjs';
async function verify(){
 const db=await setup();
 const owner='11111111-1111-7111-8111-111111111111',company='22222222-2222-4222-8222-222222222222',other='99999999-9999-4999-8999-999999999999',party='33333333-3333-4333-8333-333333333333',warehouse='44444444-4444-4444-8444-444444444444',feed='55555555-5555-4555-8555-555555555555',milk='66666666-6666-4666-8666-666666666666';
 await db.query('insert into auth.users values($1)',[owner]);
 await db.query('insert into orbis_khata.ledger_owners(id,legacy) values($1,false)',[owner]);
 await db.query('insert into khata_companies(id,owner_id,name) values($1,$2,$3)',[company,owner,'Historical owner']);
 await db.query("insert into khata_parties(id,company_id,name,kind,opening_account) values($1,$2,'Old supplier','both','receivable')",[party,company]);
 await db.query("select set_config('request.jwt.claims',$1,false),set_config('orbis.khata.gateway_verified','v1',false)",[JSON.stringify({sub:owner,role:'authenticated'})]);
 for(const [id,kind,code,name,unit] of [[warehouse,'warehouse','MAIN','Main',''],[feed,'item','FEED','Feed','bag'],[milk,'item','MILK','Milk','litre']])await db.query('select public.khata_inventory_post_v1($1::jsonb)',[JSON.stringify({id,company,kind,date:'2026-10-01',code,name,unit,party:null,reference:'',note:'',lines:[]})]);
 const rpc=async p=>(await db.query('select public.khata_workspace_v3($1::jsonb) as result',[JSON.stringify(p)])).rows[0].result;
 const settings=await rpc({company,action:'settings'});
 const bill=(id,production=false)=>({company,action:'invoice-save',...(production?{production:true}:{}),command:{company,action:'bill',bill:{id,company,kind:'purchase',date:'2026-10-01',code:'',name:'',unit:'',party,reference:'',note:'Feed',lines:[{item:feed,warehouse,to:null,quantity:'500000000',rate:'5000'}]},paid:'100000',account:'cash',roundoff:'0'}});
 const old=bill(crypto.randomUUID());await rpc(old);
 const fingerprint=async()=>(await db.query("select jsonb_build_object('users',(select jsonb_agg(to_jsonb(t)) from auth.users t),'companies',(select jsonb_agg(to_jsonb(t)) from khata_companies t),'parties',(select jsonb_agg(to_jsonb(t)) from khata_parties t),'vouchers',(select jsonb_agg(to_jsonb(t)) from khata_vouchers t),'inventory',(select jsonb_agg(to_jsonb(t)) from khata_inventory_documents t)) as state")).rows[0].state;
 const before=await fingerprint();
 await db.exec(await readFile('supabase/migrations/20261031075245_lottery_row_storage.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261031081126_continuous_production.sql','utf8'));
 assert.equal((await db.query("select has_table_privilege('authenticated','public.khata_production_posts','SELECT') as allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('anon','public.khata_workspace_v3(jsonb)','EXECUTE') as allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','orbis_khata.production_post(jsonb)','EXECUTE') as allowed")).rows[0].allowed,false);
 assert.deepEqual(await fingerprint(),before,'Migration must preserve every old account/company/party/voucher/inventory value');
 await rpc({company,action:'settings-save',settings:{...settings,production:true}});
 const routed=bill(crypto.randomUUID(),true),answer=await rpc(routed);assert.equal(answer.total,'2500000');assert.deepEqual(await rpc(routed),answer);
 await assert.rejects(rpc({...routed,production:false}),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(rpc({...old,production:true}),/IDEMPOTENCY_CONFLICT/);
 const journalBefore=(await db.query('select count(*)::int as n from khata_vouchers where company_id=$1',[company])).rows[0].n;
 const output={company,action:'production',id:crypto.randomUUID(),date:'2026-10-01',kind:'output',item:milk,warehouse,quantity:'500000000',note:'Own milk'};
 await rpc(output);await rpc(output);
 assert.equal((await db.query('select count(*)::int as n from khata_vouchers where company_id=$1',[company])).rows[0].n,journalBefore,'Internal milk must not post another purchase/payable/payment');
 assert.equal((await db.query('select sum(quantity)::text as q from khata_stock_journal where company_id=$1 and item_id=$2',[company,milk])).rows[0].q,'500000000');
 const count=async()=>(await db.query('select count(*)::int as n from khata_inventory_documents')).rows[0].n;
 const n=await count();await assert.rejects(rpc({...output,id:crypto.randomUUID(),kind:'input',item:feed,quantity:'999999999999'}),/INSUFFICIENT_PRODUCTION_STOCK/);assert.equal(await count(),n);
 await assert.rejects(rpc({...output,id:crypto.randomUUID(),item:feed}),/ONE_PRODUCTION_OUTPUT_ITEM_REQUIRED/);
 await assert.rejects(rpc({...output,id:crypto.randomUUID(),kind:'input'}),/PRODUCTION_OUTPUT_CANNOT_BE_INPUT/);
 await assert.rejects(rpc({...output,id:crypto.randomUUID(),date:'2099-01-01'}),/INVALID_PRODUCTION/);
 await assert.rejects(rpc({...output,id:crypto.randomUUID(),quantity:'0'}),/INVALID_QUANTITY/);
 await assert.rejects(rpc({...output,quantity:'1000000'}),/IDEMPOTENCY_CONFLICT/);
 await rpc({company,action:'settings-save',settings:{...settings,production:false}});
 await assert.rejects(rpc({...output,id:crypto.randomUUID()}),/PRODUCTION_DISABLED/);
 // Failed checkbox routing rolls back its purchase, supplier/cash entries and serial.
 const failed=bill(crypto.randomUUID(),true),numberBefore=await rpc({company,action:'number-preview',id:crypto.randomUUID(),kind:'purchase',date:'2026-10-01'});
 await assert.rejects(rpc(failed),/PRODUCTION_DISABLED/);assert.equal(await count(),n);
 assert.equal(await rpc({company,action:'number-preview',id:crypto.randomUUID(),kind:'purchase',date:'2026-10-01'}),numberBefore);
 await assert.rejects(rpc({...output,id:crypto.randomUUID(),company:other}),/COMPANY_NOT_ACCESSIBLE/);
 await db.exec('update khata_write_controls set enabled=false');await assert.rejects(rpc({...output,id:crypto.randomUUID()}),/WRITES_DISABLED/);await db.exec('update khata_write_controls set enabled=true');
 // Reversal returns the routed input as well; original supplier settlement logic is retained.
 await rpc({company,action:'correct',id:crypto.randomUUID(),target:routed.command.bill.id,type:'voucher',reason:'Wrong purchase',replacement:null});
 assert.equal((await db.query("select count(*)::int as n from khata_stock_reversals r join khata_production_routes p on p.input_id=r.original_id where p.company_id=$1",[company])).rows[0].n,1);
 const savedOld=(await db.query('select payload from khata_inventory_documents where id=$1',[old.command.bill.id])).rows[0].payload;assert.equal(savedOld.lines[0].quantity,'500000000');
 // Retired-company restore must still delegate before the active-company guard.
 await rpc({company,action:'retire',name:'Historical owner'});await rpc({company,action:'restore',name:'Historical owner'});
 await db.exec(await readFile('docs/atomic-invoice.rollback-test.sql','utf8'));
 await db.exec(await readFile('docs/account-details.rollback-test.sql','utf8'));
 await db.query("select set_config('orbis.khata.gateway_verified','',false)");await assert.rejects(rpc({...output,id:crypto.randomUUID()}),/COMPANY_NOT_ACCESSIBLE/);
 await db.close();console.log('PASS: old account/ledger fingerprints, atomic routed purchase, internal milk, retry, rollback+serial, stock/tenant/write/mode guards, linked reversal and restore.');
}
try{await verify();}catch(error_){console.error('FAIL:',error_.message,error_.where??'');process.exitCode=1;}
