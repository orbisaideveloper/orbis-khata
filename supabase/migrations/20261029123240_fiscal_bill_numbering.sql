-- Financial-year reservations are independent of posted accounting records.
create table public.khata_fiscal_counters(
 company_id uuid not null references public.khata_companies(id) on delete cascade,
 kind text not null check(kind in('sale','purchase','expense')),
 fiscal_year integer not null check(fiscal_year between 1 and 9998),
 next_serial bigint not null check(next_serial between 1 and 100000000),
 primary key(company_id,kind,fiscal_year)
);
create table public.khata_fiscal_numbers(
 company_id uuid not null references public.khata_companies(id) on delete cascade,
 kind text not null check(kind in('sale','purchase','expense')),
 fiscal_year integer not null,
 draft_id uuid not null,
 reference text not null check(length(reference) between 1 and 80),
 primary key(company_id,kind,fiscal_year,draft_id),
 unique(company_id,kind,reference)
);
alter table public.khata_fiscal_counters enable row level security;
alter table public.khata_fiscal_numbers enable row level security;
revoke all on public.khata_fiscal_counters,public.khata_fiscal_numbers from public,anon,authenticated;
create function orbis_khata.fiscal_year(d date) returns integer language sql immutable strict set search_path='' as $$
 select extract(year from d)::integer-case when extract(month from d)<4 then 1 else 0 end;
$$;
revoke all on function orbis_khata.fiscal_year(date) from public,anon,authenticated;
alter function public.khata_workspace_v3(jsonb) rename to khata_workspace_v3_legacy;
revoke all on function public.khata_workspace_v3_legacy(jsonb) from public,anon,authenticated;
create function public.khata_workspace_v3(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare cid uuid:=(p->>'company')::uuid; k text:=p->>'kind'; day date; fy integer; cy integer;
 s jsonb; old_s jsonb; answer jsonb; seq bigint; ref text; seed bigint; eid uuid;
begin
 -- Keep the same company lock and verified canonical owner boundary as v3.
 if auth.uid() is null or current_setting('orbis.khata.gateway_verified',true) is distinct from 'v1'
 or not exists(select 1 from public.khata_companies where id=cid and owner_id=auth.uid()) then raise exception 'COMPANY_NOT_ACCESSIBLE';end if;
 perform pg_advisory_xact_lock(hashtextextended('stock-company:'||cid::text,0));
 if p->>'action'='settings-save' then
  old_s:=public.khata_workspace_v3_legacy(jsonb_build_object('company',cid,'action','settings'));
  if p->'settings' ? 'mode' and (jsonb_typeof(p->'settings'->'mode')<>'object' or exists(select 1 from unnest(array['sale','purchase','expense']) kind where coalesce(p->'settings'->'mode'->>kind,'') not in('auto','manual'))) then raise exception 'INVALID_NUMBER_MODE';end if;
  answer:=public.khata_workspace_v3_legacy(p);
  cy:=orbis_khata.fiscal_year((now() at time zone 'Asia/Kolkata')::date);
  foreach k in array array['sale','purchase','expense'] loop
   if coalesce(p->'settings'->'next'->>k,'') !~ '^[1-9][0-9]{0,7}$' then raise exception 'INVALID_SERIAL';end if;
   if (old_s->'next'->>k) is distinct from (p->'settings'->'next'->>k) then
    insert into public.khata_fiscal_counters values(cid,k,cy,(p->'settings'->'next'->>k)::bigint)
    on conflict(company_id,kind,fiscal_year) do update set next_serial=excluded.next_serial;
   end if;
  end loop;
  return answer;
 end if;
 if p->>'action'<>'number' then return public.khata_workspace_v3_legacy(p);end if;
 perform orbis_khata.inventory_access(cid,true);
 eid:=(p->>'id')::uuid;day:=coalesce((p->>'date')::date,(now() at time zone 'Asia/Kolkata')::date);
 if eid is null or k not in('sale','purchase','expense') or day is null then raise exception 'INVALID_NUMBER_REQUEST';end if;
 fy:=orbis_khata.fiscal_year(day);cy:=orbis_khata.fiscal_year((now() at time zone 'Asia/Kolkata')::date);
 s:=public.khata_workspace_v3_legacy(jsonb_build_object('company',cid,'action','settings'));
 if coalesce(s->'mode'->>k,'auto')='manual' then raise exception 'MANUAL_NUMBER_REQUIRED';end if;
 select reference into ref from public.khata_fiscal_numbers where company_id=cid and kind=k and fiscal_year=fy and draft_id=eid;
 if ref is not null then return to_jsonb(ref);end if;
 seed:=case when fy=cy then (s->'next'->>k)::bigint else 1 end;
 insert into public.khata_fiscal_counters values(cid,k,fy,seed) on conflict do nothing;
 select next_serial into seq from public.khata_fiscal_counters where company_id=cid and kind=k and fiscal_year=fy for update;
 loop
  if seq>99999999 then raise exception 'NUMBER_LIMIT';end if;
  ref:=coalesce(s->'numbering'->>k,'')||fy::text||'-'||right((fy+1)::text,2)||'/'||seq::text;
  exit when not exists(select 1 from public.khata_fiscal_numbers where company_id=cid and kind=k and reference=ref)
   and not exists(select 1 from public.khata_bill_numbers where company_id=cid and kind=k and reference=ref)
   and not exists(select 1 from public.khata_vouchers where company_id=cid and kind=k and reference=ref)
   and not exists(select 1 from public.khata_expense_events where company_id=cid and k='expense' and reference=ref);
  seq:=seq+1;
 end loop;
 insert into public.khata_fiscal_numbers values(cid,k,fy,eid,ref);
 update public.khata_fiscal_counters set next_serial=seq+1 where company_id=cid and kind=k and fiscal_year=fy;
 if fy=cy then
  s:=jsonb_set(s,array['next',k],to_jsonb((seq+1)::text));
  insert into public.khata_workspace_settings values(cid,s,now()) on conflict(company_id) do update set settings=excluded.settings,updated_at=now();
 end if;
 return to_jsonb(ref);
end $fn$;
revoke all on function public.khata_workspace_v3(jsonb) from public,anon;
grant execute on function public.khata_workspace_v3(jsonb) to authenticated;
