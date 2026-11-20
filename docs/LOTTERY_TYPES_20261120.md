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
