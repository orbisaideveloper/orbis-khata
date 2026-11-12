"""Step 03 Part 1: actual SQLite storage and transaction tests, synthetic only."""
import os,sqlite3,re,sys,tempfile,pathlib,hashlib
src=pathlib.Path(sys.argv[1]).read_text()
statements=re.findall(r'String.raw`([^`]*)`',src,re.S)
if len(statements)!=9: raise AssertionError('SCHEMA_PARSE_MISMATCH')
with tempfile.TemporaryDirectory(prefix='orbis-khata-sqlite-fixture-') as td:
  path=pathlib.Path(td)/'sandbox.sqlite'
  def open_db():
    c=sqlite3.connect(str(path),isolation_level=None)
    c.execute('PRAGMA foreign_keys=ON')
    c.execute('PRAGMA journal_mode=DELETE')
    c.execute('PRAGMA synchronous=FULL')
    return c
  db=open_db()
  def migrate(c):
    c.execute('BEGIN IMMEDIATE')
    try:
      for s in statements:c.execute(s)
      c.execute('PRAGMA user_version = 1')
      c.execute('COMMIT')
    except: c.execute('ROLLBACK');raise
  migrate(db)
  assert db.execute('PRAGMA user_version').fetchone()[0]==1
  migrate(db)
  print('SQLITE_VERSIONED_MIGRATION_IDEMPOTENT: PASS')
  now='2026-11-11T05:30:00.000Z'
  actorA,actorB,companyA,companyB='owner_A','owner_B','company_A','company_B'
  db.execute('BEGIN IMMEDIATE')
  try:
    for actor in (actorA,actorB):db.execute('INSERT INTO local_accounts VALUES(?,?)',(actor,now))
    for a,c in ((actorA,companyA),(actorB,companyB)):db.execute('INSERT INTO local_companies VALUES(?,?,?)',(a,c,now))
    db.execute('COMMIT')
  except:db.execute('ROLLBACK');raise
  op='11111111-1111-4111-8111-111111111111'
  blob=b'\x00\x01'+os.urandom(32)
  values=(actorA,companyA,op,'voucher-post','a'*64,sqlite3.Binary(blob),now)
  sql='INSERT INTO local_outbox(actor_id,company_id,operation_id,command_type,payload_digest,sealed_record,created_at) VALUES(?,?,?,?,?,?,?)'
  db.execute(sql,values)
  db2=open_db()
  only=db2.execute('SELECT operation_id,typeof(sealed_record),sealed_record FROM local_outbox WHERE actor_id=? AND company_id=?',(actorA,companyA)).fetchone()
  assert only and only[1]=='blob' and only[2]==blob
  assert db2.execute('SELECT COUNT(*) FROM local_outbox WHERE actor_id=? AND company_id=?',(actorB,companyB)).fetchone()[0]==0
  assert b'financial-note-synthetic-only' not in path.read_bytes()  # no plaintext accounting payload stored
  print('SQLITE_ENCRYPTED_BLOB_STORAGE_AND_REOPEN: PASS')
  try:
    db.execute(sql,values)
    raise AssertionError('UNIQUE_CONFLICT_NOT_DETECTED')
  except sqlite3.IntegrityError: pass
  try:
    db.execute('UPDATE local_outbox SET sealed_record=? WHERE actor_id=? AND company_id=? AND operation_id=?',(sqlite3.Binary(os.urandom(32)),actorA,companyA,op))
    raise AssertionError('PAYLOAD_MUTATION_NOT_REJECTED')
  except sqlite3.IntegrityError: pass
  print('SQLITE_IDEMPOTENT_PK_AND_IMMUTABLE_PAYLOAD: PASS')
  try:
    db.execute(sql,(actorA,companyB,'22222222-2222-4222-8222-222222222222','voucher-post','a'*64,sqlite3.Binary(blob),now))
    raise AssertionError('CROSS_COMPANY_FOREIGN_KEY_NOT_DETECTED')
  except sqlite3.IntegrityError: pass
  print('SQLITE_TENANT_FK_ISOLATION: PASS')
  db.execute('BEGIN IMMEDIATE')
  try:
    db.execute(sql,(actorB,companyB,'33333333-3333-4333-8333-333333333333','voucher-post','b'*64,sqlite3.Binary(blob),now))
    raise RuntimeError('SYNTHETIC_CRASH_BEFORE_COMMIT')
  except RuntimeError:db.execute('ROLLBACK')
  assert db2.execute('SELECT COUNT(*) FROM local_outbox').fetchone()[0]==1
  print('SQLITE_TRANSACTION_ABORT_ZERO_PARTIAL_WRITES: PASS')
  db.close();db2.close()
  db3=open_db()
  assert db3.execute('SELECT COUNT(*) FROM local_outbox').fetchone()[0]==1
  assert db3.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
  assert db3.execute('PRAGMA foreign_key_check').fetchall()==[]
  db3.close()
  print('SQLITE_REOPEN_INTEGRITY_AND_FOREIGN_KEYS: PASS')
print('SYNTHETIC_ONLY: YES; NO SQLCIPHER OR REAL FINANCIAL DATA OR LIVE STORAGE')
