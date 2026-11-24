-- Layer only on the settlement row-capture candidate. Do not install the
-- older aggregate production-output candidate in the same fixture.
-- Party INSERT emission belongs to company-direct-write-fence.sql.
create trigger sync_master_party after update or delete on public.khata_parties
for each row execute function sync_v2.capture_company_financial_row('party');
create trigger sync_master_item after insert or update or delete on public.khata_items
for each row execute function sync_v2.capture_company_financial_row('item');
create trigger sync_master_warehouse after insert or update or delete on public.khata_warehouses
for each row execute function sync_v2.capture_company_financial_row('warehouse');
create trigger sync_master_audit after insert on public.khata_master_audit
for each row execute function sync_v2.capture_company_financial_row('master-audit');
create trigger sync_workspace_settings after insert or update on public.khata_workspace_settings
for each row execute function sync_v2.capture_company_financial_row('workspace-settings');
create trigger sync_workspace_operation after insert on public.khata_workspace_events
for each row execute function sync_v2.capture_company_financial_row('workspace-operation');
create trigger sync_workspace_bill_number after insert on public.khata_bill_numbers
for each row execute function sync_v2.capture_company_financial_row('legacy-bill-number');
create trigger sync_production_post after insert on public.khata_production_posts
for each row execute function sync_v2.capture_company_financial_row('production-post');
create trigger sync_production_route after insert on public.khata_production_routes
for each row execute function sync_v2.capture_company_financial_row('production-route');
