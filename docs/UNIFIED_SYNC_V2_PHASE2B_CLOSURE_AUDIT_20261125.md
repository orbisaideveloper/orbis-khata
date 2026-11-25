# ORBIS Khata — Phase 2B closeout audit (incomplete)

**Status:** `BLOCKED / CODE-ONLY REVIEW`. This is not a production migration,
feature activation, GitHub push or phase acceptance certificate.

## Exact provenance

- Source of truth: `orbisaideveloper/orbis-khata` `main` commit
  `f3409aab014b25a80bd630de69aa922875c81ed5`.
- Green CI: Quality run `45661041800`; Android candidate `45661041554`.
- Disconnected local reconstruction was compared with prior verified tree;
  new code in this audit is isolated, not a claim of fresh production deployment.
- Live ORBIS Khata Supabase **read-only metadata** checked on 25 November 2026:
  26 exact named backend functions, 26 exact named non-internal triggers,
  4 named `cron.job` entries; 19 `authenticated`-executable routines,
  no anonymous execute grants in the reviewed 26; **no `sync_v2` schema live**.
  Function/trigger/cron name sets matched `phase2a-coverage.ts` exactly.
- Live company rows, finance transactions or secrets were **not** read.

## Root cause and critical security boundaries

A passing CI fixture proves behavior only for its installed disposable schema,
not every route or the actual deployed Supabase definition. The real deployed
`sync_v2` schema does not exist yet, so capturing full live writes, performing
a company bootstrap and certifying rollback are not possible by read-only
inspection. GitHub success cannot authorize automatic Render or SQL deployment.
Review-only triggers across company financial rows have no live effect.

Supabase Data API `EXECUTE` grants, RLS and privileged `SECURITY DEFINER`
functions are distinct controls. Absence of `anon` EXECUTE does not prove
that the authenticated 19-RPC surface checks actor/tenant, especially for
`SECURITY DEFINER` functions. Never automatically grant untrusted clients
`sync_v2` schema access or apply these review scripts to production.

## New automated fail-closed evidence register

`src/sync-v2/phase2b-closure-gates.ts` and associated tests, plus a financial feed regression in `tests/sync-v2/server-company-review-candidate.test.ts`:

- Every **26** live backend routine, including **19** authenticated entry
  points and **7** internal-only routines, has an individual sign-off ID.
- Every **26** deployed trigger, **4** cron job, and **3** direct Edge SQL
  table ingress entries is included.
- Six cross-cutting invariants require distinct evidence: derivation/lock
  order, direct Edge authority, historic snapshot and purged IDs, registered
  device/entitlement, financial reconciliation and atomic client staging.
- **65 distinct evidence obligations** are tracked. This is *not* a count of
  incomplete features or a completion percentage; guard/read/relay obligations
  need different proof than a financial writer. Blanket `CI green` alone
  cannot mark them complete. One native voucher retry slice was verified;
  other categories are not automatically certified by the same fixture.
- This register does **not** itself secure any API or constitute signed proof;
  it must be paired with replayable real native tests and audited evidence.

## Precise residual gates

1. Every authenticated and internal RPC affecting financial/company state,
   including invoice, independent payment, expense, recurring profile,
   party/item and warehouse, inventory, opening balances, production and
   correction, must have writer-specific concurrent/rollback/lineage proof.
2. Every legacy trigger and direct Edge ingress must preserve exactly one
   authoritative capture producer, no bypass of retired-company fence, and
   correct lock order/privilege mapping. The four cron schedules need disposal
   evidence and per-scope boundaries.
3. Full historical owner/company snapshot must be complete and authorized,
   including old purged IDs, >2 MiB or >4,096-row datasets, tombstone retention,
   stable watermarks and failed-transfer recovery. Bound-overflow currently
   fails closed rather than producing a universal bootstrap.
4. Separate 2E typed financial command adapters and 2C/2D client atomic
   consumption are prerequisites for end-to-end two-way acceptance. A 2B
   server-only review cannot independently prove device sync.
5. Do not execute migrations, grant permissions, publish Edge or deploy Render
   until complete reviewed sequence, rollback rehearsal, old-client compatibility
   and explicit owner production authorization.

## Targeted evidence this session

- New fail-closed register tests: **3/3 PASS**.
- Combined selected server/identity/recovery tests: **86/86 PASS**, 11 suites; new independent equal-cash receipts regression **PASS**.
- `npm run typecheck`: **PASS**; scoped `oxlint`: **0 issues**;
  `npm run build`: **PASS** (existing Vite chunk and dynamic-import warnings).
- `psql` / `postgres` CLI not present in the local environment. Verified prior
  GitHub PostgreSQL company fixture only by its successful action conclusion;
  no new native multi-writer run was triggered.
- Full local coverage, live migration, physical Android and backup restore:
  **NOT RUN / NOT AUTHORIZED**.

**Next code step:** For each unresolved financial ingress, add a native
PostgreSQL 17 fixture with exact old-client SQL and actor/tenant role, then
verify DB row+receipt+group feed or authorized denial in the same transaction.
Keep the review SQL unpromoted, retain default-off flags, and re-run all
related negative tests. If a new GitHub push is separately authorized, use
only the reviewed delta and non-force `expected_sha` lease, followed by the
Setup 01 immediate CI-handover stop. No production action.

## Owner-approved phase-by-phase GitHub Actions simulation policy (2026-11-25)

- Finish **2B Server Simulation Acceptance** before declaring 2B complete or starting 2C implementation. Its sign-off is separate from later **Android A + Android B + Playwright Web** cross-device simulation (after 2C/2D client integration), and separate again from physical-device acceptance.
- The dedicated manually dispatched workflow `.github/workflows/sync-v2-phase2b-simulator.yml` runs three **isolated disposable PostgreSQL 17** fixtures (`company`, `trusted-device`, `lottery`) and targeted Phase 2A/2B TypeScript regression/closure-register tests. It captures log artifacts, Git SHA and immutable run link; it has **no Render deploy, no Supabase production credentials, no Edge release, no feature switch**.
- A green run certifies **only its tested scenarios**. The current fixture suite does not prove all historical RPC/trigger/cron/direct Edge writers, complete initial snapshot, authorization revocations, all cross-module balances, transport interruptions or lossless disaster recovery. `assessPhase2bClosure` must remain fail-closed while individual evidence is missing. Do not mislabel 2B as complete.
- For the later full E2E simulator, provision two separately identified Android emulators, an isolated browser and disposable server. Verify offline-save/reconnect, idempotent retry, same-amount distinct entries, tenant scope, concurrent conflict policies, recovery and matching balances. **Do not** implement a fake green E2E test before the real 2C/2D adapters exist.
- Only after **Phase 2B Server Simulation Acceptance PASS** can a phase be marked completed. Physical-device PASS remains a distinct future gate and the owner retains the overall Render/Supabase deployment freeze.
- Workflow and prior four-file closure patch are **local-only review candidates** at this checkpoint. All locally available typecheck, scoped lint, build and selected Vitest checks passed. The new GitHub-hosted workflow has **not run**; no claim of actual hosted CI PASS is made.
