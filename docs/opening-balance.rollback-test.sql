-- Verification fixtures are rolled back; existing customer records are untouched.
begin;
do $test$
declare cid uuid:=gen_random_uuid(); owner uuid; pid uuid:=gen_random_uuid(); r jsonb; p jsonb; n integer;
begin
 select owner_id into owner from public.khata_companies order by created_at limit 1;
 if owner is null then raise exception 'TEST_OWNER_REQUIRED';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);
 perform set_config('orbis.khata.gateway_verified','v1',true);
 insert into public.khata_companies(id,name,owner_id) values(cid,'Opening correction rollback fixture',owner);
 insert into public.khata_parties(id,company_id,name,kind,opening_account) values(pid,cid,'Fixture supplier','supplier','payable');
 perform public.khata_post_v1(gen_random_uuid(),cid,pid,'purchase','2026-10-20','200000','cash','TEST-P','',null);
 perform public.khata_post_v1(gen_random_uuid(),cid,pid,'payment','2026-10-20','50000','cash','TEST-PAY','',null);
 select to_jsonb(v)||jsonb_build_object('company',cid,'opening_amount','650000','opening_side','due','opening_date','2026-10-01') into p from public.khata_parties v where id=pid;
 perform public.khata_master_save_v2('party',p);
 r:=public.khata_report_v1(cid,'2026-10-01','2026-10-29',pid,0);
 if r#>>'{ledger_balances,payable,closing}'<>'-800000' then raise exception 'OPENING_DUE_MISMATCH %',r;end if;
 if jsonb_array_length(r->'entries')<>2 then raise exception 'OLD_TRANSACTIONS_LOST';end if;
 if not exists(select 1 from public.khata_master_audit where entity_id=pid and old_row->>'opening_amount'='0' and new_row->>'opening_amount'='650000') then raise exception 'AUDIT_MISSING';end if;
 perform public.khata_master_save_v2('party',p||jsonb_build_object('opening_amount','100000','opening_side','advance'));
 r:=public.khata_report_v1(cid,'2026-10-01','2026-10-29',pid,0);
 if r#>>'{ledger_balances,payable,closing}'<>'-50000' then raise exception 'OPENING_ADVANCE_MISMATCH';end if;
 begin
  update public.khata_parties set kind='customer' where id=pid;
  raise exception 'USED_KIND_GUARD_MISSING';
 exception when foreign_key_violation then null;end;
 begin
  delete from public.khata_parties where id=pid;
  raise exception 'USED_PARTY_DELETE_GUARD_MISSING';
 exception when foreign_key_violation then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 begin
  perform public.khata_master_save_v2('party',p);
  raise exception 'TENANT_GUARD_MISSING';
 exception when raise_exception then if sqlerrm<>'COMPANY_NOT_ACCESSIBLE' then raise;end if;end;
end $test$;
rollback;
select 'PASS: audited used-party opening correction, advance, old entries, deletion/type/tenant guards; fixtures rolled back' as result;
