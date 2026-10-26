-- Runs only inside BEGIN / ROLLBACK after the candidate migration.
insert into public.khata_companies(id,name,owner_id) select 'a0000000-0000-4000-8000-000000000001','Release rollback fixture',owner_id from public.khata_companies limit 1;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select owner_id from public.khata_companies where id='a0000000-0000-4000-8000-000000000001'),'role','authenticated')::text,true);
select set_config('orbis.khata.gateway_verified','v1',true);
set local role authenticated;
do $$declare c uuid:='a0000000-0000-4000-8000-000000000001';p uuid:='a0000000-0000-4000-8000-000000000002';i uuid:='a0000000-0000-4000-8000-000000000003';w uuid;r jsonb;begin
 perform public.khata_prepare_company_v2(c);
 perform public.khata_master_save_v2('party',jsonb_build_object('id',p,'company',c,'name','Fixture expense','kind','expense','phone','+919876543210','email','test@example.com','address','Fixture','credit_limit','10000','credit_days',30,'opening_amount','5000','opening_side','due','opening_date','2026-10-01','opening_account','expense_payable'));
 r:=public.khata_masters_v2(c);if r->'parties'->0->>'phone'<>'+919876543210' then raise exception 'CONTACT_NOT_SAVED';end if;
 if public.khata_party_balance_v2(c,p,'2026-10-25','expense')<>'5000' then raise exception 'OPENING_WRONG';end if;
 perform public.khata_expense_post_v2(jsonb_build_object('id','a0000000-0000-4000-8000-000000000004','company',c,'kind','payment','date','2026-10-25','amount','2000','method','cash','parent',p,'category','','payee','Fixture expense','reference','','note',''));
 r:=public.khata_expense_report_v2(c,'2026-10-01','2026-10-25',0);
 if r->>'count'<>'1' or r->'bills'->0->>'due'<>'3000' then raise exception 'PAYMENT_REPORT_WRONG %',r;end if;
 perform public.khata_master_save_v2('item',jsonb_build_object('id',i,'company',c,'name','Fixture milk','unit','litre','code','','default_rate',null));
 r:=public.khata_masters_v2(c);if r->'items'->0->>'code'<>'' then raise exception 'OPTIONAL_CODE_WRONG';end if;
 perform public.khata_master_delete_v2('item',c,i);
 if jsonb_array_length(public.khata_masters_v2(c)->'items')<>0 then raise exception 'DELETE_NOT_SAVED';end if;
 begin perform public.khata_master_delete_v2('party',c,p);raise exception 'UNSAFE_DELETE_ALLOWED';exception when foreign_key_violation then null;end;
end $$;
reset role;
select set_config('orbis.khata.gateway_verified','v1',true);
set local role authenticated;
do $$declare c uuid:='a0000000-0000-4000-8000-000000000001';i uuid:='a0000000-0000-4000-8000-000000000013';p uuid:='a0000000-0000-4000-8000-000000000012';w uuid;r jsonb;cmd jsonb;begin
 perform public.khata_master_save_v2('party',jsonb_build_object('id',p,'company',c,'name','Fixture trader','kind','both','phone','','email','','address','','credit_limit',null,'credit_days',null,'opening_amount','0','opening_side','none','opening_date','','opening_account','receivable'));
 perform public.khata_master_save_v2('item',jsonb_build_object('id',i,'company',c,'name','Fixture exact milk','unit','litre','code','','default_rate',null));
 select id into w from public.khata_warehouses where company_id=c limit 1;
 cmd:=jsonb_build_object('id','a0000000-0000-4000-8000-000000000014','company',c,'kind','purchase','date','2026-10-25','code','','name','','unit','','party',p,'reference','TEST','note','','lines',jsonb_build_array(jsonb_build_object('item',i,'warehouse',w,'to',null,'quantity','3000000','rate','3333','unit_rate','33.33333333')));
 perform public.khata_inventory_post_v1(cmd);perform public.khata_inventory_post_v1(cmd);
 r:=public.khata_inventory_report_v1(c,'2026-10-01','2026-10-25',0);
 if r->'documents'->0->>'total'<>'10000' or r->'stocks'->0->>'closing'<>'3000000' then raise exception 'PRECISE_BILL_OR_RETRY_WRONG %',r;end if;
 begin perform public.khata_master_delete_v2('item',c,i);raise exception 'USED_ITEM_DELETED';exception when foreign_key_violation then null;end;
 perform public.khata_expense_bill_v2(jsonb_build_object('id','a0000000-0000-4000-8000-000000000015','company',c,'kind','charge','date','2026-10-25','amount','10000','category','Fixture expense','payee','Fixture expense','method',null,'parent',null,'reference','','note',''),jsonb_build_array(jsonb_build_object('description','Precise expense','quantity','3000000','unit','','rate','3333','unit_rate','33.33333333')));
 r:=public.khata_expense_report_v2(c,'2026-10-01','2026-10-25',0);
 if r->>'count'<>'2' or not exists(select 1 from jsonb_array_elements(r->'entries')e where e->'bill_lines'->0->>'description'='Precise expense') then raise exception 'EXPENSE_LINES_NOT_PERSISTED %',r;end if;
 perform set_config('orbis.khata.gateway_verified','',true);
 begin perform public.khata_masters_v2(c);raise exception 'GATEWAY_BYPASS';exception when others then if sqlerrm='GATEWAY_BYPASS' then raise;end if;end;
end $$;
reset role;
