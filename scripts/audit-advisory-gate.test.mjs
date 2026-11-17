import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAudit} from './audit-advisory-policy.mjs';
const day=new Date('2026-11-18T00:00:00Z');
const sample=()=>({metadata:{vulnerabilities:{high:2,total:2}},vulnerabilities:{
  picomatch:{isDirect:false,via:[{url:'https://github.com/advisories/GHSA-fc5q-39xc-vjpf'}]},
  vite:{isDirect:true,via:['picomatch']}
}});
test('known dev-only advisory is visible and time-boxed',()=>assert.equal(evaluateAudit(sample(),day).exception,true));
test('unknown advisory always blocks',()=>{const x=sample();x.vulnerabilities.picomatch.via.push({url:'https://github.com/advisories/other'});assert.equal(evaluateAudit(x,day).ok,false)});
test('new package vulnerability blocks',()=>{const x=sample();x.vulnerabilities.other={isDirect:false,via:['picomatch']};assert.equal(evaluateAudit(x,day).ok,false)});
test('exception expires',()=>assert.equal(evaluateAudit(sample(),new Date('2026-11-25T00:00:00Z')).ok,false));
test('zero issues passes cleanly',()=>assert.equal(evaluateAudit({metadata:{vulnerabilities:{total:0}},vulnerabilities:{}},day).exception,false));
test('audit errors block',()=>assert.equal(evaluateAudit({error:'no network'},day).ok,false));
