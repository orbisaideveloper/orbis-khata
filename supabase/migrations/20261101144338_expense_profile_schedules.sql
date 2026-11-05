-- PREPARED ONLY: apply to the Khata project before the matching gateway/frontend.
begin;
create table public.khata_expense_profile_state (
 company_id uuid primary key references public.khata_companies(id),
 state jsonb not null default '{"categories":[],"profiles":[],"payments":[]}',
 version bigint not null default 0 check(version>=0), updated_at timestamptz not null default now()
);
create table public.khata_expense_profile_operations (
 company_id uuid not null references public.khata_companies(id),id uuid not null,
 request jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(company_id,id)
);
alter table public.khata_expense_profile_state enable row level security;
alter table public.khata_expense_profile_state force row level security;
alter table public.khata_expense_profile_operations enable row level security;
alter table public.khata_expense_profile_operations force row level security;
revoke all on public.khata_expense_profile_state,public.khata_expense_profile_operations from public,anon,authenticated;
grant select on public.khata_expense_profile_state to authenticated;
create policy expense_profile_owner_read on public.khata_expense_profile_state for select to authenticated
 using(current_setting('orbis.khata.gateway_verified',true)='v1' and exists(select 1 from public.khata_companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create function public.khata_expense_profiles_v1(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid:=(p->>'company')::uuid;op uuid:=(p->>'operationId')::uuid;s public.khata_expense_profile_state;r public.khata_expense_profile_operations;
begin
 if auth.uid() is null or current_setting('orbis.khata.gateway_verified',true) is distinct from 'v1' or not exists(select 1 from public.khata_companies where id=cid and owner_id=auth.uid() and deleted_at is null) then raise exception 'COMPANY_NOT_ACCESSIBLE';end if;
 perform 1 from public.khata_companies where id=cid for update;
 if op is not null then
  select * into r from public.khata_expense_profile_operations where company_id=cid and id=op;
  if found then
   if r.request is distinct from p->'request' then raise exception 'IDEMPOTENCY_CONFLICT';end if;
   return jsonb_build_object('replay',true,'state',r.result);
  end if;
 end if;
 if p->>'action'='load' then
  select * into s from public.khata_expense_profile_state where company_id=cid for update;
  return jsonb_build_object('state',coalesce(s.state,'{"categories":[],"profiles":[],"payments":[]}'::jsonb),'version',coalesce(s.version,0));
 end if;
 if p->>'action'<>'commit' or op is null or jsonb_typeof(p->'state')<>'object' or jsonb_typeof(p->'state'->'categories')<>'array' or jsonb_typeof(p->'state'->'profiles')<>'array' or jsonb_typeof(p->'state'->'payments')<>'array' then raise exception 'INVALID_EXPENSE_PROFILE_STATE';end if;
 if not coalesce((select enabled from public.khata_write_controls where singleton),false) then raise exception 'WRITES_DISABLED';end if;
 insert into public.khata_expense_profile_state(company_id) values(cid) on conflict do nothing;
 select * into s from public.khata_expense_profile_state where company_id=cid for update;
 if not found or s.version is distinct from (p->>'version')::bigint then raise exception 'EXPENSE_PROFILE_VERSION_CONFLICT';end if;
 update public.khata_expense_profile_state set state=p->'state',version=version+1,updated_at=now() where company_id=cid;
 insert into public.khata_expense_profile_operations(company_id,id,request,result) values(cid,op,p->'request',p->'state');
 return jsonb_build_object('state',p->'state');
end $$;
revoke all on function public.khata_expense_profiles_v1(jsonb) from public,anon;
grant execute on function public.khata_expense_profiles_v1(jsonb) to authenticated;
commit;
