-- Save-time allocation. This migration never renumbers existing posted records.
create table public.khata_invoice_saves(id uuid primary key,company_id uuid not null references public.khata_companies(id) on delete cascade,payload jsonb not null,result jsonb not null);
create index khata_invoice_saves_company_idx on public.khata_invoice_saves(company_id);
alter table public.khata_invoice_saves enable row level security;
revoke all on public.khata_invoice_saves from public,anon,authenticated;
-- Existing roundoff stores a signed bill-level adjustment. Widen its exact minor-unit
-- range for discounts without changing the historical payload or journal model.
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('orbis_khata.inventory_write(jsonb)'::regprocedure);
 if position('^-?[0-9]{1,4}$' in definition)=0 then raise exception 'EXPECTED_ADJUSTMENT_VALIDATION_MISSING';end if;
 execute replace(definition,'^-?[0-9]{1,4}$','^-?[0-9]{1,12}$');
end $patch$;
create function orbis_khata.expense_bill_discount(p jsonb,p_lines jsonb,discount text) returns uuid language plpgsql security definer set search_path='' as $fn$
declare cid uuid:=(p->>'company')::uuid;eid uuid;line jsonb;total numeric:=0;rate numeric;
begin
 perform orbis_khata.inventory_access(cid,true);
 if coalesce(discount,'') !~ '^(0|[1-9][0-9]{0,11})$' or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 50 or p->>'kind'<>'charge' then raise exception 'INVALID_EXPENSE_LINES';end if;
 for line in select value from jsonb_array_elements(p_lines) loop
  if length(btrim(line->>'description')) not between 1 and 120 or line->>'quantity' !~ '^[1-9][0-9]{0,11}$' then raise exception 'INVALID_EXPENSE_LINE';end if;
  if line ? 'unit_rate' then
   if line->>'unit_rate' !~ '^[0-9]{1,10}([.][0-9]{1,8})?$' then raise exception 'INVALID_RATE';end if;rate:=(line->>'unit_rate')::numeric*100;
  else
   if line->>'rate' !~ '^(0|[1-9][0-9]{0,11})$' then raise exception 'INVALID_RATE';end if;rate:=(line->>'rate')::numeric;
  end if;
  if rate<=0 or round((line->>'quantity')::numeric*rate/1000000)<=0 then raise exception 'INVALID_RATE';end if;
  total:=total+round((line->>'quantity')::numeric*rate/1000000);
 end loop;
 if total-discount::numeric<>(p->>'amount')::numeric or total-discount::numeric<=0 then raise exception 'INVALID_EXPENSE_TOTAL';end if;
 eid:=public.khata_expense_post_v2(p);
 if exists(select 1 from public.khata_expense_bill_lines where id=eid and (company_id<>cid or lines<>p_lines)) then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 insert into public.khata_expense_bill_lines values(eid,cid,p_lines) on conflict(id) do nothing;
 return eid;
end $fn$;
revoke all on function orbis_khata.expense_bill_discount(jsonb,jsonb,text) from public,anon,authenticated;
create function orbis_khata.preview_bill_number(cid uuid,k text,d date) returns text language plpgsql security definer set search_path='' as $fn$
declare s jsonb;fy integer:=orbis_khata.fiscal_year(d);cy integer:=orbis_khata.fiscal_year((now() at time zone 'Asia/Kolkata')::date);seq bigint;ref text;
begin
 perform orbis_khata.inventory_access(cid,false);
 if k not in('sale','purchase','expense') or d is null then raise exception 'INVALID_NUMBER_REQUEST';end if;
 s:=public.khata_workspace_v3_numbered(jsonb_build_object('company',cid,'action','settings'));
 if coalesce(s->'mode'->>k,'auto')='manual' then raise exception 'MANUAL_NUMBER_REQUIRED';end if;
 select next_serial into seq from public.khata_fiscal_counters where company_id=cid and kind=k and fiscal_year=fy;
 seq:=coalesce(seq,case when fy=cy then (s->'next'->>k)::bigint else 1 end);
 loop
  if seq>99999999 then raise exception 'NUMBER_LIMIT';end if;ref:=seq::text;
  exit when not exists(select 1 from public.khata_fiscal_numbers where company_id=cid and kind=k and fiscal_year=fy and reference=ref)
   and not exists(select 1 from public.khata_vouchers where company_id=cid and kind=k and reference=ref and orbis_khata.fiscal_year(effective_date)=fy)
   and not exists(select 1 from public.khata_expense_events where company_id=cid and k='expense' and reference=ref and orbis_khata.fiscal_year(effective_date)=fy);
  seq:=seq+1;
 end loop;
 return ref;
end $fn$;
revoke all on function orbis_khata.preview_bill_number(uuid,text,date) from public,anon,authenticated;
alter function public.khata_workspace_v3(jsonb) rename to khata_workspace_v3_numbered;
revoke all on function public.khata_workspace_v3_numbered(jsonb) from public,anon,authenticated;
create function public.khata_workspace_v3(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare cid uuid:=(p->>'company')::uuid;a text:=p->>'action';cmd jsonb;b jsonb;k text;d date;eid uuid;s jsonb;ref text;answer jsonb;prior public.khata_invoice_saves;
begin
 if auth.uid() is null or current_setting('orbis.khata.gateway_verified',true) is distinct from 'v1' or not exists(select 1 from public.khata_companies where id=cid and owner_id=auth.uid()) then raise exception 'COMPANY_NOT_ACCESSIBLE';end if;
 if a in('number','number-preview') then return to_jsonb(orbis_khata.preview_bill_number(cid,p->>'kind',coalesce((p->>'date')::date,(now() at time zone 'Asia/Kolkata')::date)));end if;
 if a='expense' and p ? 'discount' then
  if (p->'command'->>'company')::uuid<>cid or (p->'command'->>'id')::uuid<>(p->>'id')::uuid then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('id',orbis_khata.expense_bill_discount(p->'command',p->'lines',p->>'discount'));
 end if;
 if a<>'invoice-save' then return public.khata_workspace_v3_numbered(p);end if;
 perform orbis_khata.inventory_access(cid,true);
 perform pg_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0));
 cmd:=p->'command';
 if (cmd->>'company')::uuid<>cid or cmd->>'action' not in('bill','expense') then raise exception 'INVALID_INVOICE';end if;
 if cmd->>'action'='bill' then b:=cmd->'bill';k:=b->>'kind';else b:=cmd->'command';k:='expense';end if;
 eid:=(b->>'id')::uuid;d:=(b->>'date')::date;
 if (b->>'company')::uuid<>cid or eid is null or d is null or k not in('sale','purchase','expense') then raise exception 'INVALID_INVOICE';end if;
 -- Also serialize a reused ID across companies; financial writes retain their own locks.
 perform pg_advisory_xact_lock(hashtextextended('invoice-save:'||eid::text,0));
 select * into prior from public.khata_invoice_saves where id=eid;
 if prior.id is not null then
  if prior.company_id<>cid or prior.payload<>p then raise exception 'IDEMPOTENCY_CONFLICT';end if;return prior.result;
 end if;
 s:=public.khata_workspace_v3_numbered(jsonb_build_object('company',cid,'action','settings'));
 if coalesce(s->'mode'->>k,'auto')='manual' then ref:=btrim(b->>'reference');
 else ref:=public.khata_workspace_v3_numbered(jsonb_build_object('company',cid,'action','number','id',eid,'kind',k,'date',d))#>>'{}';end if;
 if coalesce(ref,'')='' then raise exception 'BILL_NUMBER_REQUIRED';end if;
 if k='expense' then cmd:=jsonb_set(cmd,'{command,reference}',to_jsonb(ref));else cmd:=jsonb_set(cmd,'{bill,reference}',to_jsonb(ref));end if;
 answer:=public.khata_workspace_v3(cmd)||jsonb_build_object('id',eid,'reference',ref);
 insert into public.khata_invoice_saves values(eid,cid,p,answer);
 return answer;
end $fn$;
revoke all on function public.khata_workspace_v3(jsonb) from public,anon;
grant execute on function public.khata_workspace_v3(jsonb) to authenticated;
