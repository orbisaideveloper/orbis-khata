-- Continuous production: internal stock movements only; existing trade journals remain authoritative.
alter table public.khata_inventory_documents drop constraint khata_inventory_documents_kind_check;
alter table public.khata_inventory_documents add constraint khata_inventory_documents_kind_check check(kind in('item','warehouse','purchase','sale','opening','transfer','production-input','production-output'));
create table public.khata_production_posts(id uuid primary key references public.khata_inventory_documents(id) on delete cascade,company_id uuid not null references public.khata_companies(id) on delete cascade,payload jsonb not null);
create table public.khata_production_routes(invoice_id uuid primary key references public.khata_inventory_documents(id) on delete cascade,company_id uuid not null references public.khata_companies(id) on delete cascade,input_id uuid not null references public.khata_inventory_documents(id) on delete cascade,payload jsonb not null,result jsonb not null);
alter table public.khata_production_posts enable row level security;
alter table public.khata_production_routes enable row level security;
revoke all on public.khata_production_posts,public.khata_production_routes from public,anon,authenticated;
create function orbis_khata.production_post(p jsonb) returns uuid language plpgsql security definer set search_path='' as $fn$
declare cid uuid:=(p->>'company')::uuid;eid uuid:=(p->>'id')::uuid;d date:=(p->>'date')::date;k text:=p->>'kind';x jsonb;iid uuid;wid uuid;q numeric;idx integer:=0;prior public.khata_production_posts;available numeric;
begin
 perform orbis_khata.inventory_access(cid,true);
 perform pg_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0));
 perform pg_advisory_xact_lock(hashtextextended('stock-id:'||eid::text,0));
 select * into prior from public.khata_production_posts where id=eid;
 if found then if prior.company_id<>cid or prior.payload is distinct from p then raise exception 'IDEMPOTENCY_CONFLICT';end if;return eid;end if;
 if not coalesce((select (settings->>'production')::boolean from public.khata_workspace_settings where company_id=cid),false) then raise exception 'PRODUCTION_DISABLED';end if;
 if eid is null or d is null or p->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or d>(now() at time zone 'Asia/Kolkata')::date or k not in('production-input','production-output') or jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') not between 1 and 50 or not orbis_khata.inventory_text(p->'note',500) or length(btrim(p->>'note'))=0 then raise exception 'INVALID_PRODUCTION';end if;
 if k='production-output' and jsonb_array_length(p->'lines')<>1 then raise exception 'ONE_PRODUCTION_OUTPUT_ITEM_REQUIRED';end if;
 -- No financial journal, supplier account, payment or bill number is created here.
 insert into public.khata_inventory_documents(id,company_id,kind,effective_date,payload,total_minor,actor_id) values(eid,cid,k,d,p,0,auth.uid());
 for x in select value from jsonb_array_elements(p->'lines') loop
  iid:=(x->>'item')::uuid;wid:=(x->>'warehouse')::uuid;
  if jsonb_typeof(x->'quantity') is distinct from 'string' or coalesce(x->>'quantity','') !~ '^[1-9][0-9]{0,11}$' then raise exception 'INVALID_QUANTITY';end if;q:=(x->>'quantity')::numeric;
  if not exists(select 1 from public.khata_items where id=iid and company_id=cid) or not exists(select 1 from public.khata_warehouses where id=wid and company_id=cid) then raise exception 'STOCK_MASTER_NOT_ACCESSIBLE';end if;
  if k='production-output' then
   if exists(select 1 from public.khata_inventory_documents e cross join lateral jsonb_array_elements(e.payload->'lines') l where e.company_id=cid and ((e.kind='production-output' and l->>'item'<>iid::text) or (e.kind='production-input' and l->>'item'=iid::text))) then raise exception 'ONE_PRODUCTION_OUTPUT_ITEM_REQUIRED';end if;
  else
   if exists(select 1 from public.khata_inventory_documents e cross join lateral jsonb_array_elements(e.payload->'lines') l where e.company_id=cid and e.kind='production-output' and l->>'item'=iid::text) then raise exception 'PRODUCTION_OUTPUT_CANNOT_BE_INPUT';end if;
   select coalesce(sum(quantity),0) into available from public.khata_stock_journal where company_id=cid and item_id=iid and warehouse_id=wid and effective_date<=d;
   if available<q then raise exception 'INSUFFICIENT_PRODUCTION_STOCK';end if;
   select coalesce(sum(quantity),0) into available from public.khata_stock_journal where company_id=cid and item_id=iid and warehouse_id=wid;
   if available<q then raise exception 'INSUFFICIENT_PRODUCTION_STOCK';end if;
  end if;
  idx:=idx+1;
  insert into public.khata_stock_movements values(eid,idx,cid,iid,wid,d,case when k='production-input' then -q else q end);
 end loop;
 insert into public.khata_production_posts values(eid,cid,p);return eid;
end $fn$;
revoke all on function orbis_khata.production_post(jsonb) from public,anon,authenticated;
alter function public.khata_workspace_v3(jsonb) rename to khata_workspace_v3_before_production;
revoke all on function public.khata_workspace_v3_before_production(jsonb) from public,anon,authenticated;
create function public.khata_workspace_v3(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare cid uuid:=(p->>'company')::uuid;a text:=p->>'action';b jsonb;doc jsonb;answer jsonb;eid uuid;input_id uuid;prior public.khata_production_routes;
begin
 if a='production' then
  doc:=jsonb_build_object('id',p->'id','company',cid,'kind',case when p->>'kind'='input' then 'production-input' when p->>'kind'='output' then 'production-output' else '' end,'date',p->'date','code','','name','','unit','','party',null,'reference','','note',p->'note','lines',jsonb_build_array(jsonb_build_object('item',p->'item','warehouse',p->'warehouse','to',null,'quantity',p->'quantity','rate','0')));
  return jsonb_build_object('id',orbis_khata.production_post(doc));
 end if;
 -- Delegate legacy actions first, including restore of a retired company.
 if a is distinct from 'invoice-save' then return public.khata_workspace_v3_before_production(p);end if;
 perform orbis_khata.inventory_access(cid,true);
 perform pg_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0));
 b:=p->'command'->'bill';eid:=(b->>'id')::uuid;
 select * into prior from public.khata_production_routes where invoice_id=eid;
 if found then if prior.company_id<>cid or prior.payload is distinct from p then raise exception 'IDEMPOTENCY_CONFLICT';end if;return prior.result;end if;
 if not(p?'production') then return public.khata_workspace_v3_before_production(p);end if;
 if p->'production' is distinct from 'true'::jsonb or b->>'kind' is distinct from 'purchase' or p->'command'->>'action' is distinct from 'bill' or (b->>'company')::uuid is distinct from cid then raise exception 'INVALID_PRODUCTION';end if;
 if exists(select 1 from public.khata_invoice_saves where id=eid) then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 answer:=public.khata_workspace_v3_before_production(p-'production');
 input_id:=gen_random_uuid();
 select jsonb_build_object('id',input_id,'company',cid,'kind','production-input','date',effective_date,'code','','name','','unit','','party',null,'reference',payload->>'reference','note','Purchase to production','lines',(select jsonb_agg(jsonb_build_object('item',l->'item','warehouse',l->'warehouse','to',null,'quantity',l->'quantity','rate','0')) from jsonb_array_elements(payload->'lines') l)) into doc from public.khata_inventory_documents where id=eid and company_id=cid;
 perform orbis_khata.production_post(doc);
 insert into public.khata_production_routes values(eid,cid,input_id,p,answer);return answer;
end $fn$;
revoke all on function public.khata_workspace_v3(jsonb) from public,anon;
grant execute on function public.khata_workspace_v3(jsonb) to authenticated;
-- Reversing a routed purchase also returns its production input; both remain audited.
create function orbis_khata.production_purchase_reverse() returns trigger language plpgsql security definer set search_path='' as $fn$
declare source uuid;
begin
 if new.kind='reversal' then
  select input_id into source from public.khata_production_routes where invoice_id=new.reverses_id and company_id=new.company_id;
  if source is not null then
   insert into public.khata_stock_reversals(voucher_id,original_id,ordinal,company_id,item_id,warehouse_id,effective_date,quantity)
    select new.id,source,ordinal+(select coalesce(max(m.ordinal),0) from public.khata_stock_movements m where m.document_id=new.reverses_id),company_id,item_id,warehouse_id,new.effective_date,-quantity from public.khata_stock_movements where document_id=source;
  end if;
 end if;return new;
end $fn$;
revoke all on function orbis_khata.production_purchase_reverse() from public,anon,authenticated;
create trigger khata_production_purchase_reverse after insert on public.khata_vouchers for each row execute function orbis_khata.production_purchase_reverse();
