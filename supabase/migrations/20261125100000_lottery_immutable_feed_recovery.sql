-- Recover a whole committed Lottery group without staging a second copy of financial data.
-- Access remains behind the existing default-off HTTP flag and trusted device checks.
create function sync_v2.lottery_recovery_event(event_seq bigint, operation text, payload jsonb)
returns bytea language sql immutable set search_path='' as $$
 select convert_to(jsonb_build_object('seq',event_seq::text,'operationId',operation,'change',payload)::text,'UTF8')
$$;

create function sync_v2.read_trusted_lottery_group(
 a uuid,d text,credential_digest text,s text,e text,after_seq bigint,item integer,byte_offset integer
) returns jsonb language plpgsql set search_path='' as $$
declare
 k constant text:='lottery-organization';
 watermark bigint; floor_seq bigint; native_tx text; stop_seq bigint;
 count_items bigint; total_bytes bigint; max_bytes bigint;
 transfer text; body bytea; part bytea;
begin
 if after_seq is null or after_seq<0 or (item is null)<>(byte_offset is null) or
    (item is not null and (item<1 or item>16000 or byte_offset<0 or byte_offset>=2097152)) then
  raise exception 'SYNC_RECOVERY_FRAGMENT_CURSOR';
 end if;
 perform sync_v2.assert_trusted_device(a,d,credential_digest,k,s,e,false);
 select high_water into watermark from sync_v2.resolve_module_read(a,k,s,e);
 if not found then raise exception 'SYNC_RECOVERY_TRANSFER_DENIED'; end if;
 select retained_after into strict floor_seq from sync_v2.scope
  where actor_id=a::text and kind=k and scope_id=s and epoch=e;
 if after_seq<floor_seq then raise exception 'SYNC_FEED_CURSOR_EXPIRED'; end if;
 if after_seq>=watermark then raise exception 'SYNC_RECOVERY_GROUP_ABSENT'; end if;

 select capture_transaction into native_tx from sync_v2.event
  where actor_id=a::text and kind=k and scope_id=s and epoch=e and seq=after_seq+1;
 if not found then raise exception 'SYNC_FEED_GAP'; end if;
 if exists (select 1 from sync_v2.event where actor_id=a::text and kind=k and scope_id=s
  and epoch=e and seq=after_seq and capture_transaction=native_tx) then raise exception 'SYNC_FEED_SPLIT_CURSOR'; end if;
 select max(seq) into stop_seq from sync_v2.event
  where actor_id=a::text and kind=k and scope_id=s and epoch=e and capture_transaction=native_tx;
 if stop_seq-after_seq>16000 then raise exception 'SYNC_RECOVERY_TRANSFER_BUDGET'; end if;
 transfer:=after_seq::text||':'||stop_seq::text;

 if item is null then
  select count(*),sum(length),max(length) into count_items,total_bytes,max_bytes
  from (
    select octet_length(sync_v2.lottery_recovery_event(seq,operation_id,change)) length
    from sync_v2.event where actor_id=a::text and kind=k and scope_id=s and epoch=e
     and seq>after_seq and seq<=stop_seq and capture_transaction=native_tx
  ) as sizes;
  if count_items<>stop_seq-after_seq then raise exception 'SYNC_FEED_GAP'; end if;
  if total_bytes>16777216 or max_bytes>2097152 then raise exception 'SYNC_RECOVERY_TRANSFER_BUDGET'; end if;
  return jsonb_build_object('version',1,'purpose','group','scopeKind',k,'scopeId',s,'epoch',e,
   'transfer',transfer,'from',after_seq::text,'next',stop_seq::text,'items',count_items,'bytes',total_bytes);
 end if;

 if item>stop_seq-after_seq then raise exception 'SYNC_RECOVERY_FRAGMENT_CURSOR'; end if;
 select sync_v2.lottery_recovery_event(seq,operation_id,change) into body
 from sync_v2.event where actor_id=a::text and kind=k and scope_id=s and epoch=e
  and seq=after_seq+item and capture_transaction=native_tx;
 if not found then raise exception 'SYNC_FEED_GAP'; end if;
 if octet_length(body)>2097152 then raise exception 'SYNC_RECOVERY_TRANSFER_BUDGET'; end if;
 if byte_offset>=octet_length(body) then raise exception 'SYNC_RECOVERY_FRAGMENT_CURSOR'; end if;
 part:=substring(body from byte_offset+1 for 24576);
 return jsonb_build_object('transfer',transfer,'item',item,'offset',byte_offset,
  'nextOffset',byte_offset+octet_length(part),'size',octet_length(body),
  'sha256',encode(sha256(body),'hex'),'hex',encode(part,'hex'));
end $$;

revoke all on function sync_v2.lottery_recovery_event(bigint,text,jsonb),
 sync_v2.read_trusted_lottery_group(uuid,text,text,text,text,bigint,integer,integer)
from public,anon,authenticated,service_role;

-- Read one logical snapshot row in fragments. All parts retain the same revision
-- fence; a write between parts invalidates the in-memory client snapshot.
create function sync_v2.read_trusted_lottery_snapshot_part(
 a uuid,d text,credential_digest text,s text,e text,expected_head bigint,after_ordinal bigint,byte_offset integer
) returns jsonb language plpgsql set search_path='' as $$
declare
 k constant text:='lottery-organization';
 bound_owner uuid; watermark bigint; row_ordinal bigint; body bytea; part bytea; finished boolean;
begin
 if after_ordinal is null or after_ordinal<0 or byte_offset is null or byte_offset<0 or byte_offset>=2097152 or
    ((after_ordinal>0 or byte_offset>0) and expected_head is null) then
  raise exception 'SYNC_RECOVERY_FRAGMENT_CURSOR';
 end if;
 perform sync_v2.assert_trusted_device(a,d,credential_digest,k,s,e,false);
 select owner_id into bound_owner from sync_v2.resolve_module_read(a,k,s,e);
 if not found then raise exception 'SYNC_RECOVERY_TRANSFER_DENIED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('lottery-owner:'||bound_owner::text,0));
 perform sync_v2.assert_trusted_device(a,d,credential_digest,k,s,e,false);
 select owner_id,high_water into bound_owner,watermark from sync_v2.resolve_module_read(a,k,s,e);
 if not found then raise exception 'SYNC_RECOVERY_TRANSFER_DENIED'; end if;
 if expected_head is not null and expected_head<>watermark then raise exception 'SYNC_LOTTERY_SNAPSHOT_STALE'; end if;

 select ordinal,convert_to(jsonb_build_object('model',model,'id',id,'ordinal',ordinal::text,
   'projectionJson',value::text)::text,'UTF8') into row_ordinal,body
 from public.khata_lottery_records r
 where r.owner_id=bound_owner and sync_v2.lottery_organization(r.model,r.id,r.value)=s and ordinal>after_ordinal
 order by ordinal limit 1;
 if not found then raise exception 'SYNC_RECOVERY_FRAGMENT_CURSOR'; end if;
 if octet_length(body)>2097152 then raise exception 'SYNC_RECOVERY_TRANSFER_BUDGET'; end if;
 if byte_offset>=octet_length(body) then raise exception 'SYNC_RECOVERY_FRAGMENT_CURSOR'; end if;
 part:=substring(body from byte_offset+1 for 24576);
 select not exists(select 1 from public.khata_lottery_records r
   where r.owner_id=bound_owner and sync_v2.lottery_organization(r.model,r.id,r.value)=s and ordinal>row_ordinal)
   into finished;
 return jsonb_build_object('scopeId',s,'epoch',e,'highWater',watermark::text,
  'after',after_ordinal::text,'next',row_ordinal::text,'done',finished,
  'fragment',jsonb_build_object('transfer',watermark::text||':'||row_ordinal::text,'item',1,'offset',byte_offset,
   'nextOffset',byte_offset+octet_length(part),'size',octet_length(body),
   'sha256',encode(sha256(body),'hex'),'hex',encode(part,'hex')));
end $$;

revoke all on function sync_v2.read_trusted_lottery_snapshot_part(uuid,text,text,text,text,bigint,bigint,integer)
from public,anon,authenticated,service_role;
