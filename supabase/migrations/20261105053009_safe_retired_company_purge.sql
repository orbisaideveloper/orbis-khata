-- Preserve the existing retention deadline; isolate each eligible company atomically.
begin;
create or replace function orbis_khata.purge_retired_companies() returns integer language plpgsql security definer set search_path='' as $$
declare cid uuid;n integer:=0;
begin
 for cid in select id from public.khata_companies where deleted_at is not null and purge_after<=now() order by purge_after limit 50 for update skip locked loop
  begin
  perform pg_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0));
  perform set_config('orbis.khata.purge_company',cid::text,true);
  delete from public.khata_expense_profile_operations where company_id=cid;
  delete from public.khata_expense_profile_state where company_id=cid;
  delete from public.khata_workspace_events where company_id=cid;
  delete from public.khata_payment_links where company_id=cid;
  delete from public.khata_bill_numbers where company_id=cid;
  delete from public.khata_workspace_settings where company_id=cid;
  delete from public.khata_stock_reversals where company_id=cid;
  delete from public.khata_stock_movements where company_id=cid;
  delete from public.khata_expense_bill_lines where company_id=cid;
  delete from public.khata_opening_expense_payments where company_id=cid;
  delete from public.khata_expense_events where company_id=cid;
  delete from public.khata_vouchers where company_id=cid;
  delete from public.khata_items where company_id=cid;
  delete from public.khata_warehouses where company_id=cid;
  delete from public.khata_inventory_documents where company_id=cid;
  delete from public.khata_parties where company_id=cid;
  delete from public.khata_master_audit where company_id=cid;
  delete from public.khata_companies where id=cid;
  n:=n+1;
  exception when foreign_key_violation then
   raise warning 'KHATA_PURGE_DEPENDENCY_BLOCKED';
  end;
  perform set_config('orbis.khata.purge_company','',true);
 end loop;
 perform set_config('orbis.khata.purge_company','',true);return n;
end $$;
revoke all on function orbis_khata.purge_retired_companies() from public,anon,authenticated;
commit;
