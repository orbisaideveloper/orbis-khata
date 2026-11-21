# Customer statements on Android and web

Review candidate; not deployed. Existing Lottery sharing remains compatible.
New device-delivered shares are created in Customer view → Share my account →
Choose account → one Khata/Lottery party → recipient ORBIS ID. The recipient
accepts in Customer view. This grants read-only access, never financial posting.

## Delivery and storage

- Owner books remain authoritative on their existing device/backend. Only the
  chosen party's journal projection crosses the new sharing boundary. No company
  export is sent to the recipient. Khata keeps receivable/payable/expense payable
  separate; opening entries, explicit reversals, corrections and removed rows
  are included. Legacy expense-payee names must be unique before sharing.
- One outstanding version per share; changed row IDs are upserted and deleted IDs
  are tombstoned. No new delta overwrites an undelivered version. A reset is used
  on first delivery, lost publisher baseline, expiry or explicit recovery.
- Recipient commits the merged copy to encrypted Android SQLCipher/hardware
  storage, or encrypted IndexedDB on web, BEFORE acknowledging delivery. The ACK
  deletes only the delivered mailbox version. Replayed ACKs cannot erase a newer
  version. Failed/uncertain storage never produces a successful ACK.
- Exact UUID scope, verified central identity, recipient consent, database row
  locks/CAS, RLS and denied direct table access protect the transport. Existing approved Lottery links copy only their permission/routing metadata
  into the relay. Financial records are not copied or deleted. New Khata links
  use the same relay.
- Server retains only routing/permission/version metadata after delivery.
  Undelivered data expires after 30 days; hourly Cron and request-time expiry mark
  it for a fresh reset. Original financial tables, operation histories and backups
  are not deleted. PostgreSQL reuses deleted space; its allocated file size does
  not have to shrink immediately after an ACK.
- Current protective bounds: 100 links per owner/recipient, 5,000 projected rows
  per party, 750 KB serialized patch, 16 MB outstanding mailbox data per owner.
  Oversized/ambiguous projections fail explicitly, never truncate balances.
- Foreground/reconnect/visibility and 60-second foreground polling share one
  in-flight exchange per identity. Acknowledged unchanged statements require no
  further download or local rewrite. Killed Android apps do not receive a promised
  background sync. Sender must open the app online to publish local changes;
  recipient can then receive even after the sender goes offline.
- Cached copies show last-received time. Offline copies can be stale; closing a
  link stops future delivery and clears the active cache after next contact, but
  cannot recall an exported file, backup or another offline copy.
- Lost phone/cache: Request full statement again. Owner's next online exchange
  republishes a baseline. This is not an independent cloud backup; if both phones
  lose their only source copies, the relay cannot reconstruct erased history.

## Deployment and verification

1. Review local diff and approve push. Full CI, Sonar and Android candidate follow.
2. Separately approve/apply `20261121182053_customer_statement_relay.sql` to Khata.
3. Deploy updated `orbis-khata-data`; no new token or provider secret required.
4. Deploy web assets and install a new Android candidate. Existing installed APK
   cannot acquire native UI changes from a web deploy alone.
5. Test two synthetic identities: invite/accept, initial receipt, offline reopen,
   correction/deletion, storage failure, lost ACK, revoke, resync and restart.
   Confirm mailbox payload is gone only after recipient's durable save and ACK.

Rollback: revert frontend/Edge to prior version, unschedule
`orbis-statement-relay-cleanup` if enabled, retain isolated transport tables for
inspection. Never delete or reverse financial records for this rollout.

Local proof: `node scripts/verify-statement-relay.mjs`, full migration-chain
fixture, changed-area unit/UI/native persistence tests, strict Deno and build.
`verify-statement-relay-concurrency.mjs` is guarded to the disposable localhost
CI database: 32 publishers/receivers, repeated ACKs and old-ACK/new-publish race.
It requires native PostgreSQL and is not represented by PGlite tests.

## Browser fixture correction after relay release

Quality run 44937721041 on 1f09f7f passed SQL, native 32-client relay
concurrency and 1,344 unit tests, then failed browser smoke because the old
account mock rejected the foreground `customer-relay` list request. Other
scenario mocks also needed to isolate that new background request.

Unrelated browser scenarios now share an authenticated empty-inbox fixture.
It accepts only the dedicated path, exact version and read-only list action;
unexpected relay mutations still fail. Existing accounting assertions remain.
The dedicated stateful relay scenario inspects the committed encrypted browser
record when ACK arrives and checks saved data after a reload with the relay
unavailable. It is browser/fixture evidence, not production or native-phone
acceptance. Local Chromium launch remains environment-blocked; CI runs both
mobile and desktop scenarios. This test-only correction needs no migration,
Edge redeployment or replacement Android APK.

The same pre-push review cleared seven additional local SonarJS findings in
relay client/source and tests: explicit condition blocks, standalone sorting
and unnested sign/test selection. Calculations and transport behavior are
unchanged; these frontend/test-only corrections require no Edge deployment.

### Subsequent cloud Sonar findings

Quality44939867054 on e32b866 passed all64 browser cases and the earlier SQL,
native concurrency and unit checks. It then failed on three cloud Sonar rules:
S9011 implicit submit button, and S6671 nullable IndexedDB rejection reasons.
Use explicit submit/button types and wrap request/transaction failures in Error
objects with the original cause, including null native errors. Read/write/abort
failures still reject; no successful save or ACK is invented. This is frontend
code only; no migration or Edge redeployment is required.
