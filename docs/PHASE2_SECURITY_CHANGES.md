# Phase 2: scoped security changes (pending review/deployment)

Base: main `464d5a6e8169a209e6223192834a0674813022e5`.
These changes do not alter Accounting Policy v2 or rewrite saved financial entries.

## Request admission

The gateway reads at most 65,536 UTF-8 bytes and retains the existing 16,384-character envelope. A stalled request body times out after 5 seconds. At most 24 requests per Edge isolate may occupy authentication/database work concurrently. This is a local resource ceiling, not a distributed IP firewall.

After the central session is verified, the canonical identity receives one shared PostgreSQL counter row: 600 requests/minute and 120/10 seconds. Tokens, company switches and Edge replicas share that identity budget. Atomic UPSERT serializes concurrent updates. Rejected requests do not invoke financial posting. Quota storage errors fail closed. Counters commit before posting, independently of financial rollback. Rate limits return HTTP 429 and Retry-After; busy/timeouts have localized Bengali/Hindi/English messages. Existing pending transaction IDs are preserved for explicit retry; no automatic financial resubmission is introduced.

Only the trusted database owner connection can execute admission. PUBLIC, anon, authenticated and service_role have neither EXECUTE nor direct table access. Counters are derivative nonfinancial data, one row per active identity; stale-row retention/cleanup and managed pre-auth global abuse protection remain operational follow-ups. This is not a million-user capacity certification. The Central Admin repository and its rate limits were not changed.

## Migration ledger reconciliation

Six previously applied baseline migrations have been recovered from the live read-only migration ledger into canonical source files:

- 20260921180314 create_khata_companies_owner_rls
- 20260921184447 khata_accounting_v1
- 20261024042046 central_owner_bridge_preserve_trial_books
- 20261025165602 activate_expense_subledger_v1
- 20261025165618 activate_itemized_bills_inventory_v1
- 20261102075520 master_party_link_metadata

Existing SQL bytes were preserved when reconciling these five filenames to live applied versions:

| Old source version | Applied canonical version |
| --- | --- |
| 20261028000100 | 20261028184713 |
| 20261101110000 | 20261101144338 |
| 20261101181635 | 20261101191307 |
| 20261104070825 | 20261104122849 |
| 20261104190750 | 20261105040047 |

These 22 historical migrations are already applied on the audited live project. Do not replay them or repair live history just because source filenames changed. Old documents retain their historical references. Test scripts now use canonical files rather than replaying SQL proposal documents.

Admission was applied by the management API as version 20261105084705; its SQL is byte-identical to the formerly prepared 20261105052854 file. Source filenames and test references now follow the actual applied version; live migration history was not rewritten. The safe retired-company purge was subsequently applied successfully through the connector as version 20261105101338; its SQL is byte-identical to the former prepared 20261105053009 file. Both live migrations now match source filenames without rewriting live history. Review the target project and migration list again before any separately authorized live application. A clean disposable chain test is provided in scripts/verify-phase2.mjs; scheduling itself requires native pg_cron, deliberately excluded from PGlite fixtures.

## Retired company cleanup

The existing deletion deadline and 50-company locked batch remain unchanged. Expense profile operations/state are removed before their company. Each company's deletion runs in a subtransaction; an unexpected foreign-key dependency rolls that company's cleanup back completely and emits a fixed non-sensitive warning, while the batch continues. Other errors still abort the job. Active companies and companies within their recovery window are not eligible. No cleanup is invoked by installing the migration.

## Release and verification boundaries

Targeted SQL and gateway tests are development evidence. New native PostgreSQL concurrency, exact-SHA CI/Sonar, final certification and live compatibility/deployment verification remain required. The native concurrency suite now includes the same disposable permission/reset/purge cases as PGlite on a reserved connection, plus 64 simultaneous admission requests. PGlite is not evidence of multi-process concurrency.

Authorized release order after review: apply only the two new migrations, then deploy the matching Edge source, then the frontend. An old Edge remains usable after the additive migrations, but does not enforce the new quota. Deploying the new Edge before its admission function exists fails closed. Never roll back by deleting financial data; revert Edge first if necessary and retain additive SQL while investigating.


Local follow-up evidence (5 November 2026): browser preflight recovered, canonical BN/HI/EN mobile/desktop preview6/6 and related Playwright18/18 PASS. Preview emoji fonts restored outside source dependencies; updated screenshots inspected. New native PostgreSQL CI results remain pending until this source is pushed through the owner-approved workflow. Re-running the old main commit does not test these local changes.


Live verification: admission version20261105084705 and cleanup version20261105101338 applied; both statement hashes match the reviewed SQL. Cleanup is postgres-owned, unavailable to anon/authenticated, and was not invoked manually. All7 companies remain (6 active), with0 currently eligible for purge. Edgev23 is ACTIVE and all35 deployed files match the verified application source; five live negative/CORS checks passed. Existing Render deployment is LIVE at16967b6 withHTTP200. Metadata-alignment commit04c8bbf CI#113 passed; the next filename-only commit requires its own CI result. No real financial records were deleted or rewritten by this release.
