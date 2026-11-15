begin;
create table orbis_khata.drive_account_recovery (
  identity_id uuid primary key,
  sealed_record text not null check (length(sealed_record) between 40 and 1024)
);
alter table orbis_khata.drive_account_recovery enable row level security;
alter table orbis_khata.drive_account_recovery force row level security;
revoke all on orbis_khata.drive_account_recovery from public, anon, authenticated, service_role;
create policy drive_account_recovery_gateway_read
  on orbis_khata.drive_account_recovery for select to postgres using (true);
create policy drive_account_recovery_gateway_insert
  on orbis_khata.drive_account_recovery for insert to postgres with check (true);
grant select, insert on orbis_khata.drive_account_recovery to postgres;
commit;
