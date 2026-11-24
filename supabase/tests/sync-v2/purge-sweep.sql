-- Disposable fairness candidate, layered on purge-stock-order.sql.
create table orbis_khata.fixture_purge_sweep (
  singleton boolean primary key check (singleton),
  through timestamptz,
  after_time timestamptz,
  after_id uuid,
  check ((after_time is null) = (after_id is null))
);
insert into orbis_khata.fixture_purge_sweep(singleton) values (true);
revoke all on orbis_khata.fixture_purge_sweep from public,anon,authenticated;
create index fixture_purge_eligibility
  on public.khata_companies(purge_after,id) where deleted_at is not null;

do $fixture$
declare
  definition text := pg_get_functiondef('orbis_khata.purge_retired_companies()'::regprocedure);
  header text := 'declare cid uuid;n integer:=0;';
  start_loop text := $old$for cid in
  select id from public.khata_companies where deleted_at is not null and purge_after<=now()
  order by purge_after,id limit 50 loop$old$;
  finish text := $old$perform set_config('orbis.khata.purge_company','',true);return n;$old$;
  windowed text := $new$
 select * into sweep from orbis_khata.fixture_purge_sweep where singleton for update skip locked;
 if not found then return 0; end if;
 sweep.through:=coalesce(sweep.through,now());
 for candidate in
  select id,purge_after from public.khata_companies
  where deleted_at is not null and purge_after<=sweep.through
    and (sweep.after_id is null or (purge_after,id)>(sweep.after_time,sweep.after_id))
  order by purge_after,id limit 50 loop
  cid:=candidate.id;
  seen:=seen+1;
  sweep.after_time:=candidate.purge_after;
  sweep.after_id:=cid;$new$;
begin
  if strpos(definition,header)=0 or strpos(definition,start_loop)=0 or strpos(definition,finish)=0 then
    raise exception 'SYNC_PURGE_SWEEP_SOURCE_CHANGED';
  end if;
  definition:=replace(definition,header,header ||
    ' sweep orbis_khata.fixture_purge_sweep; candidate record; seen integer:=0;');
  definition:=replace(definition,start_loop,windowed);
  execute replace(definition,finish,$new$
  if seen<50 then
    sweep.through:=null; sweep.after_time:=null; sweep.after_id:=null;
  end if;
  update orbis_khata.fixture_purge_sweep set
    through=sweep.through,after_time=sweep.after_time,after_id=sweep.after_id where singleton;
  $new$ || finish);
end
$fixture$;
