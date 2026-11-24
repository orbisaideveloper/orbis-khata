-- Review-only candidate. The server issues identities but grants no right to
-- create a cloud company, change a fence or post to a financial ledger.
create table sync_v2.recovery_evidence (
  ticket uuid primary key,
  actor uuid not null,
  source_company uuid not null,
  archive_digest text not null check (archive_digest ~ '^[a-f0-9]{64}$'),
  manifest_digest text not null check (manifest_digest ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  revoked boolean not null default false,
  unique(actor,source_company,archive_digest)
);
create table sync_v2.recovery_plan (
  ticket uuid primary key references sync_v2.recovery_evidence(ticket),
  recovery_company uuid not null unique default gen_random_uuid(),
  manifest jsonb not null,
  prepared_at timestamptz not null default now()
);
create table sync_v2.recovery_entity (
  ticket uuid not null references sync_v2.recovery_plan(ticket),
  original_id uuid not null,
  entity_kind text not null check (entity_kind ~ '^[a-z][a-z-]{0,31}$'),
  recovery_id uuid not null unique default gen_random_uuid(),
  parent_original_id uuid,
  primary key(ticket,original_id),
  foreign key(ticket,parent_original_id) references sync_v2.recovery_entity(ticket,original_id) deferrable
);
revoke all on sync_v2.recovery_evidence,sync_v2.recovery_plan,sync_v2.recovery_entity
from public,anon,authenticated,service_role;

create function sync_v2.prepare_recovery_plan(a uuid,t uuid,requested_manifest jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare verified sync_v2.recovery_evidence; existing sync_v2.recovery_plan; root_count integer;
begin
  select * into verified from sync_v2.recovery_evidence
    where ticket=t and actor=a and not revoked and expires_at>statement_timestamp() for update;
  if not found or not exists(select 1 from orbis_khata.principals where orbis_identity_id=a) then
    raise exception 'SYNC_RECOVERY_REVIEW_DENIED';
  end if;
  if jsonb_typeof(requested_manifest) is distinct from 'array' then raise exception 'SYNC_RECOVERY_MANIFEST_INVALID'; end if;
  if jsonb_array_length(requested_manifest) not between 1 and 1000 or octet_length(requested_manifest::text)>262144
    or exists(select 1 from jsonb_array_elements(requested_manifest) j
       where jsonb_typeof(j) is distinct from 'object'
         or not (j ?& array['id','kind','parent'])
         or j - 'id' - 'kind' - 'parent' <> '{}'::jsonb
         or jsonb_typeof(j->'id') is distinct from 'string'
         or jsonb_typeof(j->'kind') is distinct from 'string'
         or jsonb_typeof(j->'parent') not in ('string','null')) then
    raise exception 'SYNC_RECOVERY_MANIFEST_INVALID';
  end if;
  select * into existing from sync_v2.recovery_plan where ticket=t;
  if found then
    if existing.manifest is distinct from requested_manifest then raise exception 'SYNC_RECOVERY_MANIFEST_CHANGED'; end if;
  else
    if verified.manifest_digest<>encode(sha256(convert_to(requested_manifest::text,'UTF8')),'hex') then
      raise exception 'SYNC_RECOVERY_MANIFEST_NOT_REVIEWED';
    end if;
    insert into sync_v2.recovery_plan(ticket,manifest) values(t,requested_manifest) returning * into existing;
    insert into sync_v2.recovery_entity(ticket,original_id,entity_kind,parent_original_id)
      select t,(j->>'id')::uuid,j->>'kind',(j->>'parent')::uuid from jsonb_array_elements(requested_manifest) j;
    -- Every entity must be reachable from a root; an otherwise valid FK can
    -- still hide an isolated cycle. Each record has at most one parent.
    with recursive tree(id) as (
      select original_id from sync_v2.recovery_entity where ticket=t and parent_original_id is null
      union all select child.original_id from sync_v2.recovery_entity child
        join tree on child.parent_original_id=tree.id where child.ticket=t
    )
    select count(*) into root_count from tree;
    if root_count<>jsonb_array_length(requested_manifest) then raise exception 'SYNC_RECOVERY_PARENT_CYCLE'; end if;
  end if;
  return jsonb_build_object('state','review-only','sourceCompany',verified.source_company,
    'archiveDigest',verified.archive_digest,'recoveryCompany',existing.recovery_company,
    'entities',(select jsonb_agg(jsonb_build_object('original',m.original_id,'fresh',m.recovery_id,
      'kind',m.entity_kind,'freshParent',p.recovery_id) order by m.original_id)
      from sync_v2.recovery_entity m left join sync_v2.recovery_entity p
        on p.ticket=m.ticket and p.original_id=m.parent_original_id where m.ticket=t));
end $$;
revoke all on function sync_v2.prepare_recovery_plan(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
