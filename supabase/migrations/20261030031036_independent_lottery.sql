-- Independent product-local lottery aggregate; no Foundation tables or imports.
create table public.khata_lottery_state(owner_id uuid primary key,version bigint not null default 0,state jsonb not null default '{}'::jsonb,updated_at timestamptz not null default now(),check(jsonb_typeof(state)='object'));
create table public.khata_lottery_operations(owner_id uuid not null,operation_id uuid not null,request jsonb not null,result jsonb,created_at timestamptz not null default now(),primary key(owner_id,operation_id));
alter table public.khata_lottery_state enable row level security;
alter table public.khata_lottery_operations enable row level security;
revoke all on public.khata_lottery_state,public.khata_lottery_operations from public,anon,authenticated;
create function public.khata_lottery_store_v1(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare owner uuid:=auth.uid();row public.khata_lottery_state;prior public.khata_lottery_operations;op uuid:=(p->>'operationId')::uuid;
begin
 if owner is null or current_setting('orbis.khata.gateway_verified',true) is distinct from 'v1' then raise exception 'LOTTERY_ACCESS_DENIED';end if;
 perform pg_advisory_xact_lock(hashtextextended('lottery-owner:'||owner::text,0));
 if p->>'action'='load' then
  if op is not null then
   select * into prior from public.khata_lottery_operations where owner_id=owner and operation_id=op;
   if found then
    if prior.request<>p->'request' then raise exception 'IDEMPOTENCY_CONFLICT';end if;
    return jsonb_build_object('replay',true,'result',prior.result);
   end if;
  end if;
  insert into public.khata_lottery_state(owner_id) values(owner) on conflict do nothing;
  select * into row from public.khata_lottery_state where owner_id=owner for update;
  return jsonb_build_object('state',row.state,'version',row.version);
 end if;
 if p->>'action'<>'commit' or jsonb_typeof(p->'state')<>'object' or octet_length((p->'state')::text)>1500000 then raise exception 'INVALID_LOTTERY_STATE';end if;
 select * into row from public.khata_lottery_state where owner_id=owner for update;
 if row.version is distinct from (p->>'version')::bigint then raise exception 'LOTTERY_VERSION_CONFLICT';end if;
 if row.state is distinct from p->'state' and not coalesce((select enabled from public.khata_write_controls where singleton),false) then raise exception 'WRITES_DISABLED';end if;
 update public.khata_lottery_state set state=p->'state',version=version+1,updated_at=now() where owner_id=owner;
 if op is not null then insert into public.khata_lottery_operations(owner_id,operation_id,request,result) values(owner,op,p->'request',p->'result');end if;
 return p->'result';
end $fn$;
revoke all on function public.khata_lottery_store_v1(jsonb) from public,anon;
grant execute on function public.khata_lottery_store_v1(jsonb) to authenticated;
