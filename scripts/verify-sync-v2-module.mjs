import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
import {createModuleRegistry} from '../src/sync-v2/module-registry.ts';

const url=new URL(process.env.KHATA_SYNC_V2_TEST_URL??'http://missing');
assert(url.protocol==='postgres:' && url.hostname==='127.0.0.1' && url.pathname==='/khata_sync_v2_test' && !url.search);
const sql=postgres(url.toString(),{max:5,connection:{statement_timeout:10000}});
const actor='fixture-owner', other='fixture-stranger', kind='fixture-module', scopeId='opaque-scope', epoch='v1';
const command={
  protocolVersion:2,schemaVersion:1,operationId:'ledger-independent-operation',actorId:actor,deviceRegistrationId:'test-device',
  scope:{kind,id:scopeId,epoch},commandType:'fixture-append',entityId:'fixture-parent',children:{line:'fixture-line'},
  dependsOn:[],baseRevision:null,clientSequence:'1',createdAt:'2026-11-24T00:00:00Z',payload:{label:'Synthetic marker'},
};

function mockModule(abort=false) {
  return {
    scopeKind:kind, commandType:command.commandType, schemaVersion:1,
    validate(raw){
      const exact=(id,value)=>typeof id==='string' && /^[a-z0-9-]{1,80}$/u.test(id) && id!==value;
      if(!exact(raw.operationId) || !exact(raw.entityId) || !exact(raw.children?.line,raw.entityId) ||
        Object.keys(raw.children).length!==1 || !Array.isArray(raw.dependsOn) || raw.dependsOn.length ||
        raw.baseRevision!==null || typeof raw.payload?.label!=='string' ||
        Object.keys(raw.payload).length!==1 || raw.payload.label.length>80) throw new Error('FIXTURE_PAYLOAD_INVALID');
      return raw;
    },
    transaction:work=>sql.begin(async tx=>{
      let admitted;
      const output=await work({
        async lockAuthorizedScope(principal,device,scope){
          const [owned]=await tx`select s.actor_id,s.kind,s.scope_id,s.epoch from sync_v2.scope s
           join fixture_module.device d on d.actor_id=s.actor_id and d.active
           where s.actor_id=${principal} and s.kind=${scope.kind} and s.scope_id=${scope.id}
             and s.epoch=${scope.epoch} and s.lifecycle='active' and d.registration=${device}
           for update of s for share of d`;
          if(!owned)throw new Error('FIXTURE_SCOPE_DENIED');
          admitted=owned;
        },
        async findReceipt(operationId){
          return (await tx`select digest,seq::text as sequence,result from sync_v2.receipt
            where actor_id=${admitted.actor_id} and kind=${admitted.kind} and scope_id=${admitted.scope_id}
              and epoch=${admitted.epoch} and operation_id=${operationId}`)[0]??null;
        },
        async assertPreconditions(){},
        async post(input){
          const result={parent:input.entityId,child:input.children.line,label:input.payload.label};
          await tx`insert into fixture_module.marker(actor_id,kind,scope_id,epoch,parent,child,label)
            values(${admitted.actor_id},${admitted.kind},${admitted.scope_id},${admitted.epoch},
              ${result.parent},${result.child},${result.label})`;
          return {result,changes:[{type:'fixture-marker',...result}]};
        },
        async finish(operationId,digest,result,changes){
          const [{seq}]=await tx`select sync_v2.finish(${admitted.actor_id},${admitted.kind},${admitted.scope_id},
           ${admitted.epoch},${operationId},${digest},${tx.json(result)},${tx.json(changes)})::text as seq`;
          return {sequence:seq,digest,result};
        },
      });
      if(abort)throw new Error('FIXTURE_ABORT');
      return output;
    }),
  };
}

try{
  assert.equal((await sql`select count(*)::int as n from information_schema.tables where table_schema='public'`)[0].n,0);
  await sql.unsafe('create role anon; create role authenticated; create role service_role');
  for(const fixture of ['kernel.sql','grouped-feed.sql','module-kind-registry.sql'])
    await sql.unsafe(await readFile('supabase/tests/sync-v2/'+fixture,'utf8'));
  await sql.unsafe(`create schema fixture_module;
    revoke all on schema fixture_module from public;
    create table fixture_module.device(actor_id text,registration text,active boolean,primary key(actor_id,registration));
    create table fixture_module.marker(actor_id text,kind text,scope_id text,epoch text,parent text,child text,label text,
      primary key(actor_id,scope_id,epoch,parent),unique(actor_id,scope_id,epoch,child),
      foreign key(actor_id,kind,scope_id,epoch) references sync_v2.scope(actor_id,kind,scope_id,epoch))`);
  await assert.rejects(sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle)
    values(${actor},${kind},${scopeId},${epoch},'active')`,error=>error.code==='23503');
  await sql`insert into sync_v2.module_scope_kind values(${kind})`;
  await sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle)
    values(${actor},${kind},${scopeId},${epoch},'active'),(${other},'company',${scopeId},${epoch},'active'),
      (${other},'lottery-organization',${scopeId},${epoch},'active')`;
  await sql`insert into fixture_module.device values(${actor},'test-device',true),(${other},'test-device',true)`;
  const module=mockModule();
  assert.throws(()=>createModuleRegistry([module,module]),/SYNC_MODULE_DUPLICATE/);
  const route=createModuleRegistry([module]);
  await assert.rejects(route(actor,{...command,schemaVersion:2}),/SYNC_MODULE_UNSUPPORTED/);
  await assert.rejects(route(actor,{...command,protocolVersion:1}),/SYNC_MODULE_ENVELOPE_INVALID/);
  await assert.rejects(route(actor,{...command,scope:{...command.scope,kind:'company'}}),/SYNC_MODULE_UNSUPPORTED/);
  await assert.rejects(route(other,command),/SYNC_ACTOR_MISMATCH/);
  await assert.rejects(route(other,{...command,actorId:other}),/FIXTURE_SCOPE_DENIED/);
  await assert.rejects(route(actor,{...command,scope:{...command.scope,epoch:'stale'}}),/FIXTURE_SCOPE_DENIED/);
  await assert.rejects(route(actor,{...command,deviceRegistrationId:'forged'}),/FIXTURE_SCOPE_DENIED/);
  await assert.rejects(createModuleRegistry([mockModule(true)])(actor,command),/FIXTURE_ABORT/);
  assert.equal((await sql`select count(*)::int as n from fixture_module.marker`)[0].n,0);
  assert.equal((await sql`select count(*)::int as n from sync_v2.receipt`)[0].n,0);

  const [first,duplicate]=await Promise.all([route(actor,command),route(actor,command)]);
  assert.deepEqual(duplicate,first);
  assert.deepEqual(await route(actor,command),first);
  assert.equal((await sql`select count(*)::int as n from fixture_module.marker`)[0].n,1);
  await assert.rejects(route(actor,{...command,payload:{label:'Changed'}}),/SYNC_OPERATION_DIGEST_MISMATCH/);
  const [{page}]=await sql`select sync_v2.read_grouped_feed(${actor},${kind},${scopeId},${epoch},0,1) as page`;
  assert.equal(page.next,'1');
  assert.deepEqual(page.groups[0].events[0].change,[{type:'fixture-marker',...first.result}]);
  await sql`update fixture_module.device set active=false where actor_id=${actor}`;
  await assert.rejects(route(actor,command),/FIXTURE_SCOPE_DENIED/);
  console.log('PASS: registered synthetic third scope kind, unchanged transactional receipt/feed behavior, rollback, immutable children, version/tenant/device denials.');
}finally{await sql.end({timeout:5});}
