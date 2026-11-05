-- Additional guard only; never updates an existing document/movement or costing policy.
create function orbis_khata.guard_warehouse_transfer() returns trigger
language plpgsql security definer set search_path='' as $guard$
declare line record; available numeric;
begin
 if new.kind<>'transfer' then return new; end if;
 -- Same lock as inventory_write and production: serialize stock-changing commands.
 perform pg_advisory_xact_lock(hashtextextended('stock-company:'||new.company_id::text,0));
 for line in
  select (x->>'item')::uuid as item,(x->>'warehouse')::uuid as warehouse,
   sum((x->>'quantity')::numeric) as requested
  from jsonb_array_elements(new.payload->'lines') x group by 1,2
 loop
  select coalesce(sum(quantity),0) into available from public.khata_stock_journal
   where company_id=new.company_id and item_id=line.item and warehouse_id=line.warehouse
    and effective_date<=new.effective_date;
  if available<line.requested then raise exception 'INSUFFICIENT_STOCK'; end if;
 end loop;
 -- Check each affected source's entire later date history using the net movement
 -- of this command. A transfer can never deepen a later negative balance.
 for line in
  select item,warehouse,sum(delta) as change from (
   select (x->>'item')::uuid as item,(x->>'warehouse')::uuid as warehouse,-(x->>'quantity')::numeric as delta
    from jsonb_array_elements(new.payload->'lines') x
   union all
   select (x->>'item')::uuid,(x->>'to')::uuid,(x->>'quantity')::numeric
    from jsonb_array_elements(new.payload->'lines') x
  ) changes group by item,warehouse having sum(delta)<0
 loop
  if exists(select 1 from (
   select effective_date,sum(sum(quantity)) over(order by effective_date rows unbounded preceding) as closing
    from public.khata_stock_journal
    where company_id=new.company_id and item_id=line.item and warehouse_id=line.warehouse
    group by effective_date
  ) history where effective_date>new.effective_date and closing+line.change<0)
  then raise exception 'INSUFFICIENT_STOCK'; end if;
 end loop;
 return new;
end $guard$;
revoke all on function orbis_khata.guard_warehouse_transfer() from public,anon,authenticated;
create trigger khata_warehouse_transfer_guard before insert on public.khata_inventory_documents
 for each row execute function orbis_khata.guard_warehouse_transfer();
