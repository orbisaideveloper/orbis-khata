-- Used only in a newly created local disposable cluster, after the real review SQL.
do $$begin
 assert (select count(*) from pg_constraint where contype='f' and confrelid='orbis_khata.principals'::regclass)=2,'central ownership FKs missing';
 assert (select count(*) from pg_constraint where contype='f' and confrelid='auth.users'::regclass and conrelid in ('public.khata_companies'::regclass,'public.khata_vouchers'::regclass))=0,'old auth FK remains';
 assert not has_table_privilege('authenticated','orbis_khata.principals','SELECT'),'principal refs exposed';
 assert not has_table_privilege('anon','orbis_khata.principals','SELECT'),'anonymous refs exposed';
 assert not has_table_privilege('service_role','orbis_khata.principals','SELECT'),'service refs exposed';
 assert (select relrowsecurity and relforcerowsecurity from pg_class where oid='orbis_khata.principals'::regclass),'private RLS missing';
 assert (select reloptions @> array['security_invoker=true'] from pg_class where oid='public.khata_journal'::regclass),'journal bypasses RLS';
end $$;
insert into orbis_khata.principals(orbis_identity_id) values
 ('11111111-1111-7111-8111-111111111111'),('22222222-2222-7222-8222-222222222222');
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-7111-8111-111111111111","role":"authenticated"}',true);
insert into public.khata_companies(id,name,owner_id) values
 ('10000000-0000-4000-8000-000000000001','Shop A','11111111-1111-7111-8111-111111111111'),
 ('10000000-0000-4000-8000-000000000002','Shop A2','11111111-1111-7111-8111-111111111111');
insert into public.khata_parties(id,company_id,name,kind) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Party A','both'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Party A2','both');
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-7222-8222-222222222222","role":"authenticated"}',true);
insert into public.khata_companies(id,name,owner_id) values('10000000-0000-4000-8000-000000000003','Shop B','22222222-2222-7222-8222-222222222222');
insert into public.khata_parties(id,company_id,name,kind) values('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','Party B','both');
do $$begin assert (select count(*) from public.khata_companies)=1,'B can see A shops';end $$;
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-7111-8111-111111111111","role":"authenticated"}',true);
do $$begin
 assert (select count(*) from public.khata_companies)=2,'A can see B shop';
 assert (select count(*) from public.khata_parties)=2,'A can see B parties';
 begin
  insert into public.khata_companies(id,name,owner_id) values('10000000-0000-4000-8000-000000000009','Forged B','22222222-2222-7222-8222-222222222222');
  raise exception 'FORGED_OWNER_WAS_ACCEPTED';
 exception when insufficient_privilege then null;end;
 begin
  perform public.khata_report_v1('10000000-0000-4000-8000-000000000003','2020-01-01',current_date,null,0);
  raise exception 'CROSS_USER_REPORT_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'COMPANY_NOT_ACCESSIBLE' then raise;end if;end;
 begin
  perform public.khata_report_v1('10000000-0000-4000-8000-000000000001','2020-01-01',current_date,'20000000-0000-4000-8000-000000000002',0);
  raise exception 'CROSS_COMPANY_PARTY_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'PARTY_NOT_ACCESSIBLE' then raise;end if;end;
 begin perform 1 from orbis_khata.principals;raise exception 'PRIVATE_REFS_ACCESSIBLE';
 exception when insufficient_privilege then null;end;
end $$;
select public.khata_post_v1('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','sale','2020-01-01','10000','cash','','',null);
do $$declare result jsonb;begin
 result:=public.khata_report_v1('10000000-0000-4000-8000-000000000001','2020-01-01',current_date,null,0);
 assert coalesce((result->'balances'->'cash'->>'closing')::numeric,0)=0,'unpaid sale counted as cash';
 assert (result->'balances'->'receivable'->>'closing')::numeric=10000,'receivable wrong';
end $$;
select public.khata_post_v1('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','receipt','2020-01-01','12000','cash','','',null);
select public.khata_post_v1('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','purchase','2020-01-01','5000','cash','','',null);
select public.khata_post_v1('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','payment','2020-01-01','2000','cash','','',null);
select public.khata_post_v1('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','sale','2020-01-01','10000','cash','','',null);
do $$declare result jsonb;begin
 result:=public.khata_report_v1('10000000-0000-4000-8000-000000000001','2020-01-01',current_date,null,0);
 assert (result->'balances'->'cash'->>'closing')::numeric=10000,'cash/payment total wrong';
 assert (result->'balances'->'receivable'->>'closing')::numeric=-2000,'advance lost';
 assert (result->'balances'->'payable'->>'closing')::numeric=-3000,'payable wrong';
 assert (result->>'count')::integer=4,'retry duplicated voucher';
 assert (select sum(signed_minor) from public.khata_journal)=0,'journal not balanced';
 assert (select count(*) from public.khata_vouchers where actor_id<>'11111111-1111-7111-8111-111111111111')=0,'wrong actor';
 begin
  perform public.khata_post_v1('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','sale','2020-01-01','10001','cash','','',null);
  raise exception 'CHANGED_RETRY_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise;end if;end;
 begin
  perform public.khata_post_v1('30000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','sale','2020-01-01','10000','cash','','',null);
  raise exception 'CROSS_USER_WRITE_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'COMPANY_NOT_ACCESSIBLE' then raise;end if;end;
end $$;
commit;
do $$begin
 begin update public.khata_vouchers set amount_minor=1;raise exception 'VOUCHER_MUTATED';
 exception when raise_exception then if sqlerrm<>'IMMUTABLE_VOUCHER' then raise;end if;end;
end $$;
begin;
set local role anon;
do $$begin
 begin perform 1 from public.khata_companies;raise exception 'ANON_COMPANY_READ';exception when insufficient_privilege then null;end;
 begin perform public.khata_report_v1('10000000-0000-4000-8000-000000000001','2020-01-01',current_date,null,0);raise exception 'ANON_REPORT';exception when insufficient_privilege then null;end;
end $$;
commit;
select 'KHATA_CENTRAL_SQL_ISOLATION_ACCOUNTING_AND_RETRY_PASS' as result;
