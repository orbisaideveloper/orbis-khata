-- Khata v1: INR, owner-only, online. Immutable balanced two-line vouchers.
-- Apply only on gqyaxsczlmvppxuoqbox, after owner-authorized review.
alter table public.khata_companies drop constraint khata_companies_owner_id_key;
create index khata_companies_owner_idx on public.khata_companies(owner_id);
grant insert (id) on public.khata_companies to authenticated;

create table public.khata_parties (
  id uuid primary key,
  company_id uuid not null references public.khata_companies(id),
  name text not null check(char_length(btrim(name)) between 1 and 120),
  kind text not null check(kind in ('customer','supplier','both')),
  created_at timestamptz not null default now(),
  unique(company_id,id)
);
create index khata_parties_company_idx on public.khata_parties(company_id,created_at,id);
alter table public.khata_parties enable row level security;
alter table public.khata_parties force row level security;
revoke all on public.khata_parties from public,anon,authenticated;
grant select on public.khata_parties to authenticated;
grant insert(id,company_id,name,kind) on public.khata_parties to authenticated;
create policy khata_parties_read on public.khata_parties for select to authenticated
using(exists(select 1 from public.khata_companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy khata_parties_create on public.khata_parties for insert to authenticated
with check(exists(select 1 from public.khata_companies c where c.id=company_id and c.owner_id=(select auth.uid())));

create table public.khata_write_controls (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null
);
insert into public.khata_write_controls values(true,true);
alter table public.khata_write_controls enable row level security;
revoke all on public.khata_write_controls from public,anon,authenticated;
grant select on public.khata_write_controls to authenticated;
create policy khata_write_control_read on public.khata_write_controls for select to authenticated using(true);

create table public.khata_vouchers (
  id uuid primary key,
  company_id uuid not null references public.khata_companies(id),
  party_id uuid not null,
  kind text not null check(kind in ('sale','purchase','receipt','payment','reversal')),
  effective_date date not null,
  amount_minor numeric not null check(amount_minor=trunc(amount_minor) and amount_minor>0 and amount_minor<=999999999999),
  debit_account text not null,
  credit_account text not null,
  reference text not null default '' check(char_length(reference)<=80),
  note text not null default '' check(char_length(note)<=500),
  reverses_id uuid unique,
  actor_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique(company_id,id),
  foreign key(company_id,party_id) references public.khata_parties(company_id,id),
  foreign key(company_id,reverses_id) references public.khata_vouchers(company_id,id),
  check(debit_account in ('receivable','payable','cash','bank','sales','purchases')),
  check(credit_account in ('receivable','payable','cash','bank','sales','purchases')),
  check(debit_account<>credit_account),
  check((kind='reversal')=(reverses_id is not null)),
  check(kind='reversal' or
    (kind='sale' and debit_account='receivable' and credit_account='sales') or
    (kind='purchase' and debit_account='purchases' and credit_account='payable') or
    (kind='receipt' and debit_account in ('cash','bank') and credit_account='receivable') or
    (kind='payment' and debit_account='payable' and credit_account in ('cash','bank')))
);
create index khata_vouchers_company_date_idx on public.khata_vouchers(company_id,effective_date,created_at,id);
create index khata_vouchers_party_idx on public.khata_vouchers(company_id,party_id,effective_date);
create index khata_vouchers_actor_idx on public.khata_vouchers(actor_id);
alter table public.khata_vouchers enable row level security;
alter table public.khata_vouchers force row level security;
revoke all on public.khata_vouchers from public,anon,authenticated;
grant select on public.khata_vouchers to authenticated;
grant insert(id,company_id,party_id,kind,effective_date,amount_minor,debit_account,credit_account,reference,note,reverses_id)
on public.khata_vouchers to authenticated;
create policy khata_vouchers_read on public.khata_vouchers for select to authenticated
using(exists(select 1 from public.khata_companies c where c.id=company_id and c.owner_id=(select auth.uid())));
create policy khata_vouchers_create on public.khata_vouchers for insert to authenticated
with check(actor_id=(select auth.uid()) and exists(select 1 from public.khata_companies c where c.id=company_id and c.owner_id=(select auth.uid())));

create function public.khata_validate_voucher() returns trigger language plpgsql security invoker set search_path='' as $$
declare original public.khata_vouchers; party_kind text;
begin
  if TG_OP<>'INSERT' then raise exception 'IMMUTABLE_VOUCHER'; end if;
  if not coalesce((select enabled from public.khata_write_controls where singleton),false) then
    raise exception 'WRITES_DISABLED'; end if;
  if new.effective_date > (now() at time zone 'Asia/Kolkata')::date then raise exception 'FUTURE_DATE'; end if;
  select kind into party_kind from public.khata_parties where id=new.party_id and company_id=new.company_id;
  if party_kind is null then raise exception 'PARTY_NOT_ACCESSIBLE'; end if;
  if new.kind in ('sale','receipt') and party_kind='supplier' then raise exception 'CUSTOMER_REQUIRED'; end if;
  if new.kind in ('purchase','payment') and party_kind='customer' then raise exception 'SUPPLIER_REQUIRED'; end if;
  if new.kind='reversal' then
    select * into original from public.khata_vouchers where id=new.reverses_id and company_id=new.company_id;
    if original.id is null or original.kind='reversal' or new.party_id<>original.party_id or
       new.amount_minor<>original.amount_minor or new.debit_account<>original.credit_account or
       new.credit_account<>original.debit_account or new.effective_date<original.effective_date or
       char_length(btrim(new.note))=0 then raise exception 'INVALID_REVERSAL'; end if;
  end if;
  return new;
end $$;
revoke all on function public.khata_validate_voucher() from public,anon,authenticated;
create trigger khata_voucher_validate before insert or update or delete on public.khata_vouchers
for each row execute function public.khata_validate_voucher();

create view public.khata_journal with(security_invoker=true) as
select id as voucher_id,company_id,party_id,effective_date,created_at,debit_account as account,amount_minor as signed_minor from public.khata_vouchers
union all
select id,company_id,party_id,effective_date,created_at,credit_account,-amount_minor from public.khata_vouchers;
revoke all on public.khata_journal from public,anon,authenticated;
grant select on public.khata_journal to authenticated;

create function public.khata_post_v1(p_id uuid,p_company uuid,p_party uuid,p_kind text,p_date date,p_amount text,p_method text,p_reference text,p_note text,p_reverses uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare dr text; cr text; amt numeric; original public.khata_vouchers; existing public.khata_vouchers;
begin
  if auth.uid() is null or not exists(select 1 from public.khata_companies where id=p_company and owner_id=auth.uid()) then
    raise exception 'COMPANY_NOT_ACCESSIBLE'; end if;
  if p_amount is null or p_amount !~ '^[0-9]{1,12}$' then raise exception 'INVALID_AMOUNT'; end if;
  amt:=p_amount::numeric;
  case p_kind
    when 'sale' then dr:='receivable'; cr:='sales';
    when 'purchase' then dr:='purchases'; cr:='payable';
    when 'receipt' then dr:=p_method; cr:='receivable';
    when 'payment' then dr:='payable'; cr:=p_method;
    when 'reversal' then
      select * into original from public.khata_vouchers where id=p_reverses and company_id=p_company;
      if original.id is null then raise exception 'INVALID_REVERSAL'; end if;
      dr:=original.credit_account; cr:=original.debit_account;
    else raise exception 'INVALID_KIND';
  end case;
  -- Same ID + exact payload is a retry; a changed payload is a conflict, never an overwrite.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into existing from public.khata_vouchers where id=p_id;
  if existing.id is not null then
    if (existing.company_id,existing.party_id,existing.kind,existing.effective_date,existing.amount_minor,
        existing.debit_account,existing.credit_account,existing.reference,existing.note,existing.reverses_id)
       is distinct from (p_company,p_party,p_kind,p_date,amt,dr,cr,p_reference,p_note,p_reverses) then
      raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.id;
  end if;
  insert into public.khata_vouchers(id,company_id,party_id,kind,effective_date,amount_minor,debit_account,credit_account,reference,note,reverses_id)
  values(p_id,p_company,p_party,p_kind,p_date,amt,dr,cr,p_reference,p_note,p_reverses);
  return p_id;
end $$;
revoke all on function public.khata_post_v1(uuid,uuid,uuid,text,date,text,text,text,text,uuid) from public,anon;
grant execute on function public.khata_post_v1(uuid,uuid,uuid,text,date,text,text,text,text,uuid) to authenticated;

create function public.khata_report_v1(p_company uuid,p_from date,p_to date,p_party uuid default null,p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.khata_companies where id=p_company and owner_id=auth.uid()) then raise exception 'COMPANY_NOT_ACCESSIBLE'; end if;
  if p_from is null or p_to is null or p_from>p_to or p_offset<0 then raise exception 'INVALID_PERIOD'; end if;
  if p_party is not null and not exists(select 1 from public.khata_parties where id=p_party and company_id=p_company) then raise exception 'PARTY_NOT_ACCESSIBLE'; end if;
  with journal as (
    select * from public.khata_journal where company_id=p_company and effective_date<=p_to
  ), balances as (
    select account,sum(signed_minor) as closing,
      coalesce(sum(signed_minor) filter(where effective_date>=p_from),0) as movement,
      coalesce(sum(signed_minor) filter(where effective_date<p_from),0) as opening
    from journal group by account
  ), ledger_balances as (
    select account,coalesce(sum(signed_minor) filter(where effective_date<p_from),0) as opening,
      sum(signed_minor) as closing
    from journal where p_party is null or party_id=p_party group by account
  ), parties as (
    select p.id,p.name,p.kind,
      coalesce(sum(j.signed_minor) filter(where j.account='receivable'),0) as receivable,
      -coalesce(sum(j.signed_minor) filter(where j.account='payable'),0) as payable
    from public.khata_parties p left join journal j on j.party_id=p.id
    where p.company_id=p_company group by p.id
  ), entries as (
    select v.*,p.name as party_name,
      exists(select 1 from public.khata_vouchers r where r.reverses_id=v.id) as reversed
    from public.khata_vouchers v join public.khata_parties p on p.id=v.party_id and p.company_id=v.company_id
    where v.company_id=p_company and v.effective_date between p_from and p_to and (p_party is null or v.party_id=p_party)
  ) select jsonb_build_object(
    'balances',coalesce((select jsonb_object_agg(account,jsonb_build_object('closing',closing::text,'movement',movement::text,'opening',opening::text)) from balances),'{}'::jsonb),
    'ledger_balances',coalesce((select jsonb_object_agg(account,jsonb_build_object('opening',opening::text,'closing',closing::text)) from ledger_balances),'{}'::jsonb),
    'parties',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind,'receivable',receivable::text,'payable',payable::text) order by name,id) from parties),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(to_jsonb(e)-'amount_minor'||jsonb_build_object('amount_minor',e.amount_minor::text) order by effective_date desc,created_at desc,id desc)
      from (select * from entries order by effective_date desc,created_at desc,id desc limit 50 offset p_offset) e),'[]'::jsonb),
    'count',(select count(*) from entries), 'as_of',now()
  ) into result;
  return result;
end $$;
revoke all on function public.khata_report_v1(uuid,date,date,uuid,integer) from public,anon;
grant execute on function public.khata_report_v1(uuid,date,date,uuid,integer) to authenticated;
