# Accounting completion — owner-approved scope, 2026-10-28

Baseline: main 80aa957c9e54d6f6bc54802920b22968a50706d0, Actions 40371513800 green.
This source snapshot is not a git checkout. No push, deployment, migration or
financial mutation is performed by this checkpoint.

## Requirements (not implemented by this document)

- Diagnose intermittent sale/purchase saves; propagate only allowlisted business
  error reasons, preserve uncertain-save retries and stable IDs.
- Permit negative stock and cash/bank balances with visible warnings, not blocks.
  Permit historical transaction dates; recompute affected reports and running
  balances. Keep immutable recorded-at timestamps separate from effective dates.
- Display two-decimal rates, explicit exact-money round-off and reconciliation
  when amount-driven pricing would otherwise change the entered total.
- Save invoice and optional immediate cash/bank settlement atomically and
  idempotently; later partial/full settlement remains independently available.
- Professional party ledger: date, reference, description, bill, receipt/payment,
  running balance; opening/period/closing totals; accessible row opens saved
  invoice/payment. Full selected-range PDF/Excel export and user-invoked sharing.
- Compact edit/delete icons on bill/payment rows and record details. Edits show
  before/after review and confirmation. Deletes always require TWO independent
  confirmations. Correct/reverse financial postings with audit history; update
  stock, settlements and balances atomically. Do not silently destroy history.
- Payment accounts in Settings, default Cash/Bank; configurable bank accounts and
  payment methods, with UPI providers linked to an account to avoid double count.
  Summary cards drill into every underlying account/party and record.
- Unify Home/Accounts navigation; Figma-assisted consistent mobile presentation.
- Company deletion: double confirmation, hide/recover during retention, then
  scheduled tenant-scoped purge including dependent files. Thirty days was
  proposed, not explicitly selected by owner; resolve before irreversible purge.
  Central identity and other companies must remain intact. Verify backup limits.

## Evidence / diagnosis

- Screenshot upload/96053.jpg: sale S-9BA84ACA dated 2026-10-27, Milk 123 litre
  x INR48 = INR5904, B/F0. Arithmetic correct; generic error does NOT identify
  actual failing condition. Do not claim exact production cause established.
- InvoicePage.save collapses almost all errors to generic invalid-fields text.
  API uses Error.message KHATA_DATA_REQUEST_FAILED and retains SQLSTATE in code;
  gateway returns SQLSTATE only, suppressing business reason.
- Current inventory RPC blocks STOCK_DATE_BEFORE_ACTIVITY and INSUFFICIENT_STOCK.
  Owner explicitly supersedes these blocking policies with warnings.
- Existing sales/purchases use inventory-post; only expense bills have method.
- PartyTransactions currently has date/description/amount, no row drill-through.
- Targeted read-only investigation: 4 files, 20 tests PASS before this checkpoint.

## Resume protocol

Read AGENTS.md, decisions, project status and this checkpoint. Inspect actual
files/remote HEAD before edits. Complete coherent local slices with targeted
evidence and update this file after each slice. Never label pending items done.
Keep migrations additive; test transaction rollback, duplicate retry, historical
dates, negative balances, edits/reversals and tenant boundaries. Production
migration/deployment needs the applicable explicit authorization. No live purge
or customer fixtures during testing.

Credits/session interruption cannot automatically schedule execution. On next
owner message to resume, continue from recorded evidence, not from scratch.

Next: safe business-error contract and complete DB/financial correction design;
then implement backend and matching demo behavior before exposing mutation UI.

## 2026-10-28 — Date filter implementation checkpoint

Additional approved requirements: mobile ledger must fit screen; date/reference/
category precede invoice and settlement amounts and running balance. Avoid dated
cards; footer totals follow selected party/range. User-defined bill references,
short optional serial numbers, separate sale/purchase/expense settings. Do not
interpret this as permission to overwrite historical invoice references.

Implemented locally: reusable DateRange and exact calendar preset helper wired
into Home and current overview/ledger/expense/stock screens and Accounts. Today,
yesterday, inclusive last seven days, month-to-date, custom; bilingual/trilingual
labels, wrapping mobile controls, bounded native date inputs. Manual dates remain
visible. Existing company/report filters preserved. Targeted 29 tests PASS;
component behavior test and final typecheck run separately. No financial policy,
SQL migration, bill numbering, export or correction feature implemented yet.

Files: src/accounting/{DateRange.tsx,DateRange.test.tsx,date-range.ts,
date-range.test.ts,Accounting.tsx,accounting.css}; src/demo/DemoWorkspace.tsx.
No push, migration or deployment. Next: safe error reason contract; financial
mutation migration design and tests before remaining UI work. Full feature scope
above remains pending, not certified complete.

## Active implementation 2026-10-28 — DO NOT claim finished

Owner explicitly authorizes completing the whole scope, pushing main after checks,
and checking Actions; owner will deploy frontend. Do not trigger Render deployment.
Local source remains authoritative. Baseline archive extracted to /tmp/khata-baseline
for exact diff; remote main still 80aa957 on initial read.

Implemented locally (verification still in progress): business reason allowlist;
workspace API contract and Edge dispatch; additive v3 SQL migration with signed
stock/historical entries, atomic bill+settlement/roundoff, account settings,
number reservation, auditable corrections, company retirement/restore and private
30-day purge + pg_cron schedule. Invoice partial settlement, warnings, two-place
rate display, new payment entry and pending recovery, settings UI, mobile ledger,
record detail/edit/delete and real XLSX/PDF export. Expense record support added.
Figma session 76c5c3b8-10c7-42cf-a404-a0f00cf9d879 inspected existing design; further
calls hit Starter cap. No new Figma design completed; continue actual browser QA.

Database migration + rollback tests ran successfully (including authenticated
role): historical negative sale, partial payment, idempotency, correction reversing
linked payment/stock, retirement/restore and cross-owner rejection. NEW purge test
was added afterward and needs execution. All DB experiments rolled back. No live
migration or Edge deployment yet. Migration path:
supabase/migrations/20261028000100_khata_accounting_completion_v3.sql.
Rollback fixture docs/accounting-v3.rollback-test.sql. Rerun exact latest together
in one begin/rollback; then verify schema/data unchanged. Cron extension available
but not installed in live DB (rolled back). Existing two companies untouched.

Tests: new workspace/record/model 13 pass; fixed old policy tests and mock boundaries.
Latest full run /tmp/khata-all-v3.log was BEFORE fixes (stale failures). Latest targeted
/tmp/khata-targeted-fixed2.log. Need complete coverage (unchanged90/90/90/85), browser,
lint/type/KNIP/JSCPD zero, Sonar. Local Sonar analyzer only found InvoicePage complexity
16; helper extraction after that should fix; rerun. No thresholds weakened.
Potential unfinished work: full record editor fields, expense details tests, company
purge rollback proof, account breakdown reconciliation/period dates, user-ID recovery
for corrections, mobile browsers/exports, preserving original bill details on edit,
full CI and exact remote push. Inspect actual files and logs before continuing.

## Latest repair checkpoint (same task, continuing)

Fixed navigation tests for new Company and Receive/pay routes; full TrialUI A-Z
passed in targeted run, DemoApp7/7, LedgerExplorer7/7 and OverviewDetails4/4 now
pass. Local Sonar cognitive/nested-regex subset has ZERO issues; JSCPD zero clones;
Typecheck and build/PWA pass. Removed two unused exported types for KNIP.
Full coverage currently running to /tmp/khata-coverage-current.log; browser run
/tmp/khata-browser-current.log. Do not trust earlier stale full failures.
Current commands started by this turn: coverage exec session21306, browsers10583;
may not survive next turn, inspect output files before rerunning. No push/migration.
Still must audit financial correctness, complete missing settings/record fields,
cover new UI and exports to unchanged thresholds, run exact SQL purge rollback,
finish mobile/desktop proof, push main then CI. Owner explicitly asks persistence;
do not present incomplete work as completed or deploy frontend.

## Latest owner insists on end-to-end completion and green push

Full coverage original:469 tests passed but global S84.45/F82.88/B84.01 failed
unchanged gates. Added Settings6, Payment4, ExpenseDetail4, ledger-download3 and
AccountBreakdown2 meaningful tests; their targeted runs pass (last2 pending log).
Expanded coverage /tmp/khata-coverage-expanded.log is active session63829.
Browser fixtures now explicitly handle workspace and retired-companies. Signup
passes. Invoice design radio failed because decorative bill-mini-paper subtree
intercepts pointer events; fixed real CSS pointer-events:none (no forced clicks).
Browser rerun /tmp/khata-browser-repaired.log started before CSS fix; inspect final
then rerun relevant bill test. Original suite20 cases, not newfeature E2E yet.
Local JSCPD0, KNIP passes, typecheck/build pass before newest tests. Must fix unused
imports in newtests (within/waitFor) before final tsc. No push, migration or deploy.

## Latest results 18:20 UTC (same authorized completion task)

Expanded coverage: statements90.4 branches86.92 lines92.43 PASS; functions89.05
FAIL unchanged90 threshold. Added saved-bill editing test (RecordDetail6/6 passes)
and AccountBreakdown2 tests; coverage rerun /tmp/khata-coverage-last.log active.
All unit tests in expanded run passed. Browser corrected fixtures:19/20 pass;
remaining mobile invoice design pointer issue FIXED in CSS; targeted exact mobile
and desktop bill PDF rerun2/2 PASS (/tmp/khata-bill-browser-fixed2.log). No forced
clicks, no threshold/retry/exclusion changes. Typecheck passes including newtests.
No GitHub push yet. Still need full completion/gates, latest SQL purge proof,
backend migration/Edge coordination, exact commit push and green CI. Keep working.
