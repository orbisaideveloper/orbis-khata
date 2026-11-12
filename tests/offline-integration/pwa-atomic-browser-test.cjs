'use strict';
// Real Chromium IndexedDB + nonextractable WebCrypto + atomic transactions.
// Synthetic-only local profile, deleted at the end. No product API calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const runtime = '/root/.orbis-quality-runtime/node_modules';
const {chromium} = require(path.join(runtime,'@playwright/test'));
const ts = require(path.join(runtime,'typescript'));
const root = process.argv[2];
if (!root || !root.endsWith('/orbis-khata')) throw Error('UNEXPECTED_REPO_ROOT');
const files = {
 './protocol':'src/sync/protocol.ts',
 './outbox-state':'src/sync/outbox-state.ts',
 './encrypted-record':'src/sync/encrypted-record.ts',
 './offline-authority':'src/offline-batch/offline-authority.ts',
 './sync-coordinator':'src/offline-batch/sync-coordinator.ts',
 './b-simulated-server':'src/offline-batch/b-simulated-server.ts',
 './pwa-crypto-vault':'src/local-db/pwa-crypto-vault.ts',
 './pwa-atomic-sync-store':'src/offline-integration/pwa-atomic-sync-store.ts',
};
let bundle = '(()=>{"use strict";const modules=Object.create(null);';
for (const [name,rel] of Object.entries(files)) {
 const content=fs.readFileSync(path.join(root,rel),'utf8');
 const output=ts.transpileModule(content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},reportDiagnostics:true});
 assert.equal((output.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,'TRANSPILE_'+rel);
 bundle+='(function(){const module={exports:{}};const exports=module.exports;';
 bundle+='const require=(x)=>{const k="./"+x.split("/").pop();if(!Object.hasOwn(modules,k))throw Error("MODULE_NOT_LOADED:"+k);return modules[k]};';
 bundle+=output.outputText+';modules['+JSON.stringify(name)+']=module.exports;})();';
}
bundle+='globalThis.__khataAtomic=modules})();';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'orbis-atomic-pwa-test-'));
const origin='http://127.0.0.1:49235/index.html';
const vaultName='khata-final-pwa-vault-synthetic';
const queueName='khata-final-pwa-sync-synthetic';
const id='90fd78c8-9696-4f41-b327-83990f08fc01';
async function open(){
 const ctx=await chromium.launchPersistentContext(path.join(profile,'browser'),{headless:true});
 await ctx.route('http://127.0.0.1:49235/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><title>ORBiS synthetic test only</title></html>'}));
 const page=await ctx.newPage(); await page.goto(origin,{waitUntil:'domcontentloaded',timeout:15000});
 await page.addScriptTag({content:bundle}); return {ctx,page};
}
(async()=>{
 let active;
 try {
  assert(fs.existsSync(chromium.executablePath()),'CHROMIUM_NOT_INSTALLED');
  active=await open();
  await active.page.evaluate(async({vaultName,queueName,id})=>{
   const m=globalThis.__khataAtomic;
   const vault=m['./pwa-crypto-vault'].createPwaCryptoVault(indexedDB,crypto,vaultName);
   const key=await vault.keyForAccount('actor-a');
   if(key.extractable) throw Error('KEY_MUST_BE_NONEXTRACTABLE');
   const store=m['./pwa-atomic-sync-store'].createPwaAtomicSyncStore({factory:indexedDB,provider:crypto,key,databaseName:queueName});
   const item=m['./outbox-state'].queueNew({protocolVersion:1,actorId:'actor-a',companyId:'company-a',operationId:id,
    commandType:'fixture-voucher',baseVersion:null,createdAt:'2026-11-12T00:00:00Z',payload:{entityId:'voucher-1',action:'put',amountPaise:5000}});
   if(await store.append(item)!=='created')throw Error('NEW_QUEUE_NOT_SAVED');
   if(await store.append(item)!=='already-present')throw Error('DUPLICATE_ITEM_NOT_DETECTED');
   if((await store.pending('actor-a','company-b')).length!==0)throw Error('COMPANY_QUEUE_LEAK');
   const old=item.envelope;
   try{await store.append(m['./outbox-state'].queueNew({...old,payload:{...old.payload,amountPaise:9000}})); throw Error('IDEMPOTENCY_OVERWRITE')}catch(err){if(String(err).includes('IDEMPOTENCY_OVERWRITE'))throw err}
   const db=await new Promise((ok,bad)=>{const r=indexedDB.open(queueName);r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)});
   const raw=await new Promise((ok,bad)=>{const t=db.transaction('sealed-outbox');const r=t.objectStore('sealed-outbox').getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)});
   if(raw.length!==1||JSON.stringify(raw).includes('voucher-1'))throw Error('OUTBOX_PLAINTEXT_EXPOSED'); db.close();
   const server=m['./b-simulated-server'].createSimulatedKhataServer();
   const result=await m['./sync-coordinator'].syncCompanyOnce({grant:{actorId:'actor-a',allowedCompanyIds:['company-a'],verifiedOnline:true,
    localUnlockVerified:true,revoked:false,validFromMs:1_780_000_000_000,validUntilMs:1_780_000_010_000},actorId:'actor-a',companyId:'company-a',
    nowMs:1_780_000_000_100,store,network:server.forIdentity('actor-a',['company-a']),onlineSessionVerified:true});
   if(result.accepted!==1||result.imported!==1||result.nextCursor!==1)throw Error('SYNC_NOT_DURABLE');
   if((await store.pending('actor-a','company-a')).length!==0)throw Error('RECEIPT_NOT_COMMITTED');
   if((await store.readFeed('actor-a','company-a')).length!==1)throw Error('FEED_NOT_PERSISTED');
   return true;
  },{vaultName,queueName,id});
  await active.ctx.close(); active=undefined;
  active=await open();
  await active.page.evaluate(async({vaultName,queueName})=>{
   const m=globalThis.__khataAtomic;
   const vault=m['./pwa-crypto-vault'].createPwaCryptoVault(indexedDB,crypto,vaultName);
   const key=await vault.keyForAccount('actor-a');
   const store=m['./pwa-atomic-sync-store'].createPwaAtomicSyncStore({factory:indexedDB,provider:crypto,key,databaseName:queueName});
   if(await store.cursor('actor-a','company-a')!==1)throw Error('REOPEN_CURSOR_LOST');
   const feed=await store.readFeed('actor-a','company-a');
   if(feed.length!==1||feed[0].change.amountPaise!==5000)throw Error('REOPEN_ENCRYPTED_FEED_LOST');
   if((await store.pending('actor-a','company-a')).length!==0)throw Error('REOPEN_ACK_LOST');
   const bad={companyId:'company-a',fromCursor:1,nextCursor:2,events:[{...feed[0],serverSeq:2}]};
   try{await store.commitFeedPage('actor-a','company-a',bad);throw Error('DUPLICATE_EVENT_ACCEPTED')}
   catch(err){if(String(err).includes('DUPLICATE_EVENT_ACCEPTED'))throw err}
   if(await store.cursor('actor-a','company-a')!==1)throw Error('NONATOMIC_FEED_CURSOR');
   const b=await vault.keyForAccount('actor-b');
   const other=m['./pwa-atomic-sync-store'].createPwaAtomicSyncStore({factory:indexedDB,provider:crypto,key:b,databaseName:queueName});
   if((await other.pending('actor-b','company-a')).length!==0)throw Error('ACCOUNT_QUEUE_LEAK');
   if((await other.readFeed('actor-b','company-a')).length!==0)throw Error('ACCOUNT_FEED_LEAK');
   const db=await new Promise((ok,bad)=>{const r=indexedDB.open(queueName);r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)});
   await new Promise((ok,bad)=>{const tx=db.transaction('sealed-feed','readwrite');const s=tx.objectStore('sealed-feed');const r=s.getAll();r.onsuccess=()=>{
     const first=r.result[0];first.ciphertext=(first.ciphertext[0]==='A'?'B':'A')+first.ciphertext.slice(1);s.put(first)
   };tx.oncomplete=ok;tx.onabort=()=>bad(tx.error)});db.close();
   try{await store.readFeed('actor-a','company-a');throw Error('TAMPERED_FEED_ACCEPTED')}
   catch(err){if(String(err).includes('TAMPERED_FEED_ACCEPTED'))throw err}
   return true;
  },{vaultName,queueName});
  console.log('PWA_REAL_CHROMIUM_ATOMIC_OUTBOX_AND_RECEIPT: PASS');
  console.log('PWA_REAL_CHROMIUM_ENCRYPTED_FEED_REOPEN: PASS');
  console.log('PWA_REAL_CHROMIUM_DUPLICATE_ROLLBACK_NO_CURSOR_ADVANCE: PASS');
  console.log('PWA_REAL_CHROMIUM_ACCOUNT_COMPANY_ISOLATION_AND_TAMPER_FAIL_CLOSED: PASS');
  console.log('SYNTHETIC_CHROMIUM_STORAGE_TEST_ONLY_NO_PRODUCTION_SYNC');
 } finally {if(active)await active.ctx.close();fs.rmSync(profile,{recursive:true,force:true})}
})().catch(err=>{console.error('PWA_ATOMIC_BROWSER_TEST_FAILED:',err?.message||String(err));process.exitCode=1});
