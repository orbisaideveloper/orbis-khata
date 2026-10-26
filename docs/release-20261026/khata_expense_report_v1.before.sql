CREATE OR REPLACE FUNCTION public.khata_expense_report_v1(p_company uuid, p_from date, p_to date, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.khata_companies where id=p_company and owner_id=auth.uid()) then raise exception 'COMPANY_NOT_ACCESSIBLE'; end if;
 if p_from is null or p_to is null or p_from>p_to or p_offset<0 then raise exception 'INVALID_PERIOD'; end if;
 with journal as (select * from public.khata_expense_journal where company_id=p_company and effective_date<=p_to),
 balances as (select account,coalesce(sum(signed_minor) filter(where effective_date<p_from),0) as opening,
   coalesce(sum(signed_minor) filter(where effective_date>=p_from),0) as movement,sum(signed_minor) as closing from journal group by account),
 categories as (select category,sum(signed_minor) as amount from journal where account='expenses' and effective_date>=p_from group by category),
 bills as (select e.id,e.effective_date,e.category,e.payee,e.amount_minor::text as amount,
   (e.amount_minor-coalesce((select sum(j.signed_minor) from journal j where j.account='expense_payable' and
     j.id in (select x.id from public.khata_expense_events x where x.parent_id=e.id or x.reverses_id in (select y.id from public.khata_expense_events y where y.parent_id=e.id))),0))::text as due
   from public.khata_expense_events e where e.company_id=p_company and e.kind='charge' and e.method is null and e.effective_date<=p_to
   and not exists(select 1 from public.khata_expense_events r where r.reverses_id=e.id and r.effective_date<=p_to)),
 entries as (select e.id,e.effective_date,e.kind,e.category,e.payee,e.amount_minor::text as amount,e.method,e.parent_id,e.reverses_id,e.reference,e.note,
   exists(select 1 from public.khata_expense_events r where r.reverses_id=e.id) as reversed
   from public.khata_expense_events e where company_id=p_company and effective_date between p_from and p_to)
 select jsonb_build_object('balances',coalesce((select jsonb_object_agg(account,jsonb_build_object('opening',opening::text,'movement',movement::text,'closing',closing::text)) from balances),'{}'::jsonb),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('name',category,'amount',amount::text) order by category) from categories),'[]'::jsonb),
 'bills',coalesce((select jsonb_agg(to_jsonb(b) order by effective_date,id) from (select * from bills where due::numeric>0 order by effective_date,id limit 501) b),'[]'::jsonb),
 'entries',coalesce((select jsonb_agg(to_jsonb(e) order by effective_date desc,id desc) from (select * from entries order by effective_date desc,id desc limit 50 offset p_offset) e),'[]'::jsonb),
 'count',(select count(*) from entries)) into result;
 if jsonb_array_length(result->'bills')>500 then raise exception 'EXPENSE_OPEN_BILL_LIMIT'; end if;
 return result;
end $function$

