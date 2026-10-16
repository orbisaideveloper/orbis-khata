-- Disposable cluster only. Never execute this fixture against a product database.
do $$begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls;end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
 select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
