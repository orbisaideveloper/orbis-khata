-- REVIEWED CANDIDATE, NOT APPLIED.
-- Target only: gqyaxsczlmvppxuoqbox (orbis-khata).
-- One owner / one company initial scope. No financial records or shared Orbis IDs.
-- Stop if this table already exists; do not silently replace an unknown schema.
begin;

create table public.khata_companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

alter table public.khata_companies enable row level security;
alter table public.khata_companies force row level security;
revoke all on public.khata_companies from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.khata_companies to authenticated;
grant insert (owner_id, name) on public.khata_companies to authenticated;

create policy khata_owner_read on public.khata_companies
  for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy khata_owner_create on public.khata_companies
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

comment on table public.khata_companies is
  'Khata-local company boundary. Contact metadata is not verified identity or authorization.';
commit;
