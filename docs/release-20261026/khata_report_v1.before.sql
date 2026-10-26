CREATE OR REPLACE FUNCTION public.khata_report_v1(p_company uuid, p_from date, p_to date, p_party uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
end $function$

