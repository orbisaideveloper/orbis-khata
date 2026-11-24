-- Private preflight for a verified server principal, never a payload actor.
-- This endpoint classifies attachments only and cannot create or restore rows.
create function sync_v2.classify_legacy_company(a uuid,c uuid,e text)
returns text language sql stable set search_path='' as $$
  select case when exists (
    select 1 from orbis_khata.principals p
    join public.khata_companies company on company.id=c and company.owner_id=p.ledger_owner_id
    join sync_v2.company_identity reservation on reservation.id=company.id and not reservation.purged
    join sync_v2.scope s on s.actor_id=p.orbis_identity_id::text and s.kind='company'
      and s.scope_id=company.id::text and s.epoch=e and s.lifecycle='active'
    where p.orbis_identity_id=a and company.deleted_at is null
  ) then 'reconcile-existing' else 'local-review' end
$$;
revoke all on function sync_v2.classify_legacy_company(uuid,uuid,text)
from public,anon,authenticated,service_role;
