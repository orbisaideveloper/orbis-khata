-- Disposable compatibility candidate: replace guarded fragments of the
-- actual RPC definitions. Production migration history stays untouched.
do $fixture$
declare
  fn text;
  definition text;
  anchor text;
  stock text := $stock$perform pg_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0));$stock$;
  recheck text := 'perform orbis_khata.inventory_access(cid,true);';
  active_owner text := $check$if not exists(select 1 from public.khata_companies where id=cid and owner_id=auth.uid() and deleted_at is null) then raise exception 'COMPANY_NOT_ACCESSIBLE';end if;$check$;
  replacement text;
begin
  for fn, anchor, replacement in
    select * from (values
      ('public.khata_expense_profiles_v1(jsonb)',
        'perform 1 from public.khata_companies where id=cid for update;',
        stock || ' ' || active_owner || ' perform 1 from public.khata_companies where id=cid for update;'),
      ('public.khata_expense_post_v1(jsonb)',
        $expense$perform pg_advisory_xact_lock(hashtextextended('expense-company:'||cid::text,0));$expense$,
        stock || ' ' || recheck || $expense$ perform pg_advisory_xact_lock(hashtextextended('expense-company:'||cid::text,0));$expense$),
      ('public.khata_expense_post_v2(jsonb)',
        $expense$perform pg_advisory_xact_lock(hashtextextended('expense-company:'||cid::text,0));$expense$,
        stock || ' ' || recheck || $expense$ perform pg_advisory_xact_lock(hashtextextended('expense-company:'||cid::text,0));$expense$),
      ('orbis_khata.inventory_write(jsonb)', stock, stock || ' ' || recheck),
      ('orbis_khata.ensure_warehouse(uuid)', stock, stock || ' ' || recheck),
      ('orbis_khata.inventory_reverse()',
        $reverse$perform pg_advisory_xact_lock(hashtextextended('stock-company:'||new.company_id::text,0));$reverse$,
        $reverse$perform pg_advisory_xact_lock(hashtextextended('stock-company:'||new.company_id::text,0));
        perform orbis_khata.inventory_access(new.company_id,true);$reverse$),
      ('public.khata_master_save_v2(text,jsonb)',
        $master$perform pg_advisory_xact_lock(hashtextextended('master:'||cid::text,0));$master$,
        $master$perform pg_advisory_xact_lock(hashtextextended('master:'||cid::text,0)); $master$ || recheck),
      ('public.khata_master_delete_v2(text,uuid,uuid)',
        $master$perform pg_advisory_xact_lock(hashtextextended('master:'||cid::text,0));$master$,
        $master$perform pg_advisory_xact_lock(hashtextextended('master:'||cid::text,0)); $master$ || recheck)
    ) as changes(fn, anchor, replacement)
  loop
    definition := pg_get_functiondef(fn::regprocedure);
    if (length(definition)-length(replace(definition,anchor,''))) <> length(anchor) then
      raise exception 'SYNC_LOCK_FIXTURE_SOURCE_CHANGED: %', fn;
    end if;
    execute replace(definition,anchor,replacement);
  end loop;
end
$fixture$;
