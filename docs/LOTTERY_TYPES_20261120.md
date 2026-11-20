# Lottery strict types, quality and ledger review — 20 November 2026

Setup 01 · Task LOTTERY-TYPES-20261120 · Audit 12:18–12:28 IST (ongoing checkpoint).

## Source and impact

Remote main `db664078a227da5895519b9546fc3a2f765cba21`, tree `a14be044bd1da15bf44a28ace3b56550ff58d3dc`. Reviewed local equivalent `d35a435dc71e06eef82ec17cdbb6f6690f7241b4` has exactly that tree. Initial worktree clean. Scope: Deno type/import repairs, unused export, ledger presentation and read-only local sync diagnostics. HIGH impact adjacency: Edge JSON/auth/customer statements and Lottery service; no SQL/formula/storage migrations. UI summary totals, transaction dates, row detail and balance calculations retained. No customer record deletion or production financial writes.

## Actual CI failure

Quality #188 / run 44684924346: 195 suites / 1186 tests passed, then Knip rejected exported-but-unused `lotteryStateText`. Android candidate #73 / run 44684924391 succeeded. This Quality failure was not Deno. Removed export only; helper remains used internally. Existing coverage/Chromium/Sonar gates not weakened. Added pinned Deno 2.9.6 strict Edge check to Quality before coverage with pipefail and preserved report artifact.

## 22 baseline diagnostics and history

Reproduced 22 on pinned pre-change base `7d556654202a34727cd5d19a5c2f29d7519eafa6` with Deno 2.9.6, `check --cached-only --no-config --node-modules-dir=manual supabase/functions/orbis-khata-data/index.ts`. Counts: 2 missing module resolutions; 7 implicit row types; 2 dynamic indexing; 10 JSON argument types; 1 unknown SQL parameter. Missing imports create cascading diagnostics, not 22 independent accounting defects. Fixing those imports exposed two additional transitive extensionless type imports, also repaired.

The table attributes each flagged SOURCE LINE to git blame, not a proven first-failing Deno run. These dates do not prove the compiler/configuration in use at that historical moment would fail. No claim that all 22 were independently reported or known at those dates. First verified baseline comparison in this task history: 20 November 2026. Earlier report preserved findings but did not contain this detailed provenance.

| Diagnostic | Base location | Last source-line commit | Authored timestamp IST |
| --- | --- | --- | --- |
| 1 | `src/customer-view/read-statement.ts:3` | `74edf2a3` | 2026-11-01T23:59:10+05:30 |
| 2 | `src/accounting/business-error.ts:1` | `0824d291` | 2026-10-28T23:55:26+05:30 |
| 3 | `src/accounting/business-error.ts:57` | `838e7653` | 2026-10-29T00:03:03+05:30 |
| 4 | `src/customer-view/statement.ts:39` | `74edf2a3` | 2026-11-01T23:59:10+05:30 |
| 5 | `src/customer-view/statement.ts:39` | `74edf2a3` | 2026-11-01T23:59:10+05:30 |
| 6 | `src/customer-view/statement.ts:41` | `74edf2a3` | 2026-11-01T23:59:10+05:30 |
| 7 | `src/customer-view/statement.ts:41` | `74edf2a3` | 2026-11-01T23:59:10+05:30 |
| 8 | `src/customer-view/statement.ts:45` | `74edf2a3` | 2026-11-01T23:59:10+05:30 |
| 9 | `src/customer-view/statement.ts:45` | `74edf2a3` | 2026-11-01T23:59:10+05:30 |
| 10 | `src/customer-view/statement.ts:66` | `74edf2a3` | 2026-11-01T23:59:10+05:30 |
| 11 | `src/lottery/service.ts:54` | `5c65314d` | 2026-10-30T11:33:27+05:30 |
| 12 | `supabase/functions/orbis-khata-data/index.ts:73` | `74edf2a3` | 2026-11-01T23:59:10+05:30 |
| 13 | `supabase/functions/orbis-khata-data/index.ts:84` | `1352d0af` | 2026-11-01T18:40:10+05:30 |
| 14 | `supabase/functions/orbis-khata-data/index.ts:94` | `607b9011` | 2026-10-31T14:16:08+05:30 |
| 15 | `supabase/functions/orbis-khata-data/index.ts:105` | `607b9011` | 2026-10-31T14:16:08+05:30 |
| 16 | `supabase/functions/orbis-khata-data/index.ts:111` | `1352d0af` | 2026-11-01T18:40:10+05:30 |
| 17 | `supabase/functions/orbis-khata-data/index.ts:116` | `838e7653` | 2026-10-29T00:03:03+05:30 |
| 18 | `supabase/functions/orbis-khata-data/index.ts:168` | `838e7653` | 2026-10-29T00:03:03+05:30 |
| 19 | `supabase/functions/orbis-khata-data/index.ts:180` | `838e7653` | 2026-10-29T00:03:03+05:30 |
| 20 | `supabase/functions/orbis-khata-data/index.ts:180` | `838e7653` | 2026-10-29T00:03:03+05:30 |
| 21 | `supabase/functions/orbis-khata-data/index.ts:184` | `838e7653` | 2026-10-29T00:03:03+05:30 |
| 22 | `supabase/functions/orbis-khata-data/index.ts:192` | `838e7653` | 2026-10-29T00:03:03+05:30 |

## Minimal fix and financial review

Type-only imports now include `.ts`. Existing parsed/validated JSON boundary values are annotated using postgres's own JSONValue; same objects, serializer, parameter values, SQL and transactions. No reserialization, blanket `any`, `ts-ignore`, relaxed compiler options or force overwrite. The allow-listed JavaScript service invocation uses Reflect.apply with the same function receiver and exact original payload/owner arguments. Existing domain authorization/transaction validation unchanged.

TypeScript transpilation comparison with comments removed proves byte-identical emitted JavaScript for business-error.ts, read-statement.ts, statement.ts, opening-balance.ts, lotteryAccountingTypes.ts and the ENTIRE Edge index.ts. Service invocation regression checked with financial fixtures. Ledger removes intermediate date/count/Open day header rows only; normal dated transactions/details remain.

## Brown sync indicator

Verified source uses local owner/company-scoped IndexedDB seller rows: ERROR, SYNCING or PENDING, or local storage warnings. DEVICE-primary storage is also intentionally non-Synced and amber. Server data alone cannot reveal this phone/browser partition. No evidence yet identifies the owner's particular seller/date; do not invent a customer-specific cause. New indicator click reveals existing local party/date/state and storage warning in Bengali/Hindi/English without raw errors, financial payloads, retries or delete/reset controls. It is keyed by owner/company navigation scope to avoid carrying an open panel between accounts. No automatic deletion or forced green. Owner can provide this panel's observation before any decision about a stuck row.

## Local verification

- Deno 2.9.6 strict Edge check: PASS, zero errors (no sloppy-imports/no-check).
- TypeScript: PASS; production build + PWA worker contract PASS (existing chunk/dynamic-import warnings).
- 15 related suites / 80 tests PASS: service, customer statement, business messages, actual Edge transport, transfer, receipt, native pull, financial invariants/reconciliation/corrections/voids, ledger presentation and diagnostic UI.
- Knip PASS; two pre-existing config hints remain. Scoped Oxlint exit 0; existing vendor hook/ref warnings remain.
- Workflow YAML parse and strict failure propagation/report/gate preservation PASS. Identical emitted JavaScript checks: six modules PASS.
- Full local coverage/certification NOT RUN. Chromium/desktop, Sonar, new full coverage and Android build remain GitHub responsibilities after approved push. Physical device and owner-browser pending row NOT VERIFIED.

## Handover

Owner's standing push authorization applies after relevant checks. No further financial deletion is authorized; owner explicitly wants a report first. Matching live Edge v28 remains deployed; type-only Edge source produces identical JavaScript, so this task does not deploy or change database state. New frontend diagnostic requires updated web deployment/build to use. Signed AAB/Play release not initiated. Push SHA/status recorded in Drive after actual push; do not assume CI green.


## Follow-up — LOTTERY-SONAR-20261120 (20 November 2026 IST)

Source: main `bfba9e786279148bd94c208014de10bc18299d4b`, equivalent reviewed local `38e8315ba8aefc75d483843a69d7290442206b4e`; clean worktree before this follow-up. Owner reported new red run and explicitly requested root cause first, then fix. No production/customer writes or deployment in this follow-up.

### Exact failure and chronology

Quality run [44691915022](https://github.com/orbisaideveloper/orbis-khata/actions/runs/44691915022), job 136139457821, failed at Sonar analysis/strict metrics, not Deno/Knip. 197 suites / 1189 unit tests PASS, 60 Chromium mobile/desktop tests PASS; Deno/typecheck/lint/SQL/concurrency/Knip/JSCPD/build steps completed before Sonar. Sonar coverage 90.3%, duplication 0%, security hotspots reviewed 100%, security rating A and maintainability A. New reliability rating D and exactly two open issues caused failure:

- `typescript:S2871`, `src/sync/lottery-transfer.ts:14`: default Object.keys(...).sort() comparator missing. Issue key AaH3ypM7IgZiFB_Gef4s, CRITICAL.
- `typescript:S9382`, `src/native-local/lottery-sync.ts:12`: await inside organization loop. Issue key AaH3ypOnIgZiFB_Gef4t, MINOR.

Previous run stopped at Knip before Sonar could execute; fixing Knip exposed this downstream gate. These are different gate findings in the same initial Lottery pull implementation, not evidence that live financial records changed or a database conflict occurred.

### Minimal fix and compatibility

Explicit ordinal string comparator preserves exact previous UTF-16 key order; localeCompare is intentionally not used for persistent hashes, because locale collation could invalidate existing baselines. Independently scoped local IndexedDB reads now use Promise.all across company scopes, still awaiting all successful checks before syncNativeLottery. Any pending row/outbox or storage read error rejects without calling financial save. Reads do not mutate customer data. No hash algorithm/baseline schema, account scope, accounting formula, migration or force-overwrite change. Four source/test files plus this report and project checkpoint only. GitHub src paths trigger existing Quality and Android candidate.

### Reproduction and local evidence

Installed eslint-plugin-sonarjs 4.2.2, ESLint 9.39.1 and @typescript-eslint/parser 8.48.1 in a disposable directory outside the app repository, with scripts disabled; no app lockfile/dependency changes. Plugin README maps S9382 to core no-await-in-loop. Executed type-aware sonarjs/no-alphabetical-sort (S2871) and no-await-in-loop on EXACT old HEAD text vs working source: old transfer produces exactly S2871, old pull exactly S9382; revised sources produce zero findings for both rules. This is targeted rule reproduction, not a full hosted Sonar analysis; the hosted gate remains pending new CI.

Local: five relevant suites / 29 tests PASS (transfer/native persistence, local partition checks, diagnostic UI, ledger layout). Added tests for concurrent read barrier, second-company pending data/storage failure and preexisting Unicode/case-sensitive baseline digest compatibility. Typecheck, scoped Oxlint, Knip and diff check PASS; only existing Knip config hints. No local coverage/full certification. Production build/full browser/hosted Sonar/Android remain CI; prior run successes are not claimed as new-commit acceptance.

### Diagnostic location and limitations

Lottery company selector → round sync dot immediately LEFT of refresh. Click opens local party, accounting entry date and sync state, NOT sign-in date. It only exists in the updated frontend; source push alone does not deploy Render. Exact owner-phone pending row still NOT VERIFIED because its IndexedDB is on that browser/device. No row deleted/reset or manually marked synced. No unrelated navigation or accounting UI change in this follow-up.


## Sync diagnostic recovery UI — 20 November 2026

Task `LOTTERY-SYNC-RECOVERY-UI-20261120`, Setup 01, base remote main c3105fc9e1f045bb0cc8fcdb02eaff6c3399b51a. Initial local worktree clean. Owner deployed previous frontend and screenshot now verifies one local seller daily row dated 2026-11-16 in ERROR; this is sync status, not sign-in. Screenshot does not reveal stored failure code or prove the financial data is missing server-side.

Root cause of display defect: status popover lived inside narrow company header; header-wide small-button styling also affected nested controls and kept browser default square trigger. Fix: native top-layer dialog portaled to document.body with explicit dedicated CSS, responsive centered width/max-height, close ×, Escape/native modal keyboard behavior, round borderless larger status light. No new dependencies. Safe allow-listed local outbox lastError codes and plain-language explanation are fetched read-only for the authenticated owner/current organization; unknown raw errors never displayed. A guarded Review entry opens exact party/date through existing DailySellerEntry editRequest; waits for current seller flush, retains modal on failure. Existing daily bill autosave may retry on opening, disclosed in UI; manual payment behavior unchanged. No forced green, draft deletion, clear-cache/reset, overwrite or new direct financial write from diagnostic. Actual customer row remains unverified until owner uses deployed UI and reports failure code/outcome. A stale-version conflict may still need an explicit local-vs-server resolution after review; this task does not silently discard either version.

Files: src/lottery/LotterySyncDetails.tsx + test; src/lottery/lottery.css; vendor LotteryAccountingWorkspace.tsx; this report and PROJECT_STATUS.md. Existing ledger rows, calculations, auth/API/DB schema/native sync contracts unchanged. Risks: navigation/autosave adjacency and browser modal layout; owner/company component key preserved. Tests: three related suites /6 tests PASS; final diagnostic suite4 PASS; TypeScript, scoped lint, Knip, production build/PWA PASS. Targeted SonarJS recommended rules on diagnostic component zero findings. Existing vendor lint/build warnings remain. Local visual Chromium NOT TESTED: bundled browser absent, system Chromium aborts on socket() Operation not permitted; no escalation/bypass. Temporary preview fixture removed. Existing GitHub mobile/desktop browser+coverage+Sonar+Android candidate triggered by source push; no local coverage/full certification. No deploy/Play release/real account write or deletion in this task. Owner's standing scoped push authorization applies; CI results not polled after push.


## Guarded pending-entry recovery — 2026-11-20 17:11:07 IST

Task `LOTTERY-RECOVERY-20261120`, Setup 01. Owner explicitly approved popup recovery implementation and scoped push. Base remote main f10d5c8e5ab73043d058854870a81fbe5637cfdf, equivalent local043bc0c; initial worktree clean. Scope HIGH: seller draft retry, read-only export, identity/company guards, IndexedDB outbox/ack/archive atomicity, fallback persistence and UI. No new server endpoint, SQL migration, formula, payment mutation or Android→Web implementation.

### Previous red run

Quality44711733673/job136204847919: normal Sonar gate OK, coverage90.4%, duplication0%, Android44711733540 PASS. Strict zero-open-issues check failed S7776 (safeReasons array membership → Set/has) and S6819 (status paragraph → output). Both corrected without weakening any gate. Local plugin recommendations do not prove full hosted zero issues.

### Implemented behavior

- Popup shows the selected pending entry's dispatch/returns/commission, explicit Retry save and two-step Discard pending changes. Server conflict shows server quantities/commission beside the preserved pending values. Existing ×/Escape centered modal remains.
- Authoritative recovery read uses existing owner-verified lottery-export and an isolated local service projection with recurring-expense materialization explicitly disabled. Export schema, actor and organization are checked; no incidental server write from this read.
- Identical server input values resolve local acknowledgement without reposting. Truly unsent draft retries reuse original durable operation ID, sale ID and expectedVersion. Saved draft is read back before local clearance. Unknown operation, stale revision, posted/missing/ambiguous identity, offline read or actor switch fails closed. Posted accounting and payments are never deleted/corrected through recovery.
- Local confirmation/discard archives original row + operation in the same existing IndexedDB workingRecords store under SELLER_RECOVERY, then atomically removes only that selected working row/outbox. Normal row queries ignore archives. No IndexedDB schema upgrade; old installation rows remain readable. resolveSellerRecovery verifies exact current row and outbox. The actual readwrite transaction rechecks selected entity snapshots across browser connections; unrelated company keys are not blocked. Synchronous/asynchronous write failure aborts the whole transaction.
- Legacy localStorage fallback data is RETAINED. An exact-value resolved marker suppresses rehydration of the old resolved copy; a new edit clears the marker. Changed fallback or blocked storage stops clearance; no broad clear-cache/reset. Copies are local browser/device recovery history, NOT a Google Drive upload or a new general backup/restore UI.
- Parent recovery lock, current-save flush and owner/company scope token protect current editing/navigation. Current daily UI remounts after resolution to drop stale in-memory rows. Manual receipt/payment behavior unchanged. Generic full-app/payment recovery remains out of scope; this handles seller daily working rows.

### Verification and review

Six related suites /26 tests PASS: new draft retry, original-ID existing-draft update, already-saved confirmation without duplicate, exact server payment/ledger preservation on local discard, owner/company isolation, offline/uncertain acknowledgement, account switch, newer edits, two independent IndexedDB connections, recovery-copy write rollback, blocked fallback storage, retained legacy fallback and changed-fallback guard, server comparison/confirmation UI, existing receipt/ledger/native pull regressions. Early fixture setup errors (missing test stock and incorrect service sale envelope) corrected; no safety assertion relaxed. Final tests PASS.

TypeScript, production build/PWA worker, scoped Oxlint, Knip, JSCPD (zero clones) and diff check PASS; existing build/vendor/config warnings remain. SonarJS recommended type-aware checks on all three recovery/diagnostic source components return zero findings. No local coverage/full certification. Local visual Chromium was already blocked by socket permissions in the preceding task; no repeated attempt here. Full GitHub coverage/browser/Sonar/Android candidate expected from src push and NOT polled after push. Actual owner's pending row is NOT asserted recovered before deploying/testing this implementation.

Changed files: seller-recovery.ts + test; SellerRecoveryActions.tsx + test; LotterySyncDetails.tsx; lottery.css; seller-receipt-order.test.tsx; vendor DailySellerEntry.tsx, LotteryAccountingWorkspace.tsx, lotteryAccountingLocalStore.ts; this report and PROJECT_STATUS.md. No dependency/lockfile/auth/deployment changes. No actual production financial writes, deletions, DB reset, Play release or signed AAB dispatch performed. Edge v28 remains adequate for existing read-only export; updated frontend/new Android build required. Owner may review hosted CI and then deploy; keep genuine divergent server values for explicit comparison rather than force overwrite.


## Scoped seller recovery follow-up — 20 November 2026, 18:15 IST

Setup 01, task `LOTTERY-RECOVERY-SCOPED-20261120`. Status: **LOCAL VERIFIED; NOT COMMITTED/PUSHED/DEPLOYED**. Remote main independently checked `de2fa67f3252b47de3ce547213c6c73d3726758f`; initial clean local equivalent `4b984db4c0a43e634d2c225301d2c74d49f16b05` has the same tree `5b2ecea61bfff7cbefedd5c0716171f24a4894cd`. Owner requests a complete safe conflict-recovery implementation; no production financial repair has been executed. Customer-specific evidence remains in the private Drive handover, not in this repository.

### Root cause and reproduction

- Read-only inspection distinguished neighbouring-day bill identities and a historical reversed bill. Different day/reference numbers are **not** evidence of duplicate billing. The customer screenshot attaches an earlier-day reference to a later-day pending row; direct phone IndexedDB inspection was unavailable, so the exact historical sequence is unproven.
- Synthetic delayed-save reproduction demonstrated that `finishSavingRow` unconditionally assigned its acknowledgement identity to whichever day was currently rendered. Before the fix the test failed and could trigger repeated autosaves; after the fix it passes. Date/view generation gates identity assignment; row revision gates final clearance. Newer edits on the same day retain their values and receive the acknowledged ID for the next update, avoiding duplicate create attempts. Known wrong-party/day IDs are also quarantined before client autosave; the server service independently rejects a draft update attempting to move its identity to another party/day.
- Both previous recovery actions fetched a complete owner export before resolution. The inspected state exceeds 3.22 million characters even with whitespace removed, while the client rejects response text above 2 million. The focused transport test reproduces rejection of a >2M response and success of the bounded response. This is a demonstrated common blocker, not proof that no additional device-specific failure can exist.

### Implemented behavior and financial safety

- Added authenticated `lottery-seller-recovery` read. A single parameterized statement scopes owner, organization, party and business day and optionally includes only the previously referenced sale. At most three candidate sales are read; multiple live same-day bills fail closed. No ledger-wide/export download, customer-supplied owner or response-size-cap removal.
- Popup compares phone/server date, bill reference, dispatch, returns and commission. A wrongly linked previous bill's actual date/reference is shown separately. Explicit **Keep phone values** confirmation applies sale/return/commission only to this day's reviewed DRAFT with optimistic revision protection and a deterministic recovery operation ID. Repeated/uncertain requests are safe; changed server revision requires a fresh comparison; posted accounting is not overwritten.
- Explicit **Keep server values** / confirmed pending discard archives just the selected local row/outbox using the existing atomic recovery transaction. Server bills/payments and neighbouring days remain untouched. Identical server values can be acknowledged without repost. All archive/rollback, account/company isolation and newer-local-edit guards remain active.
- The selected resolved UI record is removed only after successful local resolution. The indicator derives green from actual remaining pending/error state; no forced green. Refresh reloads bill rows without remounting the receipt editor, retaining unsent manually entered payment amounts. Payments remain manual; this is not a server-transaction deletion tool or a general all-module recovery system.
- HIGH impact: gateway validation and read-only Edge query, shared Lottery service identity checks (web/native), async seller acknowledgement, popup recovery and local outbox. Financial formulas, DB schema, existing IndexedDB version, auth protocol, dependencies/lockfiles and CI thresholds remain unchanged. Rollback source only after review; retain archived local recovery copies and server operation history.

### Targeted verification

- PASS: 13 related suites / **101 tests** (seller recovery, popup, sync indicator, date/receipt preservation, seller receipt, service/domain/transport, gateway scope, disposable SQL, corrections/business invariants and native Lottery sync). Includes old-day/current-day preservation, explicit kept values, changed server revision, duplicate retry, posted immutability, account switch, newer local edits, offline reads, archive write rollback and cross-connection recovery conflict.
- PASS: actual scoped SQL executed on disposable PGlite PostgreSQL-compatible database, verified owner isolation and no writes. This is not production write or real PostgreSQL multi-client load certification.
- PASS: TypeScript and production build/PWA worker checks; Deno 2.9.6 strict Edge check; scoped Oxlint (existing vendor warnings); Knip (two existing config hints); JSCPD zero clones; type-aware Sonar recommended checks for five changed first-party production modules; `git diff --check`.
- NOT RUN: full local coverage/full certification, physical Android or customer's browser/IndexedDB recovery acceptance, local Chromium visual check (previous environment launch restriction). GitHub owns full coverage/Chromium/Sonar/Android candidate after an authorized push. Quality triggers main pushes; Android candidate includes changed `src/**`. No workflow/gate changes.
- A small final UI-copy check and production rebuild confirm the final comparison labels; no new financial behavior after the 101-test run.

### Changed paths

- `src/accounting/api.ts`
- `src/accounting/server-gateway.ts`
- `src/accounting/server-gateway.test.ts`
- `src/lottery/seller-recovery-contract.ts`
- `src/lottery/seller-recovery.ts`
- `src/lottery/seller-recovery.test.ts`
- `src/lottery/SellerRecoveryActions.tsx`
- `src/lottery/SellerRecoveryActions.test.tsx`
- `src/lottery/LotterySyncDetails.tsx`
- `src/lottery/lottery.css`
- `src/lottery/seller-receipt-order.test.tsx`
- `src/lottery/service.ts`
- `src/lottery/service.test.ts`
- `supabase/functions/orbis-khata-data/index.ts`
- `supabase/functions/orbis-khata-data/seller-recovery-read.ts`
- `tests/lottery/seller-recovery-read.test.ts`
- `vendor/foundation-lottery/src/admin/dashboard/sections/DailySellerEntry.tsx`
- `vendor/foundation-lottery/src/admin/dashboard/sections/LotteryAccountingWorkspace.tsx`

Documentation: this task section, `docs/PROJECT_STATUS.md` newest checkpoint, `docs/DECISIONS.md` dated recovery-policy addendum, and one private Drive START HERE task entry. README/INDEX/AGENTS/workflow/Android release policy unchanged (not applicable).

### Deployment and next exact action

Owner approval required before commit/push and separately before matching Edge deployment. **A new matching `orbis-khata-data` Edge deployment is required for this scoped-read endpoint and server identity guard.** The earlier statement that Edge v28 sufficed applied only to the earlier export-based recovery commit. No SQL migration or database reset. Deploy matching Edge before the new frontend/Android assets; an old backend will reject the new read safely. New Android assets require a fresh build, not a claimed existing installed update. After authorized push, record actual SHA in Drive and stop; owner checks CI. Real-device acceptance must resolve the affected pending row through the popup, verify adjacent-day bills/receipt ledger and no duplicates, and confirm the indicator becomes green only when no other error remains. No customer entry has been changed by this development session.


### Owner-approved release checkpoint — 20 November 2026, 20:09 IST

Owner explicitly authorized the reviewed scoped commit/push and matching Edge deployment, and required the popup to follow the selected language. Added tests for Bengali, Hindi and English controls/errors and the parent popup heading, summary and row state; localized previously English-only sync summaries. Final related run: 13 suites / 107 tests PASS, production build/PWA, scoped UI lint and strict Deno PASS. These six language cases extend the previous 101-test evidence; no financial behavior changed in this release step. Changed paths now also include `src/lottery/LotterySyncDetails.test.tsx` (22 total including docs).

Deployed the matching `orbis-khata-data` Edge function v29 ACTIVE with the existing custom central authentication and unchanged verify_jwt=false. Uploaded 44 graph files; all 41 runtime-source files returned by deployment readback exactly match local source. Three omitted files are confirmed type-only dependencies in the Deno graph, not missing runtime modules. No SQL migration or financial data write/delete. Commit/push actual SHA belongs in the post-push Drive handover; no claim that CI has run or passed yet. Render frontend/new installed Android acceptance remains separate.
