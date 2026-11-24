-- Disposable candidate. Keep a globally reserved ID after deletion without
-- retaining the deleted owner or accounting data. Install with an atomic backfill.
begin;
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
commit;
