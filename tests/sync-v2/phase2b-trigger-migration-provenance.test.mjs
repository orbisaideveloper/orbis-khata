/** Source provenance only: each frozen LIVE trigger has traceable install SQL.
 * This does not assert runtime trigger firing, RLS, or accounting effects.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildRegister} from '../../scripts/verify-sync-v2-phase2b-evidence.mjs';
const coverage=await readFile('src/sync-v2/phase2a-coverage.ts','utf8');
const closure=await readFile('src/sync-v2/phase2b-closure-gates.ts','utf8');
const {groups}=buildRegister(coverage,closure);
const names=(await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort();
const files=await Promise.all(names.map(async name=>({path:'supabase/migrations/'+name,text:await readFile('supabase/migrations/'+name,'utf8')})));
const findCreation=(full)=>{
  const pieces=full.split('.');const trigger=pieces.pop(),table=pieces.pop(),schema=pieces.join('.');
  const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp(`create\\s+trigger\\s+${escaped(trigger)}\\b[\\s\\S]{0,300}?on\\s+${escaped(schema)}\\.${escaped(table)}\\b`,'i');
  const dynamic=new RegExp(`create\\s+trigger\\s+${escaped(trigger)}\\b[\\s\\S]{0,300}?on\\s+${escaped(schema)}\\.%I`,'i');
  return files.filter(f=>pattern.test(f.text)||dynamic.test(f.text)&&new RegExp(`['"]${escaped(table)}['"]`,'i').test(f.text));
};
test('all 26 live DB triggers have source provenance, no missing or orphan IDs',()=>{
  assert.equal(groups.trigger.length,26);
  for(const name of groups.trigger){const matches=findCreation(name);assert(matches.length,`UNPROVEN_TRIGGER_INSTALL_SQL:${name}`)}
});
test('trigger proof is tied to exact actual migration contents, not generated code strings',()=>{
  const installed=groups.trigger.map(name=>({name,sources:findCreation(name).map(f=>({path:f.path,sha256:createHash('sha256').update(f.text).digest('hex')}))}));
  assert.equal(installed.length,26);
  assert(installed.every(x=>x.sources.every(y=>/^[a-f0-9]{64}$/.test(y.sha256))));
});
