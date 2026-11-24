-- Disposable candidate: a retirement can commit while a standalone
-- production writer waits for stock. Recheck before reading or writing stock.
do $fixture$
declare
  definition text := pg_get_functiondef('orbis_khata.production_post(jsonb)'::regprocedure);
  stock_lock text := $lock$perform pg_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0));$lock$;
begin
  if strpos(definition, stock_lock) = 0 then raise exception 'SYNC_PRODUCTION_FIXTURE_SOURCE_CHANGED'; end if;
  execute replace(definition, stock_lock, stock_lock || E'\n perform orbis_khata.inventory_access(cid,true);');
end
$fixture$;
