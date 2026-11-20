// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { expect, it, vi } from 'vitest';
import { projectSellerRecovery, readSellerRecovery } from '../../supabase/functions/orbis-khata-data/seller-recovery-read';
import { createKhataDataClient } from '../../src/accounting/api';
const request={organizationId:'organization',partyId:'party',occurredAt:'2026-11-16',saleId:'old'};
const sale=(id:string,date:string)=>({id,organizationId:'organization',partyId:'party',reference:id,occurredAt:{$lottery:'date',value:date+'T00:00:00.000Z'},status:'DRAFT',syncVersion:3,dispatchQuantity:1400,morningReturnQuantity:255,dayReturnQuantity:75,eveningReturnQuantity:250,commissionPaise:{$lottery:'bigint',value:'0'}});
const rows=()=>[{kind:'organization',value:{id:'organization',userLedgerStorage:'CLOUD',privateHistory:'x'.repeat(2100000)}},{kind:'party',value:{id:'party',organizationId:'organization'}},{kind:'sale',value:sale('old','2026-11-15')},{kind:'sale',value:sale('current','2026-11-16')}];
it('projects only the selected day and previously linked bill without exporting unrelated history',()=>{
 const snapshot=projectSellerRecovery(rows(),request);
 expect(snapshot.draftSales.map(sale=>sale.id)).toEqual(['current']);
 expect(snapshot.referencedSale?.occurredAt).toBe('2026-11-15');
 expect(JSON.stringify(snapshot).length).toBeLessThan(2000);
 expect(JSON.stringify(snapshot)).not.toContain('privateHistory');
});
it('rejects other-party data, missing ownership and multiple live bills for one day',()=>{
 expect(()=>projectSellerRecovery(rows().slice(1),request)).toThrow('RECOVERY_SCOPE_INVALID');
 const foreign=rows();foreign[3].value={...sale('foreign','2026-11-16'),partyId:'someone-else'} as never;
 expect(()=>projectSellerRecovery(foreign,request)).toThrow('RECOVERY_SCOPE_INVALID');
 expect(()=>projectSellerRecovery([...rows(),{kind:'sale',value:sale('duplicate','2026-11-16')}],request)).toThrow('RECOVERY_AMBIGUOUS');
});
it('uses one bounded read-only statement with verified owner, organization, party and date predicates',async()=>{
 const tx=vi.fn().mockResolvedValue(rows());
 await readSellerRecovery(tx as never,'verified-owner',request);
 const [strings,...params]=tx.mock.calls[0];const sql=strings.join('?');
 expect(sql).toContain('owner_id=');expect(sql).toContain("model='foundationLotterySale'");expect(sql).toContain("value->>'partyId'");expect(sql).toContain('limit 3');
 expect(sql).not.toMatch(/\b(insert|update|delete)\b/iu);expect(params).toContain('verified-owner');expect(params).toContain('2026-11-16');
});
it('reproduces the old full-export response rejection while a bounded recovery response passes',async()=>{
 const snapshot=projectSellerRecovery(rows(),request);
 const fetchImpl=vi.fn().mockResolvedValueOnce(Response.json({data:{state:'x'.repeat(2100000)}})).mockResolvedValueOnce(Response.json({data:{version:1,actor:'actor',snapshot}}));
 const client=createKhataDataClient({url:'https://example.test',token:async()=>'synthetic-token',fetchImpl});
 await expect(client('lottery-export',{})).rejects.toThrow('KHATA_DATA_RESPONSE_INVALID');
 await expect(client('lottery-seller-recovery',request)).resolves.toMatchObject({snapshot});
});

it('executes the actual bounded SQL against PostgreSQL with tenant isolation and read-only results',async()=>{
 const db=new PGlite();
 try {
  await db.exec('create table public.khata_lottery_records(owner_id uuid,model text,id text,value jsonb,ordinal bigint)');
  const owner=crypto.randomUUID(),foreign=crypto.randomUUID();
  const insert=async(actor:string,model:string,value:Record<string,unknown>)=>db.query('insert into public.khata_lottery_records values($1,$2,$3,$4,1)',[actor,model,value.id,JSON.stringify(value)]);
  for(const actor of [owner,foreign]) {
   await insert(actor,'foundationAccountingOrganization',{id:'organization',userLedgerStorage:'CLOUD'});
   await insert(actor,'foundationAccountingParty',{id:'party',organizationId:'organization'});
   for(const [id,day] of [['previous','2026-11-14'],['old','2026-11-15'],['current','2026-11-16']]) await insert(actor,'foundationLotterySale',sale(id,day));
  }
  const tx=async(strings:TemplateStringsArray,...params:unknown[])=>{
   const statement=strings.reduce((text,part,index)=>text+(index?'$'+index:'')+part,'');
   return (await db.query(statement,params)).rows;
  };
  const before=(await db.query('select count(*)::integer as count from public.khata_lottery_records')).rows;
  const snapshot=await readSellerRecovery(tx as never,owner,request);
  expect(snapshot.draftSales.map(s=>s.reference)).toEqual(['current']);expect(snapshot.referencedSale?.reference).toBe('old');
  await expect(readSellerRecovery(tx as never,crypto.randomUUID(),request)).rejects.toThrow('RECOVERY_SCOPE_INVALID');
  expect((await db.query('select count(*)::integer as count from public.khata_lottery_records')).rows).toEqual(before);
 }finally{await db.close();}
},30000);
