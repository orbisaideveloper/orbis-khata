create table sync_v2.routed_invoice_receipt (
  invoice_id uuid primary key,
  actor_id text not null,
  kind text not null check (kind='company'),
  scope_id text not null,
  operation_id text not null,
  foreign key(actor_id,kind,scope_id,operation_id)
    references sync_v2.receipt(actor_id,kind,scope_id,operation_id)
);
revoke all on sync_v2.routed_invoice_receipt from public;

-- Isolated invoice receipt finalizer. Wrapper must hold company + stock locks
-- before calling the existing invoice writer and must commit them together.
create function sync_v2.finish_routed_purchase(a text, s text, e text, op text, d text, invoice uuid)
returns bigint language plpgsql set search_path = '' as $$
declare
  route public.khata_production_routes;
  saved public.khata_invoice_saves;
  bill public.khata_inventory_documents;
  payment uuid;
  projection jsonb;
  sequence bigint;
begin
  select * into strict route from public.khata_production_routes
  where invoice_id = invoice and company_id = s::uuid;
  select * into strict saved from public.khata_invoice_saves where id = invoice and company_id = s::uuid;
  select * into strict bill from public.khata_inventory_documents
  where id = invoice and company_id = s::uuid and kind = 'purchase';
  payment := (route.result->>'payment')::uuid;
  if payment is null or not exists (
    select 1 from public.khata_payment_links where id = payment and bill_id = invoice and company_id = s::uuid
  ) then raise exception 'SYNC_INVOICE_PAYMENT_LINEAGE_MISSING'; end if;

  projection := jsonb_build_object(
    'type', 'routed-purchase',
    'invoiceId', invoice,
    'paymentId', payment,
    'productionInputId', route.input_id,
    'voucherSequences', (
      select jsonb_object_agg(voucher_id, seq::text) from sync_v2.voucher_event
      where actor_id=a and kind='company' and scope_id=s and epoch=e and voucher_id in (invoice, payment)
    ),
    'invoice', to_jsonb(saved)::text,
    'productionRoute', to_jsonb(route)::text,
    'productionPost', (select to_jsonb(x)::text from public.khata_production_posts x
      where x.company_id=s::uuid and x.id=route.input_id),
    'paymentLink', (select to_jsonb(x)::text from public.khata_payment_links x
      where x.company_id=s::uuid and x.id=payment),
    'inventoryDocuments', (select jsonb_agg(to_jsonb(x)::text order by x.id)
      from public.khata_inventory_documents x where x.company_id=s::uuid and x.id in (invoice, route.input_id)),
    'stockMovements', (select jsonb_agg(to_jsonb(x)::text order by x.document_id, x.ordinal)
      from public.khata_stock_movements x where x.company_id=s::uuid and x.document_id in (invoice, route.input_id)),
    'fiscalNumber', (select to_jsonb(x)::text from public.khata_fiscal_numbers x
      where x.company_id=s::uuid and x.kind='purchase' and x.draft_id=invoice
        and x.fiscal_year=orbis_khata.fiscal_year(bill.effective_date)),
    'fiscalCounter', (select to_jsonb(x)::text from public.khata_fiscal_counters x
      where x.company_id=s::uuid and x.kind='purchase'
        and x.fiscal_year=orbis_khata.fiscal_year(bill.effective_date))
  );
  if (select count(*) from jsonb_object_keys(coalesce(projection->'voucherSequences', '{}'::jsonb))) <> 2
     or projection->'productionPost' = 'null'::jsonb
     or jsonb_array_length(projection->'inventoryDocuments') is distinct from 2
     or projection->'stockMovements' = 'null'::jsonb
  then raise exception 'SYNC_INVOICE_PROJECTION_INCOMPLETE'; end if;
  sequence := sync_v2.finish(a, 'company', s, e, op, d,
    route.result || jsonb_build_object('productionInputId',route.input_id), jsonb_build_array(projection));
  insert into sync_v2.routed_invoice_receipt values (invoice,a,'company',s,op);
  return sequence;
end;
$$;
revoke all on function sync_v2.finish_routed_purchase(text,text,text,text,text,uuid) from public;
