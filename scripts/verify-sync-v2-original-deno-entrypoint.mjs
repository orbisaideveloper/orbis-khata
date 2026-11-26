import assert from 'node:assert/strict';
import {verifyCompanyAndParty,verifyRecovery} from './sync-v2-edge-writer-fixture.mjs';
import {closeSyntheticPostgres} from './sync-v2-original-deno-postgres-shim.mjs';
export async function verifyOriginalDenoEdge(sql) {
  assert.equal(typeof Deno?.serve,'function');
  const source=await Deno.readTextFile('supabase/functions/orbis-khata-data/index.ts');
  assert(source.includes('Deno.serve(handler);'),'ORIGINAL_ENTRYPOINT_CHANGED');
  assert(source.includes("const ref = 'gqyaxsczlmvppxuoqbox'"),'DATABASE_HOST_PIN_CHANGED');
  Deno.env.set('KHATA_DATABASE_URL','postgres://synthetic:synthetic@db.gqyaxsczlmvppxuoqbox.supabase.co/postgres');
  Deno.env.set('ORBIS_CUSTOMER_API_URL','https://auth.example.invalid');
  Deno.env.set('KHATA_DRIVE_RECOVERY_WRAP_KEY','ab'.repeat(32));
  const actors={owner:'44444444-4444-7444-8444-444444444444',
    foreign:'55555555-5555-7555-8555-555555555555'};
  const nativeFetch=globalThis.fetch;
  const nativeServe=Deno.serve;
  let server;
  const stop=new AbortController();
  try {
    globalThis.fetch=async(input,init)=>{
      if(String(input)==='https://auth.example.invalid/api/v1/customer/session'){
        const token=new Headers(init?.headers).get('authorization')?.replace(/^Bearer /,'');
        const actor=actors[token];
        return actor ? Response.json({version:'orbis.customer.v1',customer:{
          orbisIdentityId:actor,displayId:'ORB-U-23456789'}}) : new Response(null,{status:401});
      }
      return nativeFetch(input,init);
    };
    Deno.serve=(handler)=>{
      server=nativeServe({hostname:'127.0.0.1',port:0,onListen(){},signal:stop.signal},handler);
      return server;
    };
    await import('../supabase/functions/orbis-khata-data/index.ts');
    assert(server?.addr?.port>0,'ORIGINAL_MODULE_NATIVE_HTTP_NOT_STARTED');
    const post=async(token,operation,input,version='orbis.khata.data.v1')=>{
      const response=await fetch('http://127.0.0.1:'+server.addr.port+'/',{
        method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
        body:JSON.stringify({version,operation,input})
      });
      return {status:response.status,body:await response.json()};
    };
    await verifyCompanyAndParty(post,sql);
    await verifyRecovery(post,sql,undefined,{preexisting:true});
    console.log('EXECUTED_SUPPLEMENTAL_CASE '+JSON.stringify({
      id:'original-edge-native-deno-module-import',outcome:'PASS',
      observed:'Original TypeScript Edge module imported using Deno ESM, native HTTP, real disposable PostgreSQL, synthetic Central, test-only npm postgres import map'
    }));
  } finally {
    // Force-close only the disposable localhost test listener; a graceful
    // shutdown may wait indefinitely for keep-alive HTTP connections.
    stop.abort();
    console.log('ORIGINAL_DENO_HTTP_ABORT_REQUESTED');
    try {
      if(server)await Promise.race([
        server.finished.catch(error=>{if(!stop.signal.aborted)throw error;}),
        new Promise((_,reject)=>setTimeout(()=>reject(Error('ORIGINAL_DENO_HTTP_CLEANUP_TIMEOUT')),5000)),
      ]);
    } finally {
      // The genuine imported Edge module creates an additional postgres.js
      // pool outside the catalog runner. Leaving it alive prevented CI exit.
      await closeSyntheticPostgres();
      Deno.serve=nativeServe;globalThis.fetch=nativeFetch;
      console.log('ORIGINAL_DENO_INTEGRATION_CLEANUP_COMPLETE');
    }
  }
}
