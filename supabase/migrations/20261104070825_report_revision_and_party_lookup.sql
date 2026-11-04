-- Additive derived-report revision metadata only. Never rewrites a financial row.
create table public.khata_report_revisions(
 company_id uuid primary key references public.khata_companies(id) on delete cascade,
 revision bigint not null default 1 check(revision>0)
);
alter table public.khata_report_revisions enable row level security;
revoke all on public.khata_report_revisions from public,anon,authenticated;
insert into public.khata_report_revisions(company_id) select id from public.khata_companies;

create function orbis_khata.touch_report_revision() returns trigger
language plpgsql security definer set search_path='' as $fn$
declare cid uuid;
begin
 if tg_table_name='khata_companies' then
  if tg_op='DELETE' then return old;end if;
  cid:=new.id;
 elsif tg_op='DELETE' then cid:=old.company_id;
 else cid:=new.company_id;
 end if;
 -- Company purge may already have removed its derived metadata by FK cascade.
 if exists(select 1 from public.khata_companies where id=cid) then
  insert into public.khata_report_revisions(company_id,revision) values(cid,1)
   on conflict(company_id) do update set revision=public.khata_report_revisions.revision+1;
 end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end $fn$;
revoke all on function orbis_khata.touch_report_revision() from public,anon,authenticated;
do $install$
declare tab text;
begin
 foreach tab in array array['khata_companies','khata_parties','khata_items','khata_warehouses','khata_vouchers','khata_expense_events','khata_inventory_documents','khata_stock_movements','khata_stock_reversals','khata_opening_expense_payments'] loop
  execute format('create trigger khata_report_revision_watch after insert or update or delete on public.%I for each row execute function orbis_khata.touch_report_revision()',tab);
 end loop;
end $install$;

create function public.khata_report_revision_v1(cid uuid) returns text
language plpgsql security definer set search_path='' as $fn$
declare version bigint;
begin
 perform orbis_khata.inventory_access(cid,false);
 -- Hold the revision row until this page read finishes. Concurrent writers cannot
 -- commit a financial change without updating the same company's revision.
 select revision into version from public.khata_report_revisions where company_id=cid for share;
 if version is null then raise exception 'REPORT_REVISION_UNAVAILABLE';end if;
 return version::text;
end $fn$;
revoke all on function public.khata_report_revision_v1(uuid) from public,anon;
grant execute on function public.khata_report_revision_v1(uuid) to authenticated;

-- Matches the prepared Edge predicate, keeping unrelated companies/names out of memory.
create index khata_party_normalized_name_idx on public.khata_parties
 (company_id,lower(btrim(regexp_replace(normalize(name,NFKC),'[[:space:]]+',' ','g'))));

-- Proven cutoff defect: a reversal dated after dto must not hide an earlier sale.
-- Guard the exact existing predicate and preserve every other function statement/grant.
do $cutoff$
declare definition text;needle text:='exists(select 1 from public.khata_vouchers r where r.reverses_id=v.id) as reversed';
begin
 select pg_get_functiondef('public.khata_report_v1(uuid,date,date,uuid,integer)'::regprocedure) into definition;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
  raise exception 'REPORT_CUTOFF_SOURCE_CHANGED';
 end if;
 execute replace(definition,needle,'exists(select 1 from public.khata_vouchers r where r.reverses_id=v.id and r.effective_date<=p_to) as reversed');
end $cutoff$;
