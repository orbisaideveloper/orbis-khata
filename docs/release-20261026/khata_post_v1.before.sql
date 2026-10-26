CREATE OR REPLACE FUNCTION public.khata_post_v1(p_id uuid, p_company uuid, p_party uuid, p_kind text, p_date date, p_amount text, p_method text, p_reference text, p_note text, p_reverses uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$

