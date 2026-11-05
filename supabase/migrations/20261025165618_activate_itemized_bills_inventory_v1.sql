-- PREPARED ONLY. Khata project gqyaxsczlmvppxuoqbox; apply through one approved managed migration.
-- Adds quantity inventory and itemized bills. Does not infer inventory from old amount-only vouchers.
create table public.khata_inventory_documents (
 id uuid primary key, company_id uuid not null references public.khata_companies(id),
 kind text not null check(kind in ('item','warehouse','purchase','sale','opening','transfer')),
 effective_date date not null, payload jsonb not null, total_minor numeric not null default 0,
 actor_id uuid not null references orbis_khata.ledger_owners(id), created_at timestamptz not null default now(),
 unique(company_id,id), check(total_minor=trunc(total_minor) and total_minor between 0 and 999999999999)
);
create table public.khata_items (
 id uuid primary key, company_id uuid not null references public.khata_companies(id),
 code text not null check(char_length(btrim(code)) between 1 and 40),
 name text not null check(char_length(btrim(name)) between 1 and 120),
 unit text not null check(char_length(btrim(unit)) between 1 and 24),
 unique(company_id,id), foreign key(company_id,id) references public.khata_inventory_documents(company_id,id)
);
create unique index khata_item_code on public.khata_items(company_id,lower(code));
create table public.khata_warehouses (
 id uuid primary key, company_id uuid not null references public.khata_companies(id),
 code text not null check(char_length(btrim(code)) between 1 and 40),
 name text not null check(char_length(btrim(name)) between 1 and 120),
 unique(company_id,id), foreign key(company_id,id) references public.khata_inventory_documents(company_id,id)
);
create unique index khata_warehouse_code on public.khata_warehouses(company_id,lower(code));
create table public.khata_stock_movements (
 document_id uuid not null, ordinal integer not null, company_id uuid not null,
 item_id uuid not null, warehouse_id uuid not null, effective_date date not null,
 quantity numeric not null check(quantity=trunc(quantity) and quantity<>0 and abs(quantity)<=999999999999),
 primary key(document_id,ordinal),
 foreign key(company_id,document_id) references public.khata_inventory_documents(company_id,id),
 foreign key(company_id,item_id) references public.khata_items(company_id,id),
 foreign key(company_id,warehouse_id) references public.khata_warehouses(company_id,id)
);
create index khata_stock_period on public.khata_stock_movements(company_id,item_id,warehouse_id,effective_date);
create index khata_inventory_period on public.khata_inventory_documents(company_id,effective_date,id);
-- Opposite stock movements link to the existing immutable reversal voucher, not a second financial entry.
create table public.khata_stock_reversals (
 voucher_id uuid not null, original_id uuid not null, ordinal integer not null,
 company_id uuid not null, item_id uuid not null, warehouse_id uuid not null,
 effective_date date not null, quantity numeric not null,
 primary key(voucher_id,ordinal), unique(original_id,ordinal),
 foreign key(company_id,voucher_id) references public.khata_vouchers(company_id,id),
 foreign key(company_id,original_id) references public.khata_inventory_documents(company_id,id),
 foreign key(company_id,item_id) references public.khata_items(company_id,id),
 foreign key(company_id,warehouse_id) references public.khata_warehouses(company_id,id)
);
create index khata_stock_reversal_period on public.khata_stock_reversals(company_id,item_id,warehouse_id,effective_date);
create view public.khata_stock_journal with(security_invoker=true) as
 select company_id,item_id,warehouse_id,effective_date,quantity from public.khata_stock_movements
 union all select company_id,item_id,warehouse_id,effective_date,quantity from public.khata_stock_reversals;
create function orbis_khata.inventory_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_INVENTORY'; end $$;
do $$declare tab text;begin
 foreach tab in array array['khata_inventory_documents','khata_items','khata_warehouses','khata_stock_movements','khata_stock_reversals'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('alter table public.%I force row level security',tab);
  execute format('revoke all on public.%I from public,anon,authenticated',tab);
  execute format('grant select on public.%I to authenticated',tab);
  execute format('create policy owner_gateway_read on public.%I for select to authenticated using(current_setting(''orbis.khata.gateway_verified'',true)=''v1'' and exists(select 1 from public.khata_companies c where c.id=company_id and c.owner_id=(select auth.uid())))',tab);
  execute format('create trigger inventory_immutable before update or delete on public.%I for each row execute function orbis_khata.inventory_immutable()',tab);
 end loop;
end $$;
revoke all on public.khata_stock_journal from public,anon,authenticated;
grant select on public.khata_stock_journal to authenticated;
revoke all on function orbis_khata.inventory_immutable() from public,anon,authenticated;

create function orbis_khata.inventory_access(cid uuid,writing boolean) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or current_setting('orbis.khata.gateway_verified',true) is distinct from 'v1' or
 not exists(select 1 from public.khata_companies c where c.id=cid and c.owner_id=auth.uid()) then raise exception 'COMPANY_NOT_ACCESSIBLE'; end if;
 if writing and not coalesce((select enabled from public.khata_write_controls where singleton),false) then raise exception 'WRITES_DISABLED'; end if;
end $$;
revoke all on function orbis_khata.inventory_access(uuid,boolean) from public,anon,authenticated;
create function orbis_khata.inventory_text(v jsonb,lim integer) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='string' and char_length(v#>>'{}')<=lim and (v#>>'{}') !~ '[<>[:cntrl:]]',false)
$$;
revoke all on function orbis_khata.inventory_text(jsonb,integer) from public,anon,authenticated;

create function orbis_khata.inventory_write(p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
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
  if jsonb_typeof(x)<>'object' or (select count(*) from jsonb_object_keys(x))<>5 or not(x ?& array['item','warehouse','to','quantity','rate']) or
  jsonb_typeof(x->'quantity')<>'string' or coalesce(x->>'quantity','') !~ '^[1-9][0-9]{0,11}$' or
  jsonb_typeof(x->'rate')<>'string' or coalesce(x->>'rate','') !~ '^(0|[1-9][0-9]{0,11})$' then raise exception 'INVALID_STOCK_LINE';end if;
  iid:=(x->>'item')::uuid;wid:=(x->>'warehouse')::uuid;dest:=(x->>'to')::uuid;q:=(x->>'quantity')::numeric;rate:=(x->>'rate')::numeric;
  if not exists(select 1 from public.khata_items where id=iid and company_id=cid) or not exists(select 1 from public.khata_warehouses where id=wid and company_id=cid) then raise exception 'STOCK_MASTER_NOT_ACCESSIBLE';end if;
  if k='transfer' then
   if dest is null or dest=wid or not exists(select 1 from public.khata_warehouses where id=dest and company_id=cid) then raise exception 'INVALID_TRANSFER';end if;
  elsif x->'to'<>'null'::jsonb then raise exception 'INVALID_DESTINATION';end if;
  if exists(select 1 from public.khata_stock_journal where company_id=cid and item_id=iid and warehouse_id in (wid,dest) and effective_date>d) then raise exception 'STOCK_DATE_BEFORE_ACTIVITY';end if;
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
 if k='item' then insert into public.khata_items values(eid,cid,p->>'code',p->>'name',p->>'unit');end if;
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
end $$;
revoke all on function orbis_khata.inventory_write(jsonb) from public,anon,authenticated;
grant usage on schema orbis_khata to authenticated;
grant execute on function orbis_khata.inventory_write(jsonb) to authenticated;
create function public.khata_inventory_post_v1(p jsonb) returns uuid language sql security invoker set search_path='' as $$select orbis_khata.inventory_write(p)$$;
revoke all on function public.khata_inventory_post_v1(jsonb) from public,anon;
grant execute on function public.khata_inventory_post_v1(jsonb) to authenticated;

create function orbis_khata.inventory_reverse() returns trigger language plpgsql security definer set search_path='' as $$
declare original public.khata_inventory_documents;
begin
 if new.kind<>'reversal' then return new;end if;
 perform orbis_khata.inventory_access(new.company_id,true);
 perform pg_advisory_xact_lock(hashtextextended('stock-company:'||new.company_id::text,0));
 select * into original from public.khata_inventory_documents where id=new.reverses_id and company_id=new.company_id and kind in ('sale','purchase');
 if original.id is null then return new;end if;
 if exists(select 1 from public.khata_stock_movements m join public.khata_stock_journal j using(company_id,item_id,warehouse_id) where m.document_id=original.id and j.effective_date>new.effective_date) then raise exception 'STOCK_DATE_BEFORE_ACTIVITY';end if;
 insert into public.khata_stock_reversals(voucher_id,original_id,ordinal,company_id,item_id,warehouse_id,effective_date,quantity)
 select new.id,original.id,ordinal,company_id,item_id,warehouse_id,new.effective_date,-quantity from public.khata_stock_movements where document_id=original.id;
 if exists(select 1 from public.khata_stock_journal where company_id=new.company_id group by item_id,warehouse_id having sum(quantity)<0) then raise exception 'INSUFFICIENT_STOCK';end if;
 return new;
end $$;
revoke all on function orbis_khata.inventory_reverse() from public,anon,authenticated;
create trigger inventory_voucher_reversal after insert on public.khata_vouchers for each row execute function orbis_khata.inventory_reverse();

create function public.khata_inventory_report_v1(cid uuid,dfrom date,dto date,skip integer default 0) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
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
 'documents',coalesce((select jsonb_agg(payload||jsonb_build_object('total',total_minor::text,'reversed',exists(select 1 from public.khata_stock_reversals r where r.original_id=e.id),'party_name',(select name from public.khata_parties p where p.id=(e.payload->>'party')::uuid and p.company_id=cid)) order by effective_date desc,created_at desc,id desc) from (
 select * from public.khata_inventory_documents where company_id=cid and effective_date between dfrom and dto and kind not in ('item','warehouse') order by effective_date desc,created_at desc,id desc limit 50 offset skip) e),'[]'::jsonb),
 'count',(select count(*) from public.khata_inventory_documents where company_id=cid and effective_date between dfrom and dto and kind not in ('item','warehouse')));
end $$;
revoke all on function public.khata_inventory_report_v1(uuid,date,date,integer) from public,anon;
grant execute on function public.khata_inventory_report_v1(uuid,date,date,integer) to authenticated;
