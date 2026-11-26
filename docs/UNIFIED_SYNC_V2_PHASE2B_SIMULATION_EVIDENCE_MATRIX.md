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
