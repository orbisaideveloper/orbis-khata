-- Per-record persistence. Legacy aggregate remains an immutable migration backup.
create table public.khata_lottery_records (
 owner_id uuid not null references public.khata_lottery_state(owner_id),
 model text not null check(model in ('foundationAccountingOrganization','foundationAccountingParty','foundationLotteryAccountingPeriod','foundationLotteryDocumentSequence','foundationLotteryStockMovement','foundationLotteryStockistEntry','foundationLotterySale','foundationLotterySellerSyncOperation','foundationLotteryPayment','foundationLotterySettlement','foundationLotteryLedgerEntry','foundationLotteryAuditEvent','foundationAccountingCorrection','foundationLotteryEntryClearance','foundationAccountingExpenseCategory','foundationAccountingExpenseProfile','foundationAccountingExpenseBill','foundationAccountingExpensePayment','foundationAccountingCustomerBill')),
 id text not null check(length(id)>0),
 ordinal bigint generated always as identity,
 value jsonb not null check(jsonb_typeof(value)='object' and value->>'id'=id),
 primary key(owner_id,model,id)
);
alter table public.khata_lottery_records enable row level security;
revoke all on public.khata_lottery_records from public,anon,authenticated;
-- Unexpected legacy shapes fail the migration rather than dropping old records.
do $migration$
declare entry record; row_value jsonb;
begin
 for entry in select s.owner_id,m.key,m.value from public.khata_lottery_state s cross join lateral jsonb_each(s.state) m loop
  if entry.key not in ('foundationAccountingOrganization','foundationAccountingParty','foundationLotteryAccountingPeriod','foundationLotteryDocumentSequence','foundationLotteryStockMovement','foundationLotteryStockistEntry','foundationLotterySale','foundationLotterySellerSyncOperation','foundationLotteryPayment','foundationLotterySettlement','foundationLotteryLedgerEntry','foundationLotteryAuditEvent','foundationAccountingCorrection','foundationLotteryEntryClearance','foundationAccountingExpenseCategory','foundationAccountingExpenseProfile','foundationAccountingExpenseBill','foundationAccountingExpensePayment','foundationAccountingCustomerBill') or jsonb_typeof(entry.value)<>'array' then raise exception 'INVALID_LEGACY_LOTTERY_MODEL';end if;
  for row_value in select value from jsonb_array_elements(entry.value) loop
   insert into public.khata_lottery_records(owner_id,model,id,value) values(entry.owner_id,entry.key,row_value->>'id',row_value);
  end loop;
 end loop;
end $migration$;
-- Old gateways must fail closed after activation; they must never overwrite migrated history.
create or replace function public.khata_lottery_store_v1(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
begin raise exception 'LOTTERY_GATEWAY_UPGRADE_REQUIRED';end $fn$;
revoke all on function public.khata_lottery_store_v1(jsonb) from public,anon,authenticated;
create function public.khata_lottery_store_v2(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare owner uuid:=auth.uid();saved public.khata_lottery_state;prior public.khata_lottery_operations;
 op uuid:=(p->>'operationId')::uuid;change jsonb;hydrated jsonb;
begin
 if owner is null or current_setting('orbis.khata.gateway_verified',true) is distinct from 'v1' then raise exception 'LOTTERY_ACCESS_DENIED';end if;
 perform pg_advisory_xact_lock(hashtextextended('lottery-owner:'||owner::text,0));
 if op is not null then
  select * into prior from public.khata_lottery_operations where owner_id=owner and operation_id=op;
  if found then
   if prior.request is distinct from p->'request' then raise exception 'IDEMPOTENCY_CONFLICT';end if;
   if p->>'action'='load' then return jsonb_build_object('replay',true,'result',prior.result);end if;
   return prior.result;
  end if;
 end if;
 if p->>'action'='load' then
  insert into public.khata_lottery_state(owner_id) values(owner) on conflict do nothing;
  select * into saved from public.khata_lottery_state where owner_id=owner for update;
  select coalesce(jsonb_object_agg(model,rows),'{}'::jsonb) into hydrated from (
   select model,jsonb_agg(value order by ordinal) as rows from public.khata_lottery_records where owner_id=owner group by model
  ) grouped;
  return jsonb_build_object('state',hydrated,'version',saved.version);
 end if;
 if p->>'action' is distinct from 'commit' or op is null or jsonb_typeof(p->'changes') is distinct from 'array' or p->'request' is null then raise exception 'INVALID_LOTTERY_CHANGES';end if;
 select * into saved from public.khata_lottery_state where owner_id=owner for update;
 if not found or saved.version is distinct from (p->>'version')::bigint then raise exception 'LOTTERY_VERSION_CONFLICT';end if;
 if jsonb_array_length(p->'changes')>0 and not coalesce((select enabled from public.khata_write_controls where singleton),false) then raise exception 'WRITES_DISABLED';end if;
 for change in select value from jsonb_array_elements(p->'changes') loop
  if jsonb_typeof(change) is distinct from 'object' or (select count(*) from jsonb_object_keys(change))<>3 or change->>'model' is null or change->>'id' is null or length(change->>'id')=0 or not(change?'value') or change->>'model' not in ('foundationAccountingOrganization','foundationAccountingParty','foundationLotteryAccountingPeriod','foundationLotteryDocumentSequence','foundationLotteryStockMovement','foundationLotteryStockistEntry','foundationLotterySale','foundationLotterySellerSyncOperation','foundationLotteryPayment','foundationLotterySettlement','foundationLotteryLedgerEntry','foundationLotteryAuditEvent','foundationAccountingCorrection','foundationLotteryEntryClearance','foundationAccountingExpenseCategory','foundationAccountingExpenseProfile','foundationAccountingExpenseBill','foundationAccountingExpensePayment','foundationAccountingCustomerBill') then raise exception 'INVALID_LOTTERY_CHANGE';end if;
  if change->'value'='null'::jsonb then
   delete from public.khata_lottery_records where owner_id=owner and model=change->>'model' and id=change->>'id';
  else
   if jsonb_typeof(change->'value') is distinct from 'object' or change->'value'->>'id' is distinct from change->>'id' then raise exception 'INVALID_LOTTERY_RECORD';end if;
   insert into public.khata_lottery_records(owner_id,model,id,value) values(owner,change->>'model',change->>'id',change->'value')
    on conflict(owner_id,model,id) do update set value=excluded.value where khata_lottery_records.value is distinct from excluded.value;
  end if;
 end loop;
 update public.khata_lottery_state set version=version+1,updated_at=now() where owner_id=owner;
 insert into public.khata_lottery_operations(owner_id,operation_id,request,result) values(owner,op,p->'request',p->'result');
 return p->'result';
end $fn$;
revoke all on function public.khata_lottery_store_v2(jsonb) from public,anon;
grant execute on function public.khata_lottery_store_v2(jsonb) to authenticated;
