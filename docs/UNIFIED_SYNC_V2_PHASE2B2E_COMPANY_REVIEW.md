# Phase 2B + 2E — private company writer-capture review (NOT COMPLETE)

**Date:** 25 November 2026 IST
**GitHub exact baseline:** `50117dbe1471ece6d2ed648866a28d7166528fe5` (`main`, Quality + Android Candidate GREEN).
**Current code state:** LOCAL ONLY; NOT pushed, migrated, deployed or activated.

## Why this isolated candidate exists

The frozen ADR-SYNC-002 requires the existing financial writer and its Sync receipt/feed to commit or roll back **together**. The existing tests under `supabase/tests/sync-v2/` proved individual ledger, voucher, expense, party, inventory, stock, settings, production and purge mechanisms, but did not prove that those independent fragments can be installed *together* after the checked-in three unapplied v2 SQL migrations without duplicate emitters or legacy compatibility breakage.

`supabase/review-candidates/20261125_private_company_financial_capture.review.sql` is a **single, atomic, review-only combination** of those tested candidate functions and triggers, with fail-fast SQL source anchors and active legacy lock ordering. **It is deliberately not in `supabase/migrations/`** because the complete Phase 2B/2E, 2F migration and 2G actual-device safety gates are not met. It has not been applied to Supabase. No feature flag has been changed.

The candidate additionally includes a BEFORE DELETE enrolled-company purge-authorization guard: it checks the trusted existing scheduled-purge authority while the company row is still present and rejects attempts when the immutable Central principal/owner binding has disappeared. Its AFTER DELETE capture enforces the same fail-closed property. This protects against a purged enrolled scope disappearing without its tombstone/last sync event. A different unenrolled legacy company can continue normally.

## Verified locally (not deployment certification)

- Independent local Git source exactly matches GitHub `main` Git tree `48b7b96b97952b97d2ca06e995ecbfd3775d8918` before these candidate files.
- Seven actual reviewed, unapplied company/Lottery v2 dependency migrations execute in order in a fresh PGlite DB. Then the combined candidate executes in **one SQL transaction**; no fixture-only `sync_v2.test_device` table is included.
- 16 new candidate acceptance tests PASS: migration source drift rolls back the entire installation, one capture owner per trigger, 100 sequential voucher retries, unenrolled legacy continuity, voucher idempotence and original receipt-to-event identity, expense and party mutation, real master save/update/delete with audit and tombstone, real `invoice-save` paid purchase with voucher/payment/fiscal/stock all in the **same commit group**, real settings and production output, atomic rollback, role/scope denial, retirement fail-closed, authorized scheduled purge, globally reserved purged company IDs and missing-owner fail-closed purge.
- Full related local QA: 9 actual suites / **59 targeted tests PASS**, typecheck PASS, scoped Oxlint 0 warnings/0 errors, `npm run build` including PWA worker-check PASS. Existing Vite chunk/dynamic-import warnings are nonfatal; no quality settings changed.
- The PGlite database is synthetic and not proof of native PostgreSQL MVCC locks, actual Supabase grants, latency, real user/device behavior or full end-to-end data safety.

## Missing mandatory Phase 2B/2E gates (NOT VERIFIED/BLOCKED)

1. **True authorized Server API:** Real Central principal, device registration, entitlement, lifecycle/epoch/actor enforcement for every Khata family; review Edge source/permission boundary, not fixture impersonation.
2. **Real native PostgreSQL concurrency:** Lock hierarchy and transaction grouping under actual concurrent old v1 and v2 clients; paid invoice vs correction/retirement/purge; concurrent expense profiles, master, stock and production; exactly one receipt after 100 retries and lost ACK; 40P01/40001 independent retries.
3. **Complete legacy RPC/trigger/cron/direct ingress:** Reconcile the 2A register's 19 legacy authenticated EXECUTE grants, 26 active noninternal triggers, 4 scheduled jobs, 3 direct SQL Edge ingress paths. No unmapped accepted money/stock write can skip the feed. The candidate covers a meaningful subset, not every write path/version or future invoice shape.
4. **Every financial module adapter:** General bill settlement/advance/opening/correction/replacement; expense schedules, all item/warehouse/prod variants; full Lottery Seller/Stockist/PWD/Commission and exact child lineage; company catalog; settings and fiscal changes. A trigger event is NOT proof the actual authorized typed v2 command + client can consume that record.
5. **Complete authorized initial snapshot, oversize recovery and local projection:** Source rows across all families; read-authorized immutable high-water; bounded resume after very large companies; atomic Android SQLCipher and Web IndexedDB apply, rollback and crash/restart. Existing partial voucher/settlement snapshot fixtures cannot authorize all-company Sync.
6. **Historic ID protection:** Known purged UUID reservations are protected in this candidate; historical purge records with no durable trusted marker remain unresolved. NO automatic re-ID or replay of ambiguous original Android/Web records.
7. **Production migration review:** Need verified old+new grants, RLS/SECURITY DEFINER, source drift, index/lock budgets and additive rollback plan; actual production currently has no `sync_v2` schema. Candidate must not be renamed/moved to a live `migrations/` file until all independent proof and owner approvals are satisfied.
8. **2F/2G policy and QA:** Owner P1–P7 subscription/retention/backup boundaries; encrypted restore, original app coexistence, full two-phone/Web physical acceptance. CI green is never sufficient by itself.

## Exact next safe execution

Use this candidate as the testable **server-capture foundation**, finish all missing ingress and full typed module adapters **in a disposable native PostgreSQL** database, then test old/new version interleavings and rollback, and only then prepare an additive real migration for separate review. Do not apply production SQL, deploy Edge/Render/Play, enable the feature flag, or rewrite old customer balances without separate explicit authorization. Preserve the existing Live Web deployment from 24 Nov, commit `4f297dcc3f8069cc733fb6f839200129337b1f49`.
