-- ORBIS KHATA v2 COMPANY FINANCIAL CAPTURE — REVIEW ONLY / NOT A MIGRATION.
-- Candidate for 2B/2E: do not place under supabase/migrations/ or deploy until
-- every source writer, legacy version, Native PostgreSQL lock order, 2F
-- historical identity policy, and external credential gate is acceptance-tested.
-- Source: exact vetted disposable fixtures, frozen ADR-SYNC-002.
-- Requires the UNAPPLIED private Lottery v2 base migration in a disposable DB.
-- This file deliberately does not install an Edge route or activate v2.
begin;
set local lock_timeout = '5s';
-- Fail before any DDL if dependency versions are absent; no IF NOT EXISTS that
-- could silently paper over a mismatched private ledger contract.
do $dependencies$ begin
  if to_regclass('sync_v2.scope') is null or to_regclass('sync_v2.event') is null
    or to_regclass('sync_v2.receipt') is null or
       to_regprocedure('sync_v2.read_grouped_feed(text,text,text,text,bigint,integer)') is null
  then raise exception 'SYNC_COMPANY_BASE_MIGRATION_REQUIRED'; end if;
end $dependencies$;

-- Refuse silent success for an enrolled company whose compatible capture
-- writer is missing, retired, or no longer tied to a trusted owner.
-- Unenrolled legacy companies retain their original financial write paths.
create function sync_v2.assert_unenrolled_company(company uuid, deleting boolean default false) returns void
language plpgsql set search_path='' as $$
begin
  if exists (
    select 1 from sync_v2.scope
    where kind='company' and scope_id=company::text
  ) then
    -- The existing trusted retired-company purge deletes descendants before
    -- the final scope tombstone. Match its exact authorization, never trust
    -- an arbitrary client-provided GUC or disable historical retention.
    if deleting and orbis_khata.purge_allowed(company) then return; end if;
    raise exception 'SYNC_COMPANY_CAPTURE_UNAVAILABLE';
  end if;
end $$;
revoke all on function sync_v2.assert_unenrolled_company(uuid,boolean)
  from public,anon,authenticated,service_role;


-- Invoke in the same transaction as the actual purge, after taking its domain locks.
-- Keep the scope identity and epoch as a fence against restored devices.
create function sync_v2.record_company_purge(a text, s text, e text) returns bigint
language plpgsql set search_path = '' as $$
declare next_seq bigint;
begin
  update sync_v2.scope set lifecycle = 'purged', head = head + 1
  where actor_id = a and kind = 'company' and scope_id = s and epoch = e and lifecycle = 'retired'
  returning head into strict next_seq;
  insert into sync_v2.event values (a, 'company', s, e, next_seq, null, '{"type":"scope-purged"}');
  return next_seq;
end;
$$;
revoke all on function sync_v2.record_company_purge(text,text,text) from public;

-- Disposable compatibility candidate for direct legacy callers. Keep the
-- existing invoker, ACL, validation, and posting logic.
do $fixture$
declare
  definition text := pg_get_functiondef(
    'public.khata_post_v1(uuid,uuid,uuid,text,date,text,text,text,text,uuid)'::regprocedure);
  anchor text := $anchor$  -- Same ID + exact payload is a retry; a changed payload is a conflict, never an overwrite.$anchor$;
  lock_order text := $order$  perform pg_advisory_xact_lock(hashtextextended('stock-company:'||p_company::text,0));
  if not exists(select 1 from public.khata_companies where id=p_company and owner_id=auth.uid() and deleted_at is null) then
    raise exception 'COMPANY_NOT_ACCESSIBLE';
  end if;
$order$;
begin
  if strpos(definition, anchor) = 0 then raise exception 'SYNC_VOUCHER_FIXTURE_SOURCE_CHANGED'; end if;
  execute replace(definition, anchor, lock_order || anchor);
end
$fixture$;

-- Disposable compatibility candidate: replace guarded fragments of the
-- actual RPC definitions. Production migration history stays untouched.
do $fixture$
declare
  fn text;
  definition text;
  anchor text;
  stock text := $stock$perform pg_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0));$stock$;
  recheck text := 'perform orbis_khata.inventory_access(cid,true);';
  active_owner text := $check$if not exists(select 1 from public.khata_companies where id=cid and owner_id=auth.uid() and deleted_at is null) then raise exception 'COMPANY_NOT_ACCESSIBLE';end if;$check$;
  replacement text;
begin
  for fn, anchor, replacement in
    select * from (values
      ('public.khata_expense_profiles_v1(jsonb)',
        'perform 1 from public.khata_companies where id=cid for update;',
        stock || ' ' || active_owner || ' perform 1 from public.khata_companies where id=cid for update;'),
      ('public.khata_expense_post_v1(jsonb)',
        $expense$perform pg_advisory_xact_lock(hashtextextended('expense-company:'||cid::text,0));$expense$,
        stock || ' ' || recheck || $expense$ perform pg_advisory_xact_lock(hashtextextended('expense-company:'||cid::text,0));$expense$),
      ('public.khata_expense_post_v2(jsonb)',
        $expense$perform pg_advisory_xact_lock(hashtextextended('expense-company:'||cid::text,0));$expense$,
        stock || ' ' || recheck || $expense$ perform pg_advisory_xact_lock(hashtextextended('expense-company:'||cid::text,0));$expense$),
      ('orbis_khata.inventory_write(jsonb)', stock, stock || ' ' || recheck),
      ('orbis_khata.ensure_warehouse(uuid)', stock, stock || ' ' || recheck),
      ('orbis_khata.inventory_reverse()',
        $reverse$perform pg_advisory_xact_lock(hashtextextended('stock-company:'||new.company_id::text,0));$reverse$,
        $reverse$perform pg_advisory_xact_lock(hashtextextended('stock-company:'||new.company_id::text,0));
        perform orbis_khata.inventory_access(new.company_id,true);$reverse$),
      ('public.khata_master_save_v2(text,jsonb)',
        $master$perform pg_advisory_xact_lock(hashtextextended('master:'||cid::text,0));$master$,
        $master$perform pg_advisory_xact_lock(hashtextextended('master:'||cid::text,0)); $master$ || recheck),
      ('public.khata_master_delete_v2(text,uuid,uuid)',
        $master$perform pg_advisory_xact_lock(hashtextextended('master:'||cid::text,0));$master$,
        $master$perform pg_advisory_xact_lock(hashtextextended('master:'||cid::text,0)); $master$ || recheck)
    ) as changes(fn, anchor, replacement)
  loop
    definition := pg_get_functiondef(fn::regprocedure);
    if (length(definition)-length(replace(definition,anchor,''))) <> length(anchor) then
      raise exception 'SYNC_LOCK_FIXTURE_SOURCE_CHANGED: %', fn;
    end if;
    execute replace(definition,anchor,replacement);
  end loop;
end
$fixture$;

-- Disposable compatibility candidate. Preserve the deployed purge body and
-- grants, replacing only candidate selection and lock acquisition.
do $fixture$
declare
  definition text := pg_get_functiondef('orbis_khata.purge_retired_companies()'::regprocedure);
  old_order text := $old$for cid in select id from public.khata_companies where deleted_at is not null and purge_after<=now() order by purge_after limit 50 for update skip locked loop
  begin
  perform pg_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0));$old$;
  new_order text := $new$for cid in
  select id from public.khata_companies where deleted_at is not null and purge_after<=now()
  order by purge_after,id limit 50 loop
  begin
  if not pg_try_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0)) then continue; end if;
  perform 1 from public.khata_companies where id=cid and deleted_at is not null and purge_after<=now()
  for update skip locked;
  if not found then continue; end if;$new$;
begin
  if strpos(definition, old_order) = 0 then raise exception 'SYNC_PURGE_FIXTURE_SOURCE_CHANGED'; end if;
  execute replace(definition, old_order, new_order);
end
$fixture$;

-- Global ID nonreuse: perform trusted known-marker backfill in one locked transaction.
lock table public.khata_companies in share row exclusive mode;
create table sync_v2.company_identity (
  id uuid primary key,
  purged boolean not null default false
);
revoke all on sync_v2.company_identity from public,anon,authenticated,service_role;
insert into sync_v2.company_identity(id) select id from public.khata_companies;
-- Only trusted, already-known purge markers are imported. Historical purges
-- that predate the marker still require migration/recovery reconciliation.
insert into sync_v2.company_identity(id,purged)
select distinct scope_id::uuid,true from sync_v2.scope
where kind='company' and lifecycle='purged';

create function sync_v2.fence_company_id() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.id is distinct from old.id then raise exception 'SYNC_COMPANY_ID_IMMUTABLE'; end if;
    return new;
  end if;
  if tg_op='DELETE' then
    update sync_v2.company_identity set purged=true where id=old.id;
    if not found then raise exception 'SYNC_COMPANY_ID_MISSING'; end if;
    return old;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stock-company:'||new.id::text,0));
  insert into sync_v2.company_identity(id) values(new.id) on conflict do nothing;
  -- The locking read cannot silently overlook a committed tombstone when
  -- using a pre-purge REPEATABLE READ snapshot: PostgreSQL aborts stale reads.
  perform 1 from sync_v2.company_identity where id=new.id and not purged for no key update;
  if not found then raise exception 'SYNC_COMPANY_ID_PURGED'; end if;
  return new;
end $$;
revoke all on function sync_v2.fence_company_id() from public,anon,authenticated,service_role;
create trigger sync_company_id_insert before insert on public.khata_companies
for each row execute function sync_v2.fence_company_id();
create trigger sync_company_id_immutable before update of id on public.khata_companies
for each row execute function sync_v2.fence_company_id();
create trigger sync_company_id_delete after delete on public.khata_companies
for each row execute function sync_v2.fence_company_id();

-- Disposable integration: the voucher INSERT owns emission for v1 and v2.
create table sync_v2.voucher_event (
  voucher_id uuid primary key,
  actor_id text not null,
  kind text not null check (kind = 'company'),
  scope_id text not null,
  epoch text not null,
  seq bigint not null,
  foreign key (actor_id, kind, scope_id, epoch, seq)
    references sync_v2.event(actor_id, kind, scope_id, epoch, seq)
);
revoke all on sync_v2.voucher_event from public;

create function sync_v2.capture_voucher() returns trigger
language plpgsql security definer set search_path = '' as $$
declare captured sync_v2.scope;
  projection jsonb;
begin
  update sync_v2.scope as s set head = s.head + 1
  from public.khata_companies c
  join orbis_khata.principals p on p.ledger_owner_id = c.owner_id
  where c.id = new.company_id and s.actor_id = p.orbis_identity_id::text
    and s.kind = 'company' and s.scope_id = c.id::text and s.lifecycle = 'active'
  returning s.* into captured;
  if not found then
    perform sync_v2.assert_unenrolled_company(new.company_id);
    return new;
  end if;

  projection := jsonb_build_object('entityType','voucher','entityId',new.id,'projectionJson',to_jsonb(new)::text);
  if new.kind = 'reversal' then
    -- The stock and production reversal triggers sort before this capture trigger.
    projection := projection || jsonb_build_object('stockReversals',(
      select coalesce(jsonb_agg(to_jsonb(r)::text order by r.ordinal),'[]'::jsonb)
      from public.khata_stock_reversals r
      where r.company_id=new.company_id and r.voucher_id=new.id
    ));
  end if;
  insert into sync_v2.event values (captured.actor_id, captured.kind, captured.scope_id,
    captured.epoch, captured.head, null, jsonb_build_array(projection));
  insert into sync_v2.voucher_event values (new.id, captured.actor_id, captured.kind,
    captured.scope_id, captured.epoch, captured.head);
  return new;
end;
$$;
revoke all on function sync_v2.capture_voucher() from public;
create trigger zz_sync_v2_capture_voucher after insert on public.khata_vouchers
for each row execute function sync_v2.capture_voucher();

create function sync_v2.finish_voucher(a text, s text, e text, op text, d text, r jsonb)
returns bigint language plpgsql set search_path = '' as $$
declare event_seq bigint;
begin
  select seq into strict event_seq from sync_v2.voucher_event
  where voucher_id = (r->>'entityId')::uuid and actor_id = a and scope_id = s and epoch = e;
  insert into sync_v2.receipt values (a, 'company', s, e, op, d, event_seq, r);
  return event_seq;
end;
$$;
revoke all on function sync_v2.finish_voucher(text,text,text,text,text,jsonb) from public;

-- Fixture for the two table INSERT grants used by the verified legacy gateway.
-- Install with voucher-stock-order.sql so voucher IDs are locked after stock.
create function sync_v2.fence_company_direct_write() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and (current_setting('orbis.khata.gateway_verified',true) is distinct from 'v1'
    or not exists (select 1 from public.khata_companies where id=new.company_id and owner_id=auth.uid())) then
    raise exception 'COMPANY_NOT_ACCESSIBLE' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stock-company:'||new.company_id::text,0));
  if not exists (select 1 from public.khata_companies where id=new.company_id and deleted_at is null
      and (auth.uid() is null or owner_id=auth.uid())) then
    raise exception 'COMPANY_NOT_ACCESSIBLE' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function sync_v2.fence_company_direct_write() from public,anon,authenticated,service_role;
create trigger aa_sync_direct_voucher before insert on public.khata_vouchers
for each row execute function sync_v2.fence_company_direct_write();
create trigger aa_sync_direct_party before insert on public.khata_parties
for each row execute function sync_v2.fence_company_direct_write();

create function sync_v2.capture_party_create() returns trigger
language plpgsql security definer set search_path='' as $$
declare registered sync_v2.scope;
begin
  update sync_v2.scope s set head=s.head+1
  from public.khata_companies c
    join orbis_khata.principals p on p.ledger_owner_id=c.owner_id
  where c.id=new.company_id and c.deleted_at is null and s.actor_id=p.orbis_identity_id::text
    and s.kind='company' and s.scope_id=c.id::text and s.lifecycle='active'
  returning s.* into registered;
  if found then
    insert into sync_v2.event(actor_id,kind,scope_id,epoch,seq,operation_id,change)
    values(registered.actor_id,registered.kind,registered.scope_id,registered.epoch,registered.head,null,
      jsonb_build_array(jsonb_build_object('entityType','party','projectionJson',to_jsonb(new)::text)));
  else
    perform sync_v2.assert_unenrolled_company(new.company_id);
  end if;
  return new;
end $$;
revoke all on function sync_v2.capture_party_create() from public,anon,authenticated,service_role;
create trigger sync_direct_party_create after insert on public.khata_parties
for each row execute function sync_v2.capture_party_create();

-- Private acceptance fixture. Capture canonical domain rows after they are
-- written and group them by the existing PostgreSQL transaction boundary.
-- Voucher emission stays owned by voucher-capture.sql.
create function sync_v2.capture_company_financial_row() returns trigger
language plpgsql security definer set search_path='' as $$
declare registered sync_v2.scope; projection jsonb;
begin
  if tg_op='DELETE' then
    projection := jsonb_build_object('id',old.id,'company_id',old.company_id,'deleted',true);
  else
    projection := to_jsonb(new);
  end if;
  update sync_v2.scope s set head=s.head+1
  from public.khata_companies c
    join orbis_khata.principals p on p.ledger_owner_id=c.owner_id
  where c.id=(projection->>'company_id')::uuid and c.deleted_at is null and s.actor_id=p.orbis_identity_id::text
    and s.kind='company' and s.scope_id=c.id::text and s.lifecycle='active'
  returning s.* into registered;
  if not found then
    perform sync_v2.assert_unenrolled_company((projection->>'company_id')::uuid,tg_op='DELETE');
    return new;
  end if;
  -- Text preserves decimal and bigint precision across JS transports.
  insert into sync_v2.event(actor_id,kind,scope_id,epoch,seq,operation_id,change)
  values(registered.actor_id,registered.kind,registered.scope_id,registered.epoch,registered.head,null,
    jsonb_build_array(jsonb_build_object('entityType',TG_ARGV[0],'projectionJson',projection::text)));
  return new;
end $$;
revoke all on function sync_v2.capture_company_financial_row() from public,anon,authenticated,service_role;

create trigger sync_financial_invoice after insert on public.khata_invoice_saves
for each row execute function sync_v2.capture_company_financial_row('invoice');
create trigger sync_financial_payment_link after insert on public.khata_payment_links
for each row execute function sync_v2.capture_company_financial_row('payment-link');
create trigger sync_financial_expense after insert on public.khata_expense_events
for each row execute function sync_v2.capture_company_financial_row('expense');
create trigger sync_financial_expense_lines after insert on public.khata_expense_bill_lines
for each row execute function sync_v2.capture_company_financial_row('expense-lines');
create trigger sync_financial_opening_payment after insert on public.khata_opening_expense_payments
for each row execute function sync_v2.capture_company_financial_row('opening-expense-payment');
create trigger sync_financial_profile_operation after insert on public.khata_expense_profile_operations
for each row execute function sync_v2.capture_company_financial_row('expense-profile-operation');
create trigger sync_financial_inventory after insert on public.khata_inventory_documents
for each row execute function sync_v2.capture_company_financial_row('inventory-document');
create trigger sync_financial_stock after insert on public.khata_stock_movements
for each row execute function sync_v2.capture_company_financial_row('stock-movement');
create trigger sync_financial_fiscal_number after insert on public.khata_fiscal_numbers
for each row execute function sync_v2.capture_company_financial_row('fiscal-number');
create trigger sync_financial_fiscal_counter after insert or update on public.khata_fiscal_counters
for each row execute function sync_v2.capture_company_financial_row('fiscal-counter');

-- Layer only on the settlement row-capture candidate. Do not install the
-- older aggregate production-output candidate in the same fixture.
-- Party INSERT emission belongs to company-direct-write-fence.sql.
create trigger sync_master_party after update or delete on public.khata_parties
for each row execute function sync_v2.capture_company_financial_row('party');
create trigger sync_master_item after insert or update or delete on public.khata_items
for each row execute function sync_v2.capture_company_financial_row('item');
create trigger sync_master_warehouse after insert or update or delete on public.khata_warehouses
for each row execute function sync_v2.capture_company_financial_row('warehouse');
create trigger sync_master_audit after insert on public.khata_master_audit
for each row execute function sync_v2.capture_company_financial_row('master-audit');
create trigger sync_workspace_settings after insert or update on public.khata_workspace_settings
for each row execute function sync_v2.capture_company_financial_row('workspace-settings');
create trigger sync_workspace_operation after insert on public.khata_workspace_events
for each row execute function sync_v2.capture_company_financial_row('workspace-operation');
create trigger sync_workspace_bill_number after insert on public.khata_bill_numbers
for each row execute function sync_v2.capture_company_financial_row('legacy-bill-number');
create trigger sync_production_post after insert on public.khata_production_posts
for each row execute function sync_v2.capture_company_financial_row('production-post');
create trigger sync_production_route after insert on public.khata_production_routes
for each row execute function sync_v2.capture_company_financial_row('production-route');

-- Disposable lifecycle capture. Write the company fence and account-catalog
-- projection in the existing company mutation transaction.
create function sync_v2.capture_company_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  entry public.khata_companies;
  principal text;
  status text;
  previous_status text;
  registered sync_v2.scope;
  change jsonb;
begin
  if tg_op='DELETE' then
    entry:=old;
    status:='purged';
  else
    entry:=new;
    status:=case when new.deleted_at is null then 'active' else 'retired' end;
    if tg_op='UPDATE' then
      previous_status:=case when old.deleted_at is null then 'active' else 'retired' end;
      if status=previous_status and old.name is not distinct from new.name then return new; end if;
    end if;
  end if;
  select orbis_identity_id::text into principal from orbis_khata.principals where ledger_owner_id=entry.owner_id;
  if not found then
    perform sync_v2.assert_unenrolled_company(entry.id,tg_op='DELETE');
    return entry;
  end if;
  change:=jsonb_build_object('type','company-lifecycle','companyId',entry.id,'status',status);
  if status<>'purged' then change:=change||jsonb_build_object('name',entry.name); end if;
  if tg_op='UPDATE' and status<>previous_status then
    update sync_v2.scope s set lifecycle=status,head=s.head+1
    where actor_id=principal and kind='company' and scope_id=entry.id::text and lifecycle=previous_status
    returning s.* into registered;
    if found then
      insert into sync_v2.event(actor_id,kind,scope_id,epoch,seq,operation_id,change)
      values(registered.actor_id,registered.kind,registered.scope_id,registered.epoch,registered.head,null,change);
    end if;
  end if;
  -- The account catalog uses its canonical principal ID as scope ID.
  update sync_v2.scope s set head=s.head+1
    where actor_id=principal and kind='account-catalog' and scope_id=principal and lifecycle='active'
    returning s.* into registered;
  if found then
    insert into sync_v2.event(actor_id,kind,scope_id,epoch,seq,operation_id,change)
    values(registered.actor_id,registered.kind,registered.scope_id,registered.epoch,registered.head,null,change);
  end if;
  return entry;
end $$;
revoke all on function sync_v2.capture_company_lifecycle() from public,anon,authenticated,service_role;
-- Company purge marker already has a single owner, the test_sync_purge trigger.
create trigger zz_sync_company_catalog after insert or update of deleted_at,name or delete on public.khata_companies
for each row execute function sync_v2.capture_company_lifecycle();

-- Enrolled company purge requires the actual legacy scheduled purge
-- authority while the original company row still exists. After DELETE is too
-- late to validate purge_allowed(): that function looks up the original row.
create function sync_v2.guard_company_purge() returns trigger
language plpgsql set search_path='' as $$
begin
  if exists(select 1 from sync_v2.scope s where s.kind='company' and s.scope_id=old.id::text) then
    if not orbis_khata.purge_allowed(old.id) or not exists (
      select 1 from sync_v2.scope s join orbis_khata.principals p
        on p.orbis_identity_id::text=s.actor_id
      where s.kind='company' and s.scope_id=old.id::text
        and p.ledger_owner_id=old.owner_id
    ) then raise exception 'SYNC_COMPANY_PURGE_AUTHORITY_REQUIRED'; end if;
  end if;
  return old;
end $$;
revoke all on function sync_v2.guard_company_purge() from public,anon,authenticated,service_role;
create trigger aa_sync_v2_company_purge_guard before delete on public.khata_companies
for each row execute function sync_v2.guard_company_purge();

create function sync_v2.capture_company_purge() returns trigger
language plpgsql set search_path = '' as $$
declare registered sync_v2.scope;
begin
  select * into registered from sync_v2.scope
  where kind='company' and scope_id=old.id::text and actor_id=(select orbis_identity_id::text from orbis_khata.principals where ledger_owner_id=old.owner_id)
  for update;
  if not found and exists (select 1 from sync_v2.scope
     where kind='company' and scope_id=old.id::text) then
    raise exception 'SYNC_COMPANY_PURGE_AUTHORITY_REQUIRED';
  end if;
  if found then
    -- The real purge has already acquired the company row and stock locks.
    update sync_v2.scope set lifecycle='retired'
    where actor_id=registered.actor_id and kind='company' and scope_id=registered.scope_id
      and lifecycle='active';
    perform sync_v2.record_company_purge(registered.actor_id, registered.scope_id, registered.epoch);
  end if;
  return old;
end;
$$;
revoke all on function sync_v2.capture_company_purge() from public;
create trigger zz_sync_v2_company_purge after delete on public.khata_companies
for each row execute function sync_v2.capture_company_purge();


-- These are private review candidates, not a license to enroll an old company.
-- The entire operation is atomic and can be reverted in disposable PostgreSQL.
commit;
