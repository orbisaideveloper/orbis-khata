-- REVIEW ONLY: activate together with matching gateway after owner review.
alter table public.khata_parties drop constraint khata_parties_kind_check;
alter table public.khata_parties add constraint khata_parties_kind_check check(kind in ('customer','supplier','both','expense'));
create function orbis_khata.reject_expense_trade() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.khata_parties where id=new.party_id and company_id=new.company_id and kind='expense') then
  raise exception 'EXPENSE_PARTY_REQUIRES_EXPENSE_ENTRY' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function orbis_khata.reject_expense_trade() from public,anon,authenticated;
create trigger khata_reject_expense_trade before insert on public.khata_vouchers for each row execute function orbis_khata.reject_expense_trade();
