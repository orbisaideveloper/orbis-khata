-- Disposable integration only. Device grants are synthetic, never client authored.
create table sync_v2.test_device (
  actor_id text not null,
  registration_id text not null,
  revoked boolean not null default false,
  expires_at timestamptz,
  primary key (actor_id, registration_id)
);
revoke all on sync_v2.test_device from public;

create function sync_v2.capture_company_purge() returns trigger
language plpgsql set search_path = '' as $$
declare registered sync_v2.scope;
begin
  select * into registered from sync_v2.scope
  where kind='company' and scope_id=old.id::text and actor_id=(select orbis_identity_id::text from orbis_khata.principals where ledger_owner_id=old.owner_id)
  for update;
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
create trigger test_sync_purge after delete on public.khata_companies
for each row execute function sync_v2.capture_company_purge();
