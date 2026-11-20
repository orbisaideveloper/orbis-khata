# ORBIS Khata — Documentation Index

> **START HERE.** Versioned index updated 2026-11-19 (IST). This is an index, not proof of current CI or deployed state. Always verify GitHub HEAD, current source and the latest dated handover.
>
> **Active work system:** [ORBIS WORK — Master](https://drive.google.com/drive/folders/1ARH5rQNp-RXHpKpP204sHEMIA6A0kd_a) → [Setup 01 Cloud Development SOP (current approved policy)](https://docs.google.com/document/d/1cthC7dM6Ieg7GD1Kx4UpmKJe1_-nKLnRVT4ZdBTJygw/edit). Setup 02 Termux development and Setup 03 Android real-user automation are separate; never switch setup merely because Chat/Work mode changes.

## 1. Read in this order

1. `docs/INDEX.md` (this file) — current vs historical document map.
2. `AGENTS.md` — repository-wide safeguards and read order.
3. `docs/DEVELOPMENT_WORKFLOW.md` — currently approved **Setup 01** cloud development and handover rules.
4. `docs/PROJECT_STATUS.md` — **newest dated entry first**; this is a large append-only historical log, not proof of today's HEAD.
5. `docs/DECISIONS.md` — latest dated supersession first when historical locked decisions conflict.
6. Task-specific domain docs, actual code/tests/CI workflows and the [Khata START HERE handover](https://docs.google.com/document/d/1FS-JBKM7SO3i_HI1u8a5tD143GuBK4HGQrc2wWUYpzg/edit).

**Precedence:** owner's current explicit direction → currently approved ORBIS WORK setup policy → verified current source/observed results → current repository-specific documentation → dated historical plans. Surface any unsafe conflicts; never silently erase historical decisions.

Current feature checkpoint: [Lottery Results foundation and source gate](LOTTERY_RESULTS_20261120.md).

## 2. Current operational documentation

| Purpose | Canonical location |
| --- | --- |
| Project introduction | [README](../README.md) |
| Mandatory agent safeguards | [AGENTS](../AGENTS.md) |
| Setup 01 cloud development, tests, owner-approved push and immediate stop | [Development Workflow](DEVELOPMENT_WORKFLOW.md) and [ORBIS WORK SOP](https://docs.google.com/document/d/1cthC7dM6Ieg7GD1Kx4UpmKJe1_-nKLnRVT4ZdBTJygw/edit) |
| Task reporting format | [Work Report Template](WORK_REPORT_TEMPLATE.md) |
| Current implementation checkpoint, older work history | [Project Status](PROJECT_STATUS.md), latest dated entry |
| Owner decisions, supersession and historical intent | [Decision Log](DECISIONS.md) |
| Product/API/tenant model | [Architecture](ARCHITECTURE.md), [Accounting Policy](ACCOUNTING_POLICY.md), [Accounting V1](ACCOUNTING_V1.md) |
| Requirements, MVP and long-range plans | [Product Blueprint](PRODUCT_BLUEPRINT.md), [MVP Specification](MVP_SPECIFICATION.md) |
| Central identity/auth | [Auth Setup](AUTH_SETUP.md), [Central Account](CENTRAL-ACCOUNT.md) |
| SQL and tenant safety | [Concurrency Test](CONCURRENCY_TEST.md), [Phase 2 Security](PHASE2_SECURITY_CHANGES.md), `supabase/migrations/` |
| Supabase Edge functions and contracts | `supabase/functions/`, `scripts/verify-*.mjs`, targeted SQL/contract tests |
| Android build/release (not tablet testing SOP) | [Android Release](ANDROID_RELEASE.md) |
| Web/PWA | [PWA](PWA.md), [Privacy Operations](PRIVACY_OPERATIONS.md) |
| Actual CI configuration | `.github/workflows/quality.yml`, `android.yml`, `android-real-user.yml`, `customer-health.yml`, `sonar-project.properties` |

## 3. Domain/module documents

| Domain | Documents |
| --- | --- |
| Masters / party / bills | [Masters & Bills Review](MASTERS_BILLS_REVIEW.md), [Accounting Completion](ACCOUNTING_COMPLETION_CHECKPOINT.md) |
| Expenses | [Expenses Activation](EXPENSES_ACTIVATION.md), [Bills & Expenses](KHATA_BILLS_EXPENSES_20261030.md) |
| Inventory / stock | [Inventory Activation](INVENTORY_ACTIVATION.md), [Stock Transfer Verification](STOCK_TRANSFER_VERIFICATION.md) |
| Production / lottery | [Production & Lottery](PRODUCTION_LOTTERY_20261031.md), [Lottery Verification](LOTTERY_VERIFICATION_20261030.md) |
| Android & app UI | [Android Release](ANDROID_RELEASE.md), [Design Review](APP_DESIGN_REVIEW.md) |

Read these with their dates: an older implementation note does not override current code.

## 4. History vs active rules

- **Active:** this index, current `AGENTS.md`, current `DEVELOPMENT_WORKFLOW.md`, the latest approved ORBIS WORK SOP, exact live source and fresh evidence.
- **History:** older dated `docs/*2026*.md`, early `UI_PHASE_*.md`, `docs/release-20261026/`, old Sonar checkpoint files, older portions of `PROJECT_STATUS.md` and `DECISIONS.md`.
- **Test assets are not archive trash:** `docs/*.sql`, `docs/verification/`, `scripts/` and migrations may still be referenced by tests; **do not move/rename/delete just for tidiness**.
- **Real Android:** evidence in the separate test-tablet/Setup 03 system is not proof of a full user journey unless that specific test passed. The repository's Android CI and installed-device acceptance are different gates.
- **Deployment:** GitHub code, CI result, Supabase migration version, Edge deployment revision and Play build are separate states.

## 5. Every task updates only the relevant documents

- Change in stable decision or architecture → append dated note in `docs/DECISIONS.md`, update affected architecture/module doc as needed.
- Implementation milestone → concise newest-first checkpoint in `docs/PROJECT_STATUS.md` with exact changed files and evidence; retain past reports.
- Change in workflow or developer requirements → scoped `AGENTS.md` and/or `docs/DEVELOPMENT_WORKFLOW.md`.
- New stable documentation → add its link here; do not duplicate full documentation.
- Any Setup 01 work → create/update one dated, secret-redacted Google Drive task handover using [template](WORK_REPORT_TEMPLATE.md) and the active [ORBIS WORK SOP](https://docs.google.com/document/d/1cthC7dM6Ieg7GD1Kx4UpmKJe1_-nKLnRVT4ZdBTJygw/edit).
- **No local full-coverage runs in Setup 01:** targeted + high-risk tests before owner-approved push; GitHub Actions executes full coverage/quality. After push: record SHA, hand over and **STOP** without waiting for Actions.
- For Setup 02/03 use their separately approved instructions, not cloud commands.

## 6. Evidence and links

- [ORBIS WORK Master folder](https://drive.google.com/drive/folders/1ARH5rQNp-RXHpKpP204sHEMIA6A0kd_a)
- [Setup 01 SOP v1.3](https://docs.google.com/document/d/1cthC7dM6Ieg7GD1Kx4UpmKJe1_-nKLnRVT4ZdBTJygw/edit)
- [ORBIS Khata START HERE — live index](https://docs.google.com/document/d/1FS-JBKM7SO3i_HI1u8a5tD143GuBK4HGQrc2wWUYpzg/edit)
- [Automated-testing historical plan](https://docs.google.com/document/d/1aEDUIUYYxq9NRm1hh96DOPmAkfmT4yvD1TSlEFbrn70/edit)
- [Android real-user historical handover](https://docs.google.com/document/d/1m1Al_hJM8QP2Tozu8K86BbYo-HVsASW5kQM90Dsq0lE/edit)
- [Web/Android tested-results archive](https://docs.google.com/document/d/1O3wr-3-e6Si1IHrCjjoT6DE2CBlm5RXtSpC3e4wQWTc/edit)

**Index convention:** keep this page short; new docs must state owner/scope, updated date, status (**ACTIVE / HISTORICAL / PLANNED**) and a source/evidence link. Do not treat PLANNED as IMPLEMENTED.
