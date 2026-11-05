-- Shared quota for verified canonical identities. No financial records are changed.
begin;
create table orbis_khata.gateway_request_windows (
 identity_id uuid primary key,
 minute_start timestamptz not null, minute_used integer not null,
 burst_start timestamptz not null, burst_used integer not null,
 updated_at timestamptz not null
);
alter table orbis_khata.gateway_request_windows enable row level security;
alter table orbis_khata.gateway_request_windows force row level security;
revoke all on orbis_khata.gateway_request_windows from public,anon,authenticated,service_role;
create function orbis_khata.admit_gateway_request(identity_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t timestamptz:=clock_timestamp();m timestamptz;b timestamptz;r orbis_khata.gateway_request_windows;allowed boolean;retry integer:=0;
begin
 if identity_id is null or identity_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'INVALID_CANONICAL_IDENTITY';end if;
 m:=date_trunc('minute',t);b:=to_timestamp(floor(extract(epoch from t)/10)*10);
 insert into orbis_khata.gateway_request_windows as w values(identity_id,m,1,b,1,t)
 on conflict on constraint gateway_request_windows_pkey do update set
 minute_start=m,minute_used=case when w.minute_start=m then least(w.minute_used+1,601) else 1 end,
 burst_start=b,burst_used=case when w.burst_start=b then least(w.burst_used+1,121) else 1 end,updated_at=t
 returning * into r;
 allowed:=r.minute_used<=600 and r.burst_used<=120;
 if r.minute_used>600 then retry:=greatest(retry,ceil(extract(epoch from m+interval '1 minute'-t))::integer);end if;
 if r.burst_used>120 then retry:=greatest(retry,ceil(extract(epoch from b+interval '10 seconds'-t))::integer);end if;
 return jsonb_build_object('allowed',allowed,'retryAfter',retry);
end $$;
revoke all on function orbis_khata.admit_gateway_request(uuid) from public,anon,authenticated,service_role;
commit;
