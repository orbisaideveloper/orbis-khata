begin;
create table lottery_private.live_draw_cache (
 draw_date date not null, slot text not null check(slot in ('1pm','6pm','8pm')),
 payload jsonb check(payload is null or octet_length(payload::text)<4096),
 lease uuid, lease_until timestamptz, next_attempt timestamptz not null default '-infinity',
 attempts integer not null default 0, failures integer not null default 0,
 cache_hits bigint not null default 0, cache_misses bigint not null default 0,
 search_calls bigint not null default 0, verification_calls bigint not null default 0,
 errors bigint not null default 0, estimated_units bigint not null default 0,
 primary key(draw_date,slot)
);
alter table lottery_private.live_draw_cache enable row level security;
revoke all on lottery_private.live_draw_cache from public,anon,authenticated;
grant all on lottery_private.live_draw_cache to service_role;
-- Preserve the current verified identity. The previous singleton remains for rollback.
insert into lottery_private.live_draw_cache(draw_date,slot,payload)
select (payload->>'date')::date,payload->>'slot',payload
from lottery_private.live_cache where payload->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
and payload->>'slot' in ('1pm','6pm','8pm') and payload->>'videoId' ~ '^[A-Za-z0-9_-]{11}$';
create function public.lottery_live_draw_claim(p_date date,p_slot text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r lottery_private.live_draw_cache; n timestamptz:=clock_timestamp(); target timestamptz;
begin
 if p_date<>(n at time zone 'Asia/Kolkata')::date or p_slot not in ('1pm','6pm','8pm') then raise exception 'LIVE_DRAW_INVALID'; end if;
 insert into lottery_private.live_draw_cache(draw_date,slot) values(p_date,p_slot) on conflict do nothing;
 select * into r from lottery_private.live_draw_cache where draw_date=p_date and slot=p_slot for update;
 target:=(p_date+case p_slot when '1pm' then time '13:00' when '6pm' then time '18:00' else time '20:00' end) at time zone 'Asia/Kolkata';
 if r.next_attempt>n or r.lease_until>n or (r.payload is null and (n<target-interval '10 minutes' or n>target+interval '60 minutes' or r.attempts>=12)) then
 update lottery_private.live_draw_cache set cache_hits=cache_hits+1 where draw_date=p_date and slot=p_slot;
 return jsonb_build_object('state','wait','payload',r.payload);
 end if;
 update lottery_private.live_draw_cache set lease=gen_random_uuid(),lease_until=n+interval '45 seconds',
 attempts=attempts+case when payload is null then 1 else 0 end,cache_misses=cache_misses+1
 where draw_date=p_date and slot=p_slot returning * into r;
 return jsonb_build_object('state','claim','lease',r.lease,'payload',r.payload);
end;$$;
create function public.lottery_live_draw_finish(p_date date,p_slot text,p_lease uuid,p_payload jsonb,p_failed boolean,p_search integer,p_verify integer,p_units integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r lottery_private.live_draw_cache; n timestamptz:=clock_timestamp(); delay_seconds integer;
begin
 select * into r from lottery_private.live_draw_cache where draw_date=p_date and slot=p_slot for update;
 if r.lease is null or r.lease_until is null or r.lease is distinct from p_lease or r.lease_until<=n then return r.payload; end if;
 if p_payload is not null and (p_payload->>'date' is distinct from p_date::text or p_payload->>'slot' is distinct from p_slot
 or p_payload->>'channelId' is distinct from 'UCX7bj5Fv2uBpAy1dRC1IhTw' or coalesce(p_payload->>'videoId','') !~ '^[A-Za-z0-9_-]{11}$'
 or (r.payload is not null and r.payload->>'videoId' is distinct from p_payload->>'videoId')) then raise exception 'LIVE_PAYLOAD_INVALID'; end if;
 delay_seconds:=case when p_payload->>'status'='completed' then 21600 when p_payload is not null then 300
 else least(300,30*power(2,least(r.failures,4))::integer)+floor(random()*15)::integer end;
 update lottery_private.live_draw_cache set payload=coalesce(p_payload,payload),lease=null,lease_until=null,
 next_attempt=n+make_interval(secs=>delay_seconds),failures=case when p_payload is null then failures+1 else 0 end,
 errors=errors+case when p_failed then 1 else 0 end,search_calls=search_calls+greatest(0,p_search),
 verification_calls=verification_calls+greatest(0,p_verify),estimated_units=estimated_units+greatest(0,p_units)
 where draw_date=p_date and slot=p_slot returning * into r;
 return r.payload;
end;$$;
revoke all on function public.lottery_live_draw_claim(date,text),public.lottery_live_draw_finish(date,text,uuid,jsonb,boolean,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.lottery_live_draw_claim(date,text),public.lottery_live_draw_finish(date,text,uuid,jsonb,boolean,integer,integer,integer) to service_role;
-- Metadata only, removed before Google's 30-day refresh/delete limit.
select cron.schedule('lottery-live-retention','17 0 * * *',$job$delete from lottery_private.live_draw_cache where draw_date < (now() at time zone 'Asia/Kolkata')::date-28; update lottery_private.live_cache set payload=null where payload->>'date' < ((now() at time zone 'Asia/Kolkata')::date-28)::text;$job$);
commit;
