-- Private voucher-only fixture. A complete owner snapshot requires all writer
-- projections, a trusted device registry and a reviewed retention policy.
create index fixture_snapshot_voucher_keyset on public.khata_vouchers(company_id,id);

create table sync_v2.voucher_snapshot (
  id uuid primary key,
  actor uuid not null,
  device text not null,
  company uuid not null references public.khata_companies(id) on delete cascade,
  epoch text not null,
  high_water bigint not null,
  projection text not null default 'vouchers-only',
  opened_at timestamptz not null default clock_timestamp(),
  vouchers jsonb not null check (octet_length(vouchers::text)<=2097152),
  unique(actor,device,company)
);
revoke all on sync_v2.voucher_snapshot from public,anon,authenticated;
create index fixture_voucher_snapshot_expiry on sync_v2.voucher_snapshot(opened_at,id);

create function sync_v2.assert_snapshot_authorized(a uuid, d text, c uuid, e text)
returns void language plpgsql stable set search_path='' as $$
begin
  if not exists (
    select 1 from orbis_khata.principals p
    join public.khata_companies company on company.owner_id=p.ledger_owner_id and company.deleted_at is null
    join sync_v2.scope s on s.actor_id=p.orbis_identity_id::text and s.kind='company'
      and s.scope_id=company.id::text and s.lifecycle='active'
    join sync_v2.test_device g on g.actor_id=s.actor_id and not g.revoked
      and (g.expires_at is null or g.expires_at>statement_timestamp())
    where p.orbis_identity_id=a and company.id=c and s.epoch=e and g.registration_id=d
  ) then raise exception 'SYNC_SNAPSHOT_DENIED'; end if;
end $$;

create function sync_v2.open_voucher_snapshot(a uuid,d text,c uuid,e text)
returns jsonb language plpgsql set search_path='' as $$
declare watermark bigint; snapshot uuid:=gen_random_uuid(); rows jsonb; size bigint; row_count bigint;
begin
  perform sync_v2.assert_snapshot_authorized(a,d,c,e);
  perform pg_advisory_xact_lock(hashtextextended('stock-company:'||c::text,0));
  perform 1 from public.khata_companies where id=c and deleted_at is null for key share;
  perform sync_v2.assert_snapshot_authorized(a,d,c,e);
  -- Every supported writer holds the stock lock and allocates its sequence
  -- in the same transaction. Historic immutable vouchers also belong here.
  select head into strict watermark from sync_v2.scope
    where actor_id=a::text and kind='company' and scope_id=c::text and epoch=e and lifecycle='active'
    for update;
  with bounded as (
    select id,to_jsonb(v)::text as projection from public.khata_vouchers v
    where company_id=c order by id limit 4097
  )
  select count(*),coalesce(sum(octet_length(projection)),0),
    coalesce(jsonb_agg(projection order by id),'[]'::jsonb) into row_count,size,rows from bounded;
  if row_count>4096 or size>2097152 or octet_length(rows::text)>2097152 then
    raise exception 'SYNC_SNAPSHOT_TOO_LARGE';
  end if;
  insert into sync_v2.voucher_snapshot(id,actor,device,company,epoch,high_water,vouchers)
    values(snapshot,a,d,c,e,watermark,rows)
    on conflict(actor,device,company) do update set
    id=excluded.id,epoch=excluded.epoch,high_water=excluded.high_water,
    projection=excluded.projection,opened_at=excluded.opened_at,vouchers=excluded.vouchers;
  return jsonb_build_object('snapshot',snapshot,'epoch',e,'highWater',watermark::text,
    'count',row_count,'projection','vouchers-only');
end $$;

create function sync_v2.read_voucher_snapshot(a uuid,d text,c uuid,e text,snapshot uuid,
  expected_watermark bigint, page_offset integer, page_size integer, max_bytes integer)
returns jsonb language plpgsql stable set search_path='' as $$
declare saved sync_v2.voucher_snapshot; output jsonb; finish integer; total integer;
begin
  perform sync_v2.assert_snapshot_authorized(a,d,c,e);
  select * into saved from sync_v2.voucher_snapshot
    where id=snapshot and actor=a and device=d and company=c and epoch=e;
  if not found or saved.high_water is distinct from expected_watermark then
    raise exception 'SYNC_SNAPSHOT_STALE';
  end if;
  if exists (select 1 from sync_v2.scope
    where actor_id=a::text and kind='company' and scope_id=c::text and epoch=e
      and retained_after>saved.high_water) then raise exception 'SYNC_SNAPSHOT_FEED_EXPIRED'; end if;
  total:=jsonb_array_length(saved.vouchers);
  if page_offset is null or page_offset<0 or page_offset>total or page_size is null or page_size not between 1 and 200
    or max_bytes is null or max_bytes not between 512 and 262144 then
    raise exception 'SYNC_SNAPSHOT_CURSOR_OR_LIMIT';
  end if;
  finish:=least(page_offset+page_size,total);
  select coalesce(jsonb_agg(item order by ordinal),'[]'::jsonb) into output
  from jsonb_array_elements(saved.vouchers) with ordinality elements(item,ordinal)
  where ordinal>page_offset and ordinal<=finish;
  output:=jsonb_build_object('snapshot',snapshot,'epoch',e,'highWater',saved.high_water::text,
    'from',page_offset,'next',finish,'done',finish=total,'projection',saved.projection,'rows',output);
  if octet_length(output::text)>max_bytes then raise exception 'SYNC_SNAPSHOT_PAGE_TOO_LARGE'; end if;
  return output;
end $$;

revoke all on function sync_v2.assert_snapshot_authorized(uuid,text,uuid,text),
  sync_v2.open_voucher_snapshot(uuid,text,uuid,text),
  sync_v2.read_voucher_snapshot(uuid,text,uuid,text,uuid,bigint,integer,integer,integer)
  from public,anon,authenticated;


create function sync_v2.close_company_snapshot(a uuid,d text,c uuid,e text,snapshot uuid)
returns boolean language plpgsql set search_path='' as $$
begin
  perform sync_v2.assert_snapshot_authorized(a,d,c,e);
  delete from sync_v2.voucher_snapshot where id=snapshot and actor=a and device=d and company=c and epoch=e;
  return found;
end $$;
revoke all on function sync_v2.close_company_snapshot(uuid,text,uuid,text,uuid) from public,anon,authenticated,service_role;


-- A trusted maintenance caller supplies its approved cutoff; this fixture
-- chooses no retention policy and schedules no production job.
create function sync_v2.dispose_company_snapshots(cutoff timestamptz, batch_limit integer)
returns integer language plpgsql set search_path='' as $$
declare removed integer;
begin
  if cutoff is null or cutoff>statement_timestamp() or batch_limit is null or batch_limit not between 1 and 100 then
    raise exception 'SYNC_SNAPSHOT_DISPOSAL_INVALID';
  end if;
  with expired as (
    select id from sync_v2.voucher_snapshot where opened_at<cutoff
    order by opened_at,id limit batch_limit for update skip locked
  )
  delete from sync_v2.voucher_snapshot image using expired where image.id=expired.id;
  get diagnostics removed=row_count;
  return removed;
end $$;
revoke all on function sync_v2.dispose_company_snapshots(timestamptz,integer)
from public,anon,authenticated,service_role;
