-- Read-only regression: no names, IDs or balances are returned; all context rolls back.
begin;
do $test$
declare company public.khata_companies; rows jsonb; actual numeric; expected numeric; kind text;
begin
 select * into company from public.khata_companies where deleted_at is null order by created_at limit 1;
 if company.id is null then raise exception 'FIXTURE_OWNER_REQUIRED';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',company.owner_id,'role','authenticated')::text,true);
 perform set_config('orbis.khata.gateway_verified','v1',true);
 rows:=public.khata_workspace_v3(jsonb_build_object('company',company.id,'action','accounts','from','2026-10-01','to','2026-10-29'));
 if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows)<2 then raise exception 'ACCOUNT_READ_FAILED';end if;
 foreach kind in array array['cash','bank'] loop
  select coalesce(sum((r->>'balance')::numeric),0) into actual from jsonb_array_elements(rows) r where r->>'kind'=kind;
  select coalesce(sum(j.signed_minor),0) into expected from public.khata_journal j where j.company_id=company.id and j.account=kind and j.effective_date<='2026-10-29';
  if actual<>expected then raise exception 'ACCOUNT_JOURNAL_MISMATCH';end if;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 begin
  perform public.khata_workspace_v3(jsonb_build_object('company',company.id,'action','accounts'));
  raise exception 'FOREIGN_OWNER_ALLOWED';
 exception when others then
  if sqlerrm<>'COMPANY_NOT_ACCESSIBLE' then raise;end if;
 end;
end $test$;
rollback;
