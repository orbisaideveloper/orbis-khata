BEGIN;
CREATE ROLE orbis_daily_ledger_gateway NOLOGIN NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA orbis_daily_ledger;
REVOKE ALL ON SCHEMA orbis_daily_ledger FROM PUBLIC, anon, authenticated;
CREATE TABLE orbis_daily_ledger.commands (
  owner_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  effective_date date NOT NULL,
  command_digest text NOT NULL CHECK (command_digest ~ '^[0-9a-f]{64}$'),
  command_body jsonb NOT NULL CHECK (jsonb_typeof(command_body) = 'object'),
  reverses_operation_id uuid,
  posting_count smallint NOT NULL CHECK (posting_count IN (0, 2)),
  received_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (owner_id, operation_id),
  UNIQUE (owner_id, revision),
  UNIQUE (owner_id, reverses_operation_id),
  FOREIGN KEY (owner_id, reverses_operation_id)
    REFERENCES orbis_daily_ledger.commands (owner_id, operation_id),
  CHECK (reverses_operation_id IS DISTINCT FROM operation_id)
);
CREATE TABLE orbis_daily_ledger.postings (
  owner_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  slot smallint NOT NULL CHECK (slot IN (0, 1)),
  account text NOT NULL CHECK (account IN
    ('cash', 'bank', 'income', 'expense', 'receivable', 'payable', 'openingEquity')),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN -999999999999 AND 999999999999 AND amount_minor <> 0),
  PRIMARY KEY (owner_id, operation_id, slot),
  UNIQUE (owner_id, operation_id, account),
  FOREIGN KEY (owner_id, operation_id)
    REFERENCES orbis_daily_ledger.commands (owner_id, operation_id)
);
ALTER TABLE orbis_daily_ledger.commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbis_daily_ledger.commands FORCE ROW LEVEL SECURITY;
ALTER TABLE orbis_daily_ledger.postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbis_daily_ledger.postings FORCE ROW LEVEL SECURITY;
CREATE POLICY daily_commands_select ON orbis_daily_ledger.commands
  FOR SELECT TO orbis_daily_ledger_gateway
  USING (owner_id = nullif(current_setting('orbis.daily_ledger.owner', true), '')::uuid);
CREATE POLICY daily_commands_insert ON orbis_daily_ledger.commands
  FOR INSERT TO orbis_daily_ledger_gateway
  WITH CHECK (owner_id = nullif(current_setting('orbis.daily_ledger.owner', true), '')::uuid);
CREATE POLICY daily_postings_select ON orbis_daily_ledger.postings
  FOR SELECT TO orbis_daily_ledger_gateway
  USING (owner_id = nullif(current_setting('orbis.daily_ledger.owner', true), '')::uuid);
CREATE POLICY daily_postings_insert ON orbis_daily_ledger.postings
  FOR INSERT TO orbis_daily_ledger_gateway
  WITH CHECK (owner_id = nullif(current_setting('orbis.daily_ledger.owner', true), '')::uuid);
CREATE FUNCTION orbis_daily_ledger.check_postings()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $check$
DECLARE
  expected_count smallint;
  actual_count bigint;
  total numeric;
BEGIN
  SELECT c.posting_count INTO STRICT expected_count
    FROM orbis_daily_ledger.commands AS c
    WHERE c.owner_id = NEW.owner_id AND c.operation_id = NEW.operation_id;
  SELECT count(*), coalesce(sum(p.amount_minor), 0)
    INTO actual_count, total
    FROM orbis_daily_ledger.postings AS p
    WHERE p.owner_id = NEW.owner_id AND p.operation_id = NEW.operation_id;
  IF expected_count <> actual_count OR total <> 0 THEN
    RAISE EXCEPTION 'Daily Ledger postings do not match their command' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$check$;
REVOKE ALL ON FUNCTION orbis_daily_ledger.check_postings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA orbis_daily_ledger FROM PUBLIC, anon, authenticated;
CREATE CONSTRAINT TRIGGER daily_command_balance
  AFTER INSERT ON orbis_daily_ledger.commands
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION orbis_daily_ledger.check_postings();
CREATE CONSTRAINT TRIGGER daily_posting_balance
  AFTER INSERT ON orbis_daily_ledger.postings
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION orbis_daily_ledger.check_postings();
GRANT USAGE ON SCHEMA orbis_daily_ledger TO orbis_daily_ledger_gateway;
GRANT SELECT, INSERT ON orbis_daily_ledger.commands,
  orbis_daily_ledger.postings TO orbis_daily_ledger_gateway;
GRANT EXECUTE ON FUNCTION orbis_daily_ledger.check_postings() TO orbis_daily_ledger_gateway;
-- No membership grant here. Bind only a dedicated trusted server login in a
-- later reviewed environment setup, never a browser or PostgREST login role.
COMMIT;
