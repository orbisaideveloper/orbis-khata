# Unified Sync v2 writer integration register

**2026-11-25 — Phase 2B/2E capture-safety checkpoint (NOT COMPLETE / NOT DEPLOYED).**
Disposable company legacy trigger candidates and the unapplied Lottery private migration now reject an accepted *financial* mutation when a previously enrolled scope can no longer emit a feed event (retired/disconnected binding). The guard retains the existing eligible company purge authority and its irreversible tombstone, permits unrelated unenrolled legacy businesses, and preserves operation-ID retry semantics. New isolated PGlite tests reproduce the old silent-accept bug and exercise the production Lottery migration sequence. These tests do **not** prove full Phase 2B or 2E: company trigger candidates remain under `supabase/tests/sync-v2/`, not an authorized production migration; many v1 RPC/trigger/cron and all-domain command adapters lack full native PostgreSQL negative/concurrency and actual app receipt/feed acceptance. Keep `sync_v2` activation OFF; review full 2B/2E writer coverage before any migration/deployment.

Frozen contract: <https://docs.google.com/document/d/1rp84i2Cw3AJKvbBAuYL6G8pebelqrdckR2SBwElC33g/edit>.

**Phase 2A source-backed complete current-route catalog and read-only LIVE metadata:** [Phase 2A Acceptance & Identity/Writer Matrix](UNIFIED_SYNC_V2_PHASE2A_ACCEPTANCE.md), validated by `tests/sync-v2/phase2a-coverage.test.ts`. This documents ingress and release blockers; it does not mean 2B/2E runtime adapters or production Sync are ready. Earlier chronological sections below remain historical.
Recovered baseline: `ef05e137876b5552978b4bb8f8bc8112eaf87505`.
Integration baseline: GitHub main `4f297dcc3f8069cc733fb6f839200129337b1f49`.
Entries below identify integration boundaries. Each still requires an end-to-end test against its real domain writer.

| Writer | Scope | Identity and feed obligation |
| --- | --- | --- |
| Gateway create company and workspace retirement/restore | Account catalog and affected company | Preserve company ID, fence lifecycle, emit catalog and company changes together |
| `khata_post_v1` and workspace payments/settlement | Company | Preserve voucher ID, payment links and reversals |
| Workspace invoice save and production route | Company | Bind invoice, settlement and production child IDs, reserve final invoice number on server |
| Expense bill, profiles and expense post | Company | Capture bill lines, scheduled postings and linked payments |
| Master save/delete | Company | Capture party/item changes and deletion markers |
| Inventory post and production purchase reversal trigger | Company | Capture stock documents, movement and derived reversal in the original transaction |
| Workspace settings and fiscal updates | Company | Version settings and allocate sequence changes on server |
| `khata_lottery_store_v2` | Lottery organization | Preserve operation, seller and stockist record IDs, PWD, commission, settlement, corrections and reversals |
| Scheduled `orbis_khata.purge_retired_companies` | Account catalog and company | Capture durable scope tombstone in purge transaction, respecting stock/company lock order |
| Customer relay, sharing and Drive recovery | Separate authorization boundaries | Keep delivery/recovery records out of accounting feed; verify existing scopes remain isolated |

Android legacy `android-local-draft` does not prove identities of generated invoice children.
Preserve encrypted original records and hold ambiguous operations and dependants for review.
PWA sessionStorage drafts and Lottery seller working rows require explicit import coverage.
Receipt lookup on restore must use stable operation identity and the current authorized scope epoch.

The isolated SQL fixture exercises a minimal company scope with a serialized counter, receipt and purge fence.
Before creating a production migration, map all legacy writers to transaction-level capture, establish the lock hierarchy and test the real company purge with dependent rows and rollback. The fixture is deliberately outside the migrations directory.

## Verified integration slice

The local voucher entry reuses the Central session verifier and the v1 voucher
payload validator before calling the v2 transaction. Native PostgreSQL tests
use a synthetic Central response and a private synthetic registration table.
The existing ORBIS principal mapping, voucher writer and purge function execute
in the disposable database.

The existing invoice RPC persists a generated payment ID in its result and the
generated production input ID in `khata_production_routes.input_id`. The
production regression test now checks both after replaying the same paid routed
purchase. A voucher-only Sync gateway cannot accept invoices. An invoice
adapter must bind the server's persisted lineage to local identities and capture
all resulting rows atomically before admitting the operation. Old unmatched
child records remain review-only.

Account catalog, settings, master writes, invoice/expenses, stock/production,
and Lottery/PWD/stockist/commission remain blocked for v2 posting until their
feed and receipt contracts have integration tests. The current application
routes continue to operate independently. Production device possession and
entitlement policy still need verification before wiring the gateway.

## Voucher capture and mixed-version acceptance

The disposable `voucher-capture.sql` AFTER INSERT trigger is the sole emitter
for voucher rows in an enrolled company. It records the complete voucher as
SQL JSON text, the immutable voucher ID and its scope/epoch sequence. The v2
receipt references that existing event by voucher ID. A legacy retry returning
an existing row does not allocate a sequence. Rollback removes the counter
increment, mapping, feed and receipt together. A purge retains the capture
mapping and appends the existing scope tombstone. There is no payload-based
matching or client-supplied trigger bypass.

The v2 voucher adapter authorizes ownership and device first, then takes the
existing stock advisory lock and rechecks the active company under a row lock.
The disposable direct voucher candidate takes stock before the voucher ID, so
the reversal trigger cannot acquire stock in reverse order. Native tests verify
both winner orders for a same-ID legacy/v2 reversal and adoption into exactly
one feed event and one receipt. The adapter retries a rolled-back PostgreSQL
deadlock or serialization failure up to three total attempts. Unknown outcomes
remain eligible for caller replay with the original operation ID.

The disposable paid routed purchase finalizer captures invoice and payment
lineage, production input, stock movements, fiscal rows and the receipt. Its
legacy invoice path still lacks a verified complete capture. Correction captures
both reversal vouchers in one group, with the exact derived stock reversals on
the invoice reversal event. The isolated production output trigger captures the
legacy production post, inventory document and movements once across replay.
Production input outside the purchase route, independent payment links and
full correction receipts, expenses, generalized inventory, Lottery and catalog
writes remain open. Tests are in `scripts/verify-sync-v2-khata.mjs` and
`scripts/verify-production.mjs`.

The preserved checkpoint reproduced `40P01` when the invoice took the company
row first and retirement took stock first. The isolated replacement takes
stock before the company row. PostgreSQL tests exercise both winner orders
through the existing retirement RPC and verify the original operation can
produce exactly one payment, input and receipt. The disposable purge candidate
tries stock first, skips contention, then locks the row and rechecks eligibility.
Tests check that skipped or aborted purge emits no tombstone, that successful
purge publishes at commit and that a retired/purged company rejects replay.
The original migration and retention deadline remain in force.

A standalone legacy production operation passed its initial authorization,
waited on the stock lock while retirement committed, then still inserted a
production record in the test transaction. The test deliberately rolls back
that probe. The disposable post-lock authorization check rejects the same
interleaving with no production or stock record. Other legacy writers that
check active status before waiting need equivalent contention tests.

Master and expense lock review advanced with native execution in
`scripts/verify-sync-v2-legacy-locks.mjs`. The original Edge master prelock
and recurring-expense row prelock both produced PostgreSQL `40P01`.
The Edge source now follows stock → expense → master before the duplicate
check. Disposable definitions make the profile and both direct expense RPCs
take stock first. The direct stock writer, master save/delete, warehouse helper
and inventory reversal also recheck authorization after waiting. The direct
stock and profile/expense and master contention tests verify real database
outcomes. The deployed definitions and their grants are unchanged.

The purge sweep fixture extends the stock-first candidate with a private,
transactional keyset cursor and fixed eligibility cutoff per sweep. It examines
at most 50 candidates per invocation using an eligibility index. Cancel or
rollback reverts the cursor with deletes and tombstones. Native tests put 50
continuously busy companies ahead of an eligible company, verify the later
company is purged and then verify the skipped companies are revisited.

The private feed fixture rejects an expired cursor or an oversized first group
with an explicit rebootstrap signal. The grouped client contract compares the
stored cursor inside the same transaction that records inbox and projection.
Authorized snapshot creation and native/browser storage adapters remain open.


## Server gate coverage

| Source and transaction | Stable identity / children | Receipt and feed | Reconciliation evidence and status |
| --- | --- | --- | --- |
| Gateway legacy post; `khata_post_v1`; v2 voucher adapter | Voucher UUID; reversal references original UUID | Voucher trigger emits once; v2 receipt adopts event | **VERIFIED** isolated append, rollback, two winner orders, repeated operation replay. Direct table insert grants require separate enforcement review. |
| Workspace invoice-save, bill, settlement/payment and fiscal allocation in `khata_workspace_v3` | Bill UUID, generated payment, payment link and fiscal reservation | Paid routed fixture finalizes receipt/projection, generic legacy capture incomplete | **BLOCKED** general sales/purchase, advance and settlement adapters. Existing native fixture reconciles paid routed purchase only. |
| Workspace correction and direct reversal | Operation UUID, source UUID, reversal and replacement IDs, derived stock reversals | Correct grouped voucher/stock effects in routed fixture; full correction receipt and replacement coverage missing | **BLOCKED** beyond the exercised correction slice. |
| `khata_master_save_v2` / `khata_master_delete_v2`; Gateway party create path | Party/item UUID and master-audit identity | No complete master projection, receipt or tombstone | **BLOCKED**. Native lock and authorization tests prove safe order for examined RPCs, not capture. |
| Workspace settings-save/number; `khata_prepare_company_v2` | Scope and fiscal draft/reservation identity | No settings/number/catalog capture | **BLOCKED**. Reconcile atomic numbering and settings with existing legacy clients before enrolment. |
| `khata_expense_post_v1/v2`, `khata_expense_bill_v2`, workspace expense/correction; recurring profile load/post/commit | Expense UUID, payment/reversal parent links, bill lines, profile operation UUID | Existing profile operation replay is separate from v2 receipt/feed; financial projections incomplete | **BLOCKED**. Native checks prove the two orders and exact charges; profile/expense/ledger feed reconciliation still required. |
| Inventory post, production/route and stock reversal triggers | Document UUID, ordinal movement key, routed input/output lineage | Production output and routed purchase projections are isolated; general input, opening, transfer and inventory capture missing | **BLOCKED** across inventory as a whole. Native tests verify stale authorization rejection and already exercised projections. |
| Edge Lottery commit → `khata_lottery_store_v2` owner transaction | Existing organization, seller, PWD, stockist and commission record IDs; native Lottery operation ID | Existing operation version/idempotency without ordered v2 organization events | **BLOCKED**. Lottery compact/history regression passes, and current transport and workspace repair remain independent of Sync. |
| Legacy company create, retire, restore; scheduled purge | Company UUID, active epoch, purge marker | Isolated committed purge tombstone; catalog and retire/restore capture missing | **BLOCKED** live. Legacy company create accepts client-selected UUID; enforce global nonreuse on all creation/import paths before production. |
| Drive recovery and Customer View relay/sharing | Separate identity and recipient/delivery lineage | Outside the owner financial projection | **NOT VERIFIED** end-to-end restore/recipient separation in this batch. Existing paths separate and unchanged. |

### Snapshot and architectural integrity

The private voucher snapshot materializes the initial immutable voucher image
and its high-water mark while stock and scope are serialized. It binds pages
to a synthetic registered device, principal binding, scope and epoch. A new
image invalidates the previous revision. PostgreSQL verifies an overlapping
writer waits, the initial image includes pre-enrolment history, and the next
feed page contains the entire post-snapshot transaction group. Oversized
requests fail explicitly. The checked-in fixture limits each image to 4,096
rows and 2 MiB, and each page to 200 rows and 256 KiB. These are test bounds,
not account limits. Live catch-up for larger companies and complete projection
coverage are release blockers. No public Sync endpoint or client status change
is introduced here.

The scope/epoch, stable operation IDs, commit receipt and grouped feed of the
frozen contract are compatible for the exercised slice. Live device authority,
retention/cleanup of images and receipts, multi-scope ordering, durable client
projection and safe legacy restore remain unverified. Lost connection after
commit must be retried by immutable operation ID; SQL retries are limited to
known aborted transactions. The feed and snapshot interfaces must remain
private until a trusted gateway enforces credentials and device entitlements.
Direct table grants must either be restricted with old-client compatibility
or brought under the same serialization and capture contract. Test roles
are not evidence of deployed, authenticated device permissions.

Basic Android-first and separate read-only Customer View do not authorize
owner Web writes. Premium live sync needs server-owned device capabilities;
a downgrade/revocation must stop remote writes without deleting local books,
receipt lineage or offline recovery access. Pricing and commercial policy
remain outside this implementation.

## Company identity and direct-writer checkpoint

| Writer / authority | Fixture evidence | Residual release gate |
| --- | --- | --- |
| Edge legacy create (client UUID, owner from Central binding) and privileged SQL import | **VERIFIED** legacy INSERT accepted a purged ID under a second owner. Candidate uses a global private ID reservation, including known purge tombstones, and checks it in DB triggers. Same-owner retries on an active ID return the original row. Same- and different-owner creates, raw import and stale device replay fail after purge. | **BLOCKED** for IDs purged before recoverable markers: reconstruct trusted historical reservations or define an authenticated legacy import policy. Never silently infer IDs from amounts, timestamps or names. |
| Workspace retire and permitted restore; cron purge | **VERIFIED** project-owner, retired-state and global fence separation. Account catalog records create/retire/restore/purge, while the company feed keeps its epoch and a terminal purge marker. Rollback leaves the reservation active and removes the attempted purge event. | **BLOCKED** client catalog persistence and snapshot, reviewed real migration/restore and production cron integration. A local archive alone cannot authorize cloud restoration. |
| Ordinary legacy JWT, verified gateway raw voucher/party INSERT and domain RPC | **VERIFIED** ordinary JWT and wrong owner are denied. Verified raw voucher could reach INSERT while retired under legacy rules; candidate denies both raw voucher and party writes after rechecking active state under stock lock. Active voucher and party INSERT feed capture exercised. | **BLOCKED** release until direct privileges and all secondary mutations are reconciled. Party updates, deletions and master audit projections remain open. |
| Non-routed legacy paid invoice, independent payments/advances | **VERIFIED** fixture captures voucher, payment link, inventory document, stock movement, fiscal number/counter and original saved invoice result in one group. Parallel retry/lost ACK returns the original generated settlement ID. Two equal cash payments preserve distinct IDs. | **BLOCKED** coverage for general corrections/replacements, opening variants, write paths outside tested RPCs and full integration with routed/stock projections. Avoid installing overlapping stock/reversal projections without a deduplication contract. |
| Direct expense and recurring profile | **VERIFIED** expense rows and existing profile operation result captured atomically. Native rollback leaves no effects; retry returns saved state. Concurrent expense corrections leave one reversal and exact zero net cash for that charge. | **BLOCKED** complete profile, opening item and line replay coverage, plus a bounded production projection for large profile state. |
| Settlement/expense snapshot + feed | **VERIFIED** disposable `settlement-expense-v1` spans voucher, invoice, payment link, expenses and profile state, inventory/stock and fiscal state. Rebuild reproduced cash and stock; the post-watermark write appeared in feed only. | **BLOCKED** complete owner/company bootstrap and Lottery organization projection, lawful retention and larger data. A partial image never marks the app Synced. |

The reservation stores a UUID and purge bit without accounting payload. The
fixture uses table-level coordination for backfill and installation, and
stock-first locking for creates. A reviewed rollout must budget for table locks,
backfill, and permanent reservation/index growth. The purge implementation must
retain this boundary even when historical financial payload retention expires.
Any restore into a new company is an explicit migration with new identities,
never the recreation of a purged company UUID.

## Versioned module onboarding

Use static server composition of scoped adapters instead of a runtime plugin
loader or a new transport per module. A closed enum hardcodes every module in
the executor; arbitrary client-declared scope kinds weaken trust. The candidate
uses registered SQL scope kinds and statically selected server adapters. Runtime
routing is by exact `scopeKind`, `commandType` and schema version, while the
shared executor retains actor checks, immutable digest, receipt lookup and
transactional finish. Unknown registrations and versions fail closed.

1. Define the module's authorization boundary and versioned scope, epoch,
   command envelope, deterministic validator, immutable parent/child IDs and
   cross-scope references. Do not inherit another scope's authorizations.
2. Review an additive migration. Register the kind privately and add module
   tables, indexes and constraints. Bind scope and entitlements using server
   principal/device data. Review legacy RPCs, direct grants, jobs and lifecycle.
3. Register a server adapter that locks its authorized scope, checks device and
   entitlement before receipt access, then commits domain mutation, result IDs,
   receipts and ordered feed atomically. Preserve exact commands across retries
   and version negotiation.
4. Define authorized snapshot, limit and high-water projections with stable
   wire IDs. Consumers stage a complete module image before atomic cursor
   advancement, validate schema support and keep unfinished projections explicit.
5. Implement Android SQLCipher and Web IndexedDB inbox/outbox and projection
   adapters. Test cursor atomicity, crash restart, restore lineage, conflict,
   retention, revocation, Basic/Premium capabilities and old clients before
   enabling the module. Keep Customer View outside owner write capabilities.
6. Require native concurrent reconciliation for each writer, rollback and
   lost ACK, unauthorized scopes and unsupported versions, snapshot/feed gaps,
   tombstones, budgets and physical device acceptance. Add capability only
   after reviewed compatibility and rollout approval.

`verify-sync-v2-module.mjs` registers a disposable third scope kind, adds a
synthetic adapter and persists a parent and child through the common executor
and SQL receipt/feed. Cross-actor, forged device, stale epoch, unknown version,
changed digest and rollback cases are exercised. No real Daily Ledger
functionality, public registration or new client activation is present.

## Integrated server evidence

Use this matrix for the newest acceptance results. The earlier sections
record the original narrower checkpoints.

| Scope and writer family | Captured in the integrated fixtures | Evidence and remaining limits |
| --- | --- | --- |
| Company create, retire, restore, purge and account catalog | Global UUID reservation, owner catalog lifecycle, company epoch and purge marker | **VERIFIED** known purge and stale payload fencing, authorized catalog snapshot/feed, active restore, rollback and denied tenant. **BLOCKED** unknown historical purges and legacy client-ID policy. |
| Verified direct voucher/party INSERT; masters and settings | DB active/owner fence, one party INSERT producer, update and delete, audit, settings and fiscal records | **VERIFIED** direct checked voucher/party path, master tombstone and settings replay image. **BLOCKED** deployed-role/grant inventory and wider master/catalog compatibility. |
| Workspace settlement, advance/payment, expense, profile and correction | Native operation result, amount and stable child ID, voucher/links, expense rows and profile state, correction/reversal | **VERIFIED** original child identity on replay, equal-amount independent payments, exact aggregate cash/stock, recurring rollback and competing correction on selected scenarios. **NOT VERIFIED** every old write variant, long profile transactions and trusted v2 command ingress. |
| Inventory, production route, input/output and reversal | Inventory documents, stock movements, production post/route and voucher-derived stock reversals | **VERIFIED** routed purchase and standalone output with linked payment/input, no duplicate route capture, and stock reconciled after correction. Older aggregate capture is an alternative fixture only. **NOT VERIFIED** all cross-module contention, production permissions and legacy historical ambiguities. |
| Lottery Daily Entry, PWD, Stockist, Commission, payment, settlement and corrections | Actual row diffs and tombstones from native store, scoped to organization and linked to its existing operation receipt | **VERIFIED** real domain service and PostgreSQL writer, lost ACK, equal-amount distinct payments, PWD overdraw denial, commission and stockist correction, draft deletion, bounded pages and byte-for-byte projection convergence through grouped feed. Verified a separate organization stays unchanged and revoked devices cannot read. **BLOCKED** production gateway attestation, all writer versions, oversized history policy and enrolled Lottery lifecycle/catalog changes. |
| Lottery customer bills, legacy stock movement and expense profiles | Same organization row-store event pipeline, including generated stock and ledger rows | **VERIFIED** synthetic postings carried through the real service and compared with new snapshots. **NOT VERIFIED** exhaustive scheduled/correction combinations, historic malformed rows, production performance and archived organization lifecycle. |
| Company operational and catalog snapshots, Lottery organization snapshot | Separate versioned images and high-water authorization; company expiry/disposal; catalog privacy-preserving purge rows | **VERIFIED** focused page+feed convergence, scope and device checks, stable accounting totals, invalid/stale cursor failure and oversized failure. **BLOCKED** complete owner bootstrap with every legacy domain and lifecycle projection, bounded recovery from oversized individual rows, and durable device runtimes. |
| Additional module | Static server registry and private SQL scope-kind allowlist | **VERIFIED** disposable third-scope write and receipt/feed, with rejected tenant/device/version. Daily Ledger remains outside this task. |

### Security and rollout limits

A verified actor/device still requires a matching authorized module and scope
epoch. Native Lottery operations are the authoritative legacy idempotency
receipts. The fixture links their actual committed row changes to ordered
events without inventing a v2 digest or operation ID. Capture context is private
and bound to the native owner/operation transaction. A cross-organization
delta and a direct mutation of an enrolled organization fail in the fixture.
Do not copy privileged fixture SQL into a published endpoint.

The wider server candidate needs old-identity provenance and a safe ingress
policy before historical import. A legacy client-UUID create request cannot
prove novelty. A snapshot that fails on a large row cannot be treated as
complete by falling back to a truncated response. Keep activation gated until
those failures have supported recovery paths. See the [server rollout
review](UNIFIED_SYNC_V2_SERVER_ROLLOUT.md) for sequence, capacity, isolation,
retention, rollback and disaster-recovery requirements.

## Recovery and authority gates

| Scope | Verified locally | Remaining prerequisite |
| --- | --- | --- |
| Historical company and child identities | A private, reviewed archive/manifest ticket maps stable originals to a fresh server-generated company and stable replacement entities without posting. Wrong actor, unreviewed manifest, revoked proof and cycles are rejected. | **BLOCKED** authoritative pre-fence provenance and irreversible policy for recovery execution and merge. No historical company recreation or automated financial replay. |
| Company and Lottery oversized recovery | Verified immutable, versioned, SHA-256-fragmented images and whole groups, with authorization on every page. Resolved 1 MiB+ examples, 510 events in a transaction, interrupted transfer and expired retention floor. Company ledger/stock reconcile exactly. | **BLOCKED** production quotas and TTL, larger-than-budget recovery, durable atomic Android/Web apply and all-writer canonical projection signoff. |
| Trusted device writes and reads | Existing Central verifier composed with a private possession and entitlement check. Synthetic primary Android, Web/additional Android entitlement, read-only, expiry, revoke, wrong tenant and wrong proof cases. | **NOT VERIFIED** actual Central service calls, device provisioning, secure storage, production schema or cohort activation. |
| Writer compatibility | Native rollout preserves seeded vouchers, legacy writes, role guards, transfer cleanup and existing feed on a synthetic multi-tenant DB. | **BLOCKED** exhaustive deployed writer/role/trigger/cron matrix, all command-v2 migrations, old/new physical device rollout and Customer View separation acceptance. |

See [rollout review and measured bounds](UNIFIED_SYNC_V2_SERVER_ROLLOUT.md)
for the dependency and rollback map. Browser runtime is blocked independently
of accounting behavior.

## Authenticated Lottery payment and durable recovery checkpoint

The private `createTrustedLotteryPaymentGateway` runs the existing Lottery
`recordPayment` service and `khata_lottery_store_v2` writer after Central
verification and the possession-bound device/organization/epoch check. The
same PostgreSQL transaction captures the native operation, links its ordered
feed group and persists the command digest at the last linked sequence.
Payment, ledger, audit and numbering identities are stable across a rolled
back attempt. A preexisting legacy receipt without v2 command lineage fails
closed. The device cannot supply child identities or change the actor.

Native PostgreSQL acceptance used mock Central responses with the production
verifier shape and synthetic enrolled credentials. Following an intentionally
dropped acknowledgement, 100 retries yielded the original receipt. An aborted
transaction left no receipt or cursor effect. Distinct equal-value payments
kept separate IDs and exact cash/PWD splits. Wrong actor, organization, epoch
or possession credential, changed digest and revoked registration were
denied. The feed projected into encrypted IndexedDB test storage after reopen.
This completes a payment slice of the writer matrix. Other Lottery commands
and existing Khata invoice/production, settlement, master and expense write
ingress still lack equivalent authorized v2 command/receipt coverage.

The existing local feed now accepts a separately authorized, fully assembled
recovery group. Encrypted record fragments, inbox, projection and cursor are
committed atomically in the original storage transaction. Large local records
are sealed in bounded chunks with independently authenticated addresses.
The normal feed's 500-event cap remains in effect. The recovery path verified
a 510-event group, an interrupted oversized audit transfer and SQLite part
write rollback. Physical SQLCipher bridge, old-record replay, browser restart,
device provisioning, garbage collection of superseded encrypted chunks and
real user interface outbound saves remain release gates.

## 2026-11-25 — Chat Mode C5: Compose existing typed v2 outbox with native financial SQLite transaction (LOCAL ONLY)

- **VERIFIED ROOT CAUSE:** `openSqliteLocalFeedStorage()` previously opened its own transaction for each outbox mutation. The live Android Lottery payment writer updates the encrypted local financial snapshot through a separate `persistState()` transaction, and no real UI invocation of the typed v2 payment outbox exists. Sequential writes cannot prove both financial projection and immutable typed command survive or roll back together.
- **IMPLEMENTED (in local worktree, not yet pushed):** `withSqliteLocalFeedTransaction()` supplies a scoped, bounded-lifetime `LocalFeedStorage` to the existing `createLotteryPaymentOutbox().enqueue()` while the caller executes its financial projection write inside the **same** injected SQLite transaction. No second v1 staging engine, client identity override, automatic remote POST, new migration, or feature activation.
- **LOCAL EVIDENCE:** test-first failures reproduced the absent API (3 failed); `node:sqlite` + existing real `sqliteFixturePort` tests now prove commit-both, rollback-on-outbox-error, rollback-on-finance-error, stale post-transaction handle denial, restart/pending replay with same immutable ID, wrong-digest denial and two equal-valued distinct payments. The target suite and neighboring scoped tests are green (47 tests / five actual collected files); TypeScript, scoped Oxlint and Web/PWA Build PASS. No full local coverage per Setup 01.
- **BLOCKED / NOT VERIFIED:** Real Android SQLCipher path has NOT been wired to call the new combined transaction API, because a verified server-owned device/organization/epoch binding, stable entity/child IDs, safe old-client cutover and live installed-device reconciliation must be established first. Payment Save → v2 transport → backend receipt → feed → other device is STILL INCOMPLETE; this checkpoint does not authorize a live financial writer or migration.
- **NEXT:** bind the verified registration and local payment Save to the *existing typed v2 outbox in this unit of work*, use existing online Central gateway, and test actual Android A/B & Web across a disposable backend. No source push without separate owner approval.
