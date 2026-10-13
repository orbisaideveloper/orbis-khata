-- Product gqyaxsczlmvppxuoqbox only. REVIEW SOURCE, not applied.
-- Stop if any company, party or voucher exists. No data is deleted or migrated.
begin;
lock table public.khata_companies,public.khata_parties,public.khata_vouchers in access exclusive mode;
do $$begin
 if exists(select 1 from public.khata_companies) or exists(select 1 from public.khata_parties) or exists(select 1 from public.khata_vouchers) then
  raise exception 'KHATA_NOT_EMPTY_STOP_FOR_REVIEW';
 end if;
end $$;
create schema orbis_khata;
revoke all on schema orbis_khata from public,anon,authenticated;
create table orbis_khata.principals(orbis_identity_id uuid primary key,created_at timestamptz not null default now(),
 check(substring(orbis_identity_id::text,15,1)='7'));
alter table orbis_khata.principals enable row level security;
alter table orbis_khata.principals force row level security;
revoke all on orbis_khata.principals from public,anon,authenticated,service_role;
-- Replace only the two existing ownership foreign keys; preserve all RLS,
-- amounts, vouchers, triggers and report functions.
do $$declare constraint_row record;n integer:=0;begin
 for constraint_row in select conname,conrelid::regclass as relation from pg_constraint
 where contype='f' and confrelid='auth.users'::regclass and
 ((conrelid='public.khata_companies'::regclass and conkey=array[(select attnum from pg_attribute where attrelid='public.khata_companies'::regclass and attname='owner_id')]::smallint[]) or
 (conrelid='public.khata_vouchers'::regclass and conkey=array[(select attnum from pg_attribute where attrelid='public.khata_vouchers'::regclass and attname='actor_id')]::smallint[]))
 loop execute format('alter table %s drop constraint %I',constraint_row.relation,constraint_row.conname);n:=n+1;end loop;
 if n<>2 then raise exception 'KHATA_OWNER_SCHEMA_DRIFT';end if;
end $$;
alter table public.khata_companies add constraint khata_company_central_owner_fk foreign key(owner_id) references orbis_khata.principals(orbis_identity_id) on delete restrict;
alter table public.khata_vouchers add constraint khata_actor_central_owner_fk foreign key(actor_id) references orbis_khata.principals(orbis_identity_id) on delete restrict;
commit;
