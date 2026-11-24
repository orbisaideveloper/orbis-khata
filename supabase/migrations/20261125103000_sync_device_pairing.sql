-- Operator-issued, actor-bound pairing. No billing, automatic grants, or public RPC.
create table sync_v2.device_pairing (
 actor uuid not null,
 ticket_sha256 text not null unique check(ticket_sha256 ~ '^[0-9a-f]{64}$'),
 registration text not null check(registration ~ '^[a-zA-Z0-9_-]{1,128}$'),
 client text not null check(client in ('android','web')),
 primary_android boolean not null default false check(not primary_android or client='android'),
 kind text not null check(kind in ('company','lottery-organization')),
 scope_id text not null,
 epoch text not null,
 can_write boolean not null default false,
 redeem_until timestamptz not null,
 device_until timestamptz not null check(device_until>=redeem_until),
 claimed_at timestamptz,
 cancelled_at timestamptz,
 primary key(actor,registration)
);
revoke all on sync_v2.device_pairing from public,anon,authenticated,service_role;

create function sync_v2.redeem_device_pairing(a uuid,ticket_digest text,proof text)
returns jsonb language plpgsql set search_path='' as $$
declare invite sync_v2.device_pairing; capability_until timestamptz; expires timestamptz;
begin
 if proof is null or proof !~ '^[0-9a-f]{64}$' then raise exception 'SYNC_PAIRING_DENIED'; end if;
 select * into invite from sync_v2.device_pairing where actor=a and ticket_sha256=ticket_digest for update;
 if not found or invite.cancelled_at is not null or invite.redeem_until<=clock_timestamp() then
  raise exception 'SYNC_PAIRING_DENIED';
 end if;
 if not exists(select 1 from sync_v2.resolve_module_read(a,invite.kind,invite.scope_id,invite.epoch)) then
  raise exception 'SYNC_PAIRING_DENIED';
 end if;

 if invite.claimed_at is null then
  select expires_at into capability_until from sync_v2.sync_entitlement where actor=a and capability=case
   when invite.client='web' then 'sync.web-cross-device'
   when invite.primary_android then 'sync.single-primary'
   else 'sync.multi-device' end for share;
  if not found or capability_until<=clock_timestamp() then raise exception 'SYNC_PAIRING_DENIED'; end if;
  expires:=least(capability_until,invite.device_until);
  insert into sync_v2.registered_device(actor,registration,credential_sha256,client,primary_android,expires_at)
   values(a,invite.registration,proof,invite.client,invite.primary_android,expires) on conflict do nothing;
  if not found then raise exception 'SYNC_PAIRING_DENIED'; end if;
  insert into sync_v2.device_scope_grant(actor,registration,kind,scope_id,epoch,can_write)
   values(a,invite.registration,invite.kind,invite.scope_id,invite.epoch,invite.can_write);
  update sync_v2.device_pairing set claimed_at=clock_timestamp() where actor=a and registration=invite.registration;
 end if;

 -- Network retries can only recover the same still-authorized registration.
 perform sync_v2.assert_trusted_device(a,invite.registration,proof,invite.kind,invite.scope_id,invite.epoch,false);
 select expires_at into strict expires from sync_v2.registered_device where actor=a and registration=invite.registration;
 return jsonb_build_object('actor',a,'registration',invite.registration,'client',invite.client,
  'scope',jsonb_build_object('kind',invite.kind,'id',invite.scope_id,'epoch',invite.epoch),
  'canWrite',invite.can_write,'expiresAt',expires);
end $$;
revoke all on function sync_v2.redeem_device_pairing(uuid,text,text) from public,anon,authenticated,service_role;
