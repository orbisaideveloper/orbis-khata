-- Disposable allowlist shared by scope provisioning. Entity writers and
-- clients cannot register kinds. The existing receipt/feed schema is reused.
create table sync_v2.module_scope_kind (
  kind text primary key check (kind ~ '^[a-z][a-z0-9-]{0,63}$')
);
insert into sync_v2.module_scope_kind(kind) values ('company'),('lottery-organization'),('account-catalog');
revoke all on sync_v2.module_scope_kind from public,anon,authenticated,service_role;
alter table sync_v2.scope drop constraint scope_kind_check;
alter table sync_v2.scope add foreign key(kind) references sync_v2.module_scope_kind(kind);
