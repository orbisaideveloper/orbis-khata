import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {buildRegister,inspectEvidence} from '../../scripts/verify-sync-v2-phase2b-evidence.mjs';
const sha='de44892cf2292f673fa117a26298fea73c42659e';
const source=await readFile('src/sync-v2/phase2a-coverage.ts','utf8');
const gate=await readFile('src/sync-v2/phase2b-closure-gates.ts','utf8');
const inventory=buildRegister(source,gate);
test('all 64 unique current server-only gates and one future client gate',()=>{
  assert.equal(inventory.required.length,64);
  assert.equal(new Set(inventory.required).size,64);
  assert.deepEqual(inventory.client,['client:staged-client-consumption']);
});
test('global green or empty evidence cannot certify any individual gate',()=>{
  const v=inspectEvidence(inventory,{},sha);
  assert.equal(v.complete,false);assert.equal(v.pending,64);assert.equal(v.reviewed,0);
});
test('reject an invented gate rather than silently ignore',()=>{
  assert.throws(()=>inspectEvidence(inventory,{'rpc:made_up':{}},sha),/UNKNOWN_GATE_ID/);
});
test('reject stale commit, missing artifact digest, or unreviewed assertion',()=>{
  const id=inventory.required[0];
  const receipt={outcome:'PASS',gitSha:sha,caseId:'exact-condition-001',fixture:'company',reviewed:true,reviewer:'QA',
    runUrl:'https://github.com/orbisaideveloper/orbis-khata/actions/runs/45747517375',scriptSha256:'a'.repeat(64),artifactSha256:'b'.repeat(64)};
  for(const patch of [{gitSha:'0'.repeat(40)},{reviewed:false},{artifactSha256:''},{runUrl:'https://example.com/fake'}]){
    const v=inspectEvidence(inventory,{[id]:{...receipt,...patch}},sha);assert.equal(v.reviewed,0)
  }
});
test('one reviewed exact-case proof only certifies itself',()=>{
  const id=inventory.required[0];
  const r=inspectEvidence(inventory,{[id]:{outcome:'PASS',gitSha:sha,caseId:'exact-condition-001',fixture:'company',reviewed:true,reviewer:'QA',runUrl:'https://github.com/orbisaideveloper/orbis-khata/actions/runs/45747517375',scriptSha256:'a'.repeat(64),artifactSha256:'b'.repeat(64)}},sha);
  assert.equal(r.reviewed,1);assert.equal(r.pending,63);assert.equal(r.complete,false);
});
test('source inventory changes must be explicitly re-reviewed',()=>{
  assert.throws(()=>buildRegister(source.replace("  'public.khata_report_v1':", "  'public.khata_fake_rpc': { family: 'ledger', kind: 'read' },\n  'public.khata_report_v1':"),gate),/FROZEN_internal-rpc_COUNT_CHANGED_REVIEW_REQUIRED/);
});

test('the same assertion cannot be reused to falsely certify multiple gates',()=>{
  const receipt={outcome:'PASS',gitSha:sha,caseId:'one-scenario-001',fixture:'company',reviewed:true,reviewer:'QA',
    runUrl:'https://github.com/orbisaideveloper/orbis-khata/actions/runs/45747517375',
    scriptSha256:'a'.repeat(64),artifactSha256:'b'.repeat(64)};
  const v=inspectEvidence(inventory,{[inventory.required[0]]:receipt,[inventory.required[1]]:receipt},sha);
  assert.equal(v.reviewed,1);assert.equal(v.pending,63);
  assert.match(v.verdict[1].reason,/Duplicate assertion/);
});
