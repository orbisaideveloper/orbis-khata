-- PROPOSED MAPPING ONLY: explicit owner confirmation is still required.
-- Existing Central identity/display ID are never changed.
-- Do not select identity from mutable email/phone.
begin;
set local lock_timeout = '5s';
lock table orbis_khata.ledger_owners,orbis_khata.principals,
  public.khata_companies,public.khata_vouchers in access exclusive mode;
do $$begin
  if current_setting('orbis.khata.binding_approval',true) is distinct from
    '7d88bc43-4768-4279-ae3d-7626830f3a8e=>01a1454a-2134-7365-8d9a-3ed6b49f0b12' then
    raise exception 'KHATA_EXPLICIT_OWNER_APPROVAL_REQUIRED';
  end if;
  if (select count(*) from public.khata_companies)<>2
    or (select count(*) from public.khata_parties)<>3
    or (select count(*) from public.khata_vouchers)<>4
    or exists(select 1 from public.khata_companies where owner_id<>'7d88bc43-4768-4279-ae3d-7626830f3a8e')
    or exists(select 1 from public.khata_vouchers where actor_id<>'7d88bc43-4768-4279-ae3d-7626830f3a8e') then
    raise exception 'KHATA_OWNERSHIP_EVIDENCE_CHANGED';
  end if;
end $$;
insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference)
values('01a1454a-2134-7365-8d9a-3ed6b49f0b12','7d88bc43-4768-4279-ae3d-7626830f3a8e',
  'owner-confirmed:2026-10-24:ORB-U-365HD9A3');
commit;
