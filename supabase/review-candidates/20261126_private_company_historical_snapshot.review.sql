-- ORBIS Khata v2: explicit authorized historical COMPANY snapshot review.
-- UNAPPLIED REVIEW CANDIDATE, not a migration or permission to deploy.
-- Baseline: private company capture + trusted device/group recovery review.
-- One fixed model for each company-scoped financial and master table, including
-- stock reversals. Stable composite primary keys; never assume every row has id.
-- Readers must re-check registration, company authority, epoch and high-water.
begin;
set local lock_timeout='5s';
do $required$ begin
  if to_regprocedure('sync_v2.assert_trusted_device(uuid,text,text,text,text,text,boolean)') is null
     or to_regprocedure('sync_v2.resolve_module_read(uuid,text,text,text)') is null
  then raise exception 'SYNC_COMPANY_SNAPSHOT_BASE_REQUIRED'; end if;
end $required$;

create function sync_v2.company_snapshot_rows(c uuid)
returns table(model text, row_key text, projection_json text)
language sql stable security definer set search_path='' as $$
  select 'khata_companies'::text, jsonb_build_array(r.id)::text, to_jsonb(r)::text
    from public.khata_companies r where r.id=c
  union all
  select 'khata_bill_numbers'::text, jsonb_build_array(r.id)::text, to_jsonb(r)::text
    from public.khata_bill_numbers r where r.company_id=c
  union all
  select 'khata_expense_bill_lines'::text, jsonb_build_array(r.id)::text, to_jsonb(r)::text
    from public.khata_expense_bill_lines r where r.company_id=c
  union all
  select 'khata_expense_events'::text, jsonb_build_array(r.id)::text, to_jsonb(r)::text
    from public.khata_expense_events r where r.company_id=c
  union all
  select 'khata_expense_profile_operations'::text, jsonb_build_array(r.company_id,r.id)::text, to_jsonb(r)::text
    from public.khata_expense_profile_operations r where r.company_id=c
  union all
  select 'khata_expense_profile_state'::text, jsonb_build_array(r.company_id)::text, to_jsonb(r)::text
    from public.khata_expense_profile_state r where r.company_id=c
  union all
  select 'khata_fiscal_counters'::text, jsonb_build_array(r.company_id,r.kind,r.fiscal_year)::text, to_jsonb(r)::text
    from public.khata_fiscal_counters r where r.company_id=c
  union all
  select 'khata_fiscal_numbers'::text, jsonb_build_array(r.company_id,r.kind,r.fiscal_year,r.draft_id)::text, to_jsonb(r)::text
    from public.khata_fiscal_numbers r where r.company_id=c
  union all
  select 'khata_inventory_documents'::text, jsonb_build_array(r.id)::text, to_jsonb(r)::text
    from public.khata_inventory_documents r where r.company_id=c
  union all
  select 'khata_invoice_saves'::text, jsonb_build_array(r.id)::text, to_jsonb(r)::text
    from public.khata_invoice_saves r where r.company_id=c
  union all
  select 'khata_items'::text, jsonb_build_array(r.id)::text, to_jsonb(r)::text
    from public.khata_items r where r.company_id=c
  union all
  select 'khata_master_audit'::text, jsonb_build_array(r.id)::text, to_jsonb(r)::text
    from public.khata_master_audit r where r.company_id=c
  union all
  select 'khata_opening_expense_payments'::text, jsonb_build_array(r.id)::text, to_jsonb(r)::text
    from public.khata_opening_expense_payments r where r.company_id=c
  union all
  select 'khata_parties'::text, jsonb_build_array(r.id)::text, to_jsonb(r)::text
    from public.khata_parties r where r.company_id=c
  union all
  select 'khata_payment_links'::text, jsonb_build_array(r.id)::text, to_jsonb(r)::text
    from public.khata_payment_links r where r.company_id=c
  union all
  select 'khata_production_posts'::text, jsonb_build_array(r.id)::text, to_jsonb(r)::text
    from public.khata_production_posts r where r.company_id=c
  union all
  select 'khata_production_routes'::text, jsonb_build_array(r.invoice_id)::text, to_jsonb(r)::text
    from public.khata_production_routes r where r.company_id=c
  union all
  select 'khata_stock_movements'::text, jsonb_build_array(r.document_id,r.ordinal)::text, to_jsonb(r)::text
    from public.khata_stock_movements r where r.company_id=c
  union all
  select 'khata_stock_reversals'::text, jsonb_build_array(r.voucher_id,r.ordinal)::text, to_jsonb(r)::text
    from public.khata_stock_reversals r where r.company_id=c
  union all
  select 'khata_vouchers'::text, jsonb_build_array(r.id)::text, to_jsonb(r)::text
    from public.khata_vouchers r where r.company_id=c
  union all
  select 'khata_warehouses'::text, jsonb_build_array(r.id)::text, to_jsonb(r)::text
    from public.khata_warehouses r where r.company_id=c
  union all
  select 'khata_workspace_events'::text, jsonb_build_array(r.id)::text, to_jsonb(r)::text
    from public.khata_workspace_events r where r.company_id=c
  union all
  select 'khata_workspace_settings'::text, jsonb_build_array(r.company_id)::text, to_jsonb(r)::text
    from public.khata_workspace_settings r where r.company_id=c
$$;
revoke all on function sync_v2.company_snapshot_rows(uuid) from public,anon,authenticated,service_role;

create function sync_v2.read_trusted_company_snapshot(
 actor uuid,registration text,credential_sha256 text,company uuid,scope_epoch text,
 expected_head bigint,after_model text,after_key text,row_limit integer,max_bytes integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 watermark bigint; locked_head bigint;
 row_count integer:=0; rows_bytes integer:=0; candidate_bytes integer; done boolean:=true;
 next_model text; next_key text; projections jsonb:='[]'::jsonb; envelope jsonb; candidate jsonb;
 entry record; result jsonb;
begin
 if company is null or actor is null or row_limit is null or row_limit not between 1 and 100
  or max_bytes is null or max_bytes not between 512 and 262144
  or (after_model is null) <> (after_key is null)
  or (after_model is not null and (expected_head is null or length(after_model)>120 or length(after_key)>512))
 then raise exception 'SYNC_COMPANY_SNAPSHOT_CURSOR_OR_LIMIT'; end if;
 perform sync_v2.assert_trusted_device(actor,registration,credential_sha256,
   'company',company::text,scope_epoch,false);
 -- Lock the server revision while reading all row models. Every enrolled
 -- financial write must advance this same scope head before committing.
 -- FOR SHARE prevents a concurrent writer from changing the revision
 -- between checking the head and constructing this response.
 select s.head into locked_head from sync_v2.scope s
   where s.actor_id=actor::text and s.kind='company' and s.scope_id=company::text
     and s.epoch=scope_epoch and s.lifecycle='active' for share;
 if not found then raise exception 'SYNC_COMPANY_SNAPSHOT_DENIED'; end if;
 select high_water into watermark
   from sync_v2.resolve_module_read(actor,'company',company::text,scope_epoch);
 if not found then raise exception 'SYNC_COMPANY_SNAPSHOT_DENIED'; end if;
 if watermark<>locked_head then raise exception 'SYNC_COMPANY_SNAPSHOT_STALE'; end if;
 if expected_head is not null and expected_head<>watermark then
   raise exception 'SYNC_COMPANY_SNAPSHOT_STALE'; end if;
 -- An arbitrary continuation would silently skip financial rows. Require
 -- exact existence of the previously delivered key in this same scope.
 if after_model is not null and not exists (
   select 1 from sync_v2.company_snapshot_rows(company) r
   where r.model=after_model and r.row_key=after_key
 ) then raise exception 'SYNC_COMPANY_SNAPSHOT_CURSOR_OR_LIMIT'; end if;
 -- Every row in the page AND its revision boundary is read under this
 -- single PostgreSQL statement snapshot. A changed revision invalidates
 -- subsequent pages, rather than silently combining old/new versions.
 envelope:=jsonb_build_object('version',1,'purpose','historical-company-snapshot',
  'scopeId',company::text,'epoch',scope_epoch,'highWater',watermark::text,
  'afterModel',after_model,'afterKey',after_key,'done',false,'rows','[]'::jsonb);
 for entry in
  select model,row_key,projection_json from sync_v2.company_snapshot_rows(company)
  where after_model is null or (model,row_key)>(after_model,after_key)
  order by model,row_key limit row_limit+1
 loop
  if row_count=row_limit then done:=false;exit;end if;
  candidate:=jsonb_build_object('model',entry.model,'key',entry.row_key,'projectionJson',entry.projection_json);
  candidate_bytes:=rows_bytes+octet_length(candidate::text)+case when row_count=0 then 0 else 2 end;
  -- Account for JSONB's ", " separators and the candidate cursor, including
  -- escaped model keys and UTF-8 bytes. Use the longer 'false' for the limit.
  if octet_length((envelope||jsonb_build_object('nextModel',entry.model,'nextKey',entry.row_key))::text)
      +candidate_bytes>max_bytes then
   if row_count=0 then raise exception 'SYNC_COMPANY_SNAPSHOT_PAGE_TOO_LARGE';end if;
   done:=false;exit;
  end if;
  projections:=projections||jsonb_build_array(candidate);
  rows_bytes:=candidate_bytes;
  row_count:=row_count+1;
  next_model:=entry.model;
  next_key:=entry.row_key;
 end loop;
 result:=envelope||jsonb_build_object('nextModel',next_model,'nextKey',next_key,'done',done,'rows',projections);
 if octet_length(result::text)>max_bytes then
   raise exception 'SYNC_COMPANY_SNAPSHOT_PAGE_TOO_LARGE';end if;
 return result;
end $$;
revoke all on function sync_v2.read_trusted_company_snapshot(
 uuid,text,text,uuid,text,bigint,text,text,integer,integer)
 from public,anon,authenticated,service_role;
commit;
