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
  end if;
  return new;
end $$;
revoke all on function sync_v2.capture_party_create() from public,anon,authenticated,service_role;
create trigger sync_direct_party_create after insert on public.khata_parties
for each row execute function sync_v2.capture_party_create();
