-- Disposable writer probe. A production output is saved after its inventory
-- document and stock movements exist, in the same stock-locked transaction.
create function sync_v2.capture_production_output() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  captured sync_v2.scope;
  inventory jsonb;
  movements jsonb;
begin
  if new.payload->>'kind' is distinct from 'production-output' then return new; end if;
  update sync_v2.scope as s set head = s.head + 1
  from public.khata_companies c
  join orbis_khata.principals p on p.ledger_owner_id = c.owner_id
  where c.id=new.company_id and s.actor_id=p.orbis_identity_id::text
    and s.kind='company' and s.scope_id=c.id::text and s.lifecycle='active'
  returning s.* into captured;
  if not found then return new; end if;

  select to_jsonb(d) into strict inventory from public.khata_inventory_documents d
  where d.id=new.id and d.company_id=new.company_id and d.kind='production-output';
  select jsonb_agg(to_jsonb(m)::text order by m.ordinal) into movements
  from public.khata_stock_movements m where m.document_id=new.id and m.company_id=new.company_id;
  if movements is null then raise exception 'SYNC_PRODUCTION_OUTPUT_MOVEMENT_MISSING'; end if;

  insert into sync_v2.event (actor_id,kind,scope_id,epoch,seq,change)
  values (captured.actor_id,captured.kind,captured.scope_id,captured.epoch,captured.head,
    jsonb_build_array(jsonb_build_object('entityType','production-output','entityId',new.id,
      'productionPost',to_jsonb(new)::text,'inventoryDocument',inventory::text,'stockMovements',movements)));
  return new;
end;
$$;
revoke all on function sync_v2.capture_production_output() from public;
create trigger sync_v2_capture_production_output after insert on public.khata_production_posts
for each row execute function sync_v2.capture_production_output();
