-- Independent fixtures only; everything rolls back. No Foundation table access.
begin;
do $test$
declare owner uuid:=gen_random_uuid();operation uuid:=gen_random_uuid();loaded jsonb;answer jsonb;request jsonb:='{"method":"createOrganization","payload":{"name":"Fixture"}}';
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);
 begin
  perform public.khata_lottery_store_v1('{"action":"load"}');raise exception 'UNVERIFIED_GATEWAY_ALLOWED';
 exception when others then if sqlerrm<>'LOTTERY_ACCESS_DENIED' then raise;end if;end;
 perform set_config('orbis.khata.gateway_verified','v1',true);
 loaded:=public.khata_lottery_store_v1(jsonb_build_object('action','load','operationId',operation,'request',request));
 if loaded->'state'<>'{}'::jsonb or loaded->>'version'<>'0' then raise exception 'INITIAL_STATE_INVALID';end if;
 answer:=public.khata_lottery_store_v1(jsonb_build_object('action','commit','version',0,'operationId',operation,'request',request,'state','{"fixture":[]}'::jsonb,'result','{"id":"fixture"}'::jsonb));
 if answer->>'id'<>'fixture' then raise exception 'COMMIT_FAILED';end if;
 loaded:=public.khata_lottery_store_v1(jsonb_build_object('action','load','operationId',operation,'request',request));
 if loaded->>'replay'<>'true' or loaded->'result'<>answer then raise exception 'RETRY_FAILED';end if;
 begin
  perform public.khata_lottery_store_v1(jsonb_build_object('action','load','operationId',operation,'request','{}'::jsonb));raise exception 'CHANGED_RETRY_ALLOWED';
 exception when others then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise;end if;end;
 begin
  perform public.khata_lottery_store_v1('{"action":"commit","version":0,"state":{}}');raise exception 'STALE_COMMIT_ALLOWED';
 exception when others then if sqlerrm<>'LOTTERY_VERSION_CONFLICT' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 loaded:=public.khata_lottery_store_v1('{"action":"load"}');
 if loaded->'state'<>'{}'::jsonb then raise exception 'OWNER_STATE_LEAKED';end if;
end $test$;
rollback;
