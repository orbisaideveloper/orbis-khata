-- All test masters, invoices, journal rows and sequence changes are rolled back.
begin;
do $test$
declare cid uuid:=gen_random_uuid();owner uuid;pid uuid:=gen_random_uuid();wid uuid:=gen_random_uuid();iid uuid:=gen_random_uuid();eid uuid:=gen_random_uuid();day date:=(now() at time zone 'Asia/Kolkata')::date;b jsonb;p jsonb;r jsonb;s jsonb;ex jsonb;exid uuid:=gen_random_uuid();n integer;v numeric;
begin
 select owner_id into owner from public.khata_companies order by created_at limit 1;
 if owner is null then raise exception 'FIXTURE_OWNER_REQUIRED';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);
 perform set_config('orbis.khata.gateway_verified','v1',true);
 insert into public.khata_companies(id,name,owner_id) values(cid,'Atomic invoice rollback fixture',owner);
 insert into public.khata_parties(id,company_id,name,kind,opening_account) values(pid,cid,'Fixture trader','both','receivable');
 perform public.khata_inventory_post_v1(jsonb_build_object('id',wid,'company',cid,'kind','warehouse','date',day,'code','W','name','Fixture godown','unit','','party',null,'reference','','note','','lines','[]'::jsonb));
 perform public.khata_inventory_post_v1(jsonb_build_object('id',iid,'company',cid,'kind','item','date',day,'code','MILK','name','Fixture milk','unit','litre','party',null,'reference','','note','','lines','[]'::jsonb));
 for n in 1..5 loop
  r:=public.khata_workspace_v3(jsonb_build_object('company',cid,'action','number-preview','kind','purchase','id',gen_random_uuid(),'date',day));
  if r<>to_jsonb('1'::text) then raise exception 'PREVIEW_CONSUMED_NUMBER';end if;
 end loop;
 if exists(select 1 from public.khata_fiscal_numbers where company_id=cid) then raise exception 'PREVIEW_CREATED_RESERVATION';end if;
 b:=jsonb_build_object('id',eid,'company',cid,'kind','purchase','date',day,'code','','name','','unit','','party',pid,'reference','1','note','','lines',jsonb_build_array(jsonb_build_object('item',iid,'warehouse',wid,'to',null,'quantity','1000000','rate','10000','unit_rate','100')));
 p:=jsonb_build_object('company',cid,'action','invoice-save','command',jsonb_build_object('company',cid,'action','bill','bill',b,'paid','4000','account','cash','roundoff','-2000'));
 r:=public.khata_workspace_v3(p);
 if r->>'reference'<>'1' or r->>'total'<>'8000' or r->>'due'<>'4000' then raise exception 'DISCOUNT_SETTLEMENT_FAILED: %',r;end if;
 if public.khata_workspace_v3(p)<>r then raise exception 'SAVE_RETRY_CHANGED_RESULT';end if;
 select sum(signed_minor) into v from public.khata_journal where company_id=cid and account='payable';
 if v<>-4000 then raise exception 'PAYABLE_MISMATCH: %',v;end if;
 select sum(quantity) into v from public.khata_stock_movements where company_id=cid and item_id=iid;
 if v<>1000000 then raise exception 'STOCK_MISMATCH: %',v;end if;
 -- A rejected account must roll back the invoice number and every financial change.
 begin
  perform public.khata_workspace_v3(jsonb_set(jsonb_set(p,'{command,bill,id}',to_jsonb(gen_random_uuid())),'{command,account}','"missing"'));
  raise exception 'INVALID_ACCOUNT_ALLOWED';
 exception when others then if sqlerrm<>'PAYMENT_ACCOUNT_REQUIRED' then raise;end if;end;
 r:=public.khata_workspace_v3(jsonb_build_object('company',cid,'action','number-preview','kind','purchase','id',gen_random_uuid(),'date',day));
 if r<>to_jsonb('2'::text) then raise exception 'FAILED_SAVE_CONSUMED_NUMBER';end if;
 p:=jsonb_set(p,'{command,bill,id}',to_jsonb(gen_random_uuid()));
 r:=public.khata_workspace_v3(p);
 if r->>'reference'<>'2' then raise exception 'SECOND_DRAFT_NUMBER_FAILED';end if;
 ex:=jsonb_build_object('id',exid,'company',cid,'date',day,'kind','charge','amount','8000','category','Power','payee','Fixture power','method','bank','parent',null,'reference','1','note','');
 p:=jsonb_build_object('company',cid,'action','invoice-save','command',jsonb_build_object('company',cid,'action','expense','id',exid,'command',ex,'discount','2000','lines',jsonb_build_array(jsonb_build_object('description','Power','quantity','1000000','rate','10000','unit_rate','100','unit',''))));
 r:=public.khata_workspace_v3(p);
 if r->>'reference'<>'1' then raise exception 'EXPENSE_SEQUENCE_FAILED';end if;
 select sum(signed_minor) into v from public.khata_expense_full_journal where company_id=cid and account='expenses';
 if v<>8000 then raise exception 'EXPENSE_DISCOUNT_FAILED: %',v;end if;
 select sum(signed_minor) into v from public.khata_expense_full_journal where company_id=cid and account='bank';
 if v<>-8000 then raise exception 'EXPENSE_BANK_FAILED: %',v;end if;
 -- Existing expense correction keeps the reference and reuses the new discount
 -- validator without advancing the invoice counter.
 eid:=gen_random_uuid();
 ex:=jsonb_set(jsonb_set(ex,'{id}',to_jsonb(eid)),'{amount}','"9000"');
 perform public.khata_workspace_v3(jsonb_build_object('company',cid,'action','correct','id',gen_random_uuid(),'target',exid,'type','expense','reason','Fixture discount correction','replacement',jsonb_build_object('company',cid,'action','expense','id',eid,'command',ex,'discount','1000','lines',p->'command'->'lines')));
 select sum(signed_minor) into v from public.khata_expense_full_journal where company_id=cid and account='expenses';
 if v<>9000 then raise exception 'EXPENSE_CORRECTION_FAILED: %',v;end if;
 r:=public.khata_workspace_v3(jsonb_build_object('company',cid,'action','number-preview','kind','expense','id',gen_random_uuid(),'date',day));
 if r<>to_jsonb('2'::text) then raise exception 'EDIT_CONSUMED_NUMBER';end if;
 -- Sale from insufficient stock is allowed; the excess receipt remains a
 -- party credit. Retrying must not post another receipt or consume a number.
 eid:=gen_random_uuid();
 b:=jsonb_build_object('id',eid,'company',cid,'kind','sale','date',day,'code','','name','','unit','','party',pid,'reference','1','note','','lines',jsonb_build_array(jsonb_build_object('item',iid,'warehouse',wid,'to',null,'quantity','45500000','rate','5500','unit_rate','55')));
 p:=jsonb_build_object('company',cid,'action','invoice-save','command',jsonb_build_object('company',cid,'action','bill','bill',b,'paid','300000','account','cash','roundoff','-250'));
 r:=public.khata_workspace_v3(p);
 if r->>'total'<>'250000' or r->>'due'<>'-50000' then raise exception 'ADVANCE_TOTAL_FAILED: %',r;end if;
 if public.khata_workspace_v3(p)<>r then raise exception 'ADVANCE_RETRY_FAILED';end if;
 select sum(signed_minor) into v from public.khata_journal where company_id=cid and account='receivable';
 if v<>-50000 then raise exception 'ADVANCE_PARTY_FAILED: %',v;end if;
 select sum(quantity) into v from public.khata_stock_movements where company_id=cid and item_id=iid;
 if v>=0 then raise exception 'NEGATIVE_STOCK_NOT_RECORDED';end if;
 perform public.khata_workspace_v3(jsonb_build_object('company',cid,'action','correct','id',gen_random_uuid(),'target',eid,'type','voucher','reason','Rollback advance fixture','replacement',null));
 select sum(signed_minor) into v from public.khata_journal where company_id=cid and account='receivable';
 if v<>0 then raise exception 'ADVANCE_REVERSAL_FAILED: %',v;end if;
end $test$;
rollback;
