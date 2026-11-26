/** Exact server-only Phase 2B ledger. Not a substitute for native PostgreSQL tests.
 * This tool is deliberately fail-closed. A green simulator job cannot invent a
 * case-specific receipt or remove a pending server requirement.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const getConst = (source, name) => {
  const m = source.match(new RegExp(`export const ${name} = (\\{|\\[)`));
  assert(m, `MISSING_SOURCE_REGISTER:${name}`);
  const start = m.index + m[0].length - 1;
  const closing = m[1] === '{' ? '}' : ']';
  let depth=0, quote=null, escaped=false;
  for(let i=start;i<source.length;i++){
    const c=source[i];
    if(quote){if(escaped){escaped=false;continue}if(c==='\\'){escaped=true;continue}if(c===quote)quote=null;continue}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue}
    if(c===m[1])depth++;
    if(c===closing&&--depth===0)return source.slice(start+1,i);
  }
  throw Error(`UNCLOSED_REGISTER:${name}`);
};
const entries = (text) => [...text.matchAll(/^\s*'([^']+)'\s*:/gm)].map(x=>x[1]);
const strings = (text) => [...text.matchAll(/^\s*'([^']+)'\s*,?\s*$/gm)].map(x=>x[1]);
const unique=(list,name)=>{
  const seen=new Set();for(const x of list){assert(!seen.has(x),`DUPLICATE_${name}:${x}`);seen.add(x)}return list;
};
export function buildRegister(coverage, closure){
  const rpc=unique(strings(getConst(coverage,'liveAuthenticatedExecutableFunctions')),'AUTH_RPC');
  const allFunctions=unique(entries(getConst(coverage,'liveBackendFunctionCoverage')),'FUNCTION');
  for(const x of rpc)assert(allFunctions.includes(x),`UNRECOGNIZED_AUTH_RPC:${x}`);
  const internal=allFunctions.filter(x=>!rpc.includes(x));
  const triggers=unique(entries(getConst(coverage,'liveBackendTriggerCoverage')),'TRIGGER');
  const cron=unique(entries(getConst(closure,'schedulerGates')),'CRON');
  const edge=unique(entries(getConst(coverage,'gatewayDirectTableWrites')),'EDGE');
  const cross=unique(entries(getConst(closure,'nonRpcGates')),'SERVER_INVARIANT');
  const client=unique(entries(getConst(closure,'crossClientGates')),'CLIENT');
  const gateEntries=unique(entries(getConst(closure,'authenticatedRpcGates')),'RPC_STATUS');
  assert.deepEqual([...rpc].sort(),[...gateEntries].sort(),'RPC_STATUS_INVENTORY_MISMATCH');
  const groups={rpc, 'internal-rpc':internal,trigger:triggers,cron,edge,gate:cross};
  const required=Object.entries(groups).flatMap(([prefix,names])=>names.map(name=>`${prefix}:${name}`));
  const expected={rpc:19,'internal-rpc':7,trigger:26,cron:4,edge:3,gate:5};
  for(const [k,count] of Object.entries(expected))assert.equal(groups[k].length,count,`FROZEN_${k}_COUNT_CHANGED_REVIEW_REQUIRED`);
  assert.equal(required.length,64,'SERVER_GATE_COUNT_CHANGED');
  assert.equal(client.length,1,'CLIENT_GATE_INVENTORY_CHANGED');
  return {groups,required,client:client.map(n=>`client:${n}`)};
}
const hex=/^[a-f0-9]{40}$/;
const digest=/^[a-f0-9]{64}$/;
export function inspectEvidence(register, submissions, gitSha){
  assert(hex.test(gitSha),'GIT_SHA_REQUIRED');
  assert(submissions && typeof submissions==='object' && !Array.isArray(submissions),'EVIDENCE_RECORD_REQUIRED');
  const known=new Set(register.required);
  for(const key of Object.keys(submissions))assert(known.has(key),`UNKNOWN_GATE_ID:${key}`);
  const usedCases=new Set();
  const verdict=register.required.map(id=>{
    const e=submissions[id];
    if(!e)return {id,status:'BLOCKED',reason:'No independently reviewed exact-case acceptance receipt'};
    const valid=e.outcome==='PASS'&&e.gitSha===gitSha&&hex.test(e.gitSha)&&
      typeof e.caseId==='string'&&e.caseId.length>8&&
      typeof e.fixture==='string'&&e.fixture.length>1&&
      typeof e.reviewer==='string'&&e.reviewer.length>1&&
      e.reviewed===true&&digest.test(e.scriptSha256??'')&&digest.test(e.artifactSha256??'')&&
      /^https:\/\/github\.com\/orbisaideveloper\/orbis-khata\/actions\/runs\/\d+$/.test(e.runUrl??'');
    const caseIdentity=`${e?.runUrl}#${e?.fixture}#${e?.caseId}`;
    if(valid && usedCases.has(caseIdentity))return {id,status:'BLOCKED',reason:'Duplicate assertion reused for another acceptance obligation'};
    if(valid)usedCases.add(caseIdentity);
    return valid?{id,status:'REVIEWED_RECEIPT',runUrl:e.runUrl,caseId:e.caseId}:
      {id,status:'BLOCKED',reason:'Missing, mismatched or unreviewed exact-SHA case receipt'};
  });
  const accepted=verdict.filter(x=>x.status==='REVIEWED_RECEIPT').length;
  return {gitSha,required:verdict.length,reviewed:accepted,pending:verdict.length-accepted,complete:accepted===verdict.length,verdict,clientDeferred:register.client};
}
export async function main(argv=process.argv.slice(2),env=process.env){
  const source=await readFile('src/sync-v2/phase2a-coverage.ts','utf8');
  const closure=await readFile('src/sync-v2/phase2b-closure-gates.ts','utf8');
  const register=buildRegister(source,closure);
  const inputIndex=argv.indexOf('--evidence');
  const evidence=inputIndex>=0?JSON.parse(await readFile(argv[inputIndex+1],'utf8')):{};
  const sha=env.GITHUB_SHA??argv[argv.indexOf('--sha')+1];
  const audit=inspectEvidence(register,evidence,sha);
  const outputIndex=argv.indexOf('--output');
  if(outputIndex>=0)await writeFile(argv[outputIndex+1],JSON.stringify(audit,null,2)+'\n');
  console.log(`PHASE_2B_SERVER_EVIDENCE ${audit.reviewed}/${audit.required} REVIEWED; ${audit.pending} BLOCKED; complete=${audit.complete}`);
  if(argv.includes('--certify')&&!audit.complete)throw Error('PHASE_2B_NOT_CERTIFIED_MISSING_EXACT_CASE_EVIDENCE');
  return audit;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(e=>{console.error(e);process.exitCode=1});
}
