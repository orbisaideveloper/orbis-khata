'use strict';
// Run inside user's existing Ubuntu Playwright Chromium; synthetic data only.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const runtime='/root/.orbis-quality-runtime/node_modules';
const {chromium}=require(path.join(runtime,'@playwright/test'));
const ts=require(path.join(runtime,'typescript'));
const root=process.argv[2];
if (!root||!root.endsWith('/orbis-khata')) throw Error('UNEXPECTED_REPO_ROOT');
const files={
 './protocol':'src/sync/protocol.ts',
 './outbox-state':'src/sync/outbox-state.ts',
 './encrypted-record':'src/sync/encrypted-record.ts',
 './durable-outbox':'src/sync/durable-outbox.ts',
 './indexeddb-port':'src/sync/indexeddb-port.ts',
 './pwa-crypto-vault':'src/local-db/pwa-crypto-vault.ts',
 './offline-backend':'src/local-db/offline-backend.ts',
};
let source='(()=>{"use strict";const modules=Object.create(null);';
for(const [name,rel] of Object.entries(files)){
  const tsIn=fs.readFileSync(path.join(root,rel),'utf8');
  const out=ts.transpileModule(tsIn,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},reportDiagnostics:true});
  assert.equal((out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,'TRANSPILE_'+rel);
  source+='(function(){const module={exports:{}};const exports=module.exports;';
  source+='const require=(x)=>{const k=x.startsWith("../sync/")?"./"+x.split("/").pop():x;if(!Object.hasOwn(modules,k))throw Error("MODULE_NOT_LOADED:"+k);return modules[k]};';
  source+=out.outputText+';modules['+JSON.stringify(name)+']=module.exports;})();';
}
source+='globalThis.__offline=modules})();';
const profileRoot=fs.mkdtempSync(path.join(os.tmpdir(),'orbis-pwa-vault-test-'));
const origin='http://127.0.0.1:49231/index.html';
const vaultName='khata-st3-pwa-vault-synthetic';
const queueName='khata-st3-pwa-queue-synthetic';
async function open(){
 const ctx=await chromium.launchPersistentContext(path.join(profileRoot,'persistent'),{headless:true});
 await ctx.route('http://127.0.0.1:49231/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><title>test-only</title></html>'}));
 const page=await ctx.newPage();await page.goto(origin,{waitUntil:'domcontentloaded',timeout:15000});
 await page.addScriptTag({content:source});return {ctx,page};
}
(async()=>{
 let active;
 try{
  assert(fs.existsSync(chromium.executablePath()),'CHROMIUM_NOT_INSTALLED');
  active=await open();
  const initial=await active.page.evaluate(async ({vaultName,queueName})=>{
   const m=globalThis.__offline;
   const vault=m['./pwa-crypto-vault'].createPwaCryptoVault(indexedDB,crypto,vaultName);
   const key=await vault.keyForAccount('actor_one');
   if(key.extractable)throw Error('KEY_EXTRACTABLE');
   const second=await vault.keyForAccount('actor_two');
   if(key===second)throw Error('CROSS_ACCOUNT_SAME_KEY');
   const a=await vault.keyForAccount('actor_one');
   const bytes=new TextEncoder().encode('synthetic-not-customer');
   const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv:new Uint8Array(12)},a,bytes);
   try{await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(12)},second,cipher);throw Error('CROSS_ACCOUNT_DECRYPTED')}catch(e){if(String(e).includes('CROSS_ACCOUNT_DECRYPTED'))throw e}
   const item=m['./outbox-state'].queueNew({protocolVersion:1,actorId:'actor_one',companyId:'company_a',operationId:'33333333-3333-4333-8333-333333333333',commandType:'voucher-post',baseVersion:null,createdAt:'2026-11-11T10:00:00.000Z',payload:{amountMinor:'50000',note:'synthetic-private'}});
   const q=await m['./offline-backend'].createBrowserPwaOfflineOutbox('actor_one',{platform:'web',factory:indexedDB,cryptoProvider:crypto,vaultName,queueName});
   if(await q.append(item)!=='created')throw Error('APPEND');
   const dbPort=m['./indexeddb-port'].createIndexedDbQueuePort(indexedDB,queueName);
   const record=await dbPort.get(JSON.stringify(['actor_one','company_a',item.envelope.operationId]));
   if(!record||JSON.stringify(record).includes('synthetic-private'))throw Error('PLAINTEXT_AT_REST');
   if((await q.list('actor_one','company_a')).length!==1)throw Error('WRONG_COMPANY_COUNT');
   if((await q.list('actor_one','company_b')).length!==0)throw Error('COMPANY_LEAK');
   return {ok:true};
  },{vaultName,queueName});
  assert(initial.ok);
  await active.ctx.close();active=undefined;
  active=await open();
  const recovered=await active.page.evaluate(async ({vaultName,queueName})=>{
   const m=globalThis.__offline;
   const q=await m['./offline-backend'].createBrowserPwaOfflineOutbox('actor_one',{platform:'web',factory:indexedDB,cryptoProvider:crypto,vaultName,queueName});
   const rows=await q.list('actor_one','company_a');
   if(rows.length!==1||rows[0].envelope.payload.note!=='synthetic-private')throw Error('PERSISTED_KEY_LOST');
   if(await q.append(rows[0])!=='already-present')throw Error('DUPLICATE_CREATED');
   const b=await m['./offline-backend'].createBrowserPwaOfflineOutbox('actor_two',{platform:'web',factory:indexedDB,cryptoProvider:crypto,vaultName,queueName});
   if((await b.list('actor_two','company_a')).length!==0)throw Error('CROSS_ACCOUNT_QUEUE_LEAK');
   return true;
  },{vaultName,queueName});
  assert(recovered);
  console.log('PWA_CHROMIUM_KEY_NONEXTRACTABLE: PASS');
  console.log('PWA_CHROMIUM_CIPHERTEXT_ONLY_PERSISTED: PASS');
  console.log('PWA_CHROMIUM_REOPEN_SAME_PROFILE_DECRYPT: PASS');
  console.log('PWA_COMPANY_ISOLATION_DUPLICATE_AND_ACCOUNT_BOUNDARY: PASS');
  console.log('SYNTHETIC_BROWSER_TEST_ONLY; NO LIVE_FINANCE_OR_ANDROID_SQLCIPHER');
 }finally{
  if(active)await active.ctx.close();
  fs.rmSync(profileRoot,{recursive:true,force:true});
 }
})().catch(err=>{console.error('PWA_BROWSER_TEST_FAILED:',err?.message||String(err));process.exitCode=1});
