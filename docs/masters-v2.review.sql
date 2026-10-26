-- Owner-authorized Khata release. No financial rows are deleted or rewritten.
alter table public.khata_parties drop constraint khata_parties_kind_check;
alter table public.khata_parties add constraint khata_parties_kind_check check(kind in('customer','supplier','both','expense'));
alter table public.khata_parties
 add column phone text not null default '' check(length(phone)<=30),
 add column email text not null default '' check(length(email)<=120),
 add column address text not null default '' check(length(address)<=400),
 add column credit_limit numeric check(credit_limit=trunc(credit_limit) and credit_limit between 0 and 999999999999),
 add column credit_days integer check(credit_days between 0 and 3650),
 add column opening_amount numeric not null default 0 check(opening_amount=trunc(opening_amount) and opening_amount between 0 and 999999999999),
 add column opening_side text not null default 'none' check(opening_side in('none','due','advance')),
 add column opening_date date,
 add column opening_account text not null default 'receivable' check(opening_account in('receivable','payable','expense_payable')),
 add constraint khata_opening_pair check((opening_side<>'none' or opening_amount=0) and (opening_amount=0 or opening_date is not null));
alter table public.khata_items add column default_rate numeric check(default_rate=trunc(default_rate) and default_rate between 0 and 999999999999);
alter table public.khata_items drop constraint khata_items_code_check;
alter table public.khata_items add constraint khata_items_code_check check(length(code)<=40 and code=btrim(code));
drop index public.khata_item_code;
create unique index khata_item_code on public.khata_items(company_id,lower(code)) where code<>'';
create unique index khata_expense_party_name on public.khata_parties(company_id,lower(name)) where kind='expense';
create table public.khata_opening_expense_payments(
 id uuid primary key,company_id uuid not null references public.khata_companies(id),party_id uuid not null,
 effective_date date not null,amount_minor numeric not null check(amount_minor>0 and amount_minor=trunc(amount_minor) and amount_minor<=999999999999),
 method text not null check(method in('cash','bank')),reverses_id uuid unique references public.khata_opening_expense_payments(id),
 payload jsonb not null,created_at timestamptz not null default now(),
 foreign key(company_id,party_id) references public.khata_parties(company_id,id)
);
create table public.khata_expense_bill_lines(id uuid primary key references public.khata_expense_events(id),company_id uuid not null references public.khata_companies(id),lines jsonb not null check(jsonb_typeof(lines)='array' and jsonb_array_length(lines) between 1 and 50));
create table public.khata_master_audit(id bigint generated always as identity primary key,company_id uuid not null references public.khata_companies(id),entity text not null,entity_id uuid not null,operation text not null,old_row jsonb,new_row jsonb,actor_id uuid not null,created_at timestamptz not null default now());
do $$declare tab text;begin foreach tab in array array['khata_opening_expense_payments','khata_expense_bill_lines','khata_master_audit'] loop
 execute format('alter table public.%I enable row level security',tab);execute format('alter table public.%I force row level security',tab);
 execute format('revoke all on public.%I from public,anon,authenticated',tab);execute format('grant select on public.%I to authenticated',tab);
 execute format('create policy owner_gateway_read on public.%I for select to authenticated using((select current_setting(''orbis.khata.gateway_verified'',true))=''v1'' and exists(select 1 from public.khata_companies c where c.id=company_id and c.owner_id=(select auth.uid())))',tab);
 execute format('create trigger immutable before update or delete on public.%I for each row execute function public.khata_expense_immutable()',tab);
end loop;end $$;
create function orbis_khata.master_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare rowdata jsonb;cid uuid;eid uuid;used boolean;begin
 rowdata:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;cid:=(rowdata->>'company_id')::uuid;eid:=(rowdata->>'id')::uuid;
 perform orbis_khata.inventory_access(cid,true);
 if tg_op='UPDATE' and (new.id<>old.id or new.company_id<>old.company_id) then raise exception 'MASTER_ID_IMMUTABLE';end if;
 if tg_table_name='khata_parties' then
  used:=exists(select 1 from public.khata_vouchers where company_id=cid and party_id=eid) or exists(select 1 from public.khata_expense_events where company_id=cid and payee=old.name) or exists(select 1 from public.khata_opening_expense_payments where company_id=cid and party_id=eid);
  if tg_op='DELETE' and (used or old.opening_amount<>0) then raise exception using errcode='23503',message='PARTY_IN_USE';end if;
  if tg_op='UPDATE' and used and ((new.kind,new.opening_account,new.opening_amount,new.opening_side,new.opening_date) is distinct from(old.kind,old.opening_account,old.opening_amount,old.opening_side,old.opening_date) or old.kind='expense' and new.name<>old.name) then raise exception using errcode='23503',message='OPENING_ALREADY_USED';end if;
 else
  used:=exists(select 1 from public.khata_stock_movements where company_id=cid and item_id=eid);
  if tg_op='DELETE' and used then raise exception using errcode='23503',message='ITEM_IN_USE';end if;
  if tg_op='UPDATE' and used and new.unit<>old.unit then raise exception using errcode='23503',message='UNIT_ALREADY_USED';end if;
 end if;
 insert into public.khata_master_audit(company_id,entity,entity_id,operation,old_row,new_row,actor_id) values(cid,tg_table_name,eid,tg_op,to_jsonb(old),case when tg_op='DELETE' then null else to_jsonb(new) end,auth.uid());
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function orbis_khata.master_guard() from public,anon,authenticated;
drop trigger inventory_immutable on public.khata_items;
create trigger master_guard before update or delete on public.khata_items for each row execute function orbis_khata.master_guard();
create trigger master_guard before update or delete on public.khata_parties for each row execute function orbis_khata.master_guard();
create function orbis_khata.ensure_warehouse(cid uuid) returns void language plpgsql security definer set search_path='' as $$
declare eid uuid;d date:=(now() at time zone 'Asia/Kolkata')::date;begin
 perform orbis_khata.inventory_access(cid,true);perform pg_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0));
 if not exists(select 1 from public.khata_warehouses where company_id=cid) then
  eid:=gen_random_uuid();perform public.khata_inventory_post_v1(jsonb_build_object('id',eid,'company',cid,'kind','warehouse','date',d::text,'code','MAIN','name','Main godown','unit','','party',null,'reference','','note','','lines','[]'::jsonb));
 end if;
end $$;
create function public.khata_masters_v2(cid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform orbis_khata.inventory_access(cid,false);
 return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'company',company_id,'name',name,'code',code,'unit',unit,'default_rate',default_rate::text) order by name,id) from public.khata_items where company_id=cid),'[]'::jsonb),
 'parties',coalesce((select jsonb_agg((to_jsonb(p)-'company_id'-'created_at')||jsonb_build_object('company',company_id,'credit_limit',credit_limit::text,'opening_amount',opening_amount::text,'opening_date',coalesce(opening_date::text,''),'receivable','0','payable','0') order by name,id) from public.khata_parties p where company_id=cid),'[]'::jsonb));end $$;
create function public.khata_master_save_v2(entity text,p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid:=(p->>'company')::uuid;eid uuid:=(p->>'id')::uuid;rowparty public.khata_parties;rowitem public.khata_items;account text;side text;amt numeric;d date;begin
 perform orbis_khata.inventory_access(cid,true);if eid is null or length(btrim(p->>'name')) not between 1 and 120 then raise exception 'INVALID_MASTER';end if;
 perform pg_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0));perform pg_advisory_xact_lock(hashtextextended('expense-company:'||cid::text,0));perform pg_advisory_xact_lock(hashtextextended('master:'||cid::text,0));
 if entity='party' then
  if p->>'kind' not in('customer','supplier','both','expense') or length(p->>'phone')>30 or length(p->>'email')>120 or length(p->>'address')>400 then raise exception 'INVALID_PARTY';end if;
  if coalesce(p->>'phone','')<>'' and p->>'phone' !~ '^[+0-9 ()-]{6,30}$' then raise exception 'INVALID_PHONE';end if;
  if coalesce(p->>'email','')<>'' and p->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_EMAIL';end if;
  account:=case p->>'kind' when 'customer' then 'receivable' when 'supplier' then 'payable' when 'expense' then 'expense_payable' else p->>'opening_account' end;
  side:=p->>'opening_side';amt:=(p->>'opening_amount')::numeric;d:=nullif(p->>'opening_date','')::date;
  if amt>0 and (d is null or d>(now() at time zone 'Asia/Kolkata')::date) then raise exception 'INVALID_OPENING_DATE';end if;
  select * into rowparty from public.khata_parties where id=eid;
  if rowparty.id is not null and rowparty.company_id<>cid then raise exception 'PARTY_NOT_ACCESSIBLE';end if;
  insert into public.khata_parties(id,company_id,name,kind,phone,email,address,credit_limit,credit_days,opening_amount,opening_side,opening_date,opening_account)
   values(eid,cid,btrim(p->>'name'),p->>'kind',coalesce(p->>'phone',''),coalesce(p->>'email',''),coalesce(p->>'address',''),(p->>'credit_limit')::numeric,(p->>'credit_days')::integer,amt,side,d,account)
  on conflict(id) do update set name=excluded.name,kind=excluded.kind,phone=excluded.phone,email=excluded.email,address=excluded.address,credit_limit=excluded.credit_limit,credit_days=excluded.credit_days,opening_amount=excluded.opening_amount,opening_side=excluded.opening_side,opening_date=excluded.opening_date,opening_account=excluded.opening_account;
 elsif entity='item' then
  if length(btrim(p->>'unit')) not between 1 and 24 or length(p->>'code')>40 then raise exception 'INVALID_ITEM';end if;
  select * into rowitem from public.khata_items where id=eid;
  if rowitem.id is not null and rowitem.company_id<>cid then raise exception 'ITEM_NOT_ACCESSIBLE';end if;
  if rowitem.id is null then perform public.khata_inventory_post_v1(jsonb_build_object('id',eid,'company',cid,'kind','item','date',(now() at time zone 'Asia/Kolkata')::date::text,'code',coalesce(nullif(p->>'code',''),'AUTO-'||replace(eid::text,'-','')),'name',btrim(p->>'name'),'unit',btrim(p->>'unit'),'party',null,'reference','','note','','lines','[]'::jsonb));end if;
  update public.khata_items set name=btrim(p->>'name'),code=coalesce(p->>'code',''),unit=btrim(p->>'unit'),default_rate=(p->>'default_rate')::numeric where id=eid and company_id=cid;
 else raise exception 'INVALID_ENTITY';end if;return eid;end $$;
create function public.khata_master_delete_v2(entity text,cid uuid,eid uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform orbis_khata.inventory_access(cid,true);perform pg_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0));perform pg_advisory_xact_lock(hashtextextended('expense-company:'||cid::text,0));perform pg_advisory_xact_lock(hashtextextended('master:'||cid::text,0));
 if entity='party' then delete from public.khata_parties where id=eid and company_id=cid;
 elsif entity='item' then delete from public.khata_items where id=eid and company_id=cid;
 else raise exception 'INVALID_ENTITY';end if;end $$;
create view public.khata_opening_journal with(security_invoker=true) as
 select p.id voucher_id,p.company_id,p.id party_id,p.opening_date effective_date,p.created_at,
 case p.kind when 'customer' then 'receivable' when 'supplier' then 'payable' when 'expense' then 'expense_payable' else p.opening_account end account,
 p.opening_amount*(case when (p.kind='customer' or p.kind='both' and p.opening_account='receivable')=(p.opening_side='due') then 1 else -1 end) signed_minor
 from public.khata_parties p where opening_amount>0 and opening_side<>'none'
 union all
 select p.id,p.company_id,p.id,p.opening_date,p.created_at,'opening_equity',-p.opening_amount*(case when (p.kind='customer' or p.kind='both' and p.opening_account='receivable')=(p.opening_side='due') then 1 else -1 end)
 from public.khata_parties p where opening_amount>0 and opening_side<>'none';
create view public.khata_opening_payment_journal with(security_invoker=true) as
 select id voucher_id,company_id,party_id,effective_date,created_at,'expense_payable'::text account,amount_minor*(case when reverses_id is null then 1 else -1 end) signed_minor from public.khata_opening_expense_payments
 union all select id,company_id,party_id,effective_date,created_at,method,-amount_minor*(case when reverses_id is null then 1 else -1 end) from public.khata_opening_expense_payments;
create or replace view public.khata_journal with(security_invoker=true) as
 select id voucher_id,company_id,party_id,effective_date,created_at,debit_account account,amount_minor signed_minor from public.khata_vouchers
 union all select id,company_id,party_id,effective_date,created_at,credit_account,-amount_minor from public.khata_vouchers
 union all select j.id,j.company_id,p.id,j.effective_date,e.created_at,j.account,j.signed_minor from public.khata_expense_journal j join public.khata_expense_events e on e.id=j.id and e.company_id=j.company_id left join public.khata_parties p on p.company_id=j.company_id and p.kind='expense' and p.name=e.payee
 union all select * from public.khata_opening_journal
 union all select * from public.khata_opening_payment_journal;
create view public.khata_expense_full_journal with(security_invoker=true) as
 select j.company_id,j.effective_date,j.account,j.signed_minor from public.khata_expense_journal j
 union all select j.company_id,j.effective_date,j.account,j.signed_minor from public.khata_opening_journal j join public.khata_parties p on p.id=j.party_id and p.company_id=j.company_id where p.kind='expense'
 union all select company_id,effective_date,account,signed_minor from public.khata_opening_payment_journal;
revoke all on public.khata_opening_journal,public.khata_opening_payment_journal,public.khata_expense_full_journal from public,anon,authenticated;
grant select on public.khata_opening_journal,public.khata_opening_payment_journal,public.khata_expense_full_journal to authenticated;
create function public.khata_party_balance_v2(cid uuid,pid uuid,d date,k text) returns text language plpgsql stable security definer set search_path='' as $$
declare a text;v numeric;begin perform orbis_khata.inventory_access(cid,false);
 if not exists(select 1 from public.khata_parties where id=pid and company_id=cid) then raise exception 'PARTY_NOT_ACCESSIBLE';end if;
 a:=case k when 'sale' then 'receivable' when 'purchase' then 'payable' when 'expense' then 'expense_payable' else null end;if a is null then raise exception 'INVALID_KIND';end if;
 select coalesce(sum(signed_minor),0) into v from public.khata_journal where company_id=cid and party_id=pid and effective_date<=d and account=a;return (v*case when a='receivable' then 1 else -1 end)::text;
end $$;
create function public.khata_expense_post_v2(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid:=(p->>'company')::uuid;eid uuid:=(p->>'id')::uuid;pid uuid:=(p->>'parent')::uuid;d date:=(p->>'date')::date;amt numeric:=(p->>'amount')::numeric;target public.khata_parties;original public.khata_opening_expense_payments;existing public.khata_opening_expense_payments;paid numeric;begin
 perform orbis_khata.inventory_access(cid,true);perform pg_advisory_xact_lock(hashtextextended('expense-company:'||cid::text,0));
 select * into target from public.khata_parties where id=pid and company_id=cid and kind='expense' and opening_side='due' and opening_amount>0;
 select * into original from public.khata_opening_expense_payments where id=pid and company_id=cid;
 if target.id is null and original.id is null then return public.khata_expense_post_v1(p);end if;
 select * into existing from public.khata_opening_expense_payments where id=eid;
 if existing.id is not null then if existing.company_id<>cid or existing.payload<>p then raise exception 'IDEMPOTENCY_CONFLICT';end if;return eid;end if;
 if amt<=0 or amt<>trunc(amt) or d>(now() at time zone 'Asia/Kolkata')::date then raise exception 'INVALID_PAYMENT';end if;
 if p->>'kind'='payment' then
  if target.id is null or d<target.opening_date or coalesce(p->>'method','') not in('cash','bank') then raise exception 'INVALID_OPENING_PAYMENT';end if;
  select coalesce(sum(amount_minor*(case when reverses_id is null then 1 else -1 end)),0) into paid from public.khata_opening_expense_payments where company_id=cid and party_id=pid;
  if paid+amt>target.opening_amount then raise exception 'EXPENSE_OVERPAYMENT';end if;
  insert into public.khata_opening_expense_payments(id,company_id,party_id,effective_date,amount_minor,method,payload) values(eid,cid,pid,d,amt,p->>'method',p);
 elsif p->>'kind'='reversal' then
  if original.id is null or original.reverses_id is not null or amt<>original.amount_minor or d<original.effective_date or length(btrim(p->>'note'))=0 or exists(select 1 from public.khata_opening_expense_payments where reverses_id=pid) then raise exception 'INVALID_REVERSAL';end if;
  insert into public.khata_opening_expense_payments(id,company_id,party_id,effective_date,amount_minor,method,reverses_id,payload) values(eid,cid,original.party_id,d,amt,original.method,pid,p);
 else raise exception 'INVALID_KIND';end if;return eid;end $$;
create function public.khata_expense_bill_v2(p jsonb,p_lines jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid:=(p->>'company')::uuid;eid uuid;line jsonb;total numeric:=0;rate numeric;begin
 perform orbis_khata.inventory_access(cid,true);
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 50 or p->>'kind'<>'charge' then raise exception 'INVALID_EXPENSE_LINES';end if;
 for line in select value from jsonb_array_elements(p_lines) loop
  if length(btrim(line->>'description')) not between 1 and 120 or line->>'quantity' !~ '^[1-9][0-9]{0,11}$' then raise exception 'INVALID_EXPENSE_LINE';end if;
  if line ? 'unit_rate' then
   if line->>'unit_rate' !~ '^[0-9]{1,10}([.][0-9]{1,8})?$' then raise exception 'INVALID_RATE';end if;rate:=(line->>'unit_rate')::numeric*100;
  else if line->>'rate' !~ '^(0|[1-9][0-9]{0,11})$' then raise exception 'INVALID_RATE';end if;rate:=(line->>'rate')::numeric;end if;
  if rate<=0 or round((line->>'quantity')::numeric*rate/1000000)<=0 then raise exception 'INVALID_RATE';end if;total:=total+round((line->>'quantity')::numeric*rate/1000000);
 end loop;
 if total<>(p->>'amount')::numeric then raise exception 'INVALID_EXPENSE_TOTAL';end if;
 eid:=public.khata_expense_post_v2(p);
 if exists(select 1 from public.khata_expense_bill_lines where id=eid and (company_id<>cid or khata_expense_bill_lines.lines<>p_lines)) then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 insert into public.khata_expense_bill_lines values(eid,cid,p_lines) on conflict(id) do nothing;return eid;end $$;
create function public.khata_expense_report_v2(cid uuid,dfrom date,dto date,skip integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;balances jsonb;opening_bills jsonb;begin
 perform orbis_khata.inventory_access(cid,false);result:=public.khata_expense_report_v1(cid,dfrom,dto,skip);
 select coalesce(jsonb_object_agg(account,jsonb_build_object('opening',opening::text,'movement',movement::text,'closing',closing::text)),'{}'::jsonb) into balances from(
 select account,coalesce(sum(signed_minor) filter(where effective_date<dfrom),0) opening,coalesce(sum(signed_minor) filter(where effective_date>=dfrom),0) movement,sum(signed_minor) closing from public.khata_expense_full_journal where company_id=cid and effective_date<=dto group by account)j;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'effective_date',opening_date,'category',name,'payee',name,'amount',opening_amount::text,'due',due::text)),'[]'::jsonb) into opening_bills from(
 select p.*,p.opening_amount-coalesce((select sum(e.amount_minor*(case when e.reverses_id is null then 1 else -1 end)) from public.khata_opening_expense_payments e where e.company_id=cid and e.party_id=p.id and e.effective_date<=dto),0) due from public.khata_parties p where company_id=cid and kind='expense' and opening_side='due' and opening_date<=dto)q where due>0;
 result:=jsonb_set(result,'{balances}',balances);result:=jsonb_set(result,'{bills}',(result->'bills')||opening_bills);
 if jsonb_array_length(result->'bills')>500 then raise exception 'EXPENSE_OPEN_BILL_LIMIT';end if;
 with entries as (
 select e.id,e.effective_date,e.kind,e.category,e.payee,e.amount_minor::text amount,e.method,e.parent_id,e.reverses_id,e.reference,e.note,exists(select 1 from public.khata_expense_events r where r.reverses_id=e.id and r.effective_date<=dto) reversed from public.khata_expense_events e where e.company_id=cid and e.effective_date between dfrom and dto
 union all
 select e.id,e.effective_date,case when e.reverses_id is null then 'payment' else 'reversal' end,p.name,p.name,e.amount_minor::text,e.method,case when e.reverses_id is null then e.party_id else null end,e.reverses_id,coalesce(e.payload->>'reference',''),coalesce(e.payload->>'note',''),exists(select 1 from public.khata_opening_expense_payments r where r.reverses_id=e.id and r.effective_date<=dto) from public.khata_opening_expense_payments e join public.khata_parties p on p.id=e.party_id and p.company_id=cid where e.company_id=cid and e.effective_date between dfrom and dto
 ) select jsonb_set(jsonb_set(result,'{count}',to_jsonb((select count(*) from entries))),'{entries}',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('bill_lines',l.lines) order by e.effective_date desc,e.id desc) from (select * from entries order by effective_date desc,id desc limit 50 offset skip)e left join public.khata_expense_bill_lines l on l.id=e.id and l.company_id=cid),'[]'::jsonb)) into result;
 return result;end $$;
create function public.khata_prepare_company_v2(cid uuid) returns void language sql security definer set search_path='' as $$select orbis_khata.ensure_warehouse(cid)$$;
revoke all on function orbis_khata.ensure_warehouse(uuid) from public,anon,authenticated;
do $$declare f record;begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in('khata_masters_v2','khata_master_save_v2','khata_master_delete_v2','khata_party_balance_v2','khata_expense_post_v2','khata_expense_bill_v2','khata_expense_report_v2','khata_prepare_company_v2') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to authenticated',f.signature);
end loop;end $$;

CREATE OR REPLACE FUNCTION orbis_khata.inventory_write(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cid uuid; eid uuid; d date; k text; x jsonb; q numeric; rate numeric; total numeric:=0;
 iid uuid; wid uuid; dest uuid; idx integer:=0; existing public.khata_inventory_documents; master boolean;
begin
 if p is null or jsonb_typeof(p)<>'object' or (select count(*) from jsonb_object_keys(p))<>11 or
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
  if exists(select 1 from public.khata_stock_journal where company_id=cid and item_id=iid and warehouse_id in (wid,dest) and effective_date>d) then raise exception 'STOCK_DATE_BEFORE_ACTIVITY';end if;
  if x ? 'unit_rate' then
   if k not in ('sale','purchase') or jsonb_typeof(x->'unit_rate')<>'string' or x->>'unit_rate' !~ '^[0-9]{1,10}([.][0-9]{1,8})?$' then raise exception 'INVALID_RATE';end if;rate:=(x->>'unit_rate')::numeric*100;
  end if;
  if k in ('sale','purchase') then
   if rate<=0 or round(q*rate/1000000)<=0 then raise exception 'INVALID_RATE';end if;
   total:=total+round(q*rate/1000000);
  elsif rate<>0 then raise exception 'INVALID_RATE';end if;
 end loop;
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
 if exists(select 1 from public.khata_stock_journal where company_id=cid group by item_id,warehouse_id having sum(quantity)<0) then raise exception 'INSUFFICIENT_STOCK';end if;
 if k in ('sale','purchase') then
  perform public.khata_post_v1(eid,cid,(p->>'party')::uuid,k,d,total::text,'cash',p->>'reference',p->>'note',null);
 end if;
 return eid;
end $function$;


CREATE OR REPLACE FUNCTION public.khata_report_v1(p_company uuid, p_from date, p_to date, p_party uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.khata_companies where id=p_company and owner_id=auth.uid()) then raise exception 'COMPANY_NOT_ACCESSIBLE'; end if;
  if p_from is null or p_to is null or p_from>p_to or p_offset<0 then raise exception 'INVALID_PERIOD'; end if;
  if p_party is not null and not exists(select 1 from public.khata_parties where id=p_party and company_id=p_company) then raise exception 'PARTY_NOT_ACCESSIBLE'; end if;
  with journal as (
    select * from public.khata_journal where company_id=p_company and effective_date<=p_to
  ), balances as (
    select account,sum(signed_minor) as closing,
      coalesce(sum(signed_minor) filter(where effective_date>=p_from),0) as movement,
      coalesce(sum(signed_minor) filter(where effective_date<p_from),0) as opening
    from journal group by account
  ), ledger_balances as (
    select account,coalesce(sum(signed_minor) filter(where effective_date<p_from),0) as opening,
      sum(signed_minor) as closing
    from journal where p_party is null or party_id=p_party group by account
  ), parties as (
    select p.id,p.name,p.kind,
      coalesce(sum(j.signed_minor) filter(where j.account='receivable'),0) as receivable,
      -coalesce(sum(j.signed_minor) filter(where j.account='payable'),0) as payable
    from public.khata_parties p left join journal j on j.party_id=p.id
    where p.company_id=p_company group by p.id
  ), entries as (
    select v.*,p.name as party_name,
      exists(select 1 from public.khata_vouchers r where r.reverses_id=v.id) as reversed
    from public.khata_vouchers v join public.khata_parties p on p.id=v.party_id and p.company_id=v.company_id
    where v.company_id=p_company and v.effective_date between p_from and p_to and (p_party is null or v.party_id=p_party)
  ) select jsonb_build_object(
    'balances',coalesce((select jsonb_object_agg(account,jsonb_build_object('closing',closing::text,'movement',movement::text,'opening',opening::text)) from balances),'{}'::jsonb),
    'ledger_balances',coalesce((select jsonb_object_agg(account,jsonb_build_object('opening',opening::text,'closing',closing::text)) from ledger_balances),'{}'::jsonb),
    'parties',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind,'receivable',receivable::text,'payable',payable::text) order by name,id) from parties),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(to_jsonb(e)-'amount_minor'||jsonb_build_object('amount_minor',e.amount_minor::text) order by effective_date desc,created_at desc,id desc)
      from (select * from entries order by effective_date desc,created_at desc,id desc limit 50 offset p_offset) e),'[]'::jsonb),
    'count',(select count(*) from entries), 'as_of',now()
  ) into result;
  result:=result||jsonb_build_object('opening_entries',coalesce((select jsonb_agg(jsonb_build_object('id','opening:'||id::text,'party_id',id,'date',opening_date,'side',opening_side,'amount',opening_amount::text)) from public.khata_parties where company_id=p_company and opening_amount>0 and opening_date<=p_to and (p_party is null or id=p_party)),'[]'::jsonb));
  return result;
end $function$;


CREATE OR REPLACE FUNCTION public.khata_inventory_report_v1(cid uuid, dfrom date, dto date, skip integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
 -- Read helper is private; use the same explicit boundary without granting its execution.
 if auth.uid() is null or current_setting('orbis.khata.gateway_verified',true) is distinct from 'v1' or not exists(select 1 from public.khata_companies c where c.id=cid and c.owner_id=auth.uid()) then raise exception 'COMPANY_NOT_ACCESSIBLE';end if;
 if dfrom is null or dto is null or dfrom>dto or skip is null or skip<0 then raise exception 'INVALID_PERIOD';end if;
 if (select count(*) from public.khata_items where company_id=cid)>1000 or (select count(*) from public.khata_warehouses where company_id=cid)>100 or
 (select count(*) from (select item_id,warehouse_id from public.khata_stock_journal where company_id=cid and effective_date<=dto group by item_id,warehouse_id) x)>3000 then raise exception 'INVENTORY_REPORT_LIMIT';end if;
 return jsonb_build_object(
 'items',coalesce((select jsonb_agg(to_jsonb(i)-'company_id' order by code,id) from public.khata_items i where company_id=cid),'[]'::jsonb),
 'warehouses',coalesce((select jsonb_agg(to_jsonb(w)-'company_id' order by code,id) from public.khata_warehouses w where company_id=cid),'[]'::jsonb),
 'stocks',coalesce((select jsonb_agg(jsonb_build_object('item',item_id,'warehouse',warehouse_id,'opening',opening::text,'incoming',incoming::text,'outgoing',outgoing::text,'closing',closing::text) order by item_id,warehouse_id) from (
 select item_id,warehouse_id,coalesce(sum(quantity) filter(where effective_date<dfrom),0) as opening,
 coalesce(sum(quantity) filter(where effective_date>=dfrom and quantity>0),0) as incoming,
 -coalesce(sum(quantity) filter(where effective_date>=dfrom and quantity<0),0) as outgoing,sum(quantity) as closing
 from public.khata_stock_journal where company_id=cid and effective_date<=dto group by item_id,warehouse_id) x),'[]'::jsonb),
 'documents',coalesce((select jsonb_agg(payload||jsonb_build_object('total',total_minor::text,'reversed',exists(select 1 from public.khata_stock_reversals r where r.original_id=e.id and r.effective_date<=dto),'party_name',(select name from public.khata_parties p where p.id=(e.payload->>'party')::uuid and p.company_id=cid)) order by effective_date desc,created_at desc,id desc) from (
 select * from public.khata_inventory_documents where company_id=cid and effective_date between dfrom and dto and kind not in ('item','warehouse') order by effective_date desc,created_at desc,id desc limit 50 offset skip) e),'[]'::jsonb),
 'count',(select count(*) from public.khata_inventory_documents where company_id=cid and effective_date between dfrom and dto and kind not in ('item','warehouse')));
end $function$;


do $$declare c record;begin for c in select id,owner_id from public.khata_companies where not exists(select 1 from public.khata_warehouses w where w.company_id=khata_companies.id) loop
 perform set_config('orbis.khata.gateway_verified','v1',true);perform set_config('request.jwt.claims',jsonb_build_object('sub',c.owner_id,'role','authenticated')::text,true);perform orbis_khata.ensure_warehouse(c.id);
end loop;perform set_config('request.jwt.claims','{}',true);perform set_config('orbis.khata.gateway_verified','',true);end $$;

create index khata_opening_payment_party on public.khata_opening_expense_payments(company_id,party_id,effective_date);
create index khata_expense_bill_company on public.khata_expense_bill_lines(company_id);
create index khata_master_audit_company on public.khata_master_audit(company_id,created_at);
