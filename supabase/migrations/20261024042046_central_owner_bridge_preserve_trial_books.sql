-- REVIEW CANDIDATE ONLY. Target: gqyaxsczlmvppxuoqbox.
-- Retains every company owner_id and historical voucher actor_id unchanged.
begin;
set local lock_timeout = '5s';
lock table public.khata_companies, public.khata_parties, public.khata_vouchers in access exclusive mode;
create temporary table khata_bridge_snapshot on commit drop as
select 'companies' as entity, md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'[]')) as fingerprint from public.khata_companies c
union all select 'parties',md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'[]')) from public.khata_parties p
union all select 'vouchers',md5(coalesce(jsonb_agg(to_jsonb(v) order by v.id)::text,'[]')) from public.khata_vouchers v;

create schema orbis_khata;
revoke all on schema orbis_khata from public,anon,authenticated,service_role;
create table orbis_khata.ledger_owners (
  id uuid primary key,
  legacy boolean not null,
  created_at timestamptz not null default now()
);
create table orbis_khata.principals (
  orbis_identity_id uuid primary key check(substring(orbis_identity_id::text,15,1)='7'),
  ledger_owner_id uuid not null unique references orbis_khata.ledger_owners(id) on delete restrict,
  approval_reference text not null check(length(btrim(approval_reference))>0),
  created_at timestamptz not null default now()
);
alter table orbis_khata.ledger_owners enable row level security;
alter table orbis_khata.ledger_owners force row level security;
alter table orbis_khata.principals enable row level security;
alter table orbis_khata.principals force row level security;
revoke all on all tables in schema orbis_khata from public,anon,authenticated,service_role;

insert into orbis_khata.ledger_owners(id,legacy)
select owner_id,true from public.khata_companies
union select actor_id,true from public.khata_vouchers;

do $$declare c record; n integer:=0; begin
  for c in select conname,conrelid::regclass as relation from pg_constraint
  where contype='f' and confrelid='auth.users'::regclass and
  ((conrelid='public.khata_companies'::regclass and conkey=array[(select attnum from pg_attribute where attrelid='public.khata_companies'::regclass and attname='owner_id')]::smallint[])
   or (conrelid='public.khata_vouchers'::regclass and conkey=array[(select attnum from pg_attribute where attrelid='public.khata_vouchers'::regclass and attname='actor_id')]::smallint[]))
  loop execute format('alter table %s drop constraint %I',c.relation,c.conname); n:=n+1; end loop;
  if n<>2 then raise exception 'KHATA_OWNER_SCHEMA_DRIFT'; end if;
end $$;
alter table public.khata_companies add constraint khata_company_ledger_owner_fk foreign key(owner_id) references orbis_khata.ledger_owners(id) on delete restrict;
alter table public.khata_vouchers add constraint khata_actor_ledger_owner_fk foreign key(actor_id) references orbis_khata.ledger_owners(id) on delete restrict;

-- Only the privileged product server resolves a verified central identity.
-- Unreviewed legacy ownership blocks provisioning rather than opening empty books.
create function orbis_khata.resolve_ledger_owner(p_identity uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
  if p_identity is null or substring(p_identity::text,15,1)<>'7' then
    raise exception 'KHATA_CENTRAL_ID_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('khata-owner:'||p_identity::text,0));
  select ledger_owner_id into result from orbis_khata.principals where orbis_identity_id=p_identity;
  if result is not null then return result; end if;
  if exists(select 1 from orbis_khata.ledger_owners o where o.legacy and not exists
    (select 1 from orbis_khata.principals p where p.ledger_owner_id=o.id)) then
    raise exception 'KHATA_LEGACY_BINDING_REQUIRED';
  end if;
  insert into orbis_khata.ledger_owners(id,legacy) values(p_identity,false);
  insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference)
    values(p_identity,p_identity,'verified-central-session:new-account');
  return p_identity;
end $$;
revoke all on function orbis_khata.resolve_ledger_owner(uuid) from public,anon,authenticated,service_role;

-- A legacy product JWT must not bypass central-session verification.
-- The product server sets this transaction-local marker only after remote verification.
-- It is not a JWT claim, user_metadata field or HTTP header.
create policy khata_central_gateway_only on public.khata_companies as restrictive
  for all to authenticated
  using (current_setting('orbis.khata.gateway_verified',true)='v1')
  with check (current_setting('orbis.khata.gateway_verified',true)='v1');
create policy khata_central_gateway_only on public.khata_parties as restrictive
  for all to authenticated
  using (current_setting('orbis.khata.gateway_verified',true)='v1')
  with check (current_setting('orbis.khata.gateway_verified',true)='v1');
create policy khata_central_gateway_only on public.khata_vouchers as restrictive
  for all to authenticated
  using (current_setting('orbis.khata.gateway_verified',true)='v1')
  with check (current_setting('orbis.khata.gateway_verified',true)='v1');
create policy khata_central_gateway_only on public.khata_write_controls as restrictive
  for all to authenticated
  using (current_setting('orbis.khata.gateway_verified',true)='v1')
  with check (current_setting('orbis.khata.gateway_verified',true)='v1');

do $$begin
  if exists(select 1 from (
    select 'companies' as entity,md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'[]')) as fingerprint from public.khata_companies c
    union all select 'parties',md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'[]')) from public.khata_parties p
    union all select 'vouchers',md5(coalesce(jsonb_agg(to_jsonb(v) order by v.id)::text,'[]')) from public.khata_vouchers v
  ) current_state join khata_bridge_snapshot before_state using(entity)
  where current_state.fingerprint<>before_state.fingerprint) then
    raise exception 'KHATA_FINANCIAL_DATA_CHANGED';
  end if;
end $$;
commit;
