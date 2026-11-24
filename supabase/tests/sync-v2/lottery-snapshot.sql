-- Revision-fenced pages avoid persisting duplicate accounting snapshots.
-- The whole page and its high-water use one PostgreSQL statement snapshot.
create function sync_v2.read_lottery_snapshot(
 a uuid, d text, organization text, e text, expected_head bigint, after_ordinal bigint,
 row_limit integer, max_bytes integer
) returns jsonb language plpgsql stable set search_path='' as $$
declare bound_owner uuid;watermark bigint;projection jsonb; continuation bigint;
 row_count integer; scanned_bytes bigint; result jsonb;
begin
 if after_ordinal is null or after_ordinal<0 or (after_ordinal>0 and expected_head is null)
   or row_limit is null or row_limit not between 1 and 200
   or max_bytes is null or max_bytes not between 512 and 262144 then
    raise exception 'SYNC_LOTTERY_SNAPSHOT_CURSOR_OR_LIMIT';
 end if;
  select owner_id,high_water into bound_owner,watermark
  from sync_v2.authorize_module_read(a,d,'lottery-organization',organization,e);
 if not found then raise exception 'SYNC_LOTTERY_SNAPSHOT_DENIED';end if;
 if expected_head is not null and expected_head<>watermark then
    raise exception 'SYNC_LOTTERY_SNAPSHOT_STALE';
 end if;
 if after_ordinal>0 and not exists (
   select 1 from public.khata_lottery_records r
   where r.owner_id=bound_owner and sync_v2.lottery_organization(r.model,r.id,r.value)=organization
     and r.ordinal=after_ordinal
 ) then raise exception 'SYNC_LOTTERY_SNAPSHOT_CURSOR_OR_LIMIT'; end if;
 with selected as materialized (
   select r.model,r.id,r.ordinal,r.value::text as encoded
   from public.khata_lottery_records r
   where r.owner_id=bound_owner and sync_v2.lottery_organization(r.model,r.id,r.value)=organization
     and r.ordinal>after_ordinal
   order by r.ordinal limit row_limit+1
 ), budget as (
   select count(*)::int as n,coalesce(sum(octet_length(encoded)),0) as bytes from selected
 ), bounded as (
   select selected.* from selected cross join budget where bytes<=max_bytes
   order by ordinal limit row_limit
 )
 select budget.n,budget.bytes,
   coalesce((select max(ordinal) from bounded),after_ordinal),
   coalesce((select jsonb_agg(jsonb_build_object('model',model,'id',id,'ordinal',ordinal::text,
     'projectionJson',encoded) order by ordinal) from bounded),'[]'::jsonb)
 into row_count,scanned_bytes,continuation,projection from budget;
 if scanned_bytes>max_bytes then raise exception 'SYNC_LOTTERY_SNAPSHOT_PAGE_TOO_LARGE';end if;
 result:=jsonb_build_object('projection','lottery-organization-v1','scopeId',organization,'epoch',e,
   'highWater',watermark::text,'after',after_ordinal::text,'next',continuation::text,
   'done',row_count<=row_limit,'rows',projection);
 if octet_length(result::text)>max_bytes then raise exception 'SYNC_LOTTERY_SNAPSHOT_PAGE_TOO_LARGE';end if;
 return result;
end $$;
revoke all on function sync_v2.read_lottery_snapshot(uuid,text,text,text,bigint,bigint,integer,integer)
from public,anon,authenticated,service_role;
