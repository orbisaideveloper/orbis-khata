-- A bill-linked receipt/payment may exceed the invoice. The existing balanced
-- party journal carries the credit/advance; do not create a second posting.
-- Retain every owner/gateway check, lock, retry payload and correction path.
do $patch$
declare definition text; old_guard text := 'if paid<0 or paid>total then raise exception ''SETTLEMENT_EXCEEDS_BILL'';end if;';
begin
 definition:=pg_get_functiondef('public.khata_workspace_v3_legacy(jsonb)'::regprocedure);
 if position(old_guard in definition)=0 then raise exception 'EXPECTED_SETTLEMENT_GUARD_MISSING';end if;
 execute replace(definition,old_guard,'if paid<0 then raise exception ''INVALID_AMOUNT'';end if;');
end $patch$;
