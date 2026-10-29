-- Preserve the existing correction transaction; disambiguate its table columns
-- from the legacy PL/pgSQL variable named kind.
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('public.khata_workspace_v3_legacy(jsonb)'::regprocedure);
 if position('from public.khata_expense_events e where company_id=cid and parent_id=target and kind=''payment''' in definition)=0 then raise exception 'EXPECTED_EXPENSE_CORRECTION_QUERY_MISSING';end if;
 execute replace(definition,'from public.khata_expense_events e where company_id=cid and parent_id=target and kind=''payment''','from public.khata_expense_events e where e.company_id=cid and e.parent_id=target and e.kind=''payment''');
end $patch$;
