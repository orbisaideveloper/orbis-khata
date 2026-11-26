# ORBIS Khata — Phase 2B evidence-first server simulator

**Status: targeted simulator, not whole-phase acceptance.** This document describes what GitHub Actions actually checks on the selected commit. Its contents do not certify release or authorise production SQL, Edge, Render or Play changes.

## Disposable native PostgreSQL 17 matrix

| CI fixture | Test boundary | Important limits |
| --- | --- | --- |
| `company` | Real legacy voucher posting with 32 concurrent same-ID retries, distinct-ID equal-value postings, immutable receipts, trusted feed 500+ group fragment recovery, old expense commit/rollback, foreign-actor and retired-scope denial | Not all authenticated RPCs or every legacy trigger mutation |
| `trusted-device` | Native device pairing, lifecycle, scope and negative auth cases | Does not assert real physical Android/Play sign-in |
| `lottery` | Native private lottery capture, scope isolation and recovery | Not all external import/cleanup scheduled jobs |
| `snapshot` | Installs seven checked-in dependencies plus review-only company capture, recovery and complete history snapshot; verifies all **22 company-scoped public table models**, fresh device grants, paged records, fabricated-cursor denial, foreign-tenant denial, oversized pages, stale revision denial, revoked-device denial | Not native Android restoration; large-scale indexed page performance still unproven; review SQL is **not** in production migrations |
| TypeScript and Vitest | Historical snapshot, trigger metadata and fail-closed closure register plus existing server gateway tests | PGlite semantics are not a substitute for native PG concurrency |

### Acceptance interpretation

- **Green** means all **specified** fixture tests passed on the **exact Git SHA**, with per-job logs uploaded as GitHub Actions artifacts. A green run is neither full 2B completion nor deploy permission.
- The `assessPhase2bClosure` inventory has **64 server evidence IDs** after excluding a future cross-client staging gate. The physical two-Android and Web/PWA synchronisation proof belongs to Phase 2C/2D/2G.
- Current native suite does not independently exercise and certify all 19 authenticated RPCs, 7 internal routines, 26 legacy triggers, 4 pg_cron jobs, 3 direct Edge ingress paths or historical full disaster-restoration invariants. These remain **BLOCKED** until exact case, source, run, result and review are recorded.
- Full 2B sign-off requires both a correctly defined complete implementation and attributable evidence for **every** required server gate. We deliberately do **not** mark remaining cases PASS based on matching function names or a global workflow green result.

### Reproducibility and safety

Workflow: `.github/workflows/sync-v2-phase2b-simulator.yml`. Runner: Ubuntu 24.04, Node 24, Docker PostgreSQL 17 ephemeral service. Native scripts refuse any URL other than the literal loopback `postgres://...@127.0.0.1:5432/khata_sync_v2_test` schema/environment; each runner job gets an empty isolated database. The scripts never fetch production credentials. Artifacts contain synthetic test outcomes with run ID and Git SHA; never live financial records.

Owners must independently review native test results and the latest frozen Rollback Baseline before any future migration or deployment. Current last confirmed Render live Web SHA is `4f297dcc3f8069cc733fb6f839200129337b1f49`, not today's GitHub main.

## Expanded multi-fixture acceptance (26 November 2026)

The dedicated simulator runs **ten separately isolated, real PostgreSQL 17 jobs** on synthetic data. Adding a job does **not** retroactively certify any 2B obligation; use only an exact successful run and its uploaded evidence.

| Additional native fixture | Scenario exercised by its executable script | What success cannot prove |
| --- | --- | --- |
| `khata` | Voucher concurrency/retry, old/v2 reversal ordering, authorization and purge tombstones | Every deployed old financial writer route |
| `module` | Third-scope operation, receipts, version and device/tenant guards | A specific production financial module's full writer |
| `rollout` | Existing populated companies, 600 legacy vouchers, reversible feature rollout, >500 event group | Production migration/rollback or real customer traffic |
| `settlement` | Invoice/payment/expense/stock settlement, lost ACK, concurrent correction, synthetic SQLite re-open | Android SQLCipher on physical devices or all invoice UI paths |
| `legacy-locks` | Old Edge/master expense lock ordering, deadlocks, rollback, purge race and handoff | All live Edge deployments, all scheduled Cron jobs |
| `company-fence` | Owner identity reservation, retired company write denial, purge/restore and concurrent replay | Actual live legacy accounts or historical production rows |

For each matrix entry, artifacts include full stdout/stderr, exact Git SHA and run URL, script SHA256, fixture name and GitHub execution outcome. They retain **60 days** in GitHub (copy important evidence to the canonical Google Drive archive before expiry). Independent matrix jobs have isolated databases and never receive production credentials. The named tests above remain a **subset** of the 64 server evidence obligations, not a substitute for individual gate reviews.

**Still mandatory and BLOCKED:** inspect all real RPC writer variants, all 26 triggers, all four Cron schedule SQLs and authority, all three direct Edge SQL ingress paths, composite-key recovery under large concurrent changes, and complete old-client compatibility/restore checks. A green ten-job simulator certifies that *its ten programs passed*, not the 64 remaining server assertions or Android A↔B↔Web E2E.


## Standalone safety evidence upgrade (26 November 2026)

The dedicated simulator additionally executes an **eleventh** native PostgreSQL 17
fixture, `scheduled-jobs`, against the *actual checked-in SQL bodies* for Lottery
live-cache retention and recipient statement mailbox expiry. It checks an
unchanged synthetic financial voucher count and total, successful cleanup,
repeat-call idempotence and transactional rollback. It does **not** simulate
pg_cron clock delivery, Edge HTTP transport, Vault integration, real owner data
or the other two scheduled jobs.

The targeted code job also runs 17 Node contract and PGlite tests, spanning
source migration provenance for 26 trigger installations, four cron source
contracts, direct Edge ownership boundaries, scheduled-body PGlite effects and
negative tests for the 64-gate Evidence Auditor. The auditor exports a 64-entry
JSON status ledger. A global green CI check can never mark these receipts
`REVIEWED` without per-case SHA-bound reviewed evidence. Metadata validation is
not independent artifact verification; retain externally reviewed artifacts.

A **green suite here is still not Phase 2B signoff**. Real RPC variants, live
cron role/schedule, all Edge ingress variants, native trigger effects, full
historical restoration and signed individual receipts remain pending. No
production migrations or release controls are touched by this testing batch.
