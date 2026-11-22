begin;
-- One global metadata refresh lease protects the shared YouTube quota across isolates.
create table lottery_private.live_cache (
 singleton boolean primary key default true check(singleton),
 payload jsonb, lease uuid, lease_until timestamptz,
 next_attempt timestamptz not null default '-infinity',
 check(payload is null or octet_length(payload::text)<4096)
);
alter table lottery_private.live_cache enable row level security;
revoke all on lottery_private.live_cache from public,anon,authenticated;
grant all on lottery_private.live_cache to service_role;
insert into lottery_private.live_cache(singleton) values(true);
create function public.lottery_live_claim() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r lottery_private.live_cache; n timestamptz:=clock_timestamp();
begin
 select * into r from lottery_private.live_cache where singleton for update;
 if r.next_attempt>n or r.lease_until>n then
   return jsonb_build_object('state','wait','payload',r.payload);
 end if;
 update lottery_private.live_cache set lease=gen_random_uuid(),lease_until=n+interval '35 seconds'
 where singleton returning * into r;
 return jsonb_build_object('state','claim','lease',r.lease);
end;$$;
create function public.lottery_live_finish(p_lease uuid,p_payload jsonb,p_failed boolean) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update lottery_private.live_cache set payload=p_payload,lease=null,lease_until=null,
 next_attempt=clock_timestamp()+case when p_failed then interval '10 minutes' else interval '60 seconds' end
 where singleton and lease=p_lease and lease_until>clock_timestamp();
 return found;
end;$$;
revoke all on function public.lottery_live_claim(),public.lottery_live_finish(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.lottery_live_claim(),public.lottery_live_finish(uuid,jsonb,boolean) to service_role;
commit;
