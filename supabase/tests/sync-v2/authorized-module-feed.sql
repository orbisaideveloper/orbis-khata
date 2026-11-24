-- Private transport fixture. A future Edge adapter must derive principal and
-- registration from verified server credentials, never from a request actor.
create function sync_v2.resolve_module_read(a uuid,k text,s text,e text)
returns table(owner_id uuid,high_water bigint)
language sql stable set search_path='' as $$
  select p.ledger_owner_id,scope.head
  from orbis_khata.principals p
    join sync_v2.scope scope on scope.actor_id=p.orbis_identity_id::text
      and scope.kind=k and scope.scope_id=s and scope.epoch=e and scope.lifecycle='active'
  where p.orbis_identity_id=a and (
    (k='account-catalog' and s=a::text) or
    (k='company' and exists (
      select 1 from public.khata_companies company
      where company.owner_id=p.ledger_owner_id and company.id::text=s and company.deleted_at is null
    )) or
    (k='lottery-organization' and exists (
      select 1 from public.khata_lottery_records org
      where org.owner_id=p.ledger_owner_id and org.id=s and org.model='foundationAccountingOrganization'
        and org.value->>'status'='ACTIVE'
    ))
  )
$$;

create function sync_v2.authorize_module_read(a uuid,d text,k text,s text,e text)
returns table(owner_id uuid,high_water bigint)
language sql stable set search_path='' as $$
  select resolved.* from sync_v2.resolve_module_read(a,k,s,e) resolved
  join sync_v2.test_device device on device.actor_id=a::text and device.registration_id=d and not device.revoked
    and (device.expires_at is null or device.expires_at>statement_timestamp())
$$;

create function sync_v2.read_authorized_module_feed(a uuid,d text,k text,s text,e text,cursor_seq bigint,event_limit integer)
returns jsonb language plpgsql stable set search_path='' as $$
begin
  if not exists(select 1 from sync_v2.authorize_module_read(a,d,k,s,e)) then
    raise exception 'SYNC_MODULE_FEED_DENIED';
  end if;
  return sync_v2.read_grouped_feed(a::text,k,s,e,cursor_seq,event_limit)
    || jsonb_build_object('scopeKind',k,'scopeId',s);
end $$;
revoke all on function sync_v2.resolve_module_read(uuid,text,text,text),
  sync_v2.authorize_module_read(uuid,text,text,text,text),
  sync_v2.read_authorized_module_feed(uuid,text,text,text,text,bigint,integer)
from public,anon,authenticated,service_role;
