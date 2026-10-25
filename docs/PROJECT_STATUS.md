# Inventory retry storage hardening — 2026-10-25

Main 9f3900ad5bd298c92761deb0b8b2cf61551ebcc9 pushed successfully after
full local certification. GitHub run 40194902343 passes unit/coverage/build
and browser gates. Previous S3776 gateway complexity issue is resolved.
Sonar API reports one open tssecurity:S8475 at Inventory.tsx storage write,
flowing from pending.ts restore; new security rating B fails required A.
New coverage 96.7%, duplication 0.0%, other gate conditions pass.

Inventory retry storage now encodes the serialized command, matching the
existing voucher recovery pattern. Restore accepts encoded and legacy JSON,
bounds encoded/decoded lengths, and revalidates the full inventory command.
Existing pending commands are not deleted or assigned new IDs. Added tests
for exact same-ID retry, stored encoding, Unicode, legacy data, malicious
markup/extra fields, malformed encoding and size limits.
Local: 49 targeted tests, typecheck, zero-warning lint, KNIP and JSCPD PASS.
No financial/schema/auth changes, no security rule suppression or threshold
reduction. Phone full certification, owner-run commit/push and fresh Sonar
verification remain pending. No assistant remote Git/deploy/database writes.

# Deterministic accounting status assertion repair — 2026-10-25

Main remains 2a7bddf; gateway complexity fix is installed but not pushed.
The 16:25:34 phone certification passed; its subsequent fetch failed DNS.
Owner reran the installer at 16:43:04: 335/336 tests passed; the invalid-amount
Accounting test selected a global single status while both Loading expenses
and the intended invalid-amount output were present. Coverage percentages
were above threshold; the failing assertion, not the threshold, blocked release.

Reproduced the exact multiple-status failure locally by delaying the expense
report deliberately. Test now selects the intended visible output text, still
asserts no financial post and confirms Cancel closes the form, then resolves
the pending expense load. Similar ambiguous status assertions in both Accounting
test files now select their intended message. Production financial code unchanged.
Local red→green: reproduced original failure; all 32 Accounting tests, typecheck
and zero-warning lint PASS. Verification runner now preserves the complete
failed-stage log in the one final report instead of dropping errors above the
last 45 lines. No thresholds/timeouts were changed and no tests were skipped.
Next: guarded phone full certification and owner-run commit/push of gateway,
test and report fixes; verify fresh remote Sonar. No assistant Git/deploy/DB writes.

# Remaining gateway Sonar complexity — 2026-10-25

Owner pushed main 2a7bddf774bcf41d31e604312c18684fb3839871 after full local
certification. GitHub run 40184772142 passes tests/build/browser and standard
Sonar gate; strict zero-issue check fails on exactly one remaining S3776 issue.
Public Sonar API read confirms server-gateway.ts khataOperation complexity 18
(limit 15), reduced from 20 but insufficient in the first repair.

Refactor moves only operation validation into a boolean type-predicate
function with direct switch returns; the public envelope validator checks the
result once and returns the same operation/input object. This removes nested
ternary returns rather than merely extracting one compound condition. All
ownership, session, operation and financial payload rules remain unchanged.
Local: 24 gateway/inventory gateway tests PASS; typecheck, zero-warning lint,
KNIP and JSCPD PASS. No rule suppression or threshold reduction.
Next: owner runs guarded repair → full certification → commit/push, followed
by fresh remote zero-issue verification. No remote Git/deploy/database writes
performed by the assistant. Expense/inventory activation remains pending.

# Sonar issue repair — 2026-10-25

Owner pushed main c88e05819173fad7eda1a52945958b82aa7b871e.
GitHub run 40182058425: all 336 unit tests, coverage, lint, typecheck, build,
KNIP, JSCPD, browser tests and standard Sonar quality gate PASS. Strict overall
checker failed because 11 open issues remained. Uploaded Sonar detail report
20261025-153721 identifies all 11 across five source/test files.

Fixes: native output status notices (block layout preserved); extract shared
paged-report validation; assertion uses toHaveLength; explicit early-return
braces; new Error; item-line keys use complete line identity and duplicate
occurrence rather than array position; Unicode codePointAt; bounded six-digit
trailing-zero regex. No financial command/schema/auth contract changes.
Local: 50 targeted tests, typecheck, zero-warning lint, KNIP and JSCPD PASS.
No lowered thresholds, excluded source or suppressed rules. Fresh phone final
certification, owner-run correction commit/push and remote Sonar zero remain
pending. No remote Git write/deploy/database write performed here.

# Final release coverage repair — 2026-10-25

Phone certification 14:25:55–14:33:19 IST: Ubuntu preflight, KNIP, JSCPD,
14 mobile/desktop browser tests including PWA offline reopen, npm dependency
check, audit (0 vulnerabilities), lint, typecheck and build PASS. All 330 unit
tests PASS; final gate blocked only on global function coverage 88.37% < 90%.
Source/Git integrity PASS; baseline main eca4181. No Git/cloud/financial writes.

Added inventory UI tests for transfer quantities/destination exclusion, line
removal, item search, bill preview/print/close, pagination, failed-report retry,
edit cancellation and definite rejection recovery. Added API tests for exact
company/period/page scoping, reviewed command forwarding and uncertain errors.
Production financial logic, PWA/auth/cache and coverage thresholds unchanged.
Local: 25 inventory tests PASS; targeted inventory coverage S/B/F/L
93.83/89.80/98.91/98.16; typecheck and zero-warning lint PASS. These are targeted
figures, not global phone certification. Final full phone verification and
remote CI/Sonar remain pending. Owner pushes only after reviewed certification.
Expense/inventory migrations, gateway activation and live deploy remain pending.

# PWA source checkpoint — 2026-10-25

Baseline main eca4181; phone item installer report 12:21:52–12:23:26 IST
confirmed typecheck/lint, all 127 selected tests, diff and source integrity PASS.
PWA static cache, trilingual connection/update status, manifest/icon, production
worker checks and offline browser test added to the same uncommitted release.
Local PWA/related UI: 24 tests PASS; typecheck/lint/KNIP/JSCPD PASS; worker VM PASS.
Browser and final coverage/CI/Sonar/phone installation remain unverified.
No Git write, remote setting, deployment, migration or financial data change.
Next: install the reviewed PWA source on phone, then the existing final verify
runner (Ubuntu preflight → KNIP → JSCPD → Playwright → Termux → coverage last).
Owner pushes once only after certification. Expense/inventory cloud activation
still pending; this PWA does not make backend functions live or fix proven latency.

# Current checkpoint — 2026-10-25 pending inventory lock repair

Phone installer: typecheck/lint PASS, 126/127 tests PASS; recovery lock assertion
observed an unlocked company selector. Initialize the Books inventory lock from
the validated stored command immediately, before child effects/report loading.
The test now holds the inventory report pending and checks the lock both before
and after it resolves. Local 32 focused tests, typecheck and zero-warning lint PASS.
No timeout, assertion, coverage gate, financial rule or database data is relaxed.
Phone recheck and all previously documented cloud activation steps remain pending.

# Current checkpoint — 2026-10-25 items, stock and workspace menu source

- Baseline main eca4181b7349023457c7f5d96874ff766927b96b; GitHub quality success;
  owner manual Render deploy dep-dbepe3bncjis73f0kmfg confirmed LIVE at that revision.
- Prepared company item/code/custom fixed unit and godown masters; fractional
  purchase/sale bills, per-godown stock/period balances, opening quantity, godown
  transfer, bill history/view/print and existing-voucher stock-aware reversal.
  Bill/stock/party-dues updates are atomic and exact retries are idempotent.
- Prepared three-dot Account & profile/Tutorial/Log out menu, separate styled
  shared-profile page and tutorial default OFF with trilingual persistent toggle.
- New database objects have RLS, gateway+owner checks, immutable records, private
  privileged write boundary, emergency switch and no direct authenticated writes.
  No old book/owner/actor or Central identity is rewritten.
- Focused React/model/gateway tests, app TypeScript, zero-warning lint, KNIP,
  0.00% JSCPD and Vite build checked locally. Private PGlite 39 checks and mocked
  Edge adapter 11 checks PASS. Evidence is development validation, not live use.
- Updated central browser tests to open the new menu/profile route; those browser
  tests are not run here. Full coverage, final certification and new CI/Sonar
  remain required before release; thresholds/exclusions are unchanged.
- Live read-only schema check found expense table/RPC absent despite frontend
  deployment. Expense activation and new inventory migration/gateway/Frontend
  activation remain pending; do not claim either is working live.
- Prepared SQL: docs/inventory-v1.review.sql, NOT APPLIED. Gateway now requires
  inventory/model.ts as its fourth bundled file. See INVENTORY_ACTIVATION.md for
  limits, activation order, explicit approvals and practical owner acceptance.
- No remote Git write, managed migration, deployment or live financial mutation.
  Next: owner runs the source-only installer and uploads its one Downloads report;
  inspect phone result before final certification or release/activation.

# Current checkpoint — 2026-10-24 expense phone verification repair

- Owner phone expense installation completed, but its 22:24:28–22:25:41 report
  failed: 193/194 tests passed; storage-block test timed out after 5000 ms.
  Typecheck passed. Lint had one set-state-in-effect warning, not zero warnings.
- Test now spies on Object.getPrototypeOf(sessionStorage), the actual storage
  implementation, rather than assuming the global Storage constructor matches
  it on Android Node/jsdom. The synchronous blocking message is asserted directly.
  No test timeout, test count, coverage threshold or safety assertion is relaxed.
- Expense component derives invalid date-range/loading state during render and
  does not set React state synchronously from the invalid-range effect branch.
- Local focused accounting tests: 107/107 PASS; selected-source TypeScript PASS.
  Phone's complete 194-test selection and lint with deny-warnings still required.
- No financial rules, SQL, gateway authorization, deployed code, database rows,
  Git commit/push or Render configuration changes in this repair.
- Next: run the single repair installer, inspect the completed Downloads report,
  then continue the previously documented owner-controlled cloud activation.

# Current checkpoint — 2026-10-24 business expense source delivery

- Owner requested complete ordinary expense accounting. This slice includes
  named expense accounts, payee/reference/notes, direct cash/bank expenses,
  unpaid bills, partial/full settlement, period/category reporting, as-of dues,
  audited opposite-entry corrections and safe exact-ID retries.
- Expenses post when incurred; settlement reduces cash/bank and expense dues
  without posting another expense. No inventory valuation or net-profit figure
  is invented. Complete inventory/P&L and other accounting expansion remain separate.
- Added one immutable, owner-isolated expense event subledger and paired journal.
  Existing cash/bank and journal checks include expense postings. Existing
  company/party/voucher records and Central IDs are not rewritten.
- RPC writes require the real gateway transaction marker, owned company,
  enabled write control, exact amounts, valid dates and linked original entry.
  Company locks serialize settlement/reversal; overpayment and backdating before
  prior linked activity are blocked. Corrections preserve original records and
  historical as-of figures; reverse linked payments before an unpaid expense.
- Added Bengali/English/Hindi expense entry, review/confirm, custom account
  names, reports, bill settlement and explicit correction confirmation.
  Uncertain saves retain the exact command in scoped session storage for retry.
- Local targeted validation: 107 Vitest tests / 9 files PASS; 37 private PGlite
  checks PASS (including original accounting/owner isolation), 9 mocked Edge
  adapter checks PASS; selected-source TypeScript and lint exit 0.
  Fixture originals are preserved. These are not live financial acceptance tests.
- Working base main 5351b05a940c58586817275d8744edf7847faf0e plus installed
  owner bridge and speed fix. Owner phone speed report 21:34:58–21:35:49 IST:
  typecheck/lint, 97 targeted tests and diff check PASS.
- Expense migration docs/expenses-v1.review.sql is PREPARED, NOT APPLIED.
  Gateway expense RPC routing is PREPARED, NOT DEPLOYED. No live expense data,
  Git commit/push, Render deployment/plan or production database change here.
- Next: owner runs one Termux expense installer (backups, hashes, typecheck,
  lint, accounting/session tests, diff check, one Downloads report). Inspect
  that result, then complete the owner-controlled release/activation described
  in docs/EXPENSES_ACTIVATION.md. Real phone/hosted save/reload/retry acceptance,
  full certification and new-source CI/Sonar remain pending.

# Current checkpoint — 2026-10-24 session request performance candidate

- Owner Termux trial setup 18:08:08–18:08:37 IST passed: typecheck, lint
  (zero warnings/errors), 22 gateway tests and diff integrity. Owner confirms
  both existing companies now open; reports more than 20 seconds of waiting.
- Read-only runtime evidence near 18:22 IST: product POST execution 1168 ms and
  642 ms; Central Admin free service restarted shortly before these requests.
  These are backend timings, not measured end-to-end mobile timings.
- Current working base: main 5351b05a940c58586817275d8744edf7847faf0e plus the
  installed trial gateway/ownership checkpoint. No commit/push in this candidate.
- Changed src/auth/customer-session.ts: reuse an in-memory remotely established
  unexpired token for gateway calls; join pending restoration/refresh; retain
  the 60-second refresh margin and cold-storage remote verification. Failed
  verification invalidates runtime reuse. Password changes still force restore.
- Server gateway still verifies the live Central session on EVERY operation;
  no auth-result cache, financial-data cache or authorization bypass was added.
- Added src/auth/session-performance.test.ts: repeated-read request counts,
  cold restore, refresh coalescing, revocation, outage, logout, account switch,
  unverified storage and real gateway denial before database execution.
- Focused local protocol/recovery/API tests: 75 tests / 7 files PASS using
  mocked network responses. Owner Termux typecheck/lint/tests remain required.
- Phone/hosted performance improvement, mobile E2E, full certification and
  latest-source CI/Sonar are NOT certified by these mocked tests. The initial
  login endpoint itself and Render idle wake-up behavior are unchanged.
- This candidate makes no external database, identity, financial, Admin,
  Render plan, deployment or remote Git changes. Free-server idle wake-up is
  a separate hosting decision; no paid upgrade is authorized or applied.
- Next: run the speed installer in Termux; reload local preview and compare
  company changes after login. Inspect the single Downloads report, then
  complete owner-controlled certification/publication before hosted acceptance.
- Pending feature order remains Party/Ledger Master, Item/Unit, itemized bills,
  Inventory, Delete/Void, then Dashboard/Reports. No expansion is claimed here.

# Current checkpoint — 2026-10-24 trial connection setup

- Owner confirmed both existing companies, three parties and four vouchers are
  their unreleased development trial data and approved mapping to ORB-U-365HD9A3.
- Central UUID remains 01a1454a-2134-7365-8d9a-3ed6b49f0b12; Admin identity/profile unchanged.
- Managed Khata migration 20261024042046 central_owner_bridge_preserve_trial_books applied.
  Private mapping resolves to legacy ledger owner 7d88bc43-4768-4279-ae3d-7626830f3a8e.
- All three full-row financial-table fingerprints unchanged after mapping.
- Existing voucher actor IDs, amounts, posting/report functions and immutability retained.
- Live transaction/RLS checks: mapped owner sees two companies and four vouchers;
  direct legacy JWT is blocked; a synthetic new principal sees no legacy rows (rolled back).
- orbis-khata-data Edge Function version 3 deployed with remote central-session
  verification, preserved owner resolution and exact-origin CORS. Configured service key
  selects the service endpoint; without one the existing public central-session endpoint
  verifies the customer. Trial public-session mode shares Admin's 30/min/IP limit;
  review service rate limits before customer release. Platform JWT verification is off
  because the function verifies the user's live Admin session before all data operations.
- Uses server-provided SUPABASE_DB_URL fallback; no DB credential is in source or browser.
- Render Khata deploy dep-dbe36doae00c73bg4osg is live at 5351b05 with VITE_KHATA_DATA_URL
  set. Built asset contains both correct central and product URLs. Auto Deploy remains off.
- Local fixtures: 18 PostgreSQL/PGlite checks and 7 Edge adapter checks pass.
  Public HTTP: preflight 204, missing token 401, denied origin 403. Malformed token
  reaches Admin Auth but currently returns 503 through Admin's upstream-403 mapping;
  it is denied without database access. No real-customer readiness certificate claimed.
- Owner Termux delivery must preserve the deployed Edge source and two SQL review docs,
  configure .env.local, then run targeted tests/lint/typecheck. No automatic commit/push.
- Real signed-in browser book access, expiry/revocation acceptance, full certification,
  mobile E2E and latest-source CI/Sonar remain pending. No customer account was created.

Historical checkpoints below are not the current runtime/deployment state.

# Project Status — Durable Resume Checkpoint

## Latest checkpoint — 2026-09-24 documentation reconciliation

- Current main HEAD inspected: `3d1d7c5145eb62137dbc9c5da834023c5adf14b8`.
- Documentation is being reconciled to the current implemented accounting foundation.
- Implemented foundation: Auth/company boundary, multiple companies, company-scoped
  parties, Sale/Purchase, Receipt/Payment, advances, Cash/Bank, party ledger/totals,
  exact money, retry/idempotency, tenant isolation and immutable reversal.
- Current source audit confirms Party/Ledger Master is still incomplete; Item/Unit,
  itemized Sale/Purchase, Inventory and Delete/Void are not yet implemented.
- Owner-approved next order is: Party + Ledger Master → Item + Unit Master →
  Itemized Sale/Purchase → Inventory → Delete/Void propagation → Dashboard/Reports.
- This documentation update does not implement a product feature and does not authorize
  deployment, database changes, Auth-setting changes or a Git push.
- Exact-SHA GitHub Actions/Sonar status is not certified by this checkpoint.
- Deployment remains OFF/not authorized.
- Historical checkpoints below remain evidence only; they do not override this current
  checkpoint or the current source.

## Latest checkpoint — 2026-09-22 coverage and reporting repair

- Phone final run 20260922-083611-15187 stopped on coverage: one UI wait timeout,
  statements 85.68%, functions 82.4%, branches 80.97%. No commit/push occurred.
- Added observable UI tests for authenticated navigation/logout, company/party scope,
  date/pagination filters, all posting types, exact retry identity, invalid amounts,
  recovery-storage failure, pending navigation and existing correction behavior.
- Android jsdom concurrency limited to 2 workers; asynchronous UI readiness timeout
  5 seconds. Coverage thresholds remain lines/statements/functions 90%, branches 85%.
- Local candidate: 75 tests / 9 files PASS; coverage statements 96.25%, branches
  91.46%, functions 99.2%, lines 99.67%. Typecheck, KNIP, JSCPD PASS (0 clones).
  Lint exits 0 with 3 existing React effect warnings; no clean-warning claim.
- Release wrapper collects exact-run stage logs on both success and failure into its
  Downloads report, with final outcome and timestamp. Phone final certification and
  exact new commit CI/Sonar still pending; local coverage is not a remote certificate.
- No new product features, schema, auth settings or financial records changed here.
  Delete, full party details, items/units and inventory remain the next approved scope.

## Latest checkpoint — 2026-09-22 release preparation

- Phone accounting installer verified exact hashes and passed 59 tests / 8 files;
  TERMUX-CMD-20260922-072905-301042456 exit=0. Source is installed, not yet committed.
- GitHub main remains 2eb03ce151d9e80607378e9fa4ce9d69bd5657ed; its old quality job
  35570208557 is success. This is NOT a scan of the new Auth/accounting source.
- Owner requests current checkpoint commit/push then Sonar before next features.
- Release fix: remove unused exported Party type (KNIP failed then passed); include
  *.test.ts alongside *.test.tsx in Sonar test classification. No threshold reductions.
- KNIP and JSCPD pass on prepared source (0 clones). Final permanent khata verify
  still required on the exact phone source, including Ubuntu browser and coverage gates.
- Next action: apply release-preparation patch and run python scripts/khata.py verify;
  inspect exact-source completed report, repair any failing gate, then authorized push
  and main Actions/Sonar inspection. No new branch/PR/staging/deploy/DB changes.
- Delete-with-two-confirmations and full party/item/stock scope recorded in DECISIONS;
  not implemented yet. Existing reversal-only behavior remains until next migration.

## Latest checkpoint — 2026-09-21 Auth candidate

- Packaging correction: first ZIP failed at `git apply --check` on the owner's clean
  expected HEAD. Reproduced all eight failed paths using exact GitHub blob bytes.
  The packaging copy had appended an extra trailing newline to every baseline file.
  Rebuilt patch from base64-decoded GitHub blobs verified against their Git SHA-1 IDs;
  strict patch application and byte-for-byte comparison of all 19 resulting files pass.
  Earlier synthetic-copy patch verification was insufficient and is superseded.
  User screenshot shows Confirm email OFF; saved server state has not been rechecked.

- Base: main `2eb03ce151d9e80607378e9fa4ce9d69bd5657ed`; prepared copy only, phone not modified.
- Added trilingual signup/login/recovery, persisted session restoration and refresh,
  local logout, company setup UI and an unapplied owner-isolated SQL proposal.
- Owner instruction: verification must not gate signup; app lock off; shared ORBIS IDs later.
- Changed: `src/App.tsx`, `src/App.css`, `src/App.test.tsx`, `src/auth/*`, package manifests,
  `scripts/khata.py` (known new source paths and default account test selection), decisions,
  this checkpoint, `docs/AUTH_SETUP.md`, `docs/khata-company-proposal.sql`.
- Targeted tests, source lint and TypeScript/build run locally; see delivered verification report.
  Full certification/coverage, Android appearance, hosted Auth/recovery and live RLS tests pending.
- Read-only live evidence: Khata public schema empty; email Auth on, signup on,
  `mailer_autoconfirm=false` (Confirm email still enabled). No production settings changed.
- No Git commit/push, GitHub main change, staging, deployment, Auth user creation or DB write.
- Next: owner applies source patch in Termux and previews; separately authorize the proposed
  table/RLS and turn off Confirm email. Configure recovery redirects/SMTP before live release.
- Earlier checkpoints below are historical and do not supersede this entry.

**Last updated:** 2026-09-15 UTC
**Repository:** `orbisaideveloper/orbis-khata`
**Current baseline branch:** `main`
**Main baseline before this work:** `d6f5a00011642c5fc1b6b543b0319244c62fbb6c`
**Baseline content commit:** `154b4e8d1d43083bbd63f1386cd51f19399640db`
**Correction source branch:** `chore/project-baseline`
**PR #1:** GitHub automatically classified it as merged when `main` was fast-forwarded to the same verified commit; no PR merge action was used
**Phase:** Product and architecture baseline
**Production code:** Not started

## Completed in this checkpoint

- Created the standalone public GitHub repository with initial README.
- Confirmed separation from Orbis Foundation and other product databases/deployments.
- Created an isolated baseline branch.
- Converted the earlier full concept into structured, AI-readable repository documentation.
- Recorded mandatory AI/contributor rules, architecture boundaries, MVP scope, workflow and durable decisions.
- Preserved the mobile/Termux verification model and production smoke requirement.
- Corrected the workflow to feature branch → verification → one owner-authorized direct update to `main`, with no default PR, PR Preview or staging.

## Baseline file set

- `README.md`
- `AGENTS.md`
- `SECURITY.md`
- `docs/PRODUCT_BLUEPRINT.md`
- `docs/ARCHITECTURE.md`
- `docs/MVP_SPECIFICATION.md`
- `docs/DEVELOPMENT_WORKFLOW.md`
- `docs/DECISIONS.md`
- `docs/PROJECT_STATUS.md`

## Verification for this documentation-only change

- Repository and main README inspected before work.
- Documentation checked for internal links and conflicting locked/open decisions.
- No runtime tests are applicable because no application code or dependency manifest exists.
- GitHub comparison verified the correction branch against the original main baseline before the direct update.
- Main was updated to the verified correction commit in one authorized fast-forward step.
- PR #1 closed automatically and GitHub classified it as merged because `main` contains the same commits; no PR merge action/API was used.

## External state

- `main`: contains the verified documentation baseline and corrected no-PR/no-staging workflow.
- Staging: not created or changed.
- Production/Render: not created or changed.
- Database/Supabase: not created or changed.
- Deployment, migrations and secrets: none.

## Unverified/open

- Final MVP screen/navigation approval.
- Technology stack, database, sync conflict rules and providers.
- GitHub branch protection/ruleset and future CI checks.
- Orbis ID and Orbis Admin contract versions.

## Exact next action

Begin a **Chat Mode** MVP architecture review using `docs/MVP_SPECIFICATION.md`. Do not write application code until that review resolves the open pre-coding decisions.

## Resume instruction for any AI

Read `AGENTS.md`, then this file, then `docs/DECISIONS.md`. Inspect the current GitHub branch/HEAD before acting. Report any difference from this checkpoint. Do not create a PR, PR Preview or staging unless the owner explicitly requests it. Do not assume coding began.

## 2026-09-18 — Main-only CI bootstrap checkpoint

- Owner chose current SonarQube Cloud Free subscription, direct main workflow, no PR Preview or staging, no automatic production deployment. Sonar scans main after push; a red run needs a new corrective commit and blocks any release.
- Local React/Vite starter is a **quality scaffold only**, not an approved MVP feature or full-stack implementation. Backend and accounting screens have not been built.
- Prepared workflow: main-only GitHub Actions with lint/typecheck/unit coverage/KNIP/JSCPD/build/Playwright browser smoke/Sonar scan and fail-closed overall metrics. GitHub Actions run and Sonar analysis remain unverified until the first remote push and successful result.
- Current Sonar organization plan: Free (user screenshot). Token/organization/project variables configured and verified by metadata, never record secret values.
- Production/Render auto-deploy OFF must be confirmed separately by owner before pushing; CI workflow has no deployment job. No deployment or database write is authorized.
- This quality bootstrap updates only tooling and project governance; product architecture open decisions in `docs/DECISIONS.md` still need owner approval before app feature development.
- Evidence: timestamped `00-SEND-KHATA-MAIN-CI-*.txt` Download report. A successful local run is not proof of remote CI success.
- Exact next steps: review remote CI results/artifacts, repair if red, then resume Chat Mode MVP architecture choices and first approved UI slice.

## 2026-09-19 — Step 1 UI local checkpoint

- Owner approved incremental app UI development: Welcome/Login first; module selection next; Khata Boi general accounting first, Gopal Dairy future dedicated module. Documented in `docs/UI_PHASE_01.md` and D-019/D-020.
- Local candidate replaces the Vite starter with Welcome, disabled real-login form, clearly labeled demo login, demo preference and placeholder Workspace. No server/Auth credentials, financial mutation, product DB or deployment.
- Expected files: `index.html`, `src/App.tsx`, `src/App.css`, `src/index.css`, `src/App.test.tsx`, `e2e/smoke.spec.ts`, this status file, decisions file, and new UI plan.
- Git baseline at preparation: `fa19d1a16a5977117b8b490baced357caaad85e2` (`main`). Termux installer verifies local HEAD before applying.
- Local verification: pending owner Termux installer report; UI review: pending owner; no claimed green result until actual checks return.
- GitHub main unchanged by preparation; staging, production, Supabase and other Orbis repositories untouched. No push or deployment authorized.
- Exact next action: owner runs installer locally, opens `http://127.0.0.1:5173/`, tests Welcome → Login → Demo Workspace → reload/logout and returns report/screenshots; fix Step 1 before working on Step 2.

## 2026-09-19 — Step 2 trilingual module UI

- Owner approved full Bengali/Hindi/English translation for the currently implemented Welcome, Login, Workspace and first-module preview; language choice persists separately from demo preference.
- Current module lineup: Khata Boi (first), Farming (future, generic label only), Lottery (Upcoming only). D-021 supersedes the previous module label; see `docs/UI_PHASE_02.md`.
- Local change scope: `src/App.tsx`, `src/App.css`, new `src/i18n.ts`, `src/App.test.tsx`, `e2e/smoke.spec.ts`, `index.html`, `docs/UI_PHASE_01.md`, `docs/UI_PHASE_02.md`, decisions and this status file. The Termux test-only storage fallback from Step 1 remains untouched.
- Source baseline before local change: `fa19d1a16a5977117b8b490baced357caaad85e2` on main. Targeted tests, TypeScript, lint and build are run by the owner installer, with results in its Downloads report; do not assume remote CI green for these unpublished files. Browser Playwright remains for supported Linux/CI at final certification.
- This is a local candidate only. No commits, pushes, releases, real authentication, company creation, accounting writes, migrations, Supabase, Render or cross-product changes.
- Exact next action: review all 3 languages on the live Termux site, select Khata Boi then Back, refresh to confirm language and demo preference; share installer report and UI feedback before designing the Khata Boi dashboard.

## 2026-09-20 — Approved Opening visual parity patch (prepared, not yet installed)

- Owner reported that the sanctioned Opening Preview and the React implementation diverged, and requested remaining restoration work as one downloadable package.
- Source audit found local HEAD `fa19d1a16a5977117b8b490baced357caaad85e2` with unpublished Step 2 working-tree changes; GitHub main still held starter code. Preserve original local source via guarded backups.
- Candidate patch uses `ORBIS-OPENING-LOGIN-PREVIEW.html` as Welcome reference; restores orbit SVG, three-line heading, hero gradient, sample accounting card composition, badges, safe-area and short-phone spacing. Login icons and workspace greeting/demo notice styling restored without re-enabling credential collection.
- Preserves the owner-approved Bengali/English/Hindi selector and Khata Boi → Farming → Lottery module order. Real Auth, signup, company creation, accounting writes and deployment remain out of scope.
- Status: patch source and a guarded install bundle prepared outside the phone. **Phone install, targeted tests, Android visual review and owner approval pending.** No GitHub commit/push/deployment performed by this packaging task.
- Next: owner installs single ZIP using Termux (SHA/HEAD guarded, Download backup/report), returns installer report and screenshots; then fix any visual feedback before final certification/owner-controlled GitHub main push.

## 2026-09-20 — Phase 4 owner-approved non-demo UI (package prepared, owner install pending)

- Owner approved the single `ORBIS-KHATA-APP-UI-APPROVAL-PREVIEW.html` across Welcome → Login → Workspace → Khata Boi, explicitly replacing demo-only user/amount/session copy and preserving Login appearance without authenticating yet.
- React TSX and CSS ported from this specific approved reference; exact three-language UI dictionary ported; only non-sensitive language preference persists. Temporary guest UI navigation never calls an API or holds financial data.
- Khata Boi renders empty four-card dashboard and visibly disabled financial action controls; **real login, company setup and accounting engine are NOT implemented**.
- New targeted Vitest and Playwright tests cover the approved screen flow, no fabricated balances, disabled login/actions and language persistence. Tests in user Termux still require owner installer output; a prepared package is not a green test run.
- Package changes are local-only; no branch change, commit, push, PR, deployment, database or remote Auth changes. `docs/UI_PHASE_04.md` records the approval and safe handoff.
- Next: owner installs once with backup/rollback and Downloads report, opens Android browser and approves exact visuals, then final certification and owner-operated GitHub push when explicitly ready.


## 2026-09-21 — Local runner hardening

- Baseline main 9ba31088b0111c15a8b1a46813c2385c8271e339; modified scripts/khata.py, scripts/khata-selftest.py and this status file.
- Preserve Git porcelain spaces and NUL paths; candidate/installed selftests passed.
- Full certification pending; no commit, push, deploy, Auth or database writes.
- Report handoff uses verified Downloads TXT and Android share chooser; exact-source CI governs release; deploy OFF.

## 2026-09-21 — Basic accounting candidate

- Multi-company selector/create, company-scoped parties, sale/purchase/receipt/payment,
  cash-bank separation, instalments, advances, immutable reversal and live totals/ledger.
- Remote khata_accounting_v1 migration applied to gqyaxsczlmvppxuoqbox; existing company
  preserved. Rollback tests passed; retained 1 company, 0 parties, 0 vouchers.
- Candidate targeted frontend/API tests: 59 passed in 8 files; typecheck, source lint,
  Vite build passed. Exact incremental installer check is recorded in the package report.
- No new dependencies, Auth changes, Admin/Foundation writes, GitHub writes or deployment.
- Android install/visual approval and real-session accounting smoke test pending. Browser
  local-preview access blocked; full certification/coverage/CI/Sonar not claimed.
- See ACCOUNTING_V1.md for remaining security-advisor warnings and deferred features.


## 2026-10-12 — Central account source checkpoint

Owner clarifies Khata is new and unreleased; no active legacy customer/book is assumed.
Preserve accounting rules and UI. Replace independent product Auth with Admin-owned
central identity; common profile remains in Admin, financial data in Khata. The
product-owned gateway enforces existing RLS using a transaction-local canonical ID.
The proposed product schema requires empty company/party/voucher tables and aborts
on unexpected data. No book or identity is deleted. One responsive web source
serves desktop/mobile; a development-only visual preview does not authorize data.

Prepared source: central browser adapter, product data client/gateway and a guarded
review SQL. Await targeted Termux lint/type/tests, actual product SQL/RLS/Deno checks,
central/provider runtime configuration, password recovery and full coverage/E2E.
Admin managed migration 20261012160546 is applied; twelve existing identities remain,
customer count is zero. No Khata product migration, gateway deployment, Git commit,
push, release or real signup/login verification has occurred at this checkpoint.


## 2026-10-12 — Central password recovery source checkpoint

Admin recovery/verify/password endpoints and Khata recovery-link session adapter are
prepared. Email recovery uses a link; signup remains OTP-free. Accounting 18/18
passed in owner Termux, including failed-report-after-successful-save (473ms).
Recovery tests below must pass before claiming source verification. SMTP, provider
redirect/template configuration, product SQL/RLS/Deno checks, coverage, other product
browser adapters, and real mobile/desktop signup/login/reset remain pending.
No commit/push/deployment or new database write is performed by this patch.
See Admin docs/CENTRAL-RECOVERY-SETUP.md for exact setup and remaining checks.


## 2026-10-12 — Local central-account closeout verification prepared

Dedicated mobile/desktop protocol browser tests and disposable SQL checks are added.
The runner checks exact source hashes, cross-user/company RLS, financial invariants,
idempotency, nonempty/drift aborts, Deno adapter types, Linux gates, builds and
changed-code four-metric 100% coverage. Results must come from the timestamped
ORBIS-LOGIN-CLOSEOUT report; source preparation alone is not a PASS. SQL executes
only in a private temporary cluster; browser APIs use test fixtures. Render Admin
still has the old d0af060 staging deployment and no Khata service was listed.
Real signup/login, deployment/provider/SMTP setup and remote CI/Sonar are pending.
No commit, push, production migration or deployment is performed by this runner.


## 2026-10-14 — Sonar corrective source verification

- Parent main: 6ce1827334855a8012493983295c67926d18c1d2.
- Encode pending voucher storage; validate decoded and legacy recovery data; preserve identical IDs/payloads on reload and uncertain retries.
- Fix six reported code smells and cover money/error-alias gaps without lowering gates.
- Exact-source Ubuntu tests, four-metric 100% coverage, lint/types/build/audit/KNIP/JSCPD and mocked mobile/desktop browser checks passed in the owner foreground runner.
- Corrective owner-authorized main push follows these checks. Remote CI/Sonar result is in the Downloads ORBIS-KHATA-SONAR-FIX report; no production claim is made here.
- Real central/server login, SMTP and deployment remain unverified; no production database or deployment change.


## 2026-10-14 — Sonar remaining storage validation and digit conversion

- Parent main: d211bcd70ca32aafea6ffa3e779f40c8fa516d80.
- Validate a bounded plain-text recovery record before storage; reject markup without silently changing the entry; retain encoded storage, validated restore, identical retry ID/payload and multilingual notes.
- Normalize Bengali/Hindi digits by their explicit digit alphabets; remove code-unit warnings while retaining exact minor-unit math and full coverage.
- Exact-source Ubuntu tests, four-metric 100% coverage, lint/types/build/audit/KNIP/JSCPD and mocked mobile/desktop browser checks passed in the owner foreground runner.
- Corrective owner-authorized main push follows these checks. Remote CI/Sonar result is in the Downloads ORBIS-KHATA-SONAR-FIX report; no production claim is made here.
- Real central/server login, SMTP and deployment remain unverified; no production database or deployment change.


## 2026-10-16 — Central ID five-family closeout prepared

One central account/profile for Admin, Maya and Khata; Maya five cloud birth slots and explicit idempotent family restore. Source verification, private disposable SQL and real API acceptance are recorded separately in the ORBIS-CENTRAL-FINISH report. No commit/push/deployment/remote migration in this runner. Browser/PWA acceptance and owner-role Admin login remain distinct. Next: inspect this report, deliver verified source through the owner Git workflow, then reviewed migration/deployment and browser acceptance.


## 2026-10-16 — Live central-ID proof and birth-storage migration

- Live Khata `841428a` login and reload returned the same `ORB-U-365HD9A3` as Admin.
- Managed Admin migration `20261016154208_maya_five_account_birth_profiles` applied; one account and one common profile preserved, zero birth-profile rows. Forced RLS and service-only RPC grants verified.
- Profile and five-slot browser fixture acceptance added; exact local full certification, Termux publication, remote CI/Sonar and post-deploy persistence remain pending.
- Current Supabase app connections cannot access Khata product `gqyaxsczlmvppxuoqbox`; the financial data gateway is not certified or live-ready. No financial database write or replacement book created.
- Next: run the resumable `ORBIS-CENTRAL-RELEASE-20261016.sh`; successful local gates authorize selected owner-Termux commit/push and an Admin PR. No merge/deployment occurs inside this runner. Inspect the single Downloads report before completing remote release.


## 2026-10-17 — Sonar corrective candidate prepared

See [SONAR-CORRECTIONS-20261017.md](SONAR-CORRECTIONS-20261017.md) for every reported file/line and the source changes. Targeted and final Termux verification, new remote Sonar analysis and owner-controlled commit/push remain pending. No merge, deployment or database change is performed by this candidate.
