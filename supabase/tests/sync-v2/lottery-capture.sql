-- Candidate only. Capture actual Lottery v2 row-store mutations, including
-- generated ledger, audit, stock, commission and PWD children. The existing
-- native operation row remains the replay and result authority.
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
   -- A retired/revoked or ownership-disconnected enrolled scope must not
   -- silently accept a financial row that no other device can ever receive.
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
do $fixture$
declare
  definition text := pg_get_functiondef('public.khata_lottery_store_v2(jsonb)'::regprocedure);
  before_changes text := $source$for change in select value from jsonb_array_elements(p->'changes') loop$source$;
  after_receipt text := $source$insert into public.khata_lottery_operations(owner_id,operation_id,request,result) values(owner,op,p->'request',p->'result');$source$;
begin
  if (length(definition)-length(replace(definition,before_changes,'')))<>length(before_changes) or
     (length(definition)-length(replace(definition,after_receipt,'')))<>length(after_receipt) then
    raise exception 'SYNC_LOTTERY_FIXTURE_SOURCE_CHANGED';
  end if;
  definition:=replace(definition,before_changes,
    $source$insert into sync_v2.lottery_capture_context values(
      pg_current_xact_id()::text,owner,op,p#>>'{request,payload,organizationId}');
    $source$ || before_changes);
  execute replace(definition,after_receipt,after_receipt ||
    $source$
    delete from sync_v2.lottery_capture_context ctx
      where ctx.transaction_id=pg_current_xact_id()::text and ctx.owner_id=owner;
    $source$);
end
$fixture$;
