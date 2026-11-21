begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
-- Vault is provisioned by Supabase. Never print or export the dedicated worker token.
alter table lottery_private.provider_gate add column collector_url text;
create function lottery_private.tick() returns void language plpgsql security invoker set search_path='' as $$
declare local_now timestamp:=clock_timestamp() at time zone 'Asia/Kolkata'; endpoint text; token text;
begin
 -- :10 through :30 for each draw; a bounded catch-up every 15 minutes otherwise.
 if not ((extract(hour from local_now) in (13,18,20) and extract(minute from local_now) between 10 and 30)
 or mod(extract(minute from local_now)::integer,15)=5) then return;end if;
 select collector_url into endpoint from lottery_private.provider_gate where singleton;
 if endpoint is null then return;end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='orbis_lottery_worker' limit 1;
 if token is null then return;end if;
 perform net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=25000);
end $$;
create function lottery_private.start_scheduler(p_project_url text) returns void language plpgsql security invoker set search_path='' as $$
declare token text;
begin
 if p_project_url is null or p_project_url !~ '^https://[a-z0-9]+\.supabase\.co$' then raise exception 'INVALID_PROJECT_URL';end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='orbis_lottery_worker' limit 1;
 if token is not null and token !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_EXISTING_WORKER_SECRET';end if;
 if token is null then
  token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  perform vault.create_secret(token,'orbis_lottery_worker','Dedicated result collector authorization; never a service-role credential');
 end if;
 update lottery_private.provider_gate set worker_hash=encode(sha256(convert_to(token,'UTF8')),'hex'),collector_url=p_project_url||'/functions/v1/orbis-lottery-collector' where singleton;
 perform cron.schedule('orbis-lottery-collector','30 seconds','select lottery_private.tick()');
end $$;
revoke all on function lottery_private.tick(),lottery_private.start_scheduler(text) from public,anon,authenticated,service_role;
-- Activation is a separate, owner-approved deployment step AFTER both Edge functions.
-- select lottery_private.start_scheduler('https://PROJECT.supabase.co');
-- Rollback: select cron.unschedule('orbis-lottery-collector'); restore previous ticket Edge.
commit;
