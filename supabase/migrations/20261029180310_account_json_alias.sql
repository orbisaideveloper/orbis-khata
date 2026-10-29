-- Qualify JSON account values so nested journal.account text cannot shadow them.
do $migration$
declare definition text; old_block text; new_block text; start_at integer; end_at integer;
begin
 definition:=pg_get_functiondef('public.khata_workspace_v3_legacy(jsonb)'::regprocedure);
 start_at:=strpos(definition,' if a=''accounts'' then');
 end_at:=strpos(definition,' if a=''detail'' then');
 if start_at=0 or end_at<=start_at then raise exception 'ACCOUNT_BLOCK_NOT_FOUND';end if;
 old_block:=substring(definition from start_at for end_at-start_at);
 new_block:=replace(replace(old_block,'account->>','acct.value->>'),'jsonb_array_elements(s->''accounts'') account','jsonb_array_elements(s->''accounts'') as acct(value)');
 if old_block=new_block then raise exception 'ACCOUNT_ALIAS_ALREADY_CHANGED';end if;
 execute replace(definition,old_block,new_block);
end $migration$;
