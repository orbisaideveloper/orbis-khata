-- Additive transport only: no accounting table, balance or voucher is changed.
begin;
create table orbis_khata.statement_links (
 id uuid primary key,
 owner_identity uuid not null,
 recipient_display text not null check (recipient_display ~ '^ORB-U-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
 recipient_identity uuid,
 scope jsonb not null check(jsonb_typeof(scope)='object'),
 status text not null default 'pending' check(status in ('pending','accepted','revoked')),
 revision bigint not null default 0 check(revision>=0),
 acknowledged bigint not null default 0 check(acknowledged>=0 and acknowledged<=revision),
 resync boolean not null default true,
 updated_at timestamptz not null default now()
);
create unique index statement_links_scope on orbis_khata.statement_links(owner_identity,recipient_display,(scope->>'module'),(scope->>'company'),(scope->>'party')) where status<>'revoked';
create table orbis_khata.statement_mailbox (
 link_id uuid primary key references orbis_khata.statement_links(id) on delete cascade,
 revision bigint not null,
 base bigint not null,
 patch jsonb not null check (jsonb_typeof(patch)='object' and octet_length(patch::text)<=900000),
 expires_at timestamptz not null default now()+interval '30 days',
 check(revision=base+1)
);
create index statement_links_owner on orbis_khata.statement_links(owner_identity);
create index statement_links_recipient on orbis_khata.statement_links(recipient_display);
alter table orbis_khata.statement_links enable row level security;
alter table orbis_khata.statement_mailbox enable row level security;
revoke all on orbis_khata.statement_links,orbis_khata.statement_mailbox from public,anon,authenticated;

-- Reuse already approved Lottery permissions; copy routing metadata only, no ledgers.
do $bridge$
begin
 if to_regclass('orbis_khata.lottery_party_shares') is not null and to_regclass('public.khata_lottery_records') is not null then
  execute $legacy$
   insert into orbis_khata.statement_links(id,owner_identity,recipient_display,recipient_identity,scope,status)
   select s.id,p.orbis_identity_id,s.recipient_display_id,s.recipient_identity_id,
    jsonb_build_object('module','lottery','company',s.organization_id,'party',s.party_id,'companyName',o.value->>'name','partyName',r.value->>'name'),s.status
   from orbis_khata.lottery_party_shares s join orbis_khata.principals p on p.ledger_owner_id=s.owner_id
   join public.khata_lottery_records o on o.owner_id=s.owner_id and o.model='foundationAccountingOrganization' and o.id=s.organization_id
   join public.khata_lottery_records r on r.owner_id=s.owner_id and r.model='foundationAccountingParty' and r.id=s.party_id and r.value->>'organizationId'=s.organization_id
   where s.status in ('pending','accepted') and o.value->>'status'='ACTIVE'
   on conflict do nothing
  $legacy$;
 end if;
end $bridge$;

create function orbis_khata.statement_relay_v1(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=nullif(current_setting('orbis.khata.identity',true),'')::uuid;
 display_id text:=current_setting('orbis.khata.display_id',true);
 action text:=p->>'action';
 link orbis_khata.statement_links%rowtype;
 result jsonb;
 n bigint;
begin
 if current_setting('orbis.khata.gateway_verified',true) is distinct from 'v1' or actor is null or display_id is null
 or not exists(select 1 from orbis_khata.principals where orbis_identity_id=actor and ledger_owner_id=auth.uid())
 then raise exception 'SHARE_ACCESS_DENIED';end if;
 -- Expired data needs a fresh baseline; never silently pretend it was delivered.
 with expired as (delete from orbis_khata.statement_mailbox where expires_at<=now() returning link_id)
 update orbis_khata.statement_links set resync=true where id in(select link_id from expired);
 if action='list' then
  select coalesce(jsonb_agg(scope||jsonb_build_object('id',id,'recipient',recipient_display,'status',status,'outgoing',owner_identity=actor,'revision',revision,'acknowledged',acknowledged,'resync',resync)),'[]') into result
  from orbis_khata.statement_links where owner_identity=actor or recipient_identity=actor or (recipient_identity is null and recipient_display=display_id);
  return result;
 end if;
 if action='invite' then
  if p->>'recipient'=display_id or p->>'recipient' !~ '^ORB-U-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'
   or p->'scope'->>'module' not in ('khata','lottery')
   or jsonb_typeof(p->'scope')<>'object' then raise exception 'SHARE_INPUT_INVALID';end if;
  perform pg_advisory_xact_lock(hashtextextended('statement-links:'||actor::text,0));
  select * into link from orbis_khata.statement_links where id=(p->>'id')::uuid;
  if found then
   if link.owner_identity<>actor or link.scope<>p->'scope' or link.recipient_display<>p->>'recipient' then raise exception 'IDEMPOTENCY_CONFLICT';end if;
   return jsonb_build_object('saved',true,'id',link.id);
  end if;
  select * into link from orbis_khata.statement_links where owner_identity=actor and recipient_display=p->>'recipient' and status<>'revoked'
   and scope->>'module'=p->'scope'->>'module' and scope->>'company'=p->'scope'->>'company' and scope->>'party'=p->'scope'->>'party';
  if found then return jsonb_build_object('saved',true,'id',link.id);end if;
  if (select count(*) from orbis_khata.statement_links where owner_identity=actor)>=100 or (select count(*) from orbis_khata.statement_links where recipient_display=p->>'recipient')>=100 then raise exception 'SHARE_LINK_LIMIT';end if;
  insert into orbis_khata.statement_links(id,owner_identity,recipient_display,scope) values((p->>'id')::uuid,actor,p->>'recipient',p->'scope');
  return jsonb_build_object('saved',true,'id',p->>'id');
 end if;
 select * into link from orbis_khata.statement_links where id=(p->>'id')::uuid for update;
 if not found or not coalesce((link.owner_identity=actor or link.recipient_identity=actor or (link.recipient_identity is null and link.recipient_display=display_id)),false) then raise exception 'SHARE_NOT_AVAILABLE';end if;
 if action='accept' then
  if link.recipient_display<>display_id or link.owner_identity=actor or link.status='revoked' then raise exception 'SHARE_NOT_AVAILABLE';end if;
  update orbis_khata.statement_links set recipient_identity=actor,status='accepted',updated_at=now() where id=link.id;
 elsif action='revoke' then
  update orbis_khata.statement_links set status='revoked',updated_at=now() where id=link.id;
  delete from orbis_khata.statement_mailbox where link_id=link.id;
 elsif action='publish' then
  if link.owner_identity<>actor or link.status<>'accepted' then raise exception 'SHARE_NOT_AVAILABLE';end if;
  if (p->>'base')::bigint<>link.revision then raise exception 'SHARE_VERSION_CONFLICT';end if;
  if link.revision<>link.acknowledged and not link.resync then raise exception 'SHARE_DELIVERY_PENDING';end if;
  if not coalesce((p->'patch'->>'reset')::boolean,false) and link.resync then raise exception 'SHARE_RESYNC_REQUIRED';end if;
  if (p->'patch'->'scope')->>'module'<>link.scope->>'module' or (p->'patch'->'scope')->>'company'<>link.scope->>'company' or (p->'patch'->'scope')->>'party'<>link.scope->>'party' or jsonb_typeof(p->'patch'->'upsert')<>'array' or jsonb_typeof(p->'patch'->'remove')<>'array'
   or jsonb_array_length(p->'patch'->'upsert')>5000 or jsonb_array_length(p->'patch'->'remove')>5000 then raise exception 'SHARE_INPUT_INVALID';end if;
  perform pg_advisory_xact_lock(hashtextextended('statement-payload:'||actor::text,0));
  if (select coalesce(sum(octet_length(m.patch::text)),0) from orbis_khata.statement_mailbox m join orbis_khata.statement_links s on s.id=m.link_id where s.owner_identity=actor and s.id<>link.id)+octet_length((p->'patch')::text)>16000000 then raise exception 'SHARE_STORAGE_LIMIT';end if;
  n:=link.revision+1;
  insert into orbis_khata.statement_mailbox(link_id,revision,base,patch) values(link.id,n,link.revision,p->'patch')
  on conflict(link_id) do update set revision=excluded.revision,base=excluded.base,patch=excluded.patch,expires_at=now()+interval '30 days';
  update orbis_khata.statement_links set revision=n,resync=false,scope=p->'patch'->'scope',updated_at=now() where id=link.id;
  return jsonb_build_object('revision',n);
 else
  if link.recipient_identity is distinct from actor or link.status<>'accepted' then raise exception 'SHARE_NOT_AVAILABLE';end if;
  if action='pull' then
   select jsonb_build_object('revision',revision,'base',base,'patch',patch) into result from orbis_khata.statement_mailbox where link_id=link.id;
   return result;
  elsif action='resync' then
   update orbis_khata.statement_links set resync=true,updated_at=now() where id=link.id;
   delete from orbis_khata.statement_mailbox where link_id=link.id;
  elsif action='ack' then
   n:=(p->>'revision')::bigint;
   if n>link.revision or n<=0 then raise exception 'SHARE_ACK_INVALID';end if;
   -- Late/replayed ACK cannot delete a newer reset or delta.
   if n>link.acknowledged then
    update orbis_khata.statement_links set acknowledged=n,updated_at=now() where id=link.id;
   end if;
   delete from orbis_khata.statement_mailbox where link_id=link.id and revision<=n;
  else raise exception 'SHARE_INPUT_INVALID';end if;
 end if;
 return jsonb_build_object('saved',true);
end $$;
revoke all on function orbis_khata.statement_relay_v1(jsonb) from public,anon,authenticated;
grant execute on function orbis_khata.statement_relay_v1(jsonb) to authenticated;
-- Keep old Lottery permission controls and the new delivery controls in agreement.
create function orbis_khata.statement_permission_bridge_v1() returns trigger
language plpgsql security invoker set search_path='' as $permission$
declare owner_actor uuid; ledger_owner uuid; next_status text;
begin
 if pg_trigger_depth()>1 then return new;end if;
 if tg_table_name='statement_links' then
  if new.scope->>'module'<>'lottery' or to_regclass('orbis_khata.lottery_party_shares') is null then return new;end if;
  select ledger_owner_id into ledger_owner from orbis_khata.principals where orbis_identity_id=new.owner_identity;
  update orbis_khata.lottery_party_shares set status=new.status,recipient_identity_id=coalesce(recipient_identity_id,new.recipient_identity),updated_at=now()
   where owner_id=ledger_owner and organization_id=new.scope->>'company' and party_id=new.scope->>'party'
   and recipient_display_id=new.recipient_display and status in ('pending','accepted') and new.status in ('accepted','revoked');
 else
  select orbis_identity_id into owner_actor from orbis_khata.principals where ledger_owner_id=new.owner_id;
  if owner_actor is null then return new;end if;
  next_status:=case when new.status in ('pending','accepted') then new.status else 'revoked' end;
  insert into orbis_khata.statement_links(id,owner_identity,recipient_display,recipient_identity,scope,status)
   select new.id,owner_actor,new.recipient_display_id,new.recipient_identity_id,
    jsonb_build_object('module','lottery','company',new.organization_id,'party',new.party_id,'companyName',o.value->>'name','partyName',r.value->>'name'),next_status
   from public.khata_lottery_records o join public.khata_lottery_records r on r.owner_id=o.owner_id
   where o.owner_id=new.owner_id and o.model='foundationAccountingOrganization' and o.id=new.organization_id
   and r.model='foundationAccountingParty' and r.id=new.party_id and r.value->>'organizationId'=new.organization_id
   on conflict do nothing;
  update orbis_khata.statement_links set status=next_status,recipient_identity=coalesce(recipient_identity,new.recipient_identity_id),updated_at=now()
   where owner_identity=owner_actor and scope->>'module'='lottery' and scope->>'company'=new.organization_id
   and scope->>'party'=new.party_id and recipient_display=new.recipient_display_id;
  if next_status='revoked' then
   delete from orbis_khata.statement_mailbox where link_id in(select id from orbis_khata.statement_links where owner_identity=owner_actor and scope->>'module'='lottery' and scope->>'company'=new.organization_id and scope->>'party'=new.party_id and recipient_display=new.recipient_display_id);
  end if;
 end if;
 return new;
end $permission$;
revoke all on function orbis_khata.statement_permission_bridge_v1() from public,anon,authenticated;
create trigger statement_permission_to_legacy after insert or update of status on orbis_khata.statement_links for each row execute function orbis_khata.statement_permission_bridge_v1();
do $legacy_trigger$
begin
 if to_regclass('orbis_khata.lottery_party_shares') is not null then
  execute 'create trigger statement_permission_from_legacy after insert or update of status on orbis_khata.lottery_party_shares for each row execute function orbis_khata.statement_permission_bridge_v1()';
 end if;
end $legacy_trigger$;

-- Hourly expiry is independent of customers opening the app. ACK deletion is immediate.
create function orbis_khata.statement_relay_cleanup_v1() returns void
language sql security invoker set search_path='' as $cleanup$
 with expired as (delete from orbis_khata.statement_mailbox where expires_at<=now() returning link_id)
 update orbis_khata.statement_links set resync=true where id in(select link_id from expired);
$cleanup$;
revoke all on function orbis_khata.statement_relay_cleanup_v1() from public,anon,authenticated;
do $schedule$
begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('orbis-statement-relay-cleanup','17 * * * *','select orbis_khata.statement_relay_cleanup_v1()');
 end if;
end $schedule$;
commit;
