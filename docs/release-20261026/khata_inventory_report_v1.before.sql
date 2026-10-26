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
 'documents',coalesce((select jsonb_agg(payload||jsonb_build_object('total',total_minor::text,'reversed',exists(select 1 from public.khata_stock_reversals r where r.original_id=e.id),'party_name',(select name from public.khata_parties p where p.id=(e.payload->>'party')::uuid and p.company_id=cid)) order by effective_date desc,created_at desc,id desc) from (
 select * from public.khata_inventory_documents where company_id=cid and effective_date between dfrom and dto and kind not in ('item','warehouse') order by effective_date desc,created_at desc,id desc limit 50 offset skip) e),'[]'::jsonb),
 'count',(select count(*) from public.khata_inventory_documents where company_id=cid and effective_date between dfrom and dto and kind not in ('item','warehouse')));
end $function$

