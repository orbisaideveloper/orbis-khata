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
end $function$

