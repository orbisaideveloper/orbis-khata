-- Owner-approved historical entries, signed stock, atomic settlement and auditable corrections.
CREATE OR REPLACE FUNCTION orbis_khata.inventory_write(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cid uuid; eid uuid; d date; k text; x jsonb; q numeric; rate numeric; total numeric:=0;
 iid uuid; wid uuid; dest uuid; idx integer:=0; existing public.khata_inventory_documents; master boolean;
begin
 if p is null or jsonb_typeof(p)<>'object' or (select count(*) from jsonb_object_keys(p))<>(case when p ? 'roundoff' then 12 else 11 end) or
 not (p ?& array['id','company','kind','date','code','name','unit','party','reference','note','lines']) then raise exception 'INVALID_INVENTORY'; end if;
 cid:=(p->>'company')::uuid;eid:=(p->>'id')::uuid;d:=(p->>'date')::date;k:=p->>'kind';
 if cid is null or eid is null or d is null or p->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or d>(now() at time zone 'Asia/Kolkata')::date or
 k is null or k not in ('item','warehouse','sale','purchase','opening','transfer') then raise exception 'INVALID_INVENTORY'; end if;
 perform orbis_khata.inventory_access(cid,true);
 perform pg_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0));
 -- Serialize identical IDs even if two independently owned companies choose the same UUID.
 perform pg_advisory_xact_lock(hashtextextended('stock-id:'||eid::text,0));
 select * into existing from public.khata_inventory_documents where id=eid;
 if existing.id is not null then
  if existing.company_id<>cid or existing.payload<>p then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return eid;
 end if;
 if not orbis_khata.inventory_text(p->'code',40) or not orbis_khata.inventory_text(p->'name',120) or not orbis_khata.inventory_text(p->'unit',24) or
 not orbis_khata.inventory_text(p->'reference',80) or not orbis_khata.inventory_text(p->'note',500) or jsonb_typeof(p->'lines')<>'array' then raise exception 'INVALID_INVENTORY'; end if;
 if p->>'code'<>btrim(p->>'code') or p->>'name'<>btrim(p->>'name') or p->>'unit'<>btrim(p->>'unit') then raise exception 'INVALID_INVENTORY'; end if;
 master:=k in ('item','warehouse');
 if master then
  if char_length(p->>'code')=0 or char_length(p->>'name')=0 or jsonb_array_length(p->'lines')<>0 or p->'party'<>'null'::jsonb then raise exception 'INVALID_MASTER';end if;
  if (k='item' and char_length(p->>'unit')=0) or (k='warehouse' and p->>'unit'<>'') then raise exception 'INVALID_UNIT';end if;
 else
  if p->>'code'<>'' or p->>'name'<>'' or p->>'unit'<>'' or jsonb_array_length(p->'lines') not between 1 and 50 then raise exception 'INVALID_INVENTORY';end if;
  if k in ('sale','purchase') then
   if not exists(select 1 from public.khata_parties where id=(p->>'party')::uuid and company_id=cid) then raise exception 'PARTY_NOT_ACCESSIBLE';end if;
  elsif p->'party'<>'null'::jsonb or char_length(btrim(p->>'note'))=0 then raise exception 'STOCK_REASON_REQUIRED';end if;
 end if;
 for x in select value from jsonb_array_elements(p->'lines') loop
  if jsonb_typeof(x)<>'object' or (select count(*) from jsonb_object_keys(x))<>(case when x ? 'unit_rate' then 6 else 5 end) or not(x ?& array['item','warehouse','to','quantity','rate']) or
  jsonb_typeof(x->'quantity')<>'string' or coalesce(x->>'quantity','') !~ '^[1-9][0-9]{0,11}$' or
  jsonb_typeof(x->'rate')<>'string' or coalesce(x->>'rate','') !~ '^(0|[1-9][0-9]{0,11})$' then raise exception 'INVALID_STOCK_LINE';end if;
  iid:=(x->>'item')::uuid;wid:=(x->>'warehouse')::uuid;dest:=(x->>'to')::uuid;q:=(x->>'quantity')::numeric;rate:=(x->>'rate')::numeric;
  if not exists(select 1 from public.khata_items where id=iid and company_id=cid) or not exists(select 1 from public.khata_warehouses where id=wid and company_id=cid) then raise exception 'STOCK_MASTER_NOT_ACCESSIBLE';end if;
  if k='transfer' then
   if dest is null or dest=wid or not exists(select 1 from public.khata_warehouses where id=dest and company_id=cid) then raise exception 'INVALID_TRANSFER';end if;
  elsif x->'to'<>'null'::jsonb then raise exception 'INVALID_DESTINATION';end if;
  if x ? 'unit_rate' then
   if k not in ('sale','purchase') or jsonb_typeof(x->'unit_rate')<>'string' or x->>'unit_rate' !~ '^[0-9]{1,10}([.][0-9]{1,8})?$' then raise exception 'INVALID_RATE';end if;rate:=(x->>'unit_rate')::numeric*100;
  end if;
  if k in ('sale','purchase') then
   if rate<=0 or round(q*rate/1000000)<=0 then raise exception 'INVALID_RATE';end if;
   total:=total+round(q*rate/1000000);
  elsif rate<>0 then raise exception 'INVALID_RATE';end if;
 end loop;
 if p ? 'roundoff' then
  if k not in ('sale','purchase') or jsonb_typeof(p->'roundoff')<>'string' or p->>'roundoff' !~ '^-?[0-9]{1,4}$' then raise exception 'INVALID_TOTAL';end if;
  total:=total+(p->>'roundoff')::numeric;
 end if;
 if k in ('sale','purchase') and total<=0 then raise exception 'INVALID_TOTAL';end if;
 if total>999999999999 then raise exception 'INVALID_TOTAL';end if;
 if exists(select 1 from public.khata_vouchers where id=eid) then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 insert into public.khata_inventory_documents(id,company_id,kind,effective_date,payload,total_minor,actor_id) values(eid,cid,k,d,p,total,auth.uid());
 if k='item' and (select count(*) from public.khata_items where company_id=cid)>=1000 then raise exception 'INVENTORY_MASTER_LIMIT';end if;
 if k='warehouse' and (select count(*) from public.khata_warehouses where company_id=cid)>=100 then raise exception 'INVENTORY_MASTER_LIMIT';end if;
 if k='item' then insert into public.khata_items(id,company_id,code,name,unit) values(eid,cid,p->>'code',p->>'name',p->>'unit');end if;
 if k='warehouse' then insert into public.khata_warehouses values(eid,cid,p->>'code',p->>'name');end if;
 for x in select value from jsonb_array_elements(p->'lines') loop
  idx:=idx+1;q:=(x->>'quantity')::numeric;
  insert into public.khata_stock_movements values(eid,idx,cid,(x->>'item')::uuid,(x->>'warehouse')::uuid,d,case when k in ('sale','transfer') then -q else q end);
  if k='transfer' then idx:=idx+1;insert into public.khata_stock_movements values(eid,idx,cid,(x->>'item')::uuid,(x->>'to')::uuid,d,q);end if;
 end loop;
 if k in ('sale','purchase') then
  perform public.khata_post_v1(eid,cid,(p->>'party')::uuid,k,d,total::text,'cash',p->>'reference',p->>'note',null);
 end if;
 return eid;
end $function$;

-- Reversal movements may also produce negative stock and precede later activity.
create or replace function orbis_khata.inventory_reverse() returns trigger language plpgsql security definer set search_path='' as $$
declare original public.khata_inventory_documents;
begin
 if new.kind<>'reversal' then return new;end if;
 perform orbis_khata.inventory_access(new.company_id,true);
 perform pg_advisory_xact_lock(hashtextextended('stock-company:'||new.company_id::text,0));
 select * into original from public.khata_inventory_documents where id=new.reverses_id and company_id=new.company_id and kind in('sale','purchase');
 if original.id is null then return new;end if;
 insert into public.khata_stock_reversals(voucher_id,original_id,ordinal,company_id,item_id,warehouse_id,effective_date,quantity)
 select new.id,original.id,ordinal,company_id,item_id,warehouse_id,new.effective_date,-quantity from public.khata_stock_movements where document_id=original.id;
 return new;
end $$;

alter table public.khata_companies add column if not exists deleted_at timestamptz;
alter table public.khata_companies add column if not exists purge_after timestamptz;
create table public.khata_workspace_settings(company_id uuid primary key references public.khata_companies(id),settings jsonb not null,updated_at timestamptz not null default now());
create table public.khata_workspace_events(id uuid primary key,company_id uuid not null references public.khata_companies(id),payload jsonb not null,result jsonb not null,actor_id uuid not null,created_at timestamptz not null default now());
create index khata_workspace_events_company_idx on public.khata_workspace_events(company_id,created_at,id);
create table public.khata_payment_links(id uuid primary key references public.khata_vouchers(id),company_id uuid not null references public.khata_companies(id),bill_id uuid,account_id text not null);
create index khata_payment_links_company_idx on public.khata_payment_links(company_id,account_id);
create table public.khata_bill_numbers(id uuid primary key,company_id uuid not null references public.khata_companies(id),kind text not null,reference text not null,unique(company_id,kind,reference));
create index khata_bill_numbers_company_idx on public.khata_bill_numbers(company_id);
alter table public.khata_workspace_settings enable row level security;
alter table public.khata_workspace_events enable row level security;
alter table public.khata_payment_links enable row level security;
alter table public.khata_bill_numbers enable row level security;
revoke all on public.khata_workspace_settings,public.khata_workspace_events,public.khata_payment_links,public.khata_bill_numbers from public,anon,authenticated;

create or replace function orbis_khata.inventory_access(cid uuid,writing boolean) returns void language plpgsql set search_path='' as $$
begin
 if auth.uid() is null or current_setting('orbis.khata.gateway_verified',true) is distinct from 'v1' or
 not exists(select 1 from public.khata_companies where id=cid and owner_id=auth.uid() and deleted_at is null) then raise exception 'COMPANY_NOT_ACCESSIBLE';end if;
 if writing and not coalesce((select enabled from public.khata_write_controls where singleton),false) then raise exception 'WRITES_DISABLED';end if;
end $$;

create function public.khata_workspace_v3(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid:=(p->>'company')::uuid;a text:=p->>'action';eid uuid; existing public.khata_workspace_events;
 s jsonb; b jsonb; ac jsonb; rowv public.khata_vouchers; ex public.khata_expense_events; payment public.khata_vouchers;
 answer jsonb;total numeric;paid numeric;pid uuid;rid uuid;target uuid;ref text;kind text;seq bigint;
begin
 if auth.uid() is null or current_setting('orbis.khata.gateway_verified',true) is distinct from 'v1' or not exists(select 1 from public.khata_companies where id=cid and owner_id=auth.uid()) then raise exception 'COMPANY_NOT_ACCESSIBLE';end if;
 perform pg_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0));
 if a in('restore','retire') then
  if not exists(select 1 from public.khata_companies where id=cid and name=p->>'name') then raise exception 'COMPANY_NOT_ACCESSIBLE';end if;
  if not coalesce((select enabled from public.khata_write_controls where singleton),false) then raise exception 'WRITES_DISABLED';end if;
  if a='restore' then update public.khata_companies set deleted_at=null,purge_after=null where id=cid and purge_after>now();
  else update public.khata_companies set deleted_at=coalesce(deleted_at,now()),purge_after=coalesce(purge_after,now()+interval '30 days') where id=cid;end if;
  return jsonb_build_object('ok',true);
 end if;
 perform orbis_khata.inventory_access(cid,a not in('settings','accounts','detail'));
 select settings into s from public.khata_workspace_settings where company_id=cid;
 s:=coalesce(s,'{"accounts":[{"id":"cash","name":"Cash","kind":"cash","channel":"","active":true},{"id":"bank","name":"Bank","kind":"bank","channel":"","active":true}],"numbering":{"sale":"S-","purchase":"P-","expense":"E-"},"next":{"sale":"1","purchase":"1","expense":"1"}}'::jsonb);
 if a='settings' then return s;end if;
 if a='settings-save' then
  if jsonb_typeof(p->'settings'->'accounts')<>'array' or jsonb_array_length(p->'settings'->'accounts') not between 2 and 30 then raise exception 'PAYMENT_ACCOUNT_REQUIRED';end if;
  insert into public.khata_workspace_settings values(cid,p->'settings',now()) on conflict(company_id) do update set settings=excluded.settings,updated_at=now();return p->'settings';
 end if;
 if a='accounts' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',account->>'id','name',account->>'name','kind',account->>'kind','balance',coalesce((select sum(j.signed_minor) from public.khata_journal j left join public.khata_vouchers v on v.id=j.voucher_id left join public.khata_payment_links l on l.id=coalesce(v.reverses_id,v.id) where j.company_id=cid and j.account=account->>'kind' and j.effective_date<=coalesce((p->>'to')::date,current_date) and coalesce(l.account_id,j.account)=account->>'id'),0)::text,
  'entry_ids',coalesce((select jsonb_agg(v.id) from public.khata_vouchers v left join public.khata_payment_links l on l.id=coalesce(v.reverses_id,v.id) where v.company_id=cid and (v.debit_account=account->>'kind' or v.credit_account=account->>'kind') and coalesce(l.account_id,account->>'kind')=account->>'id'),'[]'::jsonb))) from jsonb_array_elements(s->'accounts') account),'[]'::jsonb);
 end if;
 if a='detail' then
  select * into rowv from public.khata_vouchers where id=(p->>'id')::uuid and company_id=cid;
  select * into ex from public.khata_expense_events where id=(p->>'id')::uuid and company_id=cid;
  return jsonb_build_object('company_name',(select name from public.khata_companies where id=cid),'party_name',(select name from public.khata_parties where id=rowv.party_id and company_id=cid),'item_names',(select jsonb_object_agg(id,name) from public.khata_items where company_id=cid),'voucher',case when rowv.id is null then null else to_jsonb(rowv)||jsonb_build_object('amount_minor',rowv.amount_minor::text) end,
   'expense',case when ex.id is null then null else to_jsonb(ex)||jsonb_build_object('amount_minor',ex.amount_minor::text) end,
   'bill',(select payload||jsonb_build_object('total',total_minor::text) from public.khata_inventory_documents where id=rowv.id and company_id=cid),
   'account',(select account_id from public.khata_payment_links where id=rowv.id and company_id=cid),'lines',(select lines from public.khata_expense_bill_lines where id=ex.id and company_id=cid),
   'payments',coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object('amount_minor',v.amount_minor::text,'account',l.account_id)) from public.khata_payment_links l join public.khata_vouchers v on v.id=l.id where l.company_id=cid and l.bill_id=rowv.id and not exists(select 1 from public.khata_vouchers r where r.reverses_id=v.id)),'[]'::jsonb));
 end if;
 eid:=case when a='bill' then (p->'bill'->>'id')::uuid else (p->>'id')::uuid end;
 if eid is null then raise exception 'INVALID_AMOUNT';end if;
 perform pg_advisory_xact_lock(hashtextextended('workspace-id:'||eid::text,0));
 select * into existing from public.khata_workspace_events where id=eid;
 if existing.id is not null then
  if existing.company_id<>cid or existing.payload<>p then raise exception 'IDEMPOTENCY_CONFLICT';end if;return existing.result;
 end if;
 if a='number' then
  if exists(select 1 from public.khata_bill_numbers where id=eid and company_id=cid and khata_bill_numbers.kind=p->>'kind') then return (select to_jsonb(reference) from public.khata_bill_numbers where id=eid);end if;
  kind:=p->>'kind';if kind not in('sale','purchase','expense') then raise exception 'INVALID_KIND';end if;
  seq:=(s->'next'->>kind)::bigint;
  loop
   ref:=(s->'numbering'->>kind)||seq::text;
   exit when not exists(select 1 from public.khata_bill_numbers where company_id=cid and khata_bill_numbers.kind=kind and reference=ref) and not exists(select 1 from public.khata_vouchers where company_id=cid and reference=ref and khata_vouchers.kind=kind);
   seq:=seq+1;
  end loop;
  insert into public.khata_bill_numbers values(eid,cid,kind,ref);
  s:=jsonb_set(s,array['next',kind],to_jsonb((seq+1)::text));
  insert into public.khata_workspace_settings values(cid,s,now()) on conflict(company_id) do update set settings=excluded.settings,updated_at=now();return to_jsonb(ref);
 elsif a='expense' then
  if jsonb_array_length(p->'lines')>0 then perform public.khata_expense_bill_v2(p->'command',p->'lines');else perform public.khata_expense_post_v2(p->'command');end if;
  answer:=jsonb_build_object('id',eid);
 elsif a in('bill','payment') then
  ac:=null;
  select account into ac from jsonb_array_elements(s->'accounts') account where account->>'id'=p->>'account' and (account->>'active')::boolean;
  if ac is null then raise exception 'PAYMENT_ACCOUNT_REQUIRED';end if;
  if a='bill' then
   b:=p->'bill'||jsonb_build_object('roundoff',p->>'roundoff');
   perform public.khata_inventory_post_v1(b);
   select total_minor into total from public.khata_inventory_documents where id=eid and company_id=cid;
   paid:=(p->>'paid')::numeric;
   if paid<0 or paid>total then raise exception 'SETTLEMENT_EXCEEDS_BILL';end if;
   if paid>0 then
    pid:=gen_random_uuid();
    perform public.khata_post_v1(pid,cid,(b->>'party')::uuid,case when b->>'kind'='sale' then 'receipt' else 'payment' end,(b->>'date')::date,paid::text,ac->>'kind',b->>'reference','Payment with bill',null);
    insert into public.khata_payment_links values(pid,cid,eid,ac->>'id');
   end if;
   answer:=jsonb_build_object('id',eid,'payment',pid,'total',total::text,'paid',paid::text,'due',(total-paid)::text);
  else
   perform public.khata_post_v1(eid,cid,(p->>'party')::uuid,p->>'kind',(p->>'date')::date,p->>'amount',ac->>'kind',p->>'reference',p->>'note',null);
   insert into public.khata_payment_links values(eid,cid,null,ac->>'id');answer:=jsonb_build_object('id',eid);
  end if;
 elsif a='correct' then
  target:=(p->>'target')::uuid;
  if p->>'type'='voucher' then
   select * into rowv from public.khata_vouchers where id=target and company_id=cid;
   if rowv.id is null or rowv.kind='reversal' or exists(select 1 from public.khata_vouchers where reverses_id=target) then raise exception 'RECORD_ALREADY_CORRECTED';end if;
   for payment in select v.* from public.khata_payment_links l join public.khata_vouchers v on v.id=l.id where l.company_id=cid and l.bill_id=target and not exists(select 1 from public.khata_vouchers r where r.reverses_id=v.id) loop
    perform public.khata_post_v1(gen_random_uuid(),cid,payment.party_id,'reversal',payment.effective_date,payment.amount_minor::text,'cash','',p->>'reason',payment.id);
   end loop;
   perform public.khata_post_v1(gen_random_uuid(),cid,rowv.party_id,'reversal',rowv.effective_date,rowv.amount_minor::text,'cash','',p->>'reason',target);
  else
   select * into ex from public.khata_expense_events where id=target and company_id=cid;
   if ex.id is null or ex.kind='reversal' or exists(select 1 from public.khata_expense_events where reverses_id=target) then raise exception 'RECORD_ALREADY_CORRECTED';end if;
   -- Existing expense reversal enforces parent settlements; reverse payments first.
   for b in select payload from public.khata_expense_events e where company_id=cid and parent_id=target and kind='payment' and not exists(select 1 from public.khata_expense_events r where r.reverses_id=e.id) loop
    perform public.khata_expense_post_v2(b||jsonb_build_object('id',gen_random_uuid(),'kind','reversal','method',null,'parent',b->>'id','note',p->>'reason'));
   end loop;
   perform public.khata_expense_post_v2(ex.payload||jsonb_build_object('id',gen_random_uuid(),'kind','reversal','method',null,'parent',target,'note',p->>'reason'));
  end if;
  if p->'replacement' is not null and p->'replacement'<>'null'::jsonb then perform public.khata_workspace_v3(p->'replacement');end if;
  answer:=jsonb_build_object('ok',true);
 else raise exception 'INVALID_KIND';end if;
 insert into public.khata_workspace_events values(eid,cid,p,answer,auth.uid(),now());return answer;
end $$;
revoke all on function public.khata_workspace_v3(jsonb) from public,anon;
grant execute on function public.khata_workspace_v3(jsonb) to authenticated;

-- Purge is private and only visits explicitly retired tenants whose recovery
-- window has elapsed. It never removes shared ledger-owner / central identity.
create function orbis_khata.purge_allowed(cid uuid) returns boolean language sql stable set search_path='' as $$
 select current_user='postgres' and current_setting('orbis.khata.purge_company',true)=cid::text and exists(select 1 from public.khata_companies where id=cid and deleted_at is not null and purge_after<=now())
$$;
revoke all on function orbis_khata.purge_allowed(uuid) from public,anon;
grant execute on function orbis_khata.purge_allowed(uuid) to authenticated;
-- Keep all existing validation; add a narrowly-scoped DELETE escape for purge.
do $patch$
declare name text;definition text;
begin
 foreach name in array array['public.khata_validate_voucher()','public.khata_expense_immutable()','orbis_khata.inventory_immutable()','orbis_khata.master_guard()'] loop
  definition:=pg_get_functiondef(name::regprocedure);
  definition:=regexp_replace(definition,'\mbegin\M','begin if TG_OP=''DELETE'' and orbis_khata.purge_allowed(old.company_id) then return old;end if;','i');
  execute definition;
 end loop;
end $patch$;
create function orbis_khata.purge_retired_companies() returns integer language plpgsql security definer set search_path='' as $$
declare cid uuid;n integer:=0;
begin
 for cid in select id from public.khata_companies where deleted_at is not null and purge_after<=now() order by purge_after limit 50 for update skip locked loop
  perform pg_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0));
  perform set_config('orbis.khata.purge_company',cid::text,true);
  delete from public.khata_workspace_events where company_id=cid;
  delete from public.khata_payment_links where company_id=cid;
  delete from public.khata_bill_numbers where company_id=cid;
  delete from public.khata_workspace_settings where company_id=cid;
  delete from public.khata_stock_reversals where company_id=cid;
  delete from public.khata_stock_movements where company_id=cid;
  delete from public.khata_expense_bill_lines where company_id=cid;
  delete from public.khata_opening_expense_payments where company_id=cid;
  delete from public.khata_expense_events where company_id=cid;
  delete from public.khata_vouchers where company_id=cid;
  delete from public.khata_items where company_id=cid;
  delete from public.khata_warehouses where company_id=cid;
  delete from public.khata_inventory_documents where company_id=cid;
  delete from public.khata_parties where company_id=cid;
  delete from public.khata_master_audit where company_id=cid;
  delete from public.khata_companies where id=cid;
  n:=n+1;
 end loop;
 perform set_config('orbis.khata.purge_company','',true);return n;
end $$;
revoke all on function orbis_khata.purge_retired_companies() from public,anon,authenticated;
-- The deployment operator installs this private daily job after reviewing the
-- migration and checking pg_cron availability. No tenant is purged at install.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('khata-retired-company-purge','17 3 * * *','select orbis_khata.purge_retired_companies()');
