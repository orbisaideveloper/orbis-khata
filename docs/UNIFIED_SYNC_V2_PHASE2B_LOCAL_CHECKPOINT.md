# Unified Sync v2 — Phase 2B server continuation: LOCAL REVIEW, not complete

**Task:** ORBIS WORK / Setup 01 / Phase 2B 2026-11-25. **Repository:** `orbisaideveloper/orbis-khata`, `main` verified starting HEAD `4802942945e1cb458a98c38ed540178d3102ac1d`, tree `82522830867cc02d084d41da2d2b122fb0c89300`. **Status:** LOCAL ONLY / NOT PUSHED / NOT DEPLOYED / **NO 2B ACCEPTANCE SIGN-OFF**. New code must not be mistaken for the prior already pushed four-file candidate.

## Evidence-first root causes and implementation

1. **Network lost-ACK replays:** `sync_v2.finish_voucher` previously raised uniqueness violation if the same immutable operation retried, so a committed accounting effect could be mistaken for a failed one. The review SQL now uses `ON CONFLICT DO NOTHING` with a strict receipt readback and immutable operation/digest/result/epoch/sequence comparison. Altered replays fail closed, identical replays return original receipt. Disposable PGlite 19 candidate tests exercise multiple retries and mutation conflicts.
2. **Incomplete expense projection:** expense-profile operation feed did not guarantee the latest `khata_expense_profile_state` record itself was in the company feed. A transaction-coupled state capture trigger and negative/idempotency tests were added. A dedicated reversal-table trigger is deliberately withheld because the voucher already includes reversal lineage; adding both can double-count until 2E adapter deduplication is proven.
3. **Large atomic groups:** a normal feed page capped at 500 events cannot safely deliver one transaction exceeding 500 events. Review-only `sync_v2.read_trusted_company_group` recovers full *immutable* transactions through bounded SHA256-verifiable fragments, protecting actor/scope/epoch/cursor/device on each query and rejecting split cursors, oversize events and expired/retired scopes. The client must stage and hash-check **all** fragments before committing a local cursor; this client acceptance is still missing.
4. **Private network boundary:** new `company-sync` operations route through Central authorization, strict shape validation, rate admission, enrolled device verification and existing private DB feed/scope functions. `KHATA_COMPANY_SYNC_V2` is **OFF by default**, and private read-only SQL remains outside the production migrations directory. A supplied 64-digit device credential is still a bearer proof from the request body and is NOT final hardware-backed attestation; treat as a future hardening gate.
5. **Native concurrency:** added opt-in disposable PostgreSQL-17-only CI acceptance `scripts/verify-sync-v2-company.mjs`, with forced loopback exact database name and an empty database preflight. It tests real multi-session concurrent legacy writes, same-ID receipt retries, tenant/retired denials, and oversized feed. Existing `quality.yml` PG17 matrix adds a company fixture. Native PostgreSQL is **not installed in this local runtime**, so this script has only passed `node --check` and MUST NOT be represented as a passing native test until a separately authorized push/CI run validates it.

## Senior architecture / STRIDE / FMEA

- Source of truth stays the server accounting transaction, not an AI/client-replayed estimate; operation and group/feed must have immutable identities and atomic committed boundaries. Never treat two indistinguishable records as separate cash movement.
- **Spoofing/Elevation:** check Central principal + registered device + per-company epoch/entitlement on every read and write; test wrong company/device/revocation. Bearer proof replay remains an explicit residual risk.
- **Tampering:** SHA-256 fragment integrity is checked per event, but end-to-end group staging/cursor atomic apply requires Android/Web implementation tests.
- **Repudiation:** retain receipt event identifiers and operation digest and server-side audit; tests enforce one receipt on exact retries and different digest denial.
- **Information disclosure:** default-off route, private schema no public grants, no DB errors/secrets disclosed in client. Server/service-role call boundary and actual Supabase RLS/runtime remain unverified.
- **Denial of service:** 500 normal events cap, 16000 recovery event cap, 16 MiB group budget, 2 MiB event budget, 24 KiB fragments; controlled rate admission. Concurrent per-transaction locks require actual native PostgreSQL stress.
- **Data corruption severity critical:** any legacy SQL writer or cron/Edge path not captured may silently diverge. Inventory of 19 RPC / 26 triggers / 4 scheduled jobs / 3 direct Edge paths is still not individually accepted on live schema; a PGlite table-trigger audit alone is insufficient.

## Local validation

- Scoped Vitest against changed server/route/financial/recovery modules: **10 files, 82/82 tests PASS**. Includes 19 private company candidate, 4 grouped recovery, 3 company handler, 3 trusted group gateway, 19 accounting gateway, enrolled/lottery capture, 2A inventory, transaction, pairing.
- Prior expanded invocation including `tests/sync-v2/local-feed.test.ts` had **82 test assertions PASS but one suite unable to collect**, because Vite refused the existing `node:sqlite` builtin in the jsdom transform (`Cannot bundle Node.js built-in node:sqlite`). This is a distinct environment/runner gate, not a demonstrated new code regression; not silenced.
- TypeScript typecheck / scoped lint / Web+PWA build / `node --check` script and `git diff --check`: record exact final results in the accompanying handover manifest.
- Full local coverage intentionally NOT RUN per Setup 01; GitHub owns coverage, and new CI hasn't run because code remains local only.

## BLOCKED — reasons Phase 2B cannot be signed off now

1. Native PostgreSQL 17 multi-session acceptance is written but **not executed**. Also require failure injection and deterministic deadlock/serializable retry checks.
2. End-to-end all-writer census across SQL RPC, legacy triggers, cron, Edge and actor/grant mapping is not proven; financial adapters and original command lineage are 2E work.
3. Complete bootstrapped authorized snapshot for historical mixed-era companies, full company module projection and Android/Web atomic group apply not accepted.
4. Production schema migrations, live Supabase privileges/RLS, auth/device attestation, recovery and rollback gate 2F, real 2G two-Android+Web acceptance not authorized or tested. Phase 2A inventory is complete; Phase 2B implementation is partial.

## Recovery and next exact action

Keep this review patch against **main `4802942945e1cb458a98c38ed540178d3102ac1d` only**. Do not reapply the already-pushed old four-file review patch. Require owner approval before new GitHub push and **separate** approval before DB/Edge/Render/Play deploy. Next authorized task must first recheck GitHub main, review this patch and the native script, push safely with non-force expected SHA, then STOP; inspect independent PostgreSQL CI result in subsequent session and fix gaps before any 2B closeout. Never enable Sync v2 or treat these REVIEW ONLY files as production SQL migrations.
