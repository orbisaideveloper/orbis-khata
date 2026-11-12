/**
 * Step 03 / Part 1: versioned, offline-only SQLite schema.
 * Schema is deliberately restricted to opaque identity IDs and encrypted BLOBs.
 * Do not open or populate this with real financial data until Android SQLCipher
 * and platform key protection have passed Part 2. Not wired into live Khata.
 */
export const KHATA_LOCAL_SQLITE_VERSION = 1 as const

export const KHATA_LOCAL_SQLITE_V1 = [
  String.raw`CREATE TABLE IF NOT EXISTS local_accounts (
    actor_id TEXT PRIMARY KEY NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 128),
    created_at TEXT NOT NULL
  )`,
  String.raw`CREATE TABLE IF NOT EXISTS local_companies (
    actor_id TEXT NOT NULL,
    company_id TEXT NOT NULL CHECK(length(company_id) BETWEEN 1 AND 128),
    created_at TEXT NOT NULL,
    PRIMARY KEY(actor_id,company_id),
    FOREIGN KEY(actor_id) REFERENCES local_accounts(actor_id) ON DELETE RESTRICT
  )`,
  String.raw`CREATE TABLE IF NOT EXISTS local_outbox (
    actor_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    operation_id TEXT NOT NULL CHECK(length(operation_id)=36),
    command_type TEXT NOT NULL CHECK(length(command_type) BETWEEN 1 AND 64),
    payload_digest TEXT NOT NULL CHECK(length(payload_digest)=64),
    sealed_record BLOB NOT NULL CHECK(typeof(sealed_record)='blob' AND length(sealed_record)>=17),
    state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','conflict','rejected','synced')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 1000000),
    server_cursor TEXT,
    last_reason TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY(actor_id,company_id,operation_id),
    FOREIGN KEY(actor_id,company_id) REFERENCES local_companies(actor_id,company_id) ON DELETE RESTRICT,
    CHECK(state != 'synced' OR server_cursor IS NOT NULL)
  )`,
  String.raw`CREATE TRIGGER IF NOT EXISTS local_outbox_immutable
    BEFORE UPDATE OF actor_id,company_id,operation_id,command_type,payload_digest,sealed_record,created_at ON local_outbox
    BEGIN SELECT RAISE(ABORT,'OUTBOX_PAYLOAD_IMMUTABLE'); END`,
  String.raw`CREATE TABLE IF NOT EXISTS local_snapshots (
    actor_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    object_type TEXT NOT NULL CHECK(length(object_type) BETWEEN 1 AND 64),
    object_id TEXT NOT NULL CHECK(length(object_id) BETWEEN 1 AND 128),
    server_version TEXT NOT NULL CHECK(length(server_version) BETWEEN 1 AND 128),
    sealed_record BLOB NOT NULL CHECK(typeof(sealed_record)='blob' AND length(sealed_record)>=17),
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0,1)),
    PRIMARY KEY(actor_id,company_id,object_type,object_id),
    FOREIGN KEY(actor_id,company_id) REFERENCES local_companies(actor_id,company_id) ON DELETE RESTRICT
  )`,
  String.raw`CREATE TABLE IF NOT EXISTS local_inbox (
    actor_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    server_seq INTEGER NOT NULL CHECK(server_seq >= 1),
    event_id TEXT NOT NULL CHECK(length(event_id) BETWEEN 1 AND 128),
    sealed_change BLOB NOT NULL CHECK(typeof(sealed_change)='blob' AND length(sealed_change)>=17),
    PRIMARY KEY(actor_id,company_id,server_seq),
    UNIQUE(actor_id,company_id,event_id),
    FOREIGN KEY(actor_id,company_id) REFERENCES local_companies(actor_id,company_id) ON DELETE RESTRICT
  )`,
  String.raw`CREATE TABLE IF NOT EXISTS local_cursors (
    actor_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    last_server_seq INTEGER NOT NULL DEFAULT 0 CHECK(last_server_seq >= 0),
    PRIMARY KEY(actor_id,company_id),
    FOREIGN KEY(actor_id,company_id) REFERENCES local_companies(actor_id,company_id) ON DELETE RESTRICT
  )`,
  String.raw`CREATE INDEX IF NOT EXISTS idx_local_outbox_pending ON local_outbox(actor_id,company_id,state,created_at,operation_id)`,
  String.raw`CREATE INDEX IF NOT EXISTS idx_local_snapshots_scope ON local_snapshots(actor_id,company_id,object_type)`,
] as const
