-- Sharing grants read-only access to one existing party, never ownership of its books.
create table orbis_khata.lottery_party_shares (
 id uuid primary key,
 owner_id uuid not null references orbis_khata.ledger_owners(id),
 organization_id text not null,
 party_id text not null,
 recipient_display_id text not null check(recipient_display_id ~ '^ORB-U-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'),
 recipient_identity_id uuid,
 status text not null default 'pending' check(status in ('pending','accepted','declined','revoked')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(status <> 'accepted' or recipient_identity_id is not null)
);
create unique index lottery_party_share_active on orbis_khata.lottery_party_shares(owner_id,organization_id,party_id,recipient_display_id) where status in ('pending','accepted');
create index lottery_party_share_recipient on orbis_khata.lottery_party_shares(recipient_display_id,status);
create table orbis_khata.lottery_share_audit (
 id bigint generated always as identity primary key,
 share_id uuid not null references orbis_khata.lottery_party_shares(id),
 actor_identity_id uuid not null,
 action text not null,
 occurred_at timestamptz not null default now()
);
alter table orbis_khata.lottery_party_shares enable row level security;
alter table orbis_khata.lottery_party_shares force row level security;
alter table orbis_khata.lottery_share_audit enable row level security;
alter table orbis_khata.lottery_share_audit force row level security;
revoke all on orbis_khata.lottery_party_shares,orbis_khata.lottery_share_audit from public,anon,authenticated;
-- Internal gateway only. GUCs are set after live central-session verification.
create function orbis_khata.party_sharing_v1(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid := nullif(current_setting('orbis.khata.identity',true),'')::uuid;
 display_id text := current_setting('orbis.khata.display_id',true);
 owner uuid := auth.uid();
 action text := p->>'action';
 link orbis_khata.lottery_party_shares%rowtype;
 result jsonb; next_status text; source_state jsonb;
begin
 if current_setting('orbis.khata.gateway_verified',true) is distinct from 'v1' or actor is null or owner is null or display_id is null
 or not exists(select 1 from orbis_khata.principals where orbis_identity_id=actor and ledger_owner_id=owner)
 then raise exception 'SHARE_ACCESS_DENIED'; end if;
 if action='choices' then
  select coalesce(jsonb_agg(item),'[]'::jsonb) into result from (
   select jsonb_build_object('organizationId',o.id,'organization',o.value->>'name','partyId',r.id,'party',r.value->>'name','partyType',r.value->>'partyType') item
   from public.khata_lottery_records r join public.khata_lottery_records o on o.owner_id=r.owner_id and o.model='foundationAccountingOrganization' and o.id=r.value->>'organizationId'
   where r.owner_id=owner and r.model='foundationAccountingParty' and o.value->>'status'='ACTIVE' and r.value->>'partyType' in ('SELLER','CUSTOMER','STOCKIST','SERVICE_STOCKIST')
   order by o.value->>'name',r.value->>'name' limit 10001
  ) available;
  if jsonb_array_length(result)>10000 then raise exception 'SHARE_LIST_LIMIT';end if;
  return result;
 end if;
 if action='list' then
  select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb) into result from (
   select s.created_at,jsonb_build_object('id',s.id,'organization',coalesce(o.value->>'name','Unavailable'),'party',coalesce(r.value->>'name','Unavailable'),'partyType',r.value->>'partyType','recipient',s.recipient_display_id,'status',s.status,'outgoing',s.owner_id=owner) item
   from orbis_khata.lottery_party_shares s
   left join public.khata_lottery_records o on o.owner_id=s.owner_id and o.model='foundationAccountingOrganization' and o.id=s.organization_id
   left join public.khata_lottery_records r on r.owner_id=s.owner_id and r.model='foundationAccountingParty' and r.id=s.party_id
   where s.owner_id=owner or s.recipient_identity_id=actor or (s.status='pending' and s.recipient_display_id=display_id)
   limit 1001
  ) visible;
  if jsonb_array_length(result)>1000 then raise exception 'SHARE_LIST_LIMIT';end if;
  return result;
 end if;
 if action='invite' then
  if not coalesce((select enabled from public.khata_write_controls where singleton),false) then raise exception 'WRITES_DISABLED';end if;
  if p->>'recipient'=display_id or p->>'recipient' !~ '^ORB-U-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$' then raise exception 'SHARE_INVALID_RECIPIENT';end if;
  perform pg_advisory_xact_lock(hashtextextended('lottery-owner:'||owner::text,0));
  if not exists(select 1 from public.khata_lottery_records r join public.khata_lottery_records o on o.owner_id=r.owner_id and o.model='foundationAccountingOrganization' and o.id=p->>'organization'
   where r.owner_id=owner and r.model='foundationAccountingParty' and r.id=p->>'party' and r.value->>'organizationId'=o.id and o.value->>'status'='ACTIVE' and r.value->>'partyType' in ('SELLER','CUSTOMER','STOCKIST','SERVICE_STOCKIST')) then raise exception 'SHARE_NOT_AVAILABLE';end if;
  select * into link from orbis_khata.lottery_party_shares where id=(p->>'id')::uuid;
  if found then
   if link.owner_id<>owner or link.organization_id<>p->>'organization' or link.party_id<>p->>'party' or link.recipient_display_id<>p->>'recipient' then raise exception 'IDEMPOTENCY_CONFLICT';end if;
   return jsonb_build_object('saved',true);
  end if;
  insert into orbis_khata.lottery_party_shares(id,owner_id,organization_id,party_id,recipient_display_id) values((p->>'id')::uuid,owner,p->>'organization',p->>'party',p->>'recipient') returning * into link;
  insert into orbis_khata.lottery_share_audit(share_id,actor_identity_id,action) values(link.id,actor,action);
  return jsonb_build_object('saved',true);
 end if;
 select * into link from orbis_khata.lottery_party_shares where id=(p->>'id')::uuid for update;
 if not found then raise exception 'SHARE_NOT_AVAILABLE';end if;
 if action='statement' then
  if link.status<>'accepted' or link.recipient_identity_id is distinct from actor then raise exception 'SHARE_NOT_AVAILABLE';end if;
  perform pg_advisory_xact_lock(hashtextextended('lottery-owner:'||link.owner_id::text,0));
  if not exists(select 1 from public.khata_lottery_records where owner_id=link.owner_id and model='foundationAccountingOrganization' and id=link.organization_id and value->>'status'='ACTIVE') then raise exception 'SHARE_NOT_AVAILABLE';end if;
  select coalesce(jsonb_object_agg(model,rows),'{}'::jsonb) into source_state from (
   select model,jsonb_agg(value order by ordinal) rows from public.khata_lottery_records where owner_id=link.owner_id
   and ((model='foundationAccountingOrganization' and id=link.organization_id) or value->>'organizationId'=link.organization_id) group by model
  ) source;
  -- Private intermediate result: Edge must project one party before sending a response.
  return jsonb_build_object('state',source_state,'organization',link.organization_id,'party',link.party_id);
 end if;
 if action='accept' then
  if link.recipient_display_id<>display_id or link.owner_id=owner or (link.recipient_identity_id is not null and link.recipient_identity_id<>actor) or link.status not in ('pending','accepted') then raise exception 'SHARE_NOT_AVAILABLE';end if;
  next_status:='accepted';
 elsif action='decline' then
  if link.status in ('pending','declined') and link.recipient_display_id=display_id and (link.recipient_identity_id is null or link.recipient_identity_id=actor) then next_status:='declined';
  elsif link.recipient_identity_id=actor and link.status in ('accepted','declined','revoked') then next_status:='revoked';
  else raise exception 'SHARE_NOT_AVAILABLE';end if;
 elsif action='revoke' and link.owner_id=owner then next_status:='revoked';
 else raise exception 'SHARE_NOT_AVAILABLE';end if;
 if link.status<>next_status then
  update orbis_khata.lottery_party_shares set status=next_status,recipient_identity_id=case when action in ('accept','decline') then actor else recipient_identity_id end,updated_at=now() where id=link.id;
  insert into orbis_khata.lottery_share_audit(share_id,actor_identity_id,action) values(link.id,actor,action);
 end if;
 return jsonb_build_object('saved',true);
end $$;
revoke all on function orbis_khata.party_sharing_v1(jsonb) from public,anon,authenticated;
grant usage on schema orbis_khata to authenticated;
grant execute on function orbis_khata.party_sharing_v1(jsonb) to authenticated;
