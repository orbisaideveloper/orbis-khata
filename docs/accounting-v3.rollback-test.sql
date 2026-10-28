-- Run after migration in the SAME transaction, then ROLLBACK. No retained fixtures.
do $test$
declare cid uuid:=gen_random_uuid();owner uuid;party uuid:=gen_random_uuid();item uuid:=gen_random_uuid();wid uuid;bill uuid:=gen_random_uuid();sale uuid:=gen_random_uuid();op uuid:=gen_random_uuid();p jsonb;s jsonb;r jsonb;n numeric;
begin
 select owner_id into owner from public.khata_companies order by created_at limit 1;
 if owner is null then raise exception 'TEST_OWNER_REQUIRED';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);
 perform set_config('orbis.khata.gateway_verified','v1',true);
 insert into public.khata_companies(id,name,owner_id) values(cid,'V3 rollback fixture',owner);
 perform public.khata_prepare_company_v2(cid);
 insert into public.khata_parties(id,company_id,name,kind) values(party,cid,'Fixture party','both');
 perform public.khata_inventory_post_v1(jsonb_build_object('id',item,'company',cid,'kind','item','date','2026-01-01','code','TEST','name','Fixture milk','unit','litre','party',null,'reference','','note','','lines','[]'::jsonb));
 select id into wid from public.khata_warehouses where company_id=cid limit 1;
 execute 'set local role authenticated';
 p:=jsonb_build_object('company',cid,'action','bill','bill',jsonb_build_object('id',bill,'company',cid,'kind','purchase','date','2026-10-20','code','','name','','unit','','party',party,'reference','P1','note','','lines',jsonb_build_array(jsonb_build_object('item',item,'warehouse',wid,'to',null,'quantity','2000000','rate','100000','unit_rate','1000'))),'paid','100000','account','cash','roundoff','0');
 r:=public.khata_workspace_v3(p);
 if r->>'due'<>'100000' then raise exception 'TEST_PARTIAL_DUE';end if;
 if public.khata_workspace_v3(p)<>r then raise exception 'TEST_RETRY';end if;
 begin perform public.khata_workspace_v3(p||'{"paid":"50000"}'::jsonb);raise exception 'TEST_CONFLICT_NOT_REJECTED';exception when others then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise;end if;end;
 -- Historical sale exceeds stock and predates the purchase; both are permitted.
 s:=jsonb_set(p,'{bill,id}',to_jsonb(sale::text));s:=jsonb_set(s,'{bill,kind}','"sale"'::jsonb);s:=jsonb_set(s,'{bill,date}','"2026-10-10"'::jsonb);s:=jsonb_set(s,'{bill,reference}','"S1"'::jsonb);s:=jsonb_set(s,'{bill,lines,0,quantity}','"3000000"'::jsonb);s:=jsonb_set(s,'{paid}','"0"'::jsonb);
 perform public.khata_workspace_v3(s);
 select sum(quantity) into n from public.khata_stock_journal where company_id=cid and item_id=item;
 if n<>-1000000 then raise exception 'TEST_NEGATIVE_STOCK';end if;
 select sum(signed_minor) into n from public.khata_journal where company_id=cid and account='cash';
 if n<>-100000 then raise exception 'TEST_NEGATIVE_CASH';end if;
 perform public.khata_workspace_v3(jsonb_build_object('company',cid,'action','correct','id',op,'target',bill,'type','voucher','reason','Fixture deletion','replacement',null));
 select sum(quantity) into n from public.khata_stock_journal where company_id=cid and item_id=item;
 if n<>-3000000 then raise exception 'TEST_CORRECTION_STOCK';end if;
 select sum(signed_minor) into n from public.khata_journal where company_id=cid and account='cash';
 if n<>0 then raise exception 'TEST_CORRECTION_PAYMENT';end if;
 perform public.khata_workspace_v3(jsonb_build_object('company',cid,'action','retire','name','V3 rollback fixture'));
 begin perform public.khata_workspace_v3(jsonb_build_object('company',cid,'action','settings'));raise exception 'TEST_RETIRED_ACCESS';exception when others then if sqlerrm<>'COMPANY_NOT_ACCESSIBLE' then raise;end if;end;
 perform public.khata_workspace_v3(jsonb_build_object('company',cid,'action','restore','name','V3 rollback fixture'));
 if exists(select 1 from public.khata_companies where id=cid and deleted_at is not null) then raise exception 'TEST_RESTORE';end if;
 -- Another identity must fail even though this DO runs with database privileges.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 begin perform public.khata_workspace_v3(jsonb_build_object('company',cid,'action','settings'));raise exception 'TEST_TENANT_ACCESS';exception when others then if sqlerrm<>'COMPANY_NOT_ACCESSIBLE' then raise;end if;end;
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);
 perform public.khata_workspace_v3(jsonb_build_object('company',cid,'action','retire','name','V3 rollback fixture'));
 update public.khata_companies set purge_after=now()-interval '1 minute' where id=cid;
 perform orbis_khata.purge_retired_companies();
 if exists(select 1 from public.khata_companies where id=cid) or exists(select 1 from public.khata_vouchers where company_id=cid) or exists(select 1 from public.khata_stock_movements where company_id=cid) then raise exception 'TEST_PURGE';end if;
end $test$;
