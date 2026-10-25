-- Expense subledger. Apply once through a managed migration, after source review.
-- No existing company, party or voucher is rewritten.
create table public.khata_expense_events (
 id uuid primary key,
 company_id uuid not null references public.khata_companies(id),
 effective_date date not null,
 kind text not null check(kind in ('charge','payment','reversal')),
 amount_minor numeric not null check(amount_minor=trunc(amount_minor) and amount_minor>0 and amount_minor<=999999999999),
 category text not null check(char_length(category) between 1 and 80),
 payee text not null check(char_length(payee)<=120),
 method text check(method in ('cash','bank')),
 parent_id uuid,
 reverses_id uuid unique,
 reference text not null check(char_length(reference)<=80),
 note text not null check(char_length(note)<=500),
 actor_id uuid not null references orbis_khata.ledger_owners(id),
 payload jsonb not null,
 created_at timestamptz not null default now(),
 unique(company_id,id),
 foreign key(company_id,parent_id) references public.khata_expense_events(company_id,id),
 foreign key(company_id,reverses_id) references public.khata_expense_events(company_id,id)
);
create index khata_expenses_period_idx on public.khata_expense_events(company_id,effective_date,id);
create index khata_expenses_parent_idx on public.khata_expense_events(company_id,parent_id);
alter table public.khata_expense_events enable row level security;
alter table public.khata_expense_events force row level security;
revoke all on public.khata_expense_events from public,anon,authenticated;
grant select on public.khata_expense_events to authenticated;
create policy expense_owner_gateway_read on public.khata_expense_events for select to authenticated
 using(current_setting('orbis.khata.gateway_verified',true)='v1' and exists(
 select 1 from public.khata_companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create function public.khata_expense_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_EXPENSE'; end $$;
revoke all on function public.khata_expense_immutable() from public,anon,authenticated;
create trigger expense_immutable before update or delete on public.khata_expense_events
for each row execute function public.khata_expense_immutable();

create function public.khata_expense_post_v1(p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
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
end $$;
revoke all on function public.khata_expense_post_v1(jsonb) from public,anon;
grant execute on function public.khata_expense_post_v1(jsonb) to authenticated;

create view public.khata_expense_journal with(security_invoker=true) as
with events as (
 select e.company_id,e.id,e.effective_date,e.category,e.amount_minor,
   coalesce(o.kind,e.kind) as base_kind,coalesce(o.method,e.method) as method,
   case when e.kind='reversal' then -1 else 1 end as sign
 from public.khata_expense_events e left join public.khata_expense_events o on o.id=e.reverses_id and o.company_id=e.company_id
)
select company_id,id,effective_date,category,
 case when base_kind='charge' then 'expenses' else 'expense_payable' end as account,amount_minor*sign as signed_minor from events
union all
select company_id,id,effective_date,category,
 case when base_kind='charge' then coalesce(method,'expense_payable') else method end,-amount_minor*sign from events;
revoke all on public.khata_expense_journal from public,anon;
grant select on public.khata_expense_journal to authenticated;

create function public.khata_expense_report_v1(p_company uuid,p_from date,p_to date,p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
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
end $$;
revoke all on function public.khata_expense_report_v1(uuid,date,date,integer) from public,anon;
grant execute on function public.khata_expense_report_v1(uuid,date,date,integer) to authenticated;

-- Extend the existing journal so existing cash/bank balances and trial balance
-- incorporate expenses without counting them twice in the main party ledger.
create or replace view public.khata_journal with(security_invoker=true) as
select id as voucher_id,company_id,party_id,effective_date,created_at,debit_account as account,amount_minor as signed_minor from public.khata_vouchers
union all select id,company_id,party_id,effective_date,created_at,credit_account,-amount_minor from public.khata_vouchers
union all select j.id,j.company_id,null::uuid,j.effective_date,e.created_at,j.account,j.signed_minor
from public.khata_expense_journal j join public.khata_expense_events e on e.id=j.id and e.company_id=j.company_id;
