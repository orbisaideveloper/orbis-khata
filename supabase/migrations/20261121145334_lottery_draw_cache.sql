begin;
create schema if not exists lottery_private;
revoke all on schema lottery_private from public, anon, authenticated;
grant usage on schema lottery_private to service_role;
create table lottery_private.draw_cache (
 draw_date date not null, slot text not null check(slot in ('1pm','6pm','8pm')),
 payload jsonb, pdf_url text, lease uuid, lease_until timestamptz,
 next_attempt timestamptz not null default '-infinity', attempted_at timestamptz,
 reason text, primary key(draw_date,slot),
 check(payload is null or (jsonb_typeof(payload)='object' and octet_length(payload::text)<65536))
);
create table lottery_private.provider_gate (
 singleton boolean primary key default true check(singleton),
 next_request timestamptz not null default '-infinity',
 worker_hash text, worker_until timestamptz, active_claim uuid, active_until timestamptz
);
insert into lottery_private.provider_gate(singleton) values(true);
alter table lottery_private.draw_cache enable row level security;
alter table lottery_private.provider_gate enable row level security;
grant select,insert,update,delete on lottery_private.draw_cache to service_role;
grant select,update on lottery_private.provider_gate to service_role;
create policy service_cache on lottery_private.draw_cache to service_role using(true) with check(true);
create policy service_gate on lottery_private.provider_gate to service_role using(true) with check(true);

create function public.lottery_draw_claim(p_date date,p_slot text,p_pdf boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r lottery_private.draw_cache; n timestamptz:=clock_timestamp(); gate timestamptz; active_until timestamptz; today date:=(n at time zone 'Asia/Kolkata')::date;
begin
 if p_date is null or p_date<today-29 or p_date>today or p_slot not in ('1pm','6pm','8pm') or p_slot is null then raise exception 'INVALID_DRAW';end if;
 delete from lottery_private.draw_cache where draw_date<today-29;
 insert into lottery_private.draw_cache(draw_date,slot) values(p_date,p_slot) on conflict do nothing;
 select * into r from lottery_private.draw_cache where draw_date=p_date and slot=p_slot for update;
 if r.payload is not null and (not p_pdf or r.pdf_url is not null) then
  return jsonb_build_object('state','ready','payload',r.payload,'pdf',r.pdf_url);
 end if;
 if r.lease_until>n or r.next_attempt>n then return jsonb_build_object('state','wait');end if;
 -- One global provider gate across all isolates, both endpoints and the cron worker.
 select g.next_request,g.active_until into gate,active_until from lottery_private.provider_gate g where singleton for update;
 if gate>n or active_until>n then return jsonb_build_object('state','wait');end if;
 update lottery_private.provider_gate set next_request=n+interval '2100 milliseconds' where singleton;
 update lottery_private.draw_cache set lease=gen_random_uuid(),lease_until=n+interval '45 seconds',attempted_at=n
 where draw_date=p_date and slot=p_slot returning * into r;
 update lottery_private.provider_gate set active_claim=r.lease,active_until=r.lease_until where singleton;
 return jsonb_build_object('state','claim','lease',r.lease,'payload',r.payload,'pdf',r.pdf_url);
end $$;
create function public.lottery_draw_finish(p_date date,p_slot text,p_lease uuid,p_payload jsonb,p_pdf text,p_reason text,p_wait integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare updated integer;
begin
 if p_reason is not null and p_reason not in ('PENDING','PROVIDER_AUTH','PROVIDER_LIMIT','UPSTREAM_UNAVAILABLE','INVALID_DRAW_JSON','PDF_PENDING') then raise exception 'INVALID_REASON';end if;
 update lottery_private.draw_cache set payload=coalesce(p_payload,payload),pdf_url=coalesce(p_pdf,pdf_url),
 lease=null,lease_until=null,next_attempt=clock_timestamp()+make_interval(secs=>greatest(30,least(coalesce(p_wait,30),2678400))),reason=p_reason
 where draw_date=p_date and slot=p_slot and lease=p_lease and lease_until>clock_timestamp();
 get diagnostics updated=row_count;
 if updated=1 then
  update lottery_private.provider_gate set active_claim=null,active_until=null,next_request=greatest(next_request,clock_timestamp()+interval '2100 milliseconds') where singleton and active_claim=p_lease;
 end if;
 if updated=1 and p_reason in ('PROVIDER_LIMIT','PROVIDER_AUTH') then
  update lottery_private.provider_gate set next_request=greatest(next_request,clock_timestamp()+make_interval(secs=>greatest(30,least(coalesce(p_wait,300),2678400)))) where singleton;
 end if;
 return updated=1;
end $$;
create function public.lottery_draw_candidates() returns jsonb language sql security invoker set search_path='' as $$
 with clock as(select clock_timestamp() at time zone 'Asia/Kolkata' as n), candidates as(
 select d::date as draw_date,s.slot,s.hour,c.n,cache.payload,cache.pdf_url,cache.attempted_at,cache.next_attempt,cache.lease_until
 from clock c cross join generate_series(c.n::date-29,c.n::date,interval '1 day') d
 cross join(values('1pm',13),('6pm',18),('8pm',20))s(slot,hour)
 left join lottery_private.draw_cache cache on cache.draw_date=d::date and cache.slot=s.slot
 where d::date+make_time(s.hour,10,0)<=c.n
 ) select coalesce(jsonb_agg(jsonb_build_object('date',draw_date,'slot',slot)),'[]'::jsonb) from(
 select * from candidates where (payload is null or pdf_url is null) and coalesce(next_attempt,'-infinity')<=clock_timestamp() and coalesce(lease_until,'-infinity')<=clock_timestamp()
 order by (draw_date=n::date and n<draw_date+make_time(hour,31,0)) desc,attempted_at nulls first,draw_date desc,hour desc limit 1
 ) queue;
$$;
create function public.lottery_worker_authorized(p_token text) returns boolean language plpgsql security invoker set search_path='' as $$
declare ok boolean;
begin
 update lottery_private.provider_gate set worker_until=clock_timestamp()+interval '25 seconds'
 where singleton and length(p_token) between 32 and 128 and worker_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and coalesce(worker_until,'-infinity')<=clock_timestamp()
 returning true into ok;
 return coalesce(ok,false);
end $$;
revoke all on function public.lottery_draw_claim(date,text,boolean),public.lottery_draw_finish(date,text,uuid,jsonb,text,text,integer),public.lottery_draw_candidates(),public.lottery_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.lottery_draw_claim(date,text,boolean),public.lottery_draw_finish(date,text,uuid,jsonb,text,text,integer),public.lottery_draw_candidates(),public.lottery_worker_authorized(text) to service_role;
commit;
