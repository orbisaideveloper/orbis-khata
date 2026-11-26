import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const day='2026-10-01';
const abort=Symbol('fixture rollback');

// Only called by the catalog runner after installing real migrations in an empty disposable PG17 instance.
export async function verifyTriggerBehavior(sql, onCombinedDatasetReady = undefined) {
  const owner=randomUUID(),other=randomUUID(),company=randomUUID(),foreign=randomUUID();
  const actor='11111111-1111-7111-8111-111111111111',party=randomUUID(),expenseParty=randomUUID(),item=randomUUID();
  const warehouse=randomUUID(),destination=randomUUID(),bill=randomUUID(),openingExpense=randomUUID();
  const purchase=randomUUID(),reverse=randomUUID(),transfer=randomUUID();
  const gate=(id,observed)=>console.log('EXECUTED_CASE '+JSON.stringify({id,observed,outcome:'PASS'}));

  await sql`grant usage on schema auth to authenticated`;
  await sql`insert into auth.users(id) values(${owner}),(${other})`;
  await sql`insert into orbis_khata.ledger_owners(id,legacy) values(${owner},false),(${other},false)`;
  await sql`insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference)
    values(${actor},${owner},'disposable-trigger-fixture')`;
  await sql`insert into public.khata_companies(id,owner_id,name)
    values(${company},${owner},'Synthetic books'),(${foreign},${other},'Isolated books')`;

  const session=async(sub,work,rollback=false,role='authenticated')=>{
    try {
      return await sql.begin(async tx=>{
        await tx`select set_config('request.jwt.claims',${JSON.stringify({sub,role:'authenticated'})},true),
          set_config('orbis.khata.gateway_verified','v1',true)`;
        if(role==='authenticated') await tx`set local role authenticated`;
        const value=await work(tx);
        if(rollback) throw abort;
        return value;
      });
    } catch(error) {
      if(error!==abort) throw error;
    }
  };
  const revision=async(id=company,conn=sql)=>(await conn`select revision::int from public.khata_report_revisions where company_id=${id}`)[0].revision;
  const revisionCase=async(names,delta,write)=>{
    const before=await revision(),unrelated=await revision(foreign);
    await session(owner,write,true);
    assert.equal(await revision(),before,'Rollback must also restore report revision');
    await session(owner,write);
    assert.equal(await revision(),before+delta);
    assert.equal(await revision(foreign),unrelated);
    for(const name of names) gate('trigger:public.'+name+'.khata_report_revision_watch','Exact committed revision delta, rollback and foreign company isolation');
  };
  const asOwner=(work,rollback=false)=>session(owner,work,rollback);
  const changed=await revision();
  assert.equal(changed,1);
  await session(owner,tx=>tx`update public.khata_companies set name='Rollback company title' where id=${company}`,true,'fixture');
  assert.equal(await revision(),1);
  await sql`update public.khata_companies set name='Renamed synthetic books' where id=${company}`;
  assert.equal(await revision(),2);
  assert.equal(await revision(foreign),1);
  gate('trigger:public.khata_companies.khata_report_revision_watch','Company insert initializes revision; update increments once, rollback and foreign revision unchanged');

  const saveParty=(tx,id,name,more={})=>tx`select public.khata_master_save_v2('party',${tx.json({
    id,company,name,kind:'both',opening_side:'none',opening_amount:'0',opening_account:'receivable',...more,
  })}::jsonb)`;
  await revisionCase(['khata_parties'],1,tx=>saveParty(tx,party,'Supplier and customer'));
  await asOwner(tx=>saveParty(tx,expenseParty,'Opening rent',{
    kind:'expense',opening_side:'due',opening_amount:'400',opening_date:day,
  }));

  const inventory=(id,kind,more={})=>({id,kind,company,date:day,code:'',name:'',unit:'',
    party:null,reference:'',note:'Synthetic inventory reason',lines:[],...more});
  const inventoryPost=(tx,input)=>tx`select public.khata_inventory_post_v1(${tx.json(input)}::jsonb) as id`;
  await revisionCase(['khata_inventory_documents','khata_items'],2,
    tx=>inventoryPost(tx,inventory(item,'item',{code:'FEED',name:'Feed',unit:'bag'})));
  await revisionCase(['khata_warehouses'],2,
    tx=>inventoryPost(tx,inventory(warehouse,'warehouse',{code:'MAIN',name:'Main'})));
  await asOwner(tx=>inventoryPost(tx,inventory(destination,'warehouse',{code:'DEST',name:'Destination'})));
  const line=(amount,more={})=>({item,warehouse,to:null,quantity:amount,rate:'0',...more});
  const opening=randomUUID();
  await revisionCase(['khata_stock_movements'],2,tx=>inventoryPost(tx,inventory(opening,'opening',{lines:[line('5000000')]})));

  const expense={id:bill,company,date:day,kind:'charge',amount:'125',category:'Rent',payee:'',
    method:'cash',parent:null,reference:'',note:''};
  const lines=[{description:'Rent',quantity:'1000000',unit:'',rate:'125'}];
  const expenseBill=(tx,input=expense,details=lines)=>tx`select public.khata_expense_bill_v2(${tx.json(input)}::jsonb,${tx.json(details)}::jsonb) as id`;
  await revisionCase(['khata_expense_events'],1,tx=>expenseBill(tx));
  const expenseHead=await revision();
  assert.equal((await asOwner(tx=>expenseBill(tx)))[0].id,bill);
  assert.equal(await revision(),expenseHead);
  await assert.rejects(session(other,tx=>expenseBill(tx)),/COMPANY_NOT_ACCESSIBLE/);
  await assert.rejects(asOwner(tx=>expenseBill(tx,{...expense,id:randomUUID()},[{...lines[0],rate:'124'}])),/INVALID_EXPENSE_TOTAL/);
  const [postedExpense]=await sql`select e.amount_minor::text as amount,l.lines from public.khata_expense_events e
    join public.khata_expense_bill_lines l on l.id=e.id where e.id=${bill}`;
  assert.deepEqual(postedExpense,{amount:'125',lines});
  gate('rpc:public.khata_expense_bill_v2','Exact expense+line values, idempotency, wrong-owner denial, invalid total and rollback');

  const openingPayment={...expense,id:openingExpense,kind:'payment',amount:'150',parent:expenseParty};
  const expensePost=(tx,input)=>tx`select public.khata_expense_post_v2(${tx.json(input)}::jsonb) as id`;
  await revisionCase(['khata_opening_expense_payments'],1,tx=>expensePost(tx,openingPayment));
  assert.equal((await sql`select amount_minor::text as amount from public.khata_opening_expense_payments where id=${openingExpense}`)[0].amount,'150');
  const openingHead=await revision();
  assert.equal((await asOwner(tx=>expensePost(tx,openingPayment)))[0].id,openingExpense);
  await assert.rejects(asOwner(tx=>expensePost(tx,{...openingPayment,id:randomUUID(),amount:'251'})),/EXPENSE_OVERPAYMENT/);
  await assert.rejects(session(other,tx=>expensePost(tx,openingPayment)),/COMPANY_NOT_ACCESSIBLE/);
  assert.equal(await revision(),openingHead);
  gate('rpc:public.khata_expense_post_v2','Opening payable settlement retains exact 150, repeat is idempotent, overpayment and cross-company denied, transaction abort verified');

  const purchaseInput=inventory(purchase,'purchase',{party,lines:[line('2000000',{rate:'250'})]});
  await revisionCase(['khata_vouchers'],3,tx=>inventoryPost(tx,purchaseInput));
  const voucher=(tx,identity,kind,amount,reverses=null)=>tx`select public.khata_post_v1(${identity}::uuid,${company}::uuid,
    ${party}::uuid,${kind},${day}::date,${amount},'cash','','Synthetic voucher',${reverses}::uuid) as id`;
  await revisionCase(['khata_stock_reversals'],2,tx=>voucher(tx,reverse,'reversal','500',purchase));
  assert.deepEqual(Array.from(await sql`select original_id,quantity::text from public.khata_stock_reversals where voucher_id=${reverse}`),
    [{original_id:purchase,quantity:'-2000000'}]);
  const stock=async()=>Object.fromEntries((await sql`select warehouse_id,sum(quantity)::text as quantity
    from public.khata_stock_journal where company_id=${company} group by warehouse_id`).map(r=>[r.warehouse_id,r.quantity]));
  assert.deepEqual(await stock(),{[warehouse]:'5000000'});
  assert.equal((await asOwner(tx=>voucher(tx,reverse,'reversal','500',purchase)))[0].id,reverse);
  assert.equal((await sql`select count(*)::int as n from public.khata_stock_reversals where voucher_id=${reverse}`)[0].n,1);
  await assert.rejects(session(other,tx=>voucher(tx,randomUUID(),'receipt','500')),/COMPANY_NOT_ACCESSIBLE/);
  await assert.rejects(asOwner(tx=>voucher(tx,randomUUID(),'reversal','499',purchase)),/INVALID_REVERSAL|ALREADY_REVERSED/);
  assert.equal((await sql`select count(*)::int as n from public.khata_vouchers where company_id=${company}`)[0].n,2);
  gate('rpc:public.khata_post_v1','Exact reversal voucher and stock lineage, replay, invalid second reversal and foreign denial');
  gate('trigger:public.khata_vouchers.inventory_voucher_reversal','Exact inverse quantity and source ID; replay produces one row; rolled-back reversal restores revision');

  const movement=inventory(transfer,'transfer',{lines:[line('1000000',{to:destination})]});
  const beforeTransfer=await revision();
  await assert.rejects(asOwner(tx=>inventoryPost(tx,{...movement,lines:[line('6000000',{to:destination})]})),/INSUFFICIENT_STOCK/);
  assert.equal(await revision(),beforeTransfer);
  assert.deepEqual(await stock(),{[warehouse]:'5000000'});
  await asOwner(tx=>inventoryPost(tx,movement),true);
  assert.deepEqual(await stock(),{[warehouse]:'5000000'});
  assert.equal(await revision(),beforeTransfer);
  // Direct INSERT probes bind an insufficient-stock result to the actual BEFORE INSERT trigger.
  await assert.rejects(sql`insert into public.khata_inventory_documents(id,company_id,kind,effective_date,payload,actor_id)
    values(${randomUUID()},${company},'transfer',${day},${sql.json({...movement,lines:[line('6000000',{to:destination})]})},${owner})`,
  error=>error.where?.includes('guard_warehouse_transfer')&&error.message==='INSUFFICIENT_STOCK');
  assert.equal((await asOwner(tx=>inventoryPost(tx,movement)))[0].id,transfer);
  assert.equal((await asOwner(tx=>inventoryPost(tx,movement)))[0].id,transfer);
  assert.deepEqual(await stock(),{[warehouse]:'4000000',[destination]:'1000000'});
  assert.equal(await revision(),beforeTransfer+3);
  gate('trigger:public.khata_inventory_documents.khata_warehouse_transfer_guard','Direct trigger denial and authenticated transfer, exact source/destination totals and rollback');
  gate('rpc:public.khata_inventory_post_v1','Warehouse/item/opening/purchase/transfer calls under authenticated role, exact stock, replay, insufficient stock and rollback');

  await verifyImmutableRows(sql,company,revision,gate);
  await verifyMasterGuards(sql,session,{owner,other,company,party,item},revision,gate);
  await verifyReadouts(session,{owner,other,company,party,expenseParty,item,bill,openingExpense,purchase,reverse,warehouse,destination},revision,gate);
  await verifyLegacyExpense(sql,session,{owner,other,company},revision,gate);
  await verifyMasterLifecycle(sql,session,{owner,other,company},revision,gate);
  await verifyProductionReversal(sql,session,{owner,other,company,party,item,warehouse},gate);
  await verifyStatementBridge(sql,session,{owner,other,actor},gate);
  await verifyLifecycleAndPurge(sql,session,{owner,other,company},gate);
  await verifyExpenseProfiles(sql,session,{owner,other,company},gate);
  await verifyLotteryStore(sql,session,{owner,other},gate);
  // Caller may add synthetic concurrent legacy/v2 writes AFTER all 26 trigger effects
  // have been checked against this same still-live tenant/dataset.
  if (onCombinedDatasetReady) await onCombinedDatasetReady({sql,session,owner,other,company,party,actor,gate});
}

async function verifyImmutableRows(sql,company,revision,gate) {
  const fixtures=[
    ['khata_expense_bill_lines','immutable','IMMUTABLE_EXPENSE'],
    ['khata_expense_events','expense_immutable','IMMUTABLE_EXPENSE'],
    ['khata_inventory_documents','inventory_immutable','IMMUTABLE_INVENTORY'],
    ['khata_opening_expense_payments','immutable','IMMUTABLE_EXPENSE'],
    ['khata_stock_movements','inventory_immutable','IMMUTABLE_INVENTORY'],
    ['khata_stock_reversals','inventory_immutable','IMMUTABLE_INVENTORY'],
    ['khata_vouchers','khata_voucher_validate','IMMUTABLE_VOUCHER'],
    ['khata_warehouses','inventory_immutable','IMMUTABLE_INVENTORY'],
  ];
  const expectedRevision=await revision();
  const exactGuards={
    khata_expense_events:'khata_expense_immutable()',
    khata_vouchers:'khata_validate_voucher()',
  };
  for(const [table,trigger,error] of fixtures) {
    const rows=()=>sql`select to_jsonb(t)::text as value from public.${sql(table)} t
      where company_id=${company} order by 1`;
    const before=await rows();
    assert(before.length>0,table);
    await assert.rejects(sql`update public.${sql(table)} set company_id=company_id where company_id=${company}`,failure=>
      failure.message===error&&(!exactGuards[table]||failure.where?.includes(exactGuards[table])));
    await assert.rejects(sql`delete from public.${sql(table)} where company_id=${company}`,new RegExp(error));
    assert.deepEqual(await rows(),before);
    assert.equal(await revision(),expectedRevision);
    gate(`trigger:public.${table}.${trigger}`,'UPDATE and DELETE rejected; exact original contents and revision preserved');
  }
  for(const routine of Object.values(exactGuards)) {
    const [grant]=await sql`select has_function_privilege('authenticated',${'public.'+routine},'EXECUTE') as allowed`;
    assert.equal(grant.allowed,false);
    gate('internal-rpc:public.'+routine.slice(0,-2),'Native mutation reached the named PL/pgSQL guard; authenticated direct EXECUTE absent');
  }
}

async function verifyMasterGuards(sql,session,{owner,other,company,party,item},revision,gate) {
  const mutation=(tx,entity,id)=>tx`select public.khata_master_delete_v2(${entity},${company}::uuid,${id}::uuid)`;
  const before=await revision();
  await assert.rejects(session(owner,tx=>mutation(tx,'party',party)),/PARTY_IN_USE/);
  await assert.rejects(session(owner,tx=>mutation(tx,'item',item)),/ITEM_IN_USE/);
  await assert.rejects(session(other,tx=>mutation(tx,'party',party)),/COMPANY_NOT_ACCESSIBLE/);
  for(const [table,id] of [['khata_parties',party],['khata_items',item]]) {
    const updated=tx=>tx`update public.${sql(table)} set name='Audited change' where id=${id}`;
    await session(owner,updated,true,'fixture');
    assert.equal(await revision(),before+(table==='khata_items'?1:0));
    await session(owner,updated,false,'fixture');
    assert.deepEqual(Array.from(await sql`select operation,actor_id,new_row->>'name' as name from public.khata_master_audit
      where entity_id=${id}`),[{operation:'UPDATE',actor_id:owner,name:'Audited change'}]);
    gate(`trigger:public.${table}.master_guard`,'In-use delete denied; valid edit produces one actor-scoped audit row; rolled-back edit leaves no record');
  }
  assert.equal(await revision(),before+2);
  const auditRows=await sql`select id from public.khata_master_audit where company_id=${company}`;
  assert.equal(auditRows.length,2);
  await assert.rejects(sql`update public.khata_master_audit set operation='DELETE' where company_id=${company}`,/IMMUTABLE_EXPENSE/);
  await assert.rejects(sql`delete from public.khata_master_audit where company_id=${company}`,/IMMUTABLE_EXPENSE/);
  assert.deepEqual(await sql`select id from public.khata_master_audit where company_id=${company}`,auditRows);
  gate('trigger:public.khata_master_audit.immutable','Native audit mutation and deletion fail, original rows remain');
}

async function verifyReadouts(session,{owner,other,company,party,expenseParty,item,bill,openingExpense,purchase,reverse,warehouse,destination},revision,gate) {
  const expectOwnerRead=async(name,read,check)=>{
    const before=await revision();
    await check((await session(owner,read))[0].value);
    await assert.rejects(session(other,read),/COMPANY_NOT_ACCESSIBLE/);
    assert.equal(await revision(),before);
    gate('rpc:public.'+name,'Authenticated values reconcile to source rows; foreign principal denied and revision unchanged');
  };
  await expectOwnerRead('khata_party_balance_v2',
    tx=>tx`select public.khata_party_balance_v2(${company}::uuid,${expenseParty}::uuid,${day},'expense') as value`,
    value=>assert.equal(value,'250'));
  await expectOwnerRead('khata_report_v1',tx=>tx`select public.khata_report_v1(${company}::uuid,${day},${day},${party}::uuid,0) as value`,value=>{
    assert.equal(value.count,2);
    assert.equal(value.entries.find(row=>row.id===purchase)?.amount_minor,'500');
    assert.equal(value.entries.find(row=>row.id===reverse)?.reverses_id,purchase);
    assert.equal(value.ledger_balances.payable.closing,'0');
  });
  await expectOwnerRead('khata_report_revision_v1',tx=>tx`select public.khata_report_revision_v1(${company}::uuid) as value`,
    async value=>assert.equal(value,String(await revision())));
  await expectOwnerRead('khata_masters_v2',tx=>tx`select public.khata_masters_v2(${company}::uuid) as value`,value=>{
    assert.deepEqual(value.items.map(r=>r.id),[item]);
    assert(value.parties.some(r=>r.id===party&&r.company===company));
  });
  await expectOwnerRead('khata_inventory_report_v1',tx=>tx`select public.khata_inventory_report_v1(${company}::uuid,${day},${day},0) as value`,value=>{
    assert.deepEqual(Object.fromEntries(value.stocks.map(row=>[row.warehouse,row.closing])),
      {[warehouse]:'4000000',[destination]:'1000000'});
  });
  await expectOwnerRead('khata_expense_report_v1',tx=>tx`select public.khata_expense_report_v1(${company}::uuid,${day},${day},0) as value`,value=>{
    assert.equal(value.entries.find(row=>row.id===bill)?.amount,'125');
  });
  await expectOwnerRead('khata_expense_report_v2',tx=>tx`select public.khata_expense_report_v2(${company}::uuid,${day},${day},0) as value`,value=>{
    assert.equal(value.entries.find(row=>row.id===openingExpense)?.amount,'150');
    assert.equal(value.entries.find(row=>row.id===bill)?.bill_lines[0].rate,'125');
  });
}

async function verifyProductionReversal(sql,session,{owner,other,company,party,item,warehouse},gate) {
  const work=(tx,input)=>tx`select public.khata_workspace_v3(${tx.json({company,...input})}::jsonb) as value`;
  const [{value:settings}]=await session(owner,tx=>work(tx,{action:'settings'}));
  await session(owner,tx=>work(tx,{action:'settings-save',settings:{...settings,production:true}}));
  const id=randomUUID(), correction=randomUUID();
  const bill={id,company,kind:'purchase',date:day,code:'',name:'',unit:'',party,reference:'',note:'Synthetic routed purchase',
    lines:[{item,warehouse,to:null,quantity:'2000000',rate:'250'}]};
  const post={action:'invoice-save',production:true,command:{company,action:'bill',bill,paid:'100',account:'cash',roundoff:'0'}};
  const {posted,calls}=await session(owner,async tx=>{
    await tx`set local track_functions='pl'`;
    await tx`set local role authenticated`;
    const [{value}]=await work(tx,post);
    await tx`reset role`;
    const calls=await tx`select funcname,calls::int from pg_stat_xact_user_functions where schemaname='public'`;
    return {posted:value,calls};
  },false,'fixture');
  for(const routine of ['khata_workspace_v3_before_production','khata_workspace_v3_legacy','khata_workspace_v3_numbered']) {
    const found=calls.find(row=>row.funcname===routine);
    assert(found?.calls>0,`Real routed invoice did not execute ${routine}`);
    const [grant]=await sql`select has_function_privilege('authenticated',${'public.'+routine+'(jsonb)'},'EXECUTE') as allowed`;
    assert.equal(grant.allowed,false);
    gate('internal-rpc:public.'+routine,`Native transaction recorded ${found.calls} calls via routed invoice; direct authenticated grant absent`);
  }
  const [route]=await sql`select input_id from public.khata_production_routes where company_id=${company} and invoice_id=${id}`;
  assert(route?.input_id);
  assert.deepEqual((await session(owner,tx=>work(tx,post)))[0].value,posted);
  const command={action:'correct',id:correction,target:id,type:'voucher',reason:'Synthetic correction',replacement:null};
  const effects=()=>sql`select r.original_id,r.quantity::text,r.ordinal from public.khata_stock_reversals r
    join public.khata_vouchers v on v.id=r.voucher_id and v.company_id=r.company_id
    where r.company_id=${company} and v.reverses_id=${id} order by r.ordinal`;
  await assert.rejects(session(other,tx=>work(tx,command)),/COMPANY_NOT_ACCESSIBLE/);
  await session(owner,tx=>work(tx,command),true);
  assert.equal((await effects()).length,0);
  const first=(await session(owner,tx=>work(tx,command)))[0].value;
  assert.deepEqual((await session(owner,tx=>work(tx,command)))[0].value,first);
  const rows=await effects();
  assert.deepEqual(rows.map(r=>[r.original_id,r.quantity]),[[id,'-2000000'],[route.input_id,'2000000']]);
  assert.equal(new Set(rows.map(r=>r.ordinal)).size,2);
  const [settlement]=await sql`select count(*)::int as valid from public.khata_payment_links p
    join public.khata_vouchers v on v.reverses_id=p.id and v.company_id=p.company_id
    where p.company_id=${company} and p.bill_id=${id} and v.amount_minor=100`;
  assert.equal(settlement.valid,1);
  gate('trigger:public.khata_vouchers.khata_production_purchase_reverse','Native correction reverses routed production and purchase independently; exact quantities, settlement reversal, rollback and replay');
  gate('rpc:public.khata_workspace_v3','Authenticated routed/paid purchase, real correction, rollback, error isolation and exact idempotent replay');
}

async function verifyStatementBridge(sql,session,{owner,other,actor},gate) {
  const recipientDisplay='ORB-U-ABCDEFGH';
  const recipientActor='22222222-2222-7222-8222-222222222222';
  const org='synthetic-relay-organization',party='synthetic-relay-party',link=randomUUID();
  const foreignActor='33333333-3333-7333-8333-333333333333',foreignLink=randomUUID();
  // Fixture owner/foreign bookkeeping seeded separately from the relay metadata.
  await sql`insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference)
    values(${foreignActor},${other},'disposable-foreign-relay')`;
  for(const account of [owner,other]) {
    await sql`insert into public.khata_lottery_state(owner_id) values(${account})`;
    await sql`insert into public.khata_lottery_records(owner_id,model,id,value) values
      (${account},'foundationAccountingOrganization',${org},${sql.json({id:org,name:'Synthetic org',status:'ACTIVE'})}),
      (${account},'foundationAccountingParty',${party},${sql.json({id:party,name:'Synthetic party',organizationId:org})})`;
  }
  const accounting=()=>sql`select owner_id,model,id,value from public.khata_lottery_records
    where id in (${org},${party}) order by owner_id,model,id`;
  const before=await accounting();
  const seed=(tx,id,account)=>tx`insert into orbis_khata.lottery_party_shares
    (id,owner_id,organization_id,party_id,recipient_display_id)
    values(${id},${account},${org},${party},${recipientDisplay})`;
  await session(owner,tx=>seed(tx,link,owner),true,'fixture');
  assert.equal((await sql`select id from orbis_khata.statement_links where id=${link}`).length,0);
  await seed(sql,link,owner);
  await seed(sql,foreignLink,other);
  const statuses=async()=>{
    const [row]=await sql`select l.status as current,s.status as legacy,l.owner_identity,s.recipient_identity_id
      from orbis_khata.statement_links l join orbis_khata.lottery_party_shares s using(id)
      where l.id=${link}`;
    return row;
  };
  assert.deepEqual(await statuses(),{current:'pending',legacy:'pending',owner_identity:actor,recipient_identity_id:null});
  const accept=tx=>tx`update orbis_khata.statement_links set status='accepted',recipient_identity=${recipientActor} where id=${link}`;
  await assert.rejects(session(other,accept),/permission denied/);
  await session(owner,accept,true,'fixture');
  assert.equal((await statuses()).legacy,'pending');
  await accept(sql);
  assert.deepEqual(await statuses(),{current:'accepted',legacy:'accepted',owner_identity:actor,recipient_identity_id:recipientActor});
  gate('trigger:orbis_khata.statement_links.statement_permission_to_legacy','Matching acceptance copies status/recipient, unauthorized UPDATE denied and rolled-back status unchanged');
  await sql`insert into orbis_khata.statement_mailbox(link_id,revision,base,patch) values(${link},1,0,'{}')`;
  const revoke=tx=>tx`update orbis_khata.lottery_party_shares set status='revoked' where id=${link}`;
  await session(owner,revoke,true,'fixture');
  assert.equal((await statuses()).current,'accepted');
  assert.equal((await sql`select link_id from orbis_khata.statement_mailbox where link_id=${link}`).length,1);
  await revoke(sql);
  assert.equal((await statuses()).current,'revoked');
  assert.equal((await sql`select status from orbis_khata.statement_links where id=${foreignLink}`)[0].status,'pending');
  assert.equal((await sql`select link_id from orbis_khata.statement_mailbox where link_id=${link}`).length,0);
  assert.deepEqual(await accounting(),before);
  gate('trigger:orbis_khata.lottery_party_shares.statement_permission_from_legacy','Creates matching relay, revocation removes its mailbox, leaves foreign permission and financial rows intact; rollback tested');
}

async function verifyLegacyExpense(sql,session,{owner,other,company},revision,gate) {
  const base={id:randomUUID(),company,date:day,kind:'charge',amount:'700',category:'Synthetic payable',
    payee:'',method:null,parent:null,reference:'',note:'Synthetic legacy expense'};
  const payment={...base,id:randomUUID(),kind:'payment',amount:'300',method:'bank',parent:base.id};
  const reversal={...payment,id:randomUUID(),kind:'reversal',method:null,parent:payment.id};
  const post=(tx,input)=>tx`select public.khata_expense_post_v1(${tx.json(input)}::jsonb) as id`;
  const view=()=>sql`select id,amount_minor::text,parent_id,reverses_id from public.khata_expense_events where
    company_id=${company} and id in (${base.id},${payment.id},${reversal.id}) order by created_at,id`;
  const before=await revision();
  await session(owner,tx=>post(tx,base),true);
  assert.equal((await view()).length,0);
  assert.equal(await revision(),before);
  for(const command of [base,payment,reversal]) {
    assert.equal((await session(owner,tx=>post(tx,command)))[0].id,command.id);
    assert.equal((await session(owner,tx=>post(tx,command)))[0].id,command.id);
  }
  assert.deepEqual((await view()).map(row=>[row.id,row.amount_minor,row.parent_id,row.reverses_id]),[
    [base.id,'700',null,null],[payment.id,'300',base.id,null],[reversal.id,'300',null,payment.id],
  ]);
  assert.equal(await revision(),before+3);
  await assert.rejects(session(other,tx=>post(tx,base)),/COMPANY_NOT_ACCESSIBLE/);
  await assert.rejects(session(owner,tx=>post(tx,{...payment,id:randomUUID(),amount:'701'})),/EXPENSE_OVERPAYMENT/);
  const [{balance}]=await sql`select sum(signed_minor)::text as balance from public.khata_expense_journal
    where company_id=${company} and category=${base.category} and account='expense_payable'`;
  assert.equal(balance,'-700');
  gate('rpc:public.khata_expense_post_v1','Legacy charge, payment and reversal preserve exact payable and lineage; rollback, replay and wrong-owner denial');
}

async function verifyMasterLifecycle(sql,session,{owner,other,company},revision,gate) {
  const id=randomUUID();
  const party={id,company,name:'Disposable master',kind:'customer',opening_side:'none',opening_amount:'0'};
  const save=(tx,input)=>tx`select public.khata_master_save_v2('party',${tx.json(input)}::jsonb) as id`;
  const remove=tx=>tx`select public.khata_master_delete_v2('party',${company}::uuid,${id}::uuid)`;
  const lookup=()=>sql`select name from public.khata_parties where id=${id} and company_id=${company}`;
  await assert.rejects(session(other,tx=>save(tx,party)),/COMPANY_NOT_ACCESSIBLE/);
  await session(owner,tx=>save(tx,party),true);
  assert.equal((await lookup()).length,0);
  assert.equal((await session(owner,tx=>save(tx,party)))[0].id,id);
  assert.equal((await session(owner,tx=>save(tx,{...party,name:'Edited master'})))[0].id,id);
  assert.deepEqual((await lookup()).map(r=>r.name),['Edited master']);
  gate('rpc:public.khata_master_save_v2','Authenticated stable master identity, update, exact row, rollback and foreign write denial');
  const before=await revision();
  await assert.rejects(session(other,remove),/COMPANY_NOT_ACCESSIBLE/);
  await session(owner,remove,true);
  assert.equal((await lookup()).length,1);
  assert.equal(await revision(),before);
  await session(owner,remove);
  await session(owner,remove);
  assert.equal((await lookup()).length,0);
  assert.equal(await revision(),before+1);
  const [audit]=await sql`select count(*)::int as n from public.khata_master_audit
    where company_id=${company} and actor_id=${owner} and entity_id=${id} and operation='DELETE'`;
  assert.equal(audit.n,1);
  gate('rpc:public.khata_master_delete_v2','Owner delete of unused party, one audit and one revision; replay has no effect; wrong owner and rollback covered');
}

async function verifyLifecycleAndPurge(sql,session,{owner,other,company},gate) {
  const eligible=randomUUID(),waiting=randomUUID();
  await sql`insert into public.khata_companies(id,owner_id,name) values
    (${eligible},${owner},'Disposable eligible'),(${waiting},${other},'Disposable future')`;
  const prepare=tx=>tx`select public.khata_prepare_company_v2(${eligible}::uuid)`;
  const warehouse=async()=>await sql`select id,code from public.khata_warehouses where company_id=${eligible}`;
  await assert.rejects(session(other,prepare),/COMPANY_NOT_ACCESSIBLE/);
  await session(owner,prepare,true);
  assert.equal((await warehouse()).length,0);
  await session(owner,prepare);
  const first=await warehouse();
  await session(owner,prepare);
  assert.equal(first.length,1);
  assert.equal(first[0].code,'MAIN');
  assert.deepEqual(await warehouse(),first);
  gate('rpc:public.khata_prepare_company_v2','Creates one default warehouse, replays with the same ID, rolls back completely, wrong-owner denied');

  await sql`update public.khata_companies set deleted_at=now(),purge_after=now()-interval '1 second' where id=${eligible}`;
  await sql`update public.khata_companies set deleted_at=now(),purge_after=now()+interval '1 day' where id=${waiting}`;
  const guard=async(tx,id,marker)=>{
    await tx`select set_config('orbis.khata.purge_company',${marker},true)`;
    return (await tx`select orbis_khata.purge_allowed(${id}::uuid) as allowed`)[0].allowed;
  };
  assert.equal(await session(owner,tx=>guard(tx,eligible,eligible)),false);
  assert.equal(await session(owner,tx=>guard(tx,eligible,eligible),false,'fixture'),true);
  assert.equal(await session(owner,tx=>guard(tx,eligible,company),false,'fixture'),false);
  assert.equal(await session(owner,tx=>guard(tx,company,company),false,'fixture'),false);
  assert.equal(await session(owner,tx=>guard(tx,waiting,waiting),false,'fixture'),false);
  gate('rpc:orbis_khata.purge_allowed','Authenticated denied even with marker; exact privileged marker grants only elapsed retired company');
  const purge=tx=>tx`select orbis_khata.purge_retired_companies() as count`;
  await assert.rejects(session(owner,purge),/permission denied/);
  await session(owner,async tx=>assert.equal((await purge(tx))[0].count,1),true,'fixture');
  assert.equal((await warehouse()).length,1);
  assert.equal((await session(owner,purge,false,'fixture'))[0].count,1);
  assert.equal((await session(owner,purge,false,'fixture'))[0].count,0);
  assert.equal((await warehouse()).length,0);
  assert.deepEqual((await sql`select id from public.khata_companies where id in (${company},${waiting}) order by id`).map(row=>row.id),[company,waiting].sort());
  gate('internal-rpc:orbis_khata.purge_retired_companies','Actual privileged purge body removes only elapsed exhausted company; grant denial, replay and rollback tested');
}

async function verifyExpenseProfiles(sql,session,{owner,other,company},gate) {
  const operationId=randomUUID(),id=randomUUID(),request={company,action:'post',operationId};
  const invoke=(tx,input)=>tx`select public.khata_expense_profiles_v1(${tx.json(input)}::jsonb) as data`;
  const load={...request,action:'load',request};
  const expense={id,company,date:day,kind:'charge',amount:'321',category:'Recurring fixture',
    payee:'',method:'cash',parent:null,reference:'',note:''};
  const post=async tx=>{
    const [{data:loaded}]=await invoke(tx,load);
    if(loaded.replay) return loaded.state;
    await tx`select public.khata_expense_post_v1(${tx.json(expense)}::jsonb)`;
    const [{data:result}]=await invoke(tx,{...load,action:'commit',state:{...loaded.state,payments:[{id}]},version:loaded.version});
    return result.state;
  };
  const outcomes=()=>sql`select amount_minor::text as amount from public.khata_expense_events where id=${id}`;
  await assert.rejects(session(other,post),/COMPANY_NOT_ACCESSIBLE/);
  await session(owner,post,true);
  assert.equal((await outcomes()).length,0);
  const first=await session(owner,post);
  assert.deepEqual(await session(owner,post),first);
  assert.deepEqual(first.payments,[{id}]);
  assert.deepEqual((await outcomes()).map(r=>r.amount),['321']);
  gate('rpc:public.khata_expense_profiles_v1','Recurring state and cash expense persist together with one identity; replay, rollback and foreign principal tested');
}

async function verifyLotteryStore(sql,session,{owner,other},gate) {
  const operationId=randomUUID(),org='synthetic-relay-organization',party='synthetic-relay-party';
  const request={method:'fixture-party-state',operationId};
  const load={action:'load',request,operationId};
  const invoke=(tx,p)=>tx`select public.khata_lottery_store_v2(${tx.json(p)}::jsonb) as value`;
  const row=(await sql`select value from public.khata_lottery_records where owner_id=${owner}
    and model='foundationAccountingParty' and id=${party}`)[0].value;
  const version=(await sql`select version::int from public.khata_lottery_state where owner_id=${owner}`)[0].version;
  const command={...load,action:'commit',version,changes:[{model:'foundationAccountingParty',id:party,
    value:{...row,name:'Synthetic updated party'}}],result:{id:party}};
  await assert.rejects(session(owner,async tx=>{
    await tx`select set_config('orbis.khata.gateway_verified','',true)`;
    await invoke(tx,load);
  }),/LOTTERY_ACCESS_DENIED/);
  const loaded=(await session(owner,tx=>invoke(tx,load)))[0].value;
  assert.deepEqual(loaded.state.foundationAccountingParty,[row]);
  await session(owner,tx=>invoke(tx,command),true);
  assert.equal((await session(owner,tx=>invoke(tx,load)))[0].value.version,version);
  assert.deepEqual((await session(owner,tx=>invoke(tx,command)))[0].value,{id:party});
  assert.deepEqual((await session(owner,tx=>invoke(tx,load)))[0].value,{replay:true,result:{id:party}});
  await assert.rejects(session(owner,tx=>invoke(tx,{...load,request:{...request,changed:true}})),/IDEMPOTENCY_CONFLICT/);
  const correct=await sql`select owner_id,value->>'name' as name from public.khata_lottery_records
    where model='foundationAccountingParty' and id=${party} and value->>'organizationId'=${org}`;
  assert.equal(correct.find(r=>r.owner_id===owner).name,'Synthetic updated party');
  assert.equal(correct.find(r=>r.owner_id===other).name,row.name);
  gate('rpc:public.khata_lottery_store_v2','Real row-store scope isolation, exact serialized change and replay, gateway prerequisite, operation conflict and rollback');
  const legacy=(tx)=>tx`select public.khata_lottery_store_v1(${tx.json({action:'load'})}::jsonb) as value`;
  await assert.rejects(session(owner,legacy),/permission denied/);
  await assert.rejects(session(owner,legacy,false,'fixture'),/LOTTERY_GATEWAY_UPGRADE_REQUIRED/);
  const [legacyState]=await sql`select version::int,state from public.khata_lottery_state where owner_id=${owner}`;
  assert.deepEqual(legacyState,{version:version+1,state:{}});
  gate('internal-rpc:public.khata_lottery_store_v1','Authenticated EXECUTE denied; even privileged stale gateway gets explicit upgrade error and aggregate remains untouched');
}
