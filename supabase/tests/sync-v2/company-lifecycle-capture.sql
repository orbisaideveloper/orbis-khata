-- Disposable lifecycle capture. Write the company fence and account-catalog
-- projection in the existing company mutation transaction.
create function sync_v2.capture_company_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  entry public.khata_companies;
  principal text;
  status text;
  previous_status text;
  registered sync_v2.scope;
  change jsonb;
begin
  if tg_op='DELETE' then
    entry:=old;
    status:='purged';
  else
    entry:=new;
    status:=case when new.deleted_at is null then 'active' else 'retired' end;
    if tg_op='UPDATE' then
      previous_status:=case when old.deleted_at is null then 'active' else 'retired' end;
      if status=previous_status and old.name is not distinct from new.name then return new; end if;
    end if;
  end if;
  select orbis_identity_id::text into principal from orbis_khata.principals where ledger_owner_id=entry.owner_id;
  if not found then return entry; end if;
  change:=jsonb_build_object('type','company-lifecycle','companyId',entry.id,'status',status);
  if status<>'purged' then change:=change||jsonb_build_object('name',entry.name); end if;
  if tg_op='UPDATE' and status<>previous_status then
    update sync_v2.scope s set lifecycle=status,head=s.head+1
    where actor_id=principal and kind='company' and scope_id=entry.id::text and lifecycle=previous_status
    returning s.* into registered;
    if found then
      insert into sync_v2.event(actor_id,kind,scope_id,epoch,seq,operation_id,change)
      values(registered.actor_id,registered.kind,registered.scope_id,registered.epoch,registered.head,null,change);
    end if;
  end if;
  -- The account catalog uses its canonical principal ID as scope ID.
  update sync_v2.scope s set head=s.head+1
    where actor_id=principal and kind='account-catalog' and scope_id=principal and lifecycle='active'
    returning s.* into registered;
  if found then
    insert into sync_v2.event(actor_id,kind,scope_id,epoch,seq,operation_id,change)
    values(registered.actor_id,registered.kind,registered.scope_id,registered.epoch,registered.head,null,change);
  end if;
  return entry;
end $$;
revoke all on function sync_v2.capture_company_lifecycle() from public,anon,authenticated,service_role;
-- Company purge marker already has a single owner, the test_sync_purge trigger.
create trigger zz_sync_company_catalog after insert or update of deleted_at,name or delete on public.khata_companies
for each row execute function sync_v2.capture_company_lifecycle();
