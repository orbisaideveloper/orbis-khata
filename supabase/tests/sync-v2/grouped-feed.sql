-- Disposable contract: a scope's counter is locked until commit, so the
-- events written by one transaction form one contiguous run in that scope.
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
