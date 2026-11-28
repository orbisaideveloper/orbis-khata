-- Disposable Supabase/PostgreSQL fixture only. Run after the draft migration.
BEGIN;
SET LOCAL ROLE orbis_daily_ledger_gateway;
SELECT set_config('orbis.daily_ledger.owner', '018d0000-0000-7000-8000-000000000001', true);
INSERT INTO orbis_daily_ledger.commands
  (owner_id,operation_id,revision,effective_date,command_digest,command_body,posting_count)
VALUES ('018d0000-0000-7000-8000-000000000001',
        '018d0000-0000-7000-8000-000000000011',1,DATE '2026-11-28',
        repeat('a',64),'{"version":1,"kind":"income"}',2);
INSERT INTO orbis_daily_ledger.postings VALUES
  ('018d0000-0000-7000-8000-000000000001','018d0000-0000-7000-8000-000000000011',0,'cash',1000),
  ('018d0000-0000-7000-8000-000000000001','018d0000-0000-7000-8000-000000000011',1,'income',-1000);
SET CONSTRAINTS ALL IMMEDIATE;
DO $test$
BEGIN
  IF (SELECT count(*) FROM orbis_daily_ledger.postings) <> 2 THEN
    RAISE EXCEPTION 'Expected the complete posting pair';
  END IF;
  BEGIN
    INSERT INTO orbis_daily_ledger.commands
      (owner_id,operation_id,revision,effective_date,command_digest,command_body,posting_count)
    VALUES ('018d0000-0000-7000-8000-000000000001',
            '018d0000-0000-7000-8000-000000000012',2,DATE '2026-11-28',
            repeat('b',64),'{"version":1,"kind":"expense"}',2);
    RAISE EXCEPTION 'Incomplete command accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM orbis_daily_ledger.commands) <> 1 THEN
    RAISE EXCEPTION 'Incomplete command survived rollback';
  END IF;
END
$test$;
SELECT set_config('orbis.daily_ledger.owner', '018d0000-0000-7000-8000-000000000002', true);
DO $test$
BEGIN
  IF EXISTS(SELECT FROM orbis_daily_ledger.commands) OR EXISTS(SELECT FROM orbis_daily_ledger.postings) THEN
    RAISE EXCEPTION 'Cross-owner data visible';
  END IF;
  BEGIN
    INSERT INTO orbis_daily_ledger.commands
      (owner_id,operation_id,revision,effective_date,command_digest,command_body,posting_count)
    VALUES ('018d0000-0000-7000-8000-000000000001',
            '018d0000-0000-7000-8000-000000000012',2,DATE '2026-11-28',
            repeat('b',64),'{}',0);
    RAISE EXCEPTION 'Cross-owner insert succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$test$;
RESET ROLE;
DO $test$
BEGIN
  IF has_schema_privilege('anon', 'orbis_daily_ledger', 'USAGE')
     OR has_schema_privilege('authenticated', 'orbis_daily_ledger', 'USAGE')
     OR has_table_privilege('orbis_daily_ledger_gateway', 'orbis_daily_ledger.commands', 'UPDATE')
     OR has_table_privilege('orbis_daily_ledger_gateway', 'orbis_daily_ledger.commands', 'DELETE')
     OR has_table_privilege('orbis_daily_ledger_gateway', 'orbis_daily_ledger.postings', 'UPDATE')
     OR has_table_privilege('orbis_daily_ledger_gateway', 'orbis_daily_ledger.postings', 'DELETE') THEN
    RAISE EXCEPTION 'Unexpected direct or mutation privileges';
  END IF;
END
$test$;
ROLLBACK;
