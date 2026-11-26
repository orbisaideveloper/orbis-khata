import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {runInNewContext} from 'node:vm';
import {ModuleKind,transpileModule} from 'typescript';
import {createCentralVerifier,createKhataGateway} from '../src/accounting/server-gateway.ts';
import {createRecoveryEnvelope} from '../src/sync/server-recovery-envelope.ts';

const centralActors={
  owner:'44444444-4444-7444-8444-444444444444',
  foreign:'55555555-5555-7555-8555-555555555555',
};
const config={
  KHATA_DATABASE_URL:'postgres://fixture@db.gqyaxsczlmvppxuoqbox.supabase.co/postgres',
  ORBIS_CUSTOMER_API_URL:'https://auth.example.invalid',
  KHATA_DRIVE_RECOVERY_WRAP_KEY:'ab'.repeat(32),
};

function createEdgeHandler(source,sql) {
  const compiled=transpileModule(source,{compilerOptions:{module:ModuleKind.CommonJS}}).outputText;
  let handler;
  const imports={
    'npm:postgres@3.4.7':{__esModule:true,default:()=>sql},
    '../../../src/accounting/server-gateway.ts':{
      createKhataGateway,
      createCentralVerifier:options=>createCentralVerifier({...options,fetchImpl:async(url,init)=>{
        assert.equal(url,'https://auth.example.invalid/api/v1/customer/session');
        const token=new Headers(init.headers).get('authorization')?.replace(/^Bearer /,'');
        const identity=Object.hasOwn(centralActors,token)?centralActors[token]:null;
        return identity ? Response.json({version:'orbis.customer.v1',customer:{
          orbisIdentityId:identity,displayId:'ORB-U-23456789',
        }}) : new Response(null,{status:401});
      }}),
    },
    '../../../src/sync/server-recovery-envelope.ts':{createRecoveryEnvelope},
  };
  runInNewContext(compiled,{
    exports:{},URL,crypto,Error,console:{info(){},warn(){}},
    // All invoked accounting handlers come from the actual entrypoint. Other
    // imports fail if called, rather than pretending to execute product behavior.
    require:name=>imports[name]??new Proxy({}, {get:(_target,key)=>()=>{throw Error(`UNEXPECTED_EDGE_IMPORT:${name}:${String(key)}`);}}),
    Deno:{env:{get:key=>config[key]},serve:callback=>{handler=callback;}},
  });
  assert.equal(typeof handler,'function');
  return handler;
}

async function serveLocalNativeDeno(handler,work) {
  const native=globalThis.Deno;
  assert.equal(typeof native?.serve,'function','NATIVE_DENO_SERVER_REQUIRED');
  // Executes the original Edge handler through the real Deno HTTP listener.
  // Only the database target and central principal are synthetic test seams.
  const server=native.serve({hostname:'127.0.0.1',port:0,onListen(){}},handler);
  assert(server.addr?.port>0,'NATIVE_DENO_PORT_NOT_ASSIGNED');
  const post=async(token,operation,input,version='orbis.khata.data.v1')=>{
    const response=await fetch('http://127.0.0.1:'+server.addr.port+'/khata',{
      method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({version,operation,input})
    });
    return {status:response.status,body:await response.json()};
  };
  try{
    const result=await work(post);
    globalThis.__phase2bNativeDenoVerified=true;
    return result;
  }finally{await server.shutdown();}
}
async function serveLocal(handler,work) {
  if(globalThis.Deno?.env?.get('PHASE2B_NATIVE_DENO_HTTP')==='enabled')
    return serveLocalNativeDeno(handler,work);
  const server=createServer(async(req,res)=>{
    try {
      const bytes=[];
      for await(const chunk of req) bytes.push(chunk);
      const result=await handler(new Request('http://127.0.0.1/khata',{
        method:req.method,headers:req.headers,body:Buffer.concat(bytes),
      }));
      res.writeHead(result.status,Object.fromEntries(result.headers));
      res.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      res.writeHead(500).end();
    }
  });
  server.listen(0,'127.0.0.1');
  try {
    await once(server,'listening');
    const {port}=server.address();
    async function post(token,operation,input,version='orbis.khata.data.v1') {
      const response=await fetch(`http://127.0.0.1:${port}/khata`,{
        method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
        body:JSON.stringify({version,operation,input}),
      });
      return {status:response.status,body:await response.json()};
    }
    return await work(post);
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

const gate=(id,observed)=>console.log('EXECUTED_CASE '+JSON.stringify({id,observed,outcome:'PASS'}));

export async function verifyEdgeWriters(sql) {
  const source=await readFile('supabase/functions/orbis-khata-data/index.ts','utf8');
  const handler=createEdgeHandler(source,sql);
  await serveLocal(handler,async post=>{
    await verifyCompanyAndParty(post,sql);
    await verifyRecovery(post,sql);
  });
}

export async function verifyCompanyAndParty(post,sql, enroll = async () => {}, report = gate) {
  const company=randomUUID(),party=randomUUID();
  const create={table:'khata_companies',row:{id:company,name:'Synthetic HTTP owner'}};
  const createParty={table:'khata_parties',row:{id:party,name:'Synthetic HTTP party',company_id:company,kind:'both'}};
  const invalidVersion=await post('owner','create',create,'orbis.khata.data.v0');
  assert.deepEqual(invalidVersion,{status:400,body:{code:'KHATA_INPUT_INVALID'}});
  const unauthenticated=await post('unverified','create',create);
  assert.equal(unauthenticated.status,401);
  assert.equal((await sql`select id from public.khata_companies where id=${company}`).length,0);
  const results=await Promise.all([post('owner','create',create),post('owner','create',create)]);
  assert.equal(results[0].status,200);
  assert.deepEqual(results[1],results[0]);
  assert.deepEqual(await sql`select owner_id from public.khata_companies where id=${company}`.then(rows=>rows[0]),{owner_id:centralActors.owner});
  assert.equal((await sql`select count(*)::int as n from public.khata_warehouses where company_id=${company}`)[0].n,1);
  const conflict=await post('foreign','create',create);
  assert.deepEqual(conflict,{status:503,body:{code:'KHATA_DATA_UNAVAILABLE'}});
  assert.equal((await sql`select owner_id from public.khata_companies where id=${company}`)[0].owner_id,centralActors.owner);
  const abortId='48b8eff9-005b-4ed2-a957-f12004892eba';
  // This disposable fault fires after the company INSERT, during dependent provisioning.
  await sql`create function public.fixture_abort_edge_warehouse() returns trigger language plpgsql
    as $$begin raise exception 'FIXTURE_EDGE_WAREHOUSE_ABORT'; end$$`;
  await sql`create trigger fixture_abort_edge_warehouse before insert on public.khata_warehouses for each row
    when (new.company_id='48b8eff9-005b-4ed2-a957-f12004892eba'::uuid)
    execute function public.fixture_abort_edge_warehouse()`;
  try {
    const rejected=await post('owner','create',{...create,row:{...create.row,id:abortId}});
    assert.equal(rejected.status,422);
    assert.equal(rejected.body.code,'P0001');
    assert.equal((await sql`select id from public.khata_companies where id=${abortId}`).length,0);
    assert.equal((await sql`select company_id from public.khata_report_revisions where company_id=${abortId}`).length,0);
  } finally {
    await sql`drop trigger fixture_abort_edge_warehouse on public.khata_warehouses`;
    await sql`drop function public.fixture_abort_edge_warehouse()`;
  }
  report('edge:public.khata_companies','Actual localhost HTTP request through Edge entrypoint; owner row and one default warehouse, concurrent replay, foreign ID conflict and dependent warehouse rollback');
  await enroll({company,party});
  const forbidden=await post('foreign','create',createParty);
  assert.equal(forbidden.status,422);
  assert.equal(forbidden.body.code,'42501');
  assert.equal((await sql`select id from public.khata_parties where id=${party}`).length,0);
  const accepted=await post('owner','create',createParty);
  assert.equal(accepted.status,200);
  assert.deepEqual(await post('owner','create',createParty),accepted);
  const mismatch={...createParty,row:{...createParty.row,name:'Different data'}};
  assert.deepEqual(await post('owner','create',mismatch),{status:503,body:{code:'KHATA_DATA_UNAVAILABLE'}});
  assert.deepEqual((await sql`select name,company_id from public.khata_parties where id=${party}`)[0],
    {name:createParty.row.name,company_id:company});
  report('edge:public.khata_parties','Actual localhost HTTP create, foreign-company denial, replay, mismatched data rejection and one exact row');
}

export async function verifyRecovery(post,sql, report = gate, {preexisting=false}={}) {
  const actor=centralActors.owner;
  const record={email:'synthetic-recovery@example.invalid',key:'cd'.repeat(32)};
  const request={actor,action:'link',...record};
  assert.deepEqual(await post('foreign','drive-recovery',request),{status:503,body:{code:'KHATA_DATA_UNAVAILABLE'}});
  // The native Deno integration runs after the VM route on the same synthetic
  // PG17 dataset: it must prove the pre-existing encrypted record is preserved,
  // not falsely assume no fixture row exists. Never reset real customer data.
  assert.equal((await sql`select identity_id from orbis_khata.drive_account_recovery where identity_id=${actor}`).length,
    preexisting?1:0,'RECOVERY_FIXTURE_BASELINE_UNEXPECTED');
  const accepted=await post('owner','drive-recovery',request);
  assert.deepEqual(accepted,{status:200,body:{data:record}});
  const encrypted=async()=>(await sql`select sealed_record from orbis_khata.drive_account_recovery where identity_id=${actor}`)[0].sealed_record;
  const first=await encrypted();
  assert(!first.includes(record.email)&&!first.includes(record.key));
  assert.deepEqual(await post('owner','drive-recovery',{...request,key:'ef'.repeat(32)}),accepted);
  assert.equal(await encrypted(),first);
  assert.deepEqual(await post('owner','drive-recovery',{actor,action:'read'}),accepted);
  assert.deepEqual(await post('foreign','drive-recovery',{actor:centralActors.foreign,action:'read'}),{status:200,body:{data:null}});
  report('edge:orbis_khata.drive_account_recovery','Actual localhost HTTP link/read, wrong-identity denial, sealed at rest and existing key preserved on retry');
}
