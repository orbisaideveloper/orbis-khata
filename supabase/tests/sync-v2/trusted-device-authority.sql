-- Isolated candidate. Only a trusted provisioning channel may issue the
-- secret and set these capability/grant rows. Plan names are display metadata.
create table sync_v2.registered_device (
  actor uuid not null,
  registration text not null,
  credential_sha256 text not null unique check (credential_sha256 ~ '^[a-f0-9]{64}$'),
  client text not null check (client in ('android','web')),
  primary_android boolean not null default false check (not primary_android or client='android'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  primary key(actor,registration)
);
create unique index one_primary_android on sync_v2.registered_device(actor)
where primary_android and revoked_at is null;
create table sync_v2.sync_entitlement (
  actor uuid not null,
  capability text not null check (capability in ('sync.single-primary','sync.multi-device','sync.web-cross-device')),
  expires_at timestamptz not null,
  primary key(actor,capability)
);
create table sync_v2.device_scope_grant (
  actor uuid not null,
  registration text not null,
  kind text not null,
  scope_id text not null,
  epoch text not null,
  can_write boolean not null default false,
  primary key(actor,registration,kind,scope_id,epoch),
  foreign key(actor,registration) references sync_v2.registered_device(actor,registration)
);
revoke all on sync_v2.registered_device,sync_v2.sync_entitlement,sync_v2.device_scope_grant
from public,anon,authenticated,service_role;

create function sync_v2.assert_trusted_device(a uuid,d text,credential_digest text,k text,s text,e text,writing boolean)
returns void language plpgsql set search_path='' as $$
declare registration sync_v2.registered_device; grant_row sync_v2.device_scope_grant; feature_expiry timestamptz;
begin
 select * into registration from sync_v2.registered_device
   where actor=a and registered_device.registration=d and credential_sha256=credential_digest
   for share;
 if not found or registration.revoked_at is not null or registration.expires_at<=clock_timestamp() then
   raise exception 'SYNC_TRUSTED_DEVICE_DENIED';end if;
 select * into grant_row from sync_v2.device_scope_grant
   where actor=a and device_scope_grant.registration=d and kind=k and scope_id=s and epoch=e for share;
 if not found or writing is null or (writing and not grant_row.can_write) then raise exception 'SYNC_DEVICE_SCOPE_DENIED';end if;
 select expires_at into feature_expiry from sync_v2.sync_entitlement where actor=a and capability=case
   when registration.client='web' then 'sync.web-cross-device'
   when registration.primary_android then 'sync.single-primary'
   else 'sync.multi-device' end for share;
 if feature_expiry is null or feature_expiry<=clock_timestamp() or registration.expires_at<=clock_timestamp()
   then raise exception 'SYNC_ENTITLEMENT_DENIED';end if;
end $$;
revoke all on function sync_v2.assert_trusted_device(uuid,text,text,text,text,text,boolean)
from public,anon,authenticated,service_role;

create function sync_v2.read_trusted_feed(a uuid,d text,credential_digest text,k text,s text,e text,
  cursor_seq bigint,event_limit integer)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb;
begin
  perform sync_v2.assert_trusted_device(a,d,credential_digest,k,s,e,false);
  select sync_v2.read_grouped_feed(a::text,k,s,e,cursor_seq,event_limit)
     || jsonb_build_object('scopeKind',k,'scopeId',s)
  into result from sync_v2.resolve_module_read(a,k,s,e);
  if not found then raise exception 'SYNC_MODULE_FEED_DENIED';end if;
  return result;
end $$;
revoke all on function sync_v2.read_trusted_feed(uuid,text,text,text,text,text,bigint,integer)
from public,anon,authenticated,service_role;
