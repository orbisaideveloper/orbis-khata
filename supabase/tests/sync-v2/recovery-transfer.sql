-- Private, immutable transfer candidates. No expiry schedule or client
-- activation is implied. Materialize under a single repeatable-read snapshot.
create table sync_v2.recovery_transfer (
  id uuid primary key,
  actor uuid not null,
  registration text not null,
  kind text not null,
  scope_id text not null,
  epoch text not null,
  purpose text not null check (purpose in ('group','snapshot')),
  from_seq bigint,
  to_seq bigint not null,
  item_count integer not null default 0,
  byte_count bigint not null default 0,
  opened_at timestamptz not null default now(),
  unique(actor,registration),
  check ((purpose='group' and from_seq is not null and from_seq<to_seq)
    or (purpose='snapshot' and from_seq is null))
);
create table sync_v2.recovery_transfer_item (
  transfer_id uuid not null references sync_v2.recovery_transfer(id) on delete cascade,
  item_no integer not null,
  bytes bytea not null,
  digest bytea not null,
  primary key(transfer_id,item_no)
);
revoke all on sync_v2.recovery_transfer,sync_v2.recovery_transfer_item from public,anon,authenticated,service_role;

create function sync_v2.append_recovery_item(transfer uuid,item integer,encoded jsonb)
returns integer language plpgsql set search_path='' as $$
declare data bytea := convert_to(encoded::text,'UTF8'); size integer := octet_length(data);
begin
  if item>16000 or size>2097152 then raise exception 'SYNC_RECOVERY_TRANSFER_BUDGET';end if;
  insert into sync_v2.recovery_transfer_item values(transfer,item,data,sha256(data));
  return size;
end $$;

create function sync_v2.open_recovery_transfer(a uuid,d text,credential_digest text,k text,s text,e text,after_seq bigint)
returns jsonb language plpgsql set search_path='' as $$
declare
  transfer uuid:=gen_random_uuid(); bound_owner uuid; head_seq bigint; floor_seq bigint;
  stop_seq bigint; native_tx text; purpose text; n integer:=0; size bigint:=0; record_row record; section record;
begin
  if current_setting('transaction_isolation') not in ('repeatable read','serializable') then
    raise exception 'SYNC_RECOVERY_CONSISTENT_READ_REQUIRED';
  end if;
  perform sync_v2.assert_trusted_device(a,d,credential_digest,k,s,e,false);
  select owner_id,high_water into bound_owner,head_seq from sync_v2.resolve_module_read(a,k,s,e);
  if not found then raise exception 'SYNC_RECOVERY_TRANSFER_DENIED';end if;
  select retained_after into strict floor_seq from sync_v2.scope where actor_id=a::text and kind=k and scope_id=s and epoch=e;
  purpose:=case when after_seq is null then 'snapshot' else 'group' end;
  if purpose='group' then
    if after_seq<floor_seq then raise exception 'SYNC_FEED_CURSOR_EXPIRED';end if;
    if after_seq>=head_seq then raise exception 'SYNC_RECOVERY_GROUP_ABSENT';end if;
    select capture_transaction into native_tx from sync_v2.event
      where actor_id=a::text and kind=k and scope_id=s and epoch=e and seq=after_seq+1;
    if not found then raise exception 'SYNC_FEED_GAP';end if;
    if exists(select 1 from sync_v2.event where actor_id=a::text and kind=k and scope_id=s and epoch=e
      and seq=after_seq and capture_transaction=native_tx) then raise exception 'SYNC_FEED_SPLIT_CURSOR';end if;
    select max(seq) into stop_seq from sync_v2.event where actor_id=a::text and kind=k and scope_id=s
      and epoch=e and capture_transaction=native_tx;
  else
    if k not in ('company','lottery-organization') then raise exception 'SYNC_RECOVERY_PROJECTION_UNSUPPORTED';end if;
    stop_seq:=head_seq;
  end if;
  -- Replace one previous transfer per credential, atomically. An aborted
  -- replacement leaves the previous image available.
  delete from sync_v2.recovery_transfer where actor=a and registration=d;
  insert into sync_v2.recovery_transfer(id,actor,registration,kind,scope_id,epoch,purpose,from_seq,to_seq)
  values(transfer,a,d,k,s,e,purpose,after_seq,stop_seq);

  if purpose='group' then
    for record_row in select seq,operation_id,change,capture_transaction from sync_v2.event
      where actor_id=a::text and kind=k and scope_id=s and epoch=e and seq>after_seq and seq<=stop_seq order by seq
    loop
      n:=n+1;
      if record_row.seq<>after_seq+n or record_row.capture_transaction<>native_tx then raise exception 'SYNC_FEED_GAP';end if;
      size:=size+sync_v2.append_recovery_item(transfer,n,jsonb_build_object(
        'seq',record_row.seq::text,'operationId',record_row.operation_id,'change',record_row.change));
      if size>16777216 then raise exception 'SYNC_RECOVERY_TRANSFER_BUDGET';end if;
    end loop;
    if n<>stop_seq-after_seq then raise exception 'SYNC_FEED_GAP';end if;
  elsif k='lottery-organization' then
    for record_row in select model,id,ordinal,value from public.khata_lottery_records
      where owner_id=bound_owner and sync_v2.lottery_organization(model,id,value)=s order by ordinal
    loop
      n:=n+1;
      size:=size+sync_v2.append_recovery_item(transfer,n,jsonb_build_object(
        'model',record_row.model,'id',record_row.id,'ordinal',record_row.ordinal::text,'projectionJson',record_row.value::text));
      if size>16777216 then raise exception 'SYNC_RECOVERY_TRANSFER_BUDGET';end if;
    end loop;
  else
    for section in select * from sync_v2.company_projection_sections('company-operational-v1')
    loop
      for record_row in execute format('select to_jsonb(t)::text as payload from public.%I t where company_id=$1 order by %s',
        section.relation,section.ordering) using s::uuid
      loop
        n:=n+1;
        size:=size+sync_v2.append_recovery_item(transfer,n,jsonb_build_object(
          'entityType',section.entity,'projectionJson',record_row.payload));
        if size>16777216 then raise exception 'SYNC_RECOVERY_TRANSFER_BUDGET';end if;
      end loop;
    end loop;
  end if;
  update sync_v2.recovery_transfer set item_count=n,byte_count=size where id=transfer;
  return jsonb_build_object('version',1,'transfer',transfer,'purpose',purpose,'scopeKind',k,'scopeId',s,'epoch',e,
    'from',after_seq::text,'next',stop_seq::text,'items',n,'bytes',size);
end $$;

create function sync_v2.read_recovery_fragment(a uuid,d text,credential_digest text,t uuid,item integer,byte_offset integer)
returns jsonb language plpgsql set search_path='' as $$
declare bundle sync_v2.recovery_transfer; source sync_v2.recovery_transfer_item; fragment bytea;
begin
  select * into bundle from sync_v2.recovery_transfer where id=t and actor=a and registration=d;
  if not found or not exists(select 1 from sync_v2.resolve_module_read(a,bundle.kind,bundle.scope_id,bundle.epoch))
    then raise exception 'SYNC_RECOVERY_TRANSFER_DENIED';end if;
  perform sync_v2.assert_trusted_device(a,d,credential_digest,bundle.kind,bundle.scope_id,bundle.epoch,false);
  if exists(select 1 from sync_v2.scope where actor_id=a::text and kind=bundle.kind and scope_id=bundle.scope_id
    and epoch=bundle.epoch and retained_after>coalesce(bundle.from_seq,bundle.to_seq))
    then raise exception 'SYNC_FEED_CURSOR_EXPIRED';end if;
  select * into source from sync_v2.recovery_transfer_item where transfer_id=t and item_no=item;
  if not found or byte_offset is null or byte_offset<0 or byte_offset>=octet_length(source.bytes)
    then raise exception 'SYNC_RECOVERY_FRAGMENT_CURSOR';end if;
  fragment:=substring(source.bytes from byte_offset+1 for 24576);
  return jsonb_build_object('transfer',t,'item',item,'offset',byte_offset,'nextOffset',byte_offset+octet_length(fragment),
    'size',octet_length(source.bytes),'sha256',encode(source.digest,'hex'),'hex',encode(fragment,'hex'));
end $$;

create function sync_v2.dispose_recovery_transfers(cutoff timestamptz,batch_limit integer)
returns integer language plpgsql set search_path='' as $$
declare removed integer;
begin
  if cutoff is null or cutoff>statement_timestamp() or batch_limit is null or batch_limit not between 1 and 20 then
    raise exception 'SYNC_RECOVERY_DISPOSAL_INVALID';
  end if;
  with expired as (
    select id from sync_v2.recovery_transfer where opened_at<cutoff order by opened_at,id
      limit batch_limit for update skip locked
  )
  delete from sync_v2.recovery_transfer bundle using expired where bundle.id=expired.id;
  get diagnostics removed=row_count;
  return removed;
end $$;
create index recovery_transfer_expiry on sync_v2.recovery_transfer(opened_at,id);

revoke all on function sync_v2.append_recovery_item(uuid,integer,jsonb),
 sync_v2.open_recovery_transfer(uuid,text,text,text,text,text,bigint),
 sync_v2.read_recovery_fragment(uuid,text,text,uuid,integer,integer),
 sync_v2.dispose_recovery_transfers(timestamptz,integer)
from public,anon,authenticated,service_role;

-- Batch small items to bound request fanout without enlarging byte fragments.
create function sync_v2.read_recovery_fragment_page(a uuid,d text,credential_digest text,t uuid,
  item integer,byte_offset integer,fragment_limit integer)
returns jsonb language plpgsql set search_path='' as $$
declare
  bundle sync_v2.recovery_transfer;
  fragment jsonb;
  parts jsonb:='[]';
  i integer:=item;
  offset_bytes integer:=byte_offset;
  bytes integer:=256;
begin
  if item is null or item<1 or byte_offset is null or byte_offset<0
    or fragment_limit is null or fragment_limit not between 1 and 32 then
    raise exception 'SYNC_RECOVERY_FRAGMENT_CURSOR';
  end if;
  select * into bundle from sync_v2.recovery_transfer where id=t and actor=a and registration=d;
  if not found then raise exception 'SYNC_RECOVERY_TRANSFER_DENIED';end if;
  if i>bundle.item_count then raise exception 'SYNC_RECOVERY_FRAGMENT_CURSOR';end if;
  for n in 1..fragment_limit loop
    fragment:=sync_v2.read_recovery_fragment(a,d,credential_digest,t,i,offset_bytes);
    bytes:=bytes+octet_length(fragment::text)+2;
    exit when bytes>65536;
    parts:=parts||jsonb_build_array(fragment);
    offset_bytes:=(fragment->>'nextOffset')::integer;
    if offset_bytes=(fragment->>'size')::integer then
      i:=i+1;
      offset_bytes:=0;
    end if;
    exit when i>bundle.item_count;
  end loop;
  return jsonb_build_object('fragments',parts);
end $$;
revoke all on function sync_v2.read_recovery_fragment_page(uuid,text,text,uuid,integer,integer,integer)
from public,anon,authenticated,service_role;
