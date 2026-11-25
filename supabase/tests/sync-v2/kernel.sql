-- Isolated acceptance kernel. Integration must bind a verified principal and
-- execute authorization, domain posting and finish in the same transaction.
create schema sync_v2;
revoke all on schema sync_v2 from public;

create table sync_v2.scope (
  actor_id text not null,
  kind text not null check (kind in ('company', 'lottery-organization', 'account-catalog')),
  scope_id text not null,
  epoch text not null,
  lifecycle text not null check (lifecycle in ('active', 'retired', 'purged')),
  head bigint not null default 0 check (head >= 0),
  primary key (actor_id, kind, scope_id),
  unique (actor_id, kind, scope_id, epoch)
);

-- Refuse silent success for an enrolled company whose compatible capture
-- writer is missing, retired, or no longer tied to a trusted owner.
-- Unenrolled legacy companies retain their original financial write paths.
create function sync_v2.assert_unenrolled_company(company uuid, deleting boolean default false) returns void
language plpgsql set search_path='' as $$
begin
  if exists (
    select 1 from sync_v2.scope
    where kind='company' and scope_id=company::text
  ) then
    -- The existing trusted retired-company purge deletes descendants before
    -- the final scope tombstone. Match its exact authorization, never trust
    -- an arbitrary client-provided GUC or disable historical retention.
    if deleting and orbis_khata.purge_allowed(company) then return; end if;
    raise exception 'SYNC_COMPANY_CAPTURE_UNAVAILABLE';
  end if;
end $$;
revoke all on function sync_v2.assert_unenrolled_company(uuid,boolean)
  from public,anon,authenticated,service_role;

create table sync_v2.receipt (
  actor_id text not null,
  kind text not null,
  scope_id text not null,
  epoch text not null,
  operation_id text not null,
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  seq bigint not null check (seq > 0),
  result jsonb not null,
  primary key (actor_id, kind, scope_id, operation_id),
  foreign key (actor_id, kind, scope_id, epoch)
    references sync_v2.scope (actor_id, kind, scope_id, epoch)
);

create table sync_v2.event (
  actor_id text not null,
  kind text not null,
  scope_id text not null,
  epoch text not null,
  seq bigint not null check (seq > 0),
  operation_id text,
  change jsonb not null,
  primary key (actor_id, kind, scope_id, epoch, seq),
  foreign key (actor_id, kind, scope_id, epoch)
    references sync_v2.scope (actor_id, kind, scope_id, epoch)
);

revoke all on all tables in schema sync_v2 from public;

-- Caller must hold the scope row lock before invoking domain posting.
create function sync_v2.finish(a text, k text, s text, e text, op text,
  d text, r jsonb, changes jsonb) returns bigint
language plpgsql set search_path = '' as $$
declare next_seq bigint;
begin
  update sync_v2.scope set head = head + 1
  where actor_id = a and kind = k and scope_id = s and epoch = e and lifecycle = 'active'
  returning head into strict next_seq;
  insert into sync_v2.receipt values (a, k, s, e, op, d, next_seq, r);
  insert into sync_v2.event values (a, k, s, e, next_seq, op, changes);
  return next_seq;
end;
$$;
revoke all on function sync_v2.finish(text,text,text,text,text,text,jsonb,jsonb) from public;

-- Invoke in the same transaction as the actual purge, after taking its domain locks.
-- Keep the scope identity and epoch as a fence against restored devices.
create function sync_v2.record_company_purge(a text, s text, e text) returns bigint
language plpgsql set search_path = '' as $$
declare next_seq bigint;
begin
  update sync_v2.scope set lifecycle = 'purged', head = head + 1
  where actor_id = a and kind = 'company' and scope_id = s and epoch = e and lifecycle = 'retired'
  returning head into strict next_seq;
  insert into sync_v2.event values (a, 'company', s, e, next_seq, null, '{"type":"scope-purged"}');
  return next_seq;
end;
$$;
revoke all on function sync_v2.record_company_purge(text,text,text) from public;
