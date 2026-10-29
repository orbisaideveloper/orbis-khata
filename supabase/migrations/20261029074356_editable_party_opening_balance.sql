-- Allow audited opening corrections; preserve identity, tenancy, stock and used-party deletion guards.
create or replace function orbis_khata.master_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare rowdata jsonb;cid uuid;eid uuid;used boolean;begin
 if TG_OP='DELETE' and orbis_khata.purge_allowed(old.company_id) then return old;end if;
 rowdata:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;cid:=(rowdata->>'company_id')::uuid;eid:=(rowdata->>'id')::uuid;
 perform orbis_khata.inventory_access(cid,true);
 if tg_op='UPDATE' and (new.id<>old.id or new.company_id<>old.company_id) then raise exception 'MASTER_ID_IMMUTABLE';end if;
 if tg_table_name='khata_parties' then
  used:=exists(select 1 from public.khata_vouchers where company_id=cid and party_id=eid) or exists(select 1 from public.khata_expense_events where company_id=cid and payee=old.name) or exists(select 1 from public.khata_opening_expense_payments where company_id=cid and party_id=eid);
  if tg_op='DELETE' and (used or old.opening_amount<>0) then raise exception using errcode='23503',message='PARTY_IN_USE';end if;
  if tg_op='UPDATE' and used and ((new.kind,new.opening_account) is distinct from(old.kind,old.opening_account) or old.kind='expense' and new.name<>old.name) then raise exception using errcode='23503',message='OPENING_ALREADY_USED';end if;
 else
  used:=exists(select 1 from public.khata_stock_movements where company_id=cid and item_id=eid);
  if tg_op='DELETE' and used then raise exception using errcode='23503',message='ITEM_IN_USE';end if;
  if tg_op='UPDATE' and used and new.unit<>old.unit then raise exception using errcode='23503',message='UNIT_ALREADY_USED';end if;
 end if;
 insert into public.khata_master_audit(company_id,entity,entity_id,operation,old_row,new_row,actor_id) values(cid,tg_table_name,eid,tg_op,to_jsonb(old),case when tg_op='DELETE' then null else to_jsonb(new) end,auth.uid());
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function orbis_khata.master_guard() from public,anon,authenticated;
