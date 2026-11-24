-- Private fixture for the verified settlement/expense slice. Its projection
-- label is intentionally distinct from a complete owner bootstrap.
create function sync_v2.open_settlement_snapshot(a uuid,d text,c uuid,e text, projection_name text default 'settlement-expense-v1')
returns jsonb language plpgsql set search_path='' as $$
declare
  session jsonb;
  snapshot uuid;
  rows jsonb := '[]'::jsonb;
  section jsonb;
  row_count integer := 0;
  relation text;
  entity text;
  ordering text;
begin
  if projection_name is null or projection_name not in ('settlement-expense-v1','company-operational-v1') then
    raise exception 'SYNC_SNAPSHOT_PROJECTION_UNSUPPORTED';
  end if;
  -- Shares the ownership, device, stock and high-water lock path.
  session:=sync_v2.open_voucher_snapshot(a,d,c,e);
  snapshot:=(session->>'snapshot')::uuid;
  for relation,entity,ordering in
    select sections.relation,sections.entity,sections.ordering
    from sync_v2.company_projection_sections(projection_name) sections
  loop
    -- Ordering is drawn only from the static relation list above.
    execute format(
      'select coalesce(jsonb_agg(jsonb_build_object(''entityType'',$2,''projectionJson'',to_jsonb(x)::text)
        order by %s),''[]''::jsonb)
        from (select * from public.%I where company_id=$1 order by %s limit $3) x',
      ordering,relation,ordering)
      into section using c,entity,4097-row_count;
    row_count:=row_count+jsonb_array_length(section);
    rows:=rows||section;
    if row_count>4096 or octet_length(rows::text)>2097152 then raise exception 'SYNC_SNAPSHOT_TOO_LARGE'; end if;
  end loop;
  perform sync_v2.assert_snapshot_authorized(a,d,c,e);
  update sync_v2.voucher_snapshot set vouchers=rows,projection=projection_name where id=snapshot;
  return session||jsonb_build_object('projection',projection_name,'count',row_count);
end $$;
revoke all on function sync_v2.open_settlement_snapshot(uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
