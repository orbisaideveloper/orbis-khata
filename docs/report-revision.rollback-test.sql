-- Removes derived metadata only. Never deletes source accounting records.
do $rollback$
declare tab text;
begin
 foreach tab in array array['khata_companies','khata_parties','khata_items','khata_warehouses','khata_vouchers','khata_expense_events','khata_inventory_documents','khata_stock_movements','khata_stock_reversals','khata_opening_expense_payments'] loop
  execute format('drop trigger if exists khata_report_revision_watch on public.%I',tab);
 end loop;
end $rollback$;
drop function public.khata_report_revision_v1(uuid);
drop function orbis_khata.touch_report_revision();
drop table public.khata_report_revisions;
drop index public.khata_party_normalized_name_idx;
do $cutoff$
declare definition text;needle text:='exists(select 1 from public.khata_vouchers r where r.reverses_id=v.id and r.effective_date<=p_to) as reversed';
begin
 select pg_get_functiondef('public.khata_report_v1(uuid,date,date,uuid,integer)'::regprocedure) into definition;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'REPORT_CUTOFF_SOURCE_CHANGED';end if;
 execute replace(definition,needle,'exists(select 1 from public.khata_vouchers r where r.reverses_id=v.id) as reversed');
end $cutoff$;
