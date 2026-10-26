CREATE OR REPLACE FUNCTION public.khata_expense_post_v1(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cid uuid; eid uuid; d date; amt numeric; original public.khata_expense_events;
 existing public.khata_expense_events;
 root_id uuid; paid numeric; dr_method text; category_name text; payee_name text;
begin
 if p is null or jsonb_typeof(p)<>'object' or
    (select count(*) from jsonb_object_keys(p))<>11 or not (p ?& array['id','company','date','kind','amount','category','payee','method','parent','reference','note']) then raise exception 'INVALID_EXPENSE_INPUT'; end if;
 if p->>'amount' is null or p->>'amount' !~ '^[0-9]{1,12}$' or p->>'kind' not in ('charge','payment','reversal') then raise exception 'INVALID_EXPENSE_INPUT'; end if;
 cid:=(p->>'company')::uuid; eid:=(p->>'id')::uuid; d:=(p->>'date')::date; amt:=(p->>'amount')::numeric;
 if cid is null or eid is null or d is null or amt<=0 or d>(now() at time zone 'Asia/Kolkata')::date then raise exception 'INVALID_EXPENSE_INPUT'; end if;
 if auth.uid() is null or current_setting('orbis.khata.gateway_verified',true) is distinct from 'v1' or
 not exists(select 1 from public.khata_companies where id=cid and owner_id=auth.uid()) then raise exception 'COMPANY_NOT_ACCESSIBLE'; end if;
 if not coalesce((select enabled from public.khata_write_controls where singleton),false) then raise exception 'WRITES_DISABLED'; end if;
 if p->>'reference' is null or char_length(p->>'reference')>80 or p->>'note' is null or char_length(p->>'note')>500 or
 p->>'category' is null or char_length(btrim(p->>'category')) not between 1 and 80 or p->>'payee' is null or char_length(p->>'payee')>120 then raise exception 'INVALID_EXPENSE_INPUT'; end if;
 -- Serialize expense changes within one company; overpayment cannot race.
 perform pg_advisory_xact_lock(hashtextextended('expense-company:'||cid::text,0));
 select * into existing from public.khata_expense_events where id=eid;
 if existing.id is not null then
   if existing.company_id<>cid or existing.payload<>p then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return eid;
 end if;
 category_name:=btrim(p->>'category'); payee_name:=btrim(p->>'payee');
 if p->>'kind'='charge' then
   if p->>'parent' is not null or (p->>'method' is not null and p->>'method' not in ('cash','bank')) then raise exception 'INVALID_EXPENSE_INPUT'; end if;
   dr_method:=p->>'method';
 else
   select * into original from public.khata_expense_events where company_id=cid and id=(p->>'parent')::uuid;
   if original.id is null or d<original.effective_date or original.kind='reversal' or
     exists(select 1 from public.khata_expense_events where reverses_id=original.id) then raise exception 'INVALID_EXPENSE_PARENT'; end if;
   root_id:=case when original.kind='charge' then original.id else original.parent_id end;
   if d<(select max(e.effective_date) from public.khata_expense_events e where e.company_id=cid and
     (e.id=root_id or e.parent_id=root_id or e.reverses_id=root_id or e.reverses_id in
       (select x.id from public.khata_expense_events x where x.company_id=cid and x.parent_id=root_id))) then raise exception 'EXPENSE_DATE_BEFORE_ACTIVITY'; end if;
   category_name:=original.category; payee_name:=original.payee;
   if p->>'kind'='payment' then
     if original.kind<>'charge' or original.method is not null or coalesce(p->>'method','') not in ('cash','bank') then raise exception 'INVALID_EXPENSE_PAYMENT'; end if;
     select coalesce(sum(e.amount_minor),0) into paid from public.khata_expense_events e
       where e.parent_id=original.id and e.kind='payment' and not exists(select 1 from public.khata_expense_events r where r.reverses_id=e.id);
     if paid+amt>original.amount_minor then raise exception 'EXPENSE_OVERPAYMENT'; end if;
     dr_method:=p->>'method';
   else
     if amt<>original.amount_minor or p->>'method' is not null or char_length(btrim(p->>'note'))=0 then raise exception 'INVALID_EXPENSE_REVERSAL'; end if;
     if original.kind='charge' and exists(select 1 from public.khata_expense_events e where e.parent_id=original.id and e.kind='payment'
       and not exists(select 1 from public.khata_expense_events r where r.reverses_id=e.id)) then raise exception 'REVERSE_PAYMENTS_FIRST'; end if;
     if original.kind='charge' and exists(select 1 from public.khata_expense_events e where (e.parent_id=original.id or e.reverses_id in (select x.id from public.khata_expense_events x where x.parent_id=original.id)) and e.effective_date>d) then raise exception 'REVERSAL_DATE_BEFORE_PAYMENT'; end if;
     dr_method:=original.method;
   end if;
 end if;
 insert into public.khata_expense_events(id,company_id,effective_date,kind,amount_minor,category,payee,method,parent_id,reverses_id,reference,note,actor_id,payload)
 values(eid,cid,d,p->>'kind',amt,category_name,payee_name,dr_method,
   case when p->>'kind'='payment' then original.id else null end,
   case when p->>'kind'='reversal' then original.id else null end,p->>'reference',p->>'note',auth.uid(),p);
 return eid;
end $function$

