import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {createServer} from 'node:https';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {disposableDatabase, initializeDisposableDatabase} from './sync-v2-disposable-db-fixture.mjs';
import {verifyCompanyAndParty, verifyRecovery} from './sync-v2-edge-writer-fixture.mjs';

const {url, sql} = disposableDatabase();
const folder = await mkdtemp(join(tmpdir(), 'orbis-edge-ingress-'));
const actors = {
  owner:'44444444-4444-7444-8444-444444444444',
  foreign:'55555555-5555-7555-8555-555555555555',
};
const env = {
  PATH: process.env.PATH,
  DENO_DIR: join(folder, 'cache'),
  KHATA_DATABASE_URL: 'postgres://disposable-fixture@db.gqyaxsczlmvppxuoqbox.supabase.co/postgres',
  ORBIS_FIXTURE_PG_URL: url.href,
  KHATA_DRIVE_RECOVERY_WRAP_KEY: 'ab'.repeat(32),
};
const deno = process.env.ORBIS_DENO_BIN ?? 'deno';
const flags = ['run','--no-config','--no-prompt','--cached-only','--unstable-sloppy-imports',
  '--import-map=scripts/fixtures/sync-v2-deno/import-map.json','--allow-env','--allow-net=127.0.0.1'];
const launcher = 'scripts/fixtures/sync-v2-deno/serve.mjs';
let child, central;
try {
  const denied = spawn(deno, [...flags, launcher], {env:{...env,KHATA_DATABASE_URL:url.href}});
  let guardOutput = '';
  denied.stderr.setEncoding('utf8').on('data', chunk => {guardOutput += chunk;});
  const [code] = await once(denied, 'close');
  assert.notEqual(code, 0);
  assert.match(guardOutput,/KHATA_DATABASE_TARGET_INVALID/);

  await initializeDisposableDatabase(sql);
  const key = join(folder, 'central.key'), cert = join(folder, 'central.crt');
  const ca = join(folder,'ca.crt'), caKey = join(folder,'ca.key'), csr = join(folder,'central.csr');
  const openssl=(...args)=>execFileSync('openssl',args,{stdio:'ignore'});
  openssl('req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=ORBIS Disposable Test CA',
    '-addext','basicConstraints=critical,CA:TRUE','-keyout',caKey,'-out',ca);
  openssl('req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=127.0.0.1',
    '-addext','subjectAltName=IP:127.0.0.1','-keyout',key,'-out',csr);
  openssl('x509','-req','-in',csr,'-CA',ca,'-CAkey',caKey,'-CAcreateserial','-copy_extensions','copy',
    '-days','1','-out',cert);
  central = createServer({key:await readFile(key),cert:await readFile(cert)}, (request,response) => {
    const token = request.headers.authorization?.replace(/^Bearer /u,'');
    const actor = Object.hasOwn(actors,token) ? actors[token] : null;
    if (request.url !== '/api/v1/customer/session' || !actor) { response.writeHead(401).end(); return; }
    response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({
      version:'orbis.customer.v1',customer:{orbisIdentityId:actor,displayId:'ORB-U-23456789'},
    }));
  }).listen(0,'127.0.0.1');
  await once(central,'listening');
  env.ORBIS_CUSTOMER_API_URL = 'https://127.0.0.1:' + central.address().port;
  child = spawn(deno,[...flags,'--cert='+ca,launcher],{env});
  let output = '';
  const port = await new Promise((resolve,reject) => {
    const timer=setTimeout(()=>reject(new Error('EDGE_START_TIMEOUT: '+output)),10000);
    child.stdout.setEncoding('utf8').on('data', chunk=>{
      output += chunk;
      const match=output.match(/EDGE_LOOPBACK_PORT=(\d+)\r?\n/u);
      if (match) {clearTimeout(timer);resolve(match[1]);}
    });
    child.stderr.setEncoding('utf8').on('data',chunk=>{output += chunk;});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('close',code=>{clearTimeout(timer);reject(new Error('EDGE_EXIT '+code+' '+output));});
  });
  const post = async (token, operation, input) => {
    const response = await fetch('http://127.0.0.1:'+port,{method:'POST',signal:AbortSignal.timeout(10000),
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({version:'orbis.khata.data.v1',operation,input})});
    return {status:response.status,body:await response.json()};
  };
  // Exercise the same three contracts through Deno's actual HTTP and TLS session verification.
  await sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle)
    values(${actors.owner},'account-catalog',${actors.owner},'deno-fixture','active')`;
  await verifyCompanyAndParty(post,sql,({company})=>sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle)
    values(${actors.owner},'company',${company},'deno-fixture','active')`, () => {});
  await verifyRecovery(post,sql, () => {});
  const events = await sql`select e.seq::text, e.actor_id, e.change
    from sync_v2.event e where e.kind='company' order by e.seq`;
  assert.equal(events.length,1);
  assert.equal(events[0].actor_id,actors.owner);
  assert.equal(events[0].seq,'1');
  const party = JSON.parse(events[0].change[0].projectionJson);
  assert.equal(party.name,'Synthetic HTTP party');
  assert.equal((await sql`select count(*)::int as n from public.khata_parties where id=${party.id}`)[0].n,1);
  const catalog=await sql`select actor_id, change from sync_v2.event where kind='account-catalog'`;
  assert.deepEqual([...catalog],[{actor_id:actors.owner,change:{type:'company-lifecycle',companyId:party.company_id,
    status:'active',name:'Synthetic HTTP owner'}}]);
  assert.equal((await sql`select count(*)::int as n from sync_v2.event`)[0].n,2);
  assert.equal((await sql`select count(*)::int as n from orbis_khata.drive_account_recovery`)[0].n,1);
  console.log('GATE_EDGE_DENO_OK exact entrypoint; guard rejects loopback outside adapter; TLS Central; replay, rollback, owner isolation and one enrolled party feed event');
} finally {
  if (child && child.exitCode === null) {
    const closed=once(child,'close');
    child.kill();
    await closed;
  }
  if (central) await new Promise(resolve=>central.close(resolve));
  await sql.end({timeout:5});
  await rm(folder,{recursive:true,force:true});
}
