-- Add the private Lottery payment capture contract. This migration does not
-- enroll any account, issue device credentials or change the Edge feature flag.
begin;
set local lock_timeout = '5s';
create schema sync_v2;
revoke all on schema sync_v2 from public;

create table sync_v2.scope (
  actor_id text not null,
  kind text not null check (kind in ('company', 'lottery-organization', 'account-catalog')),
  scope_id text not null,
  epoch text not null,
  lifecycle text not null check (lifecycle in ('active', 'retired', 'purged')),
  head bigint not null default 0 check (head >= 0),
  primary key (actor_id, kind, scope_id),
  unique (actor_id, kind, scope_id, epoch)
);

create table sync_v2.receipt (
  actor_id text not null,
  kind text not null,
  scope_id text not null,
  epoch text not null,
  operation_id text not null,
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  seq bigint not null check (seq > 0),
  result jsonb not null,
  primary key (actor_id, kind, scope_id, operation_id),
  foreign key (actor_id, kind, scope_id, epoch)
    references sync_v2.scope (actor_id, kind, scope_id, epoch)
);

create table sync_v2.event (
  actor_id text not null,
  kind text not null,
  scope_id text not null,
  epoch text not null,
  seq bigint not null check (seq > 0),
  operation_id text,
  change jsonb not null,
  primary key (actor_id, kind, scope_id, epoch, seq),
  foreign key (actor_id, kind, scope_id, epoch)
    references sync_v2.scope (actor_id, kind, scope_id, epoch)
);

revoke all on all tables in schema sync_v2 from public;


alter table sync_v2.event add column capture_transaction text
  not null default pg_current_xact_id()::text;
-- An authorized snapshot/retention process must install this boundary atomically.
-- This fixture neither advances it on its own nor deletes history.
alter table sync_v2.scope add column retained_after bigint not null default 0
  check (retained_after >= 0 and retained_after <= head);
create index sync_v2_event_transaction on sync_v2.event
  (actor_id, kind, scope_id, epoch, capture_transaction, seq);

create function sync_v2.read_grouped_feed(a text, k text, s text, e text,
  cursor_seq bigint, event_limit integer) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  scope_head bigint;
  retention_boundary bigint;
  last_transaction text;
  cutoff bigint;
  first_group_end bigint;
  from_group_end bigint;
  payload jsonb;
begin
  if cursor_seq is null or cursor_seq < 0 or event_limit is null or event_limit < 1 or event_limit > 500
    then raise exception 'SYNC_FEED_INVALID_LIMIT_OR_CURSOR'; end if;
  select head,retained_after into scope_head,retention_boundary from sync_v2.scope
    where actor_id=a and kind=k and scope_id=s and epoch=e;
  if not found then raise exception 'SYNC_FEED_EPOCH_UNAVAILABLE'; end if;
  if cursor_seq < retention_boundary then
    raise exception 'SYNC_FEED_CURSOR_EXPIRED' using hint='Rebootstrap from an authorized consistent snapshot.';
  end if;
  if cursor_seq > scope_head then raise exception 'SYNC_FEED_CURSOR_AHEAD'; end if;
  if cursor_seq > retention_boundary then
    select capture_transaction into strict last_transaction from sync_v2.event
      where actor_id=a and kind=k and scope_id=s and epoch=e and seq=cursor_seq;
    select max(seq) into from_group_end from sync_v2.event
      where actor_id=a and kind=k and scope_id=s and epoch=e and capture_transaction=last_transaction;
    if cursor_seq <> from_group_end then raise exception 'SYNC_FEED_SPLIT_CURSOR'; end if;
  end if;
  if cursor_seq = scope_head then
    return jsonb_build_object('epoch',e,'from',cursor_seq::text,'next',cursor_seq::text,'groups','[]'::jsonb);
  end if;

  select seq,capture_transaction into cutoff,last_transaction from sync_v2.event
    where actor_id=a and kind=k and scope_id=s and epoch=e and seq > cursor_seq
    order by seq offset (event_limit-1) limit 1;
  if found then
    select max(seq) into cutoff from sync_v2.event
      where actor_id=a and kind=k and scope_id=s and epoch=e and capture_transaction=last_transaction;
  else
    cutoff := scope_head;
  end if;
  select max(ev.seq) into first_group_end from sync_v2.event ev
    where ev.actor_id=a and ev.kind=k and ev.scope_id=s and ev.epoch=e
      and ev.capture_transaction = (
        select capture_transaction from sync_v2.event
        where actor_id=a and kind=k and scope_id=s and epoch=e and seq=cursor_seq+1
      );
  if cutoff > cursor_seq and first_group_end is null then raise exception 'SYNC_FEED_GAP'; end if;
  if cutoff - cursor_seq > 500 then cutoff := first_group_end; end if;
  loop
    if cutoff - cursor_seq > 500 then
      raise exception 'SYNC_FEED_GROUP_TOO_LARGE' using hint='Rebootstrap from an authorized consistent snapshot.';
    end if;
    if (select count(*) from sync_v2.event where actor_id=a and kind=k and scope_id=s
      and epoch=e and seq > cursor_seq and seq <= cutoff) <> cutoff-cursor_seq
    then raise exception 'SYNC_FEED_GAP'; end if;
    if (select sum(octet_length(change::text)::bigint) from sync_v2.event where actor_id=a and kind=k
      and scope_id=s and epoch=e and seq > cursor_seq and seq <= cutoff) > 1048576 then
      if cutoff = first_group_end then
        raise exception 'SYNC_FEED_PAGE_TOO_LARGE' using hint='Rebootstrap from an authorized consistent snapshot.';
      end if;
      cutoff := first_group_end;
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('first', first_seq::text,
      'last', last_seq::text, 'events', events) order by first_seq),'[]'::jsonb)
    into payload from (
      select min(seq) first_seq,max(seq) last_seq,jsonb_agg(jsonb_build_object(
        'seq',seq::text,'operationId',operation_id,'change',change) order by seq) events
      from sync_v2.event where actor_id=a and kind=k and scope_id=s and epoch=e
        and seq > cursor_seq and seq <= cutoff group by capture_transaction
    ) as groups;
    payload := jsonb_build_object('epoch',e,'from',cursor_seq::text,'next',cutoff::text,'groups',payload);
    exit when octet_length(payload::text) <= 1048576;
    if cutoff = first_group_end then
      raise exception 'SYNC_FEED_PAGE_TOO_LARGE' using hint='Rebootstrap from an authorized consistent snapshot.';
    end if;
    cutoff := first_group_end;
  end loop;
  return payload;
end;
$$;
revoke all on function sync_v2.read_grouped_feed(text,text,text,text,bigint,integer) from public;

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


revoke all on function sync_v2.resolve_module_read(uuid,text,text,text) from public,anon,authenticated,service_role;

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

create function sync_v2.lottery_organization(model text,id text,value jsonb)
returns text language sql immutable strict set search_path='' as $$
  select case when model='foundationAccountingOrganization' then id else value->>'organizationId' end
$$;
revoke all on function sync_v2.lottery_organization(text,text,jsonb) from public,anon,authenticated,service_role;
create index fixture_lottery_scope_order on public.khata_lottery_records
  (owner_id,sync_v2.lottery_organization(model,id,value),ordinal);

create table sync_v2.lottery_operation_feed (
  owner_id uuid not null,
  operation_id uuid not null,
  actor_id text not null,
  kind text not null check (kind='lottery-organization'),
  scope_id text not null,
  epoch text not null,
  first_sequence bigint not null,
  last_sequence bigint not null check (last_sequence>=first_sequence),
  primary key(owner_id,operation_id,scope_id),
  foreign key(owner_id,operation_id) references public.khata_lottery_operations(owner_id,operation_id),
  foreign key(actor_id,kind,scope_id,epoch) references sync_v2.scope(actor_id,kind,scope_id,epoch)
);
revoke all on sync_v2.lottery_operation_feed from public,anon,authenticated,service_role;

create table sync_v2.lottery_capture_context (
  transaction_id text not null,
  owner_id uuid not null,
  operation_id uuid not null,
  requested_organization text,
  primary key(transaction_id,owner_id)
);
revoke all on sync_v2.lottery_capture_context from public,anon,authenticated,service_role;

create function sync_v2.capture_lottery_row() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 row_data public.khata_lottery_records;
 organization text;
 registered sync_v2.scope;
 prior_org text;
 native sync_v2.lottery_capture_context;
begin
 if tg_op='DELETE' then row_data:=old; else row_data:=new; end if;
 -- Do not return early merely because this owner has no ACTIVE enrollment.
 -- A retired, revoked, or disconnected previously enrolled organization still
 -- needs to deny financial mutations that cannot be captured for feed readers.
 organization:=sync_v2.lottery_organization(row_data.model,row_data.id,row_data.value);
 if tg_op='UPDATE' then
   prior_org:=sync_v2.lottery_organization(old.model,old.id,old.value);
   if (old.owner_id,old.model,old.id,prior_org) is distinct from (new.owner_id,new.model,new.id,organization) then
     raise exception 'SYNC_LOTTERY_RECORD_SCOPE_CHANGE';
   end if;
 end if;
 if organization is null and exists (
   select 1 from sync_v2.scope s join orbis_khata.principals p on s.actor_id=p.orbis_identity_id::text
   where p.ledger_owner_id=row_data.owner_id and s.kind='lottery-organization'
 ) then raise exception 'SYNC_LOTTERY_ORGANIZATION_MISSING'; end if;
 select * into native from sync_v2.lottery_capture_context
 where transaction_id=pg_current_xact_id()::text and owner_id=row_data.owner_id;
 if native.requested_organization is not null and native.requested_organization is distinct from organization then
   raise exception 'SYNC_LOTTERY_WRONG_ORGANIZATION';
 end if;
 update sync_v2.scope s set head=s.head+1
 from orbis_khata.principals p
 where p.ledger_owner_id=row_data.owner_id and s.actor_id=p.orbis_identity_id::text
 and s.kind='lottery-organization' and s.scope_id=organization and s.lifecycle='active'
 returning s.* into registered;
 if found then
   if native.operation_id is null then raise exception 'SYNC_LOTTERY_NATIVE_WRITER_REQUIRED'; end if;
   insert into sync_v2.event(actor_id,kind,scope_id,epoch,seq,operation_id,change)
   values(registered.actor_id,registered.kind,registered.scope_id,registered.epoch,registered.head,native.operation_id::text,
     jsonb_build_object('model',row_data.model,'id',row_data.id,'ordinal',row_data.ordinal::text,
       'projectionJson',case when tg_op='DELETE' then null else row_data.value::text end));
 else
   if exists(select 1 from sync_v2.scope
      where kind='lottery-organization' and scope_id=organization) then
     raise exception 'SYNC_LOTTERY_CAPTURE_UNAVAILABLE';
   end if;
 end if;
 return row_data;
end $$;
revoke all on function sync_v2.capture_lottery_row() from public,anon,authenticated,service_role;
create trigger sync_lottery_record after insert or update or delete on public.khata_lottery_records
for each row execute function sync_v2.capture_lottery_row();

create function sync_v2.link_lottery_operation() returns trigger
language plpgsql security definer set search_path='' as $$
declare principal text;
begin
 select p.orbis_identity_id::text into principal from orbis_khata.principals p where p.ledger_owner_id=new.owner_id;
 if not found then return new; end if;
 insert into sync_v2.lottery_operation_feed(owner_id,operation_id,actor_id,kind,scope_id,epoch,first_sequence,last_sequence)
 select new.owner_id,new.operation_id,actor_id,kind,scope_id,epoch,min(seq),max(seq)
 from sync_v2.event
 where actor_id=principal and kind='lottery-organization' and operation_id=new.operation_id::text
   and capture_transaction=pg_current_xact_id()::text
 group by actor_id,kind,scope_id,epoch;
 return new;
end $$;
revoke all on function sync_v2.link_lottery_operation() from public,anon,authenticated,service_role;
create trigger sync_lottery_native_receipt after insert on public.khata_lottery_operations
for each row execute function sync_v2.link_lottery_operation();

-- Each captured row must have a matching durable native receipt at commit.
create function sync_v2.require_lottery_native_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.kind='lottery-organization' and not exists (
   select 1 from sync_v2.event e join sync_v2.lottery_operation_feed r
     on (r.actor_id,r.kind,r.scope_id,r.epoch)=(e.actor_id,e.kind,e.scope_id,e.epoch)
      and r.operation_id::text=e.operation_id and e.seq between r.first_sequence and r.last_sequence
   where (e.actor_id,e.kind,e.scope_id,e.epoch,e.seq)=(new.actor_id,new.kind,new.scope_id,new.epoch,new.seq)
 ) then raise exception 'SYNC_LOTTERY_UNCLAIMED_EVENT'; end if;
 return null;
end $$;
revoke all on function sync_v2.require_lottery_native_receipt() from public,anon,authenticated,service_role;
create constraint trigger sync_lottery_native_receipt_required
after insert on sync_v2.event deferrable initially deferred
for each row when (new.kind='lottery-organization')
execute function sync_v2.require_lottery_native_receipt();


-- Attach the context inside the original trusted RPC without copying or
-- replacing its business validation. Guard each insertion anchor.
do $migration$
declare
  definition text := pg_get_functiondef('public.khata_lottery_store_v2(jsonb)'::regprocedure);
  before_changes text := $source$for change in select value from jsonb_array_elements(p->'changes') loop$source$;
  after_receipt text := $source$insert into public.khata_lottery_operations(owner_id,operation_id,request,result) values(owner,op,p->'request',p->'result');$source$;
begin
  if (length(definition)-length(replace(definition,before_changes,'')))<>length(before_changes) or
     (length(definition)-length(replace(definition,after_receipt,'')))<>length(after_receipt) then
    raise exception 'SYNC_LOTTERY_CAPTURE_SOURCE_CHANGED';
  end if;
  definition:=replace(definition,before_changes,
    $source$insert into sync_v2.lottery_capture_context
      select pg_current_xact_id()::text,owner,op,p#>>'{request,payload,organizationId}'
      where exists(select 1 from sync_v2.scope s join orbis_khata.principals binding
        on s.actor_id=binding.orbis_identity_id::text
        where binding.ledger_owner_id=owner and s.kind='lottery-organization' and s.lifecycle='active');
    $source$ || before_changes);
  execute replace(definition,after_receipt,after_receipt ||
    $source$
    delete from sync_v2.lottery_capture_context ctx
      where ctx.transaction_id=pg_current_xact_id()::text and ctx.owner_id=owner;
    $source$);
end
$migration$;

revoke all on schema sync_v2 from public,anon,authenticated,service_role;

-- Revision-fenced pages avoid persisting duplicate accounting snapshots.
-- The whole page and its high-water use one PostgreSQL statement snapshot.
create function sync_v2.read_trusted_lottery_snapshot(
 a uuid, d text, credential_digest text, organization text, e text, expected_head bigint, after_ordinal bigint,
 row_limit integer, max_bytes integer
) returns jsonb language plpgsql set search_path='' as $$
declare bound_owner uuid;watermark bigint;projection jsonb; continuation bigint;
 row_count integer; scanned_bytes bigint; result jsonb;
begin
 if after_ordinal is null or after_ordinal<0 or (after_ordinal>0 and expected_head is null)
   or row_limit is null or row_limit not between 1 and 200
   or max_bytes is null or max_bytes not between 512 and 262144 then
    raise exception 'SYNC_LOTTERY_SNAPSHOT_CURSOR_OR_LIMIT';
 end if;
 perform sync_v2.assert_trusted_device(a,d,credential_digest,'lottery-organization',organization,e,false);
  select owner_id,high_water into bound_owner,watermark
  from sync_v2.resolve_module_read(a,'lottery-organization',organization,e);
 if found then
   -- Every enrolled writer takes this owner lock before editing native rows.
   perform pg_advisory_xact_lock(hashtextextended('lottery-owner:'||bound_owner::text,0));
   perform sync_v2.assert_trusted_device(a,d,credential_digest,'lottery-organization',organization,e,false);
   select owner_id,high_water into bound_owner,watermark
     from sync_v2.resolve_module_read(a,'lottery-organization',organization,e);
 end if;
 if not found then raise exception 'SYNC_LOTTERY_SNAPSHOT_DENIED';end if;
 if expected_head is not null and expected_head<>watermark then
    raise exception 'SYNC_LOTTERY_SNAPSHOT_STALE';
 end if;
 if after_ordinal>0 and not exists (
   select 1 from public.khata_lottery_records r
   where r.owner_id=bound_owner and sync_v2.lottery_organization(r.model,r.id,r.value)=organization
     and r.ordinal=after_ordinal
 ) then raise exception 'SYNC_LOTTERY_SNAPSHOT_CURSOR_OR_LIMIT'; end if;
 with selected as materialized (
   select r.model,r.id,r.ordinal,r.value::text as encoded
   from public.khata_lottery_records r
   where r.owner_id=bound_owner and sync_v2.lottery_organization(r.model,r.id,r.value)=organization
     and r.ordinal>after_ordinal
   order by r.ordinal limit row_limit+1
 ), budget as (
   select count(*)::int as n,coalesce(sum(octet_length(encoded)),0) as bytes from selected
 ), bounded as (
   select selected.* from selected cross join budget where bytes<=max_bytes
   order by ordinal limit row_limit
 )
 select budget.n,budget.bytes,
   coalesce((select max(ordinal) from bounded),after_ordinal),
   coalesce((select jsonb_agg(jsonb_build_object('model',model,'id',id,'ordinal',ordinal::text,
     'projectionJson',encoded) order by ordinal) from bounded),'[]'::jsonb)
 into row_count,scanned_bytes,continuation,projection from budget;
 if scanned_bytes>max_bytes then raise exception 'SYNC_LOTTERY_SNAPSHOT_PAGE_TOO_LARGE';end if;
 result:=jsonb_build_object('projection','lottery-organization-v1','scopeId',organization,'epoch',e,
   'highWater',watermark::text,'after',after_ordinal::text,'next',continuation::text,
   'done',row_count<=row_limit,'rows',projection);
 if octet_length(result::text)>max_bytes then raise exception 'SYNC_LOTTERY_SNAPSHOT_PAGE_TOO_LARGE';end if;
 return result;
end $$;
revoke all on function sync_v2.read_trusted_lottery_snapshot(uuid,text,text,text,text,bigint,bigint,integer,integer)
from public,anon,authenticated,service_role;

commit;
