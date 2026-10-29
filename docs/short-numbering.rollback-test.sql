begin;
do $test$
declare cid uuid:=gen_random_uuid();owner uuid;s jsonb;r jsonb;draft uuid:=gen_random_uuid();y integer;day date;expected text;
begin
 select owner_id into owner from public.khata_companies order by created_at limit 1;
 if owner is null then raise exception 'FIXTURE_OWNER_REQUIRED';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);
 perform set_config('orbis.khata.gateway_verified','v1',true);
 insert into public.khata_companies(id,name,owner_id) values(cid,'Fiscal numbering rollback fixture',owner);
 day:=(now() at time zone 'Asia/Kolkata')::date;y:=orbis_khata.fiscal_year(day);
 s:=public.khata_workspace_v3(jsonb_build_object('company',cid,'action','settings'));
 s:=jsonb_set(jsonb_set(s,'{numbering,sale}','"INV/"'),'{next,sale}','"42"');
 perform public.khata_workspace_v3(jsonb_build_object('company',cid,'action','settings-save','settings',s));
 r:=public.khata_workspace_v3(jsonb_build_object('company',cid,'action','number','id',draft,'kind','sale','date',day));
 expected:='42';
 if r<>to_jsonb(expected) then raise exception 'CURRENT_SERIAL_FAILED: %',r;end if;
 if public.khata_workspace_v3(jsonb_build_object('company',cid,'action','number','id',draft,'kind','sale','date',make_date(y,4,1)))<>r then raise exception 'RETRY_CHANGED_NUMBER';end if;
 r:=public.khata_workspace_v3(jsonb_build_object('company',cid,'action','number','id',draft,'kind','sale','date',make_date(y+1,4,1)));
 if r<>to_jsonb('1'::text) then raise exception 'YEAR_RESET_FAILED';end if;
 r:=public.khata_workspace_v3(jsonb_build_object('company',cid,'action','number','id',gen_random_uuid(),'kind','sale','date',make_date(y,3,31)));
 if r<>to_jsonb('1'::text) then raise exception 'BACKDATE_FAILED';end if;
 r:=public.khata_workspace_v3(jsonb_build_object('company',cid,'action','number','id',gen_random_uuid(),'kind','sale','date',day));
 if r<>to_jsonb('43'::text) then raise exception 'NEXT_BILL_FAILED';end if;
 s:=public.khata_workspace_v3(jsonb_build_object('company',cid,'action','settings'));
 s:=jsonb_set(s,'{next,sale}','"42"');
 perform public.khata_workspace_v3(jsonb_build_object('company',cid,'action','settings-save','settings',s));
 r:=public.khata_workspace_v3(jsonb_build_object('company',cid,'action','number','id',gen_random_uuid(),'kind','sale','date',day));
 if r<>to_jsonb('44'::text) then raise exception 'RESERVED_NUMBER_REUSED';end if;
 r:=public.khata_workspace_v3(jsonb_build_object('company',cid,'action','number','id',gen_random_uuid(),'kind','purchase','date',day));
 if r<>to_jsonb('1'::text) then raise exception 'PURCHASE_COUNTER_SHARED';end if;
 s:=public.khata_workspace_v3(jsonb_build_object('company',cid,'action','settings'));
 s:=jsonb_set(s,'{next,sale}','"99"');
 perform public.khata_workspace_v3(jsonb_build_object('company',cid,'action','settings-save','settings',s));
 r:=public.khata_workspace_v3(jsonb_build_object('company',cid,'action','number','id',gen_random_uuid(),'kind','sale','date',day));
 if r<>to_jsonb('99'::text) then raise exception 'SETTINGS_NOT_APPLIED';end if;
 s:=jsonb_set(s,'{mode}','{"sale":"manual","purchase":"auto","expense":"auto"}');
 perform public.khata_workspace_v3(jsonb_build_object('company',cid,'action','settings-save','settings',s));
 begin
  perform public.khata_workspace_v3(jsonb_build_object('company',cid,'action','number','id',gen_random_uuid(),'kind','sale','date',day));
  raise exception 'MANUAL_NOT_ENFORCED';
 exception when others then if sqlerrm<>'MANUAL_NUMBER_REQUIRED' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 begin
  perform public.khata_workspace_v3(jsonb_build_object('company',cid,'action','number','id',gen_random_uuid(),'kind','sale','date',day));
  raise exception 'FOREIGN_OWNER_ALLOWED';
 exception when others then if sqlerrm<>'COMPANY_NOT_ACCESSIBLE' then raise;end if;end;
end $test$;
rollback;
