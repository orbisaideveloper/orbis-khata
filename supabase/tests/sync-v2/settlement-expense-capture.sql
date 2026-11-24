-- Private acceptance fixture. Capture canonical domain rows after they are
-- written and group them by the existing PostgreSQL transaction boundary.
-- Voucher emission stays owned by voucher-capture.sql.
create function sync_v2.capture_company_financial_row() returns trigger
language plpgsql security definer set search_path='' as $$
declare registered sync_v2.scope; projection jsonb;
begin
  if tg_op='DELETE' then
    projection := jsonb_build_object('id',old.id,'company_id',old.company_id,'deleted',true);
  else
    projection := to_jsonb(new);
  end if;
  update sync_v2.scope s set head=s.head+1
  from public.khata_companies c
    join orbis_khata.principals p on p.ledger_owner_id=c.owner_id
  where c.id=(projection->>'company_id')::uuid and c.deleted_at is null and s.actor_id=p.orbis_identity_id::text
    and s.kind='company' and s.scope_id=c.id::text and s.lifecycle='active'
  returning s.* into registered;
  if not found then return new; end if;
  -- Text preserves decimal and bigint precision across JS transports.
  insert into sync_v2.event(actor_id,kind,scope_id,epoch,seq,operation_id,change)
  values(registered.actor_id,registered.kind,registered.scope_id,registered.epoch,registered.head,null,
    jsonb_build_array(jsonb_build_object('entityType',TG_ARGV[0],'projectionJson',projection::text)));
  return new;
end $$;
revoke all on function sync_v2.capture_company_financial_row() from public,anon,authenticated,service_role;

create trigger sync_financial_invoice after insert on public.khata_invoice_saves
for each row execute function sync_v2.capture_company_financial_row('invoice');
create trigger sync_financial_payment_link after insert on public.khata_payment_links
for each row execute function sync_v2.capture_company_financial_row('payment-link');
create trigger sync_financial_expense after insert on public.khata_expense_events
for each row execute function sync_v2.capture_company_financial_row('expense');
create trigger sync_financial_expense_lines after insert on public.khata_expense_bill_lines
for each row execute function sync_v2.capture_company_financial_row('expense-lines');
create trigger sync_financial_opening_payment after insert on public.khata_opening_expense_payments
for each row execute function sync_v2.capture_company_financial_row('opening-expense-payment');
create trigger sync_financial_profile_operation after insert on public.khata_expense_profile_operations
for each row execute function sync_v2.capture_company_financial_row('expense-profile-operation');
create trigger sync_financial_inventory after insert on public.khata_inventory_documents
for each row execute function sync_v2.capture_company_financial_row('inventory-document');
create trigger sync_financial_stock after insert on public.khata_stock_movements
for each row execute function sync_v2.capture_company_financial_row('stock-movement');
create trigger sync_financial_fiscal_number after insert on public.khata_fiscal_numbers
for each row execute function sync_v2.capture_company_financial_row('fiscal-number');
create trigger sync_financial_fiscal_counter after insert or update on public.khata_fiscal_counters
for each row execute function sync_v2.capture_company_financial_row('fiscal-counter');
