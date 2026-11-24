-- Disposable compatibility candidate. Preserve the deployed purge body and
-- grants, replacing only candidate selection and lock acquisition.
do $fixture$
declare
  definition text := pg_get_functiondef('orbis_khata.purge_retired_companies()'::regprocedure);
  old_order text := $old$for cid in select id from public.khata_companies where deleted_at is not null and purge_after<=now() order by purge_after limit 50 for update skip locked loop
  begin
  perform pg_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0));$old$;
  new_order text := $new$for cid in
  select id from public.khata_companies where deleted_at is not null and purge_after<=now()
  order by purge_after,id limit 50 loop
  begin
  if not pg_try_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0)) then continue; end if;
  perform 1 from public.khata_companies where id=cid and deleted_at is not null and purge_after<=now()
  for update skip locked;
  if not found then continue; end if;$new$;
begin
  if strpos(definition, old_order) = 0 then raise exception 'SYNC_PURGE_FIXTURE_SOURCE_CHANGED'; end if;
  execute replace(definition, old_order, new_order);
end
$fixture$;
