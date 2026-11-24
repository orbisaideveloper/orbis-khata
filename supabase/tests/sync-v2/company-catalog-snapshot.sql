-- Private company catalog projection. Purge manifests retain only actor-bound
-- company ID and epoch, separate from the company's accounting records.
create index fixture_company_catalog_order on public.khata_companies(owner_id,id);
create index fixture_catalog_purged_order on sync_v2.scope(actor_id,(scope_id::uuid))
  where kind='company' and lifecycle='purged';

create function sync_v2.read_company_catalog(
  a uuid,d text,e text,expected_head bigint,after_id uuid,row_limit integer,max_bytes integer
) returns jsonb language plpgsql stable set search_path='' as $$
declare bound_owner uuid; watermark bigint; entries jsonb; last_id uuid; n integer; result jsonb;
begin
  if row_limit is null or row_limit not between 1 and 100 or max_bytes is null or max_bytes not between 512 and 65536
    or (after_id is not null and expected_head is null) then raise exception 'SYNC_CATALOG_CURSOR_OR_LIMIT';end if;
  select owner_id,high_water into bound_owner,watermark
  from sync_v2.authorize_module_read(a,d,'account-catalog',a::text,e);
  if not found then raise exception 'SYNC_CATALOG_DENIED';end if;
  if expected_head is not null and expected_head<>watermark then raise exception 'SYNC_CATALOG_STALE';end if;
  if after_id is not null and not exists (
    select 1 from public.khata_companies c where c.id=after_id and c.owner_id=bound_owner
    union all
    select 1 from sync_v2.scope s where s.actor_id=a::text and s.kind='company'
      and s.scope_id=after_id::text and s.lifecycle='purged'
  ) then raise exception 'SYNC_CATALOG_CURSOR_OR_LIMIT';end if;
  with candidates as (
    (select c.id,c.name,case when c.deleted_at is null then 'active' else 'retired' end as status,s.epoch as company_epoch
    from public.khata_companies c left join sync_v2.scope s on s.actor_id=a::text
      and s.kind='company' and s.scope_id=c.id::text
    where c.owner_id=bound_owner and (after_id is null or c.id>after_id)
    order by c.id limit row_limit+1)
    union all
    (select s.scope_id::uuid,null,'purged',s.epoch from sync_v2.scope s
    where s.actor_id=a::text and s.kind='company' and s.lifecycle='purged'
      and (after_id is null or s.scope_id::uuid>after_id)
    order by s.scope_id::uuid limit row_limit+1)
  ), first_window as (
    select * from candidates order by id limit row_limit+1
  ), selected as (
    select * from first_window order by id limit row_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object('companyId',id,'name',name,'status',status,'companyEpoch',company_epoch)
      order by id),'[]'::jsonb),coalesce((array_agg(id order by id desc))[1],after_id),
    (select count(*) from first_window) into entries,last_id,n from selected;
  result:=jsonb_build_object('projection','company-catalog-v1','epoch',e,'highWater',watermark::text,'after',after_id,
    'next',last_id,'done',n<=row_limit,'rows',entries);
  if octet_length(result::text)>max_bytes then raise exception 'SYNC_CATALOG_PAGE_TOO_LARGE';end if;
  return result;
end $$;
revoke all on function sync_v2.read_company_catalog(uuid,text,text,bigint,uuid,integer,integer)
from public,anon,authenticated,service_role;
