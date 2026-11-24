-- Keep the two image paths on the same static relation/key manifest.
create function sync_v2.company_projection_sections(projection_name text)
returns table(relation text,entity text,ordering text)
language sql immutable set search_path='' as $$
    select * from (values
      ('khata_vouchers','voucher','id'),
      ('khata_invoice_saves','invoice','id'),
      ('khata_payment_links','payment-link','id'),
      ('khata_expense_events','expense','id'),
      ('khata_expense_bill_lines','expense-lines','id'),
      ('khata_opening_expense_payments','opening-expense-payment','id'),
      ('khata_expense_profile_state','expense-profile-state','company_id'),
      ('khata_inventory_documents','inventory-document','id'),
      ('khata_stock_movements','stock-movement','document_id,ordinal'),
      ('khata_stock_reversals','stock-reversal','voucher_id,ordinal'),
      ('khata_fiscal_numbers','fiscal-number','kind,fiscal_year,draft_id'),
      ('khata_fiscal_counters','fiscal-counter','kind,fiscal_year')
    ) as sections(relation,entity,ordering)
    union all
    select * from (values
      ('khata_parties','party','id'),
      ('khata_items','item','id'),
      ('khata_warehouses','warehouse','id'),
      ('khata_workspace_settings','workspace-settings','company_id'),
      ('khata_workspace_events','workspace-operation','id'),
      ('khata_bill_numbers','legacy-bill-number','id'),
      ('khata_master_audit','master-audit','id'),
      ('khata_production_posts','production-post','id'),
      ('khata_production_routes','production-route','invoice_id')
    ) as company_sections(relation,entity,ordering)
    where projection_name='company-operational-v1'
$$;
revoke all on function sync_v2.company_projection_sections(text) from public,anon,authenticated,service_role;
