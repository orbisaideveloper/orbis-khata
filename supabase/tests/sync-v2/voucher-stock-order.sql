-- Disposable compatibility candidate for direct legacy callers. Keep the
-- existing invoker, ACL, validation, and posting logic.
do $fixture$
declare
  definition text := pg_get_functiondef(
    'public.khata_post_v1(uuid,uuid,uuid,text,date,text,text,text,text,uuid)'::regprocedure);
  anchor text := $anchor$  -- Same ID + exact payload is a retry; a changed payload is a conflict, never an overwrite.$anchor$;
  lock_order text := $order$  perform pg_advisory_xact_lock(hashtextextended('stock-company:'||p_company::text,0));
  if not exists(select 1 from public.khata_companies where id=p_company and owner_id=auth.uid() and deleted_at is null) then
    raise exception 'COMPANY_NOT_ACCESSIBLE';
  end if;
$order$;
begin
  if strpos(definition, anchor) = 0 then raise exception 'SYNC_VOUCHER_FIXTURE_SOURCE_CHANGED'; end if;
  execute replace(definition, anchor, lock_order || anchor);
end
$fixture$;
