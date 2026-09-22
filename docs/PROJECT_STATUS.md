# Project Status — Durable Resume Checkpoint

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
