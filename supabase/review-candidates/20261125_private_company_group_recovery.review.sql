-- Sync v2 company-specific oversized atomic transaction recovery.
-- REVIEW ONLY: not a deployed migration; requires the private base migrations
-- and the checked-in company capture review candidate in a disposable DB.
-- No grants to anon/authenticated/service_role and no enrollment side effects.
begin;
set local lock_timeout = '5s';
do $dependencies$ begin
  if to_regprocedure('sync_v2.assert_trusted_device(uuid,text,text,text,text,text,boolean)') is null
    or to_regprocedure('sync_v2.resolve_module_read(uuid,text,text,text)') is null
    or to_regprocedure('sync_v2.read_grouped_feed(text,text,text,text,bigint,integer)') is null
  then raise exception 'SYNC_COMPANY_GROUP_BASE_REQUIRED'; end if;
end $dependencies$;

-- A fragment must never be delivered without independently valid read authority.
-- An immutable committed group may be recovered in pieces, but a consumer must
-- SHA256-verify and stage the ENTIRE group before advancing the local cursor.
-- The manifest is checked first; an oversized/invalid group fails closed.
create function sync_v2.company_recovery_event(event_seq bigint, operation text, payload jsonb)
returns bytea language sql immutable set search_path='' as $$
  select convert_to(jsonb_build_object('seq',event_seq::text,
    'operationId',operation,'change',payload)::text,'UTF8')
$$;

create function sync_v2.read_trusted_company_group(
 a uuid,d text,credential_digest text,s text,e text,
 after_seq bigint,item integer,byte_offset integer
) returns jsonb language plpgsql set search_path='' as $$
declare
  k constant text := 'company';
  watermark bigint; floor_seq bigint; native_tx text; previous_tx text;
  stop_seq bigint; item_count bigint; total_bytes bigint; maximum_bytes bigint;
  body bytea; part bytea; transfer text;
begin
  if after_seq is null or after_seq < 0 or (item is null) <> (byte_offset is null)
     or (item is not null and (item < 1 or item > 16000 or byte_offset < 0 or byte_offset >= 2097152))
  then raise exception 'SYNC_RECOVERY_FRAGMENT_CURSOR'; end if;

  perform sync_v2.assert_trusted_device(a,d,credential_digest,k,s,e,false);
  select high_water into watermark from sync_v2.resolve_module_read(a,k,s,e);
  if not found then raise exception 'SYNC_COMPANY_RECOVERY_DENIED'; end if;
  select retained_after into strict floor_seq from sync_v2.scope
    where actor_id=a::text and kind=k and scope_id=s and epoch=e;
  if after_seq < floor_seq then raise exception 'SYNC_FEED_CURSOR_EXPIRED'; end if;
  if after_seq >= watermark then raise exception 'SYNC_RECOVERY_GROUP_ABSENT'; end if;

  if after_seq > floor_seq then
    select capture_transaction into previous_tx from sync_v2.event
      where actor_id=a::text and kind=k and scope_id=s and epoch=e and seq=after_seq;
    if not found then raise exception 'SYNC_FEED_GAP'; end if;
  end if;
  select capture_transaction into native_tx from sync_v2.event
    where actor_id=a::text and kind=k and scope_id=s and epoch=e and seq=after_seq+1;
  if not found then raise exception 'SYNC_FEED_GAP'; end if;
  if previous_tx is not distinct from native_tx then raise exception 'SYNC_FEED_SPLIT_CURSOR'; end if;
  select max(seq) into stop_seq from sync_v2.event
    where actor_id=a::text and kind=k and scope_id=s and epoch=e and capture_transaction=native_tx;
  if stop_seq-after_seq > 16000 then raise exception 'SYNC_RECOVERY_TRANSFER_BUDGET'; end if;
  transfer := after_seq::text || ':' || stop_seq::text;

  if item is null then
    select count(*),coalesce(sum(event_size),0),max(event_size)
    into item_count,total_bytes,maximum_bytes
    from (
      select octet_length(sync_v2.company_recovery_event(seq,operation_id,change)) event_size
      from sync_v2.event where actor_id=a::text and kind=k and scope_id=s and epoch=e
        and seq>after_seq and seq<=stop_seq and capture_transaction=native_tx
    ) sizes;
    if item_count <> stop_seq-after_seq then raise exception 'SYNC_FEED_GAP'; end if;
    if total_bytes > 16777216 or maximum_bytes > 2097152 then
      raise exception 'SYNC_RECOVERY_TRANSFER_BUDGET'; end if;
    return jsonb_build_object('version',1,'purpose','group','scopeKind',k,
      'scopeId',s,'epoch',e,'transfer',transfer,'from',after_seq::text,
      'next',stop_seq::text,'items',item_count,'bytes',total_bytes);
  end if;

  if item > stop_seq-after_seq then raise exception 'SYNC_RECOVERY_FRAGMENT_CURSOR'; end if;
  select sync_v2.company_recovery_event(seq,operation_id,change) into body
  from sync_v2.event where actor_id=a::text and kind=k and scope_id=s and epoch=e
    and seq=after_seq+item and capture_transaction=native_tx;
  if not found then raise exception 'SYNC_FEED_GAP'; end if;
  if octet_length(body)>2097152 then raise exception 'SYNC_RECOVERY_TRANSFER_BUDGET'; end if;
  if byte_offset>=octet_length(body) then raise exception 'SYNC_RECOVERY_FRAGMENT_CURSOR'; end if;
  part := substring(body from byte_offset+1 for 24576);
  return jsonb_build_object('transfer',transfer,'item',item,'offset',byte_offset,
    'nextOffset',byte_offset+octet_length(part),'size',octet_length(body),
    'sha256',encode(sha256(body),'hex'),'hex',encode(part,'hex'));
end $$;
revoke all on function sync_v2.company_recovery_event(bigint,text,jsonb),
  sync_v2.read_trusted_company_group(uuid,text,text,text,text,bigint,integer,integer)
from public,anon,authenticated,service_role;
commit;
