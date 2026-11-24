import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {assembleRecoveryTransfer} from '../src/sync-v2/recovery-assembly.ts';

export async function provisionTransfer(sql,actor,scopeKind,scopeId,epoch) {
  const registration='recovery-fixture';
  const secret=randomBytes(32).toString('hex');
  const digest=createHash('sha256').update(secret).digest('hex');
  await sql`insert into sync_v2.registered_device values(${actor},${registration},${digest},'android',true,now()+interval '1 hour',null)`;
  await sql`insert into sync_v2.sync_entitlement values(${actor},'sync.single-primary',now()+interval '1 hour')`;
  await sql`insert into sync_v2.device_scope_grant values(${actor},${registration},${scopeKind},${scopeId},${epoch},false)`;
  const open=async (after=null)=>(await sql.begin('isolation level repeatable read',tx=>tx`
    select sync_v2.open_recovery_transfer(${actor}::uuid,${registration},${digest},
      ${scopeKind},${scopeId},${epoch},${after}::bigint) as bundle`))[0].bundle;
  const read=async (t,item,offset,proof=digest)=>(await sql`
    select sync_v2.read_recovery_fragment(${actor}::uuid,${registration},${proof},
      ${t}::uuid,${item},${offset}) as fragment`)[0].fragment;
  async function download(bundle) {
    const started=performance.now();
    let requests=0, largest=0;
    let buffered=[];
    const result=await assembleRecoveryTransfer(bundle,{
      purpose:bundle.purpose,scopeKind,scopeId,epoch,from:bundle.from,
    },async(item,offset)=>{
      if(!buffered.length){
        const [{page}]=await sql`select sync_v2.read_recovery_fragment_page(
          ${actor}::uuid,${registration},${digest},${bundle.transfer}::uuid,${item},${offset},32) as page`;
        buffered=page.fragments;
        assert(buffered.length>0&&buffered.length<=32);
        const bytes=Buffer.byteLength(JSON.stringify(page));
        largest=Math.max(largest,bytes);
        assert(bytes<=65536);
        requests++;
      }
      const fragment=buffered.shift();
      assert.equal(fragment.item,item);
      assert.equal(fragment.offset,offset);
      return fragment;
    });
    assert.equal(buffered.length,0);
    console.log('RECOVERY_METRIC '+JSON.stringify({scopeKind,purpose:bundle.purpose,items:bundle.items,
      dataBytes:bundle.bytes,requests,maxResponseBytes:largest,downloadMs:Math.round(performance.now()-started)}));
    return result;
  }
  return {open,read,download,registration};
}
