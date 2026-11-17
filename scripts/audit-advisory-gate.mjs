#!/usr/bin/env node
// Tracks a limited, expiring developer-tool ReDoS advisory, WITHOUT hiding it.
import {spawnSync} from 'node:child_process';
import {evaluateAudit} from './audit-advisory-policy.mjs';
function audit(args=[]) {
  const p=spawnSync('npm',['audit','--json',...args],{encoding:'utf8',maxBuffer:16*1024*1024});
  if(p.error || ![0,1].includes(p.status))throw Error('Audit unavailable: '+(p.error?.message||p.stderr||p.status));
  let data;
  try {data=JSON.parse(p.stdout)} catch {throw Error('Invalid npm audit JSON')}
  if(data.error||!data.metadata?.vulnerabilities||!data.vulnerabilities)throw Error('Incomplete npm audit result');
  return data;
}
try {
  const prod=audit(['--omit=dev']);
  if(Object.keys(prod.vulnerabilities).length)throw Error('Production dependency vulnerability: '+Object.keys(prod.vulnerabilities).join(', '));
  console.log('PRODUCTION AUDIT: PASS (zero production dependency advisories)');
  const verdict=evaluateAudit(audit(),new Date());
  if(!verdict.ok)throw Error(verdict.message);
  if(verdict.exception){
    console.warn('SECURITY ADVISORY OPEN — TIME-LIMITED EXCEPTION, NOT ZERO ISSUES: '+verdict.message);
    console.warn('GHSA-fc5q-39xc-vjpf; no fixed release verified on 2026-11-17; review before 2026-11-25 UTC.');
  }else console.log('FULL DEPENDENCY AUDIT: PASS');
}catch(e){console.error('DEPENDENCY SECURITY GATE: FAIL '+e.message);process.exitCode=1;}
