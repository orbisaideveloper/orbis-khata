# Development Workflow — ORBIS WORK Setup 01 (Cloud)
**Status: ACTIVE** · Updated 2026-11-19 IST · Applies to cloud/local GitHub development only.

> [Documentation Index](INDEX.md) · [Mandatory Repo Safety](../AGENTS.md) · [ORBIS WORK Setup 01 SOP (complete authoritative procedure)](https://docs.google.com/document/d/1cthC7dM6Ieg7GD1Kx4UpmKJe1_-nKLnRVT4ZdBTJygw/edit) · [Report Template](WORK_REPORT_TEMPLATE.md)

## 1. Select the correct execution setup

**Setup 01 — Cloud Development:** Chat Mode or Work Mode with actual cloud-local repo/runtime tools. **Setup 02 — Termux Development:** owner's phone, separate scripts/guarded commands. **Setup 03 — Android Real Automation:** separate test tablet and installed Android app. Do not mix paths, commands, credentials, authority or evidence among setups. Changing Chat/Work mode alone changes neither the setup nor permissions.

## 2. One coherent task, root cause first

1. Read active SOP, current `docs/INDEX.md`, `AGENTS.md`, relevant decisions/current status/Drive handover; verify branch, exact HEAD, origin and existing local changes.
2. Prepare the complete relevant repository in the cloud-local workspace if supported; do not bypass a missing local runtime with speculative GitHub web edits. Preserve user files.
3. Before edits, assess affected files, API/Edge/SQL/native/auth/accounting/sync contracts, likely benefits, conflicts/regressions, rollback and expected GitHub Action path triggers.
4. Reproduce and diagnose the root cause where feasible; distinguish **VERIFIED** from **HYPOTHESIS**. Make one scoped solution locally and review its actual diff.
5. Run changed-area and risk-required critical tests: accounting invariants, tenant/RLS, migrations on disposable DB, Edge API contracts, affected Playwright/API E2E, sync/backup/native behavior as relevant.
6. **Never run full repository coverage or the full `khata verify` certification in Setup 01.** Full coverage/general CI/Sonar is GitHub Actions' job. Do not weaken, skip or misrepresent CI gates to get a pass.
7. If a high-risk test is impossible locally, report **BLOCKED / NOT TESTED**, exact risk and best next action; don't claim green or repeat the same unproductive attempt.

## 3. Approval, GitHub and external environments

Present pre-push report with scope, exact diff/files, baseline SHA, risks, migration/Edge impact, local tests and limitations. **Only after explicit owner permission**, push exactly reviewed changes from local source. Never force-push to solve a mismatch. Docs-only temporary direct GitHub write exceptions must be separately explicitly authorized and must not become the default setup.

After authorized push: verify actual resulting commit SHA/remote state; immediately save Google Drive handover; **STOP**. Do not wait/poll for GitHub Actions, Sonar or Android runs, do not start a corrective push; owner will report results and choose follow-up.

Git push approval does **not** authorize Render/Edge deployment, database migration/production write, merge, release, Play publishing or tablet user automation. Each needs distinct authorization.

## 4. Verification and migration/Edge gates

| Change | Cloud-local pre-push checks | After push |
| --- | --- | --- |
| UI/navigation | Changed component tests, focused browser smoke | GitHub full quality/coverage |
| Accounting/payments/stock/lottery | Exact amount, balance, correction, idempotency, tenant and critical regression | Full SQL/coverage/Sonar |
| SQL migrations | Disposable PostgreSQL migration order/dependencies, constraints/RLS, data compatibility, safe rollback plan | Full SQL/concurrency CI; separately approved deployment |
| Supabase Edge | Local runtime/static validation, auth/tenant/response/errors, SQL contract and retry behavior | Full CI; separately approved Edge deployment |
| Sync, backup, encryption | Conflict/retry/duplicate-free, integrity/restore tests as relevant | Full quality + triggered Android CI |
| Android source/build | Targeted build/native checks where actual runtime supports it | Android candidate; separate Setup 03 acceptance only when directed |
| Workflow config | Local YAML/bash/toolchain/preflight and trigger impact | Appropriate GitHub Actions |

Never pass actual production DB credentials to disposable tests; mocked browser E2E is not genuine installed-device acceptance. Record Git commit, migration version, deployed Edge version and APK/Play version separately.

## 5. Documentation update contract

Keep stable, code-versioned instructions in GitHub, and detailed dated task/verification evidence in Google Drive. When relevant, update **with the same scoped local code change**:
- `docs/INDEX.md` for navigation; `README.md` for overview.
- `AGENTS.md` and this workflow for developer-policy changes.
- `docs/DECISIONS.md` for durable/superseding decisions (append, don't rewrite history).
- `docs/PROJECT_STATUS.md` for latest concise checkpoint (older giant log stays intact).
- Affected existing domain/release docs (e.g. accounting, migration, Android), not all docs reflexively.
- `ORBIS WORK / 01 CLOUD DEVELOPMENT / <project> / <YYYY-MM> / <YYYY-MM-DD> / <task>` for report/evidence (or existing project-specific archive linked from it).

The [report template](WORK_REPORT_TEMPLATE.md) defines goal, reason, source SHA, impact, root cause, exact files, targeted checks, approval, push SHA, GitHub CI pending, and next action. Redact secrets, customer data and irrelevant logs. Update status **PASS/FAIL/BLOCKED/NOT TESTED**, never infer outcomes.

## 6. History, safeguards and scope

Older workflow instructions in historical logs refer to Termux owner-push and full local certification. For **Setup 01 only**, the later approved ORBIS WORK policy supersedes those particular procedures. This does NOT rewrite Setup 02 Termux certification rules or Setup 03 test-tablet instructions.
Default Khata path is owner-controlled main only; no PR/staging/release by default. Source and observed evidence take precedence over undated claims. Preserve historic decisions and all SQL/test paths.

**Stop conditions:** unexpected local changes or HEAD movement, unresolved high-risk test, data/tenant risk, migration/deploy authorization missing, ambiguous owner permission, or tooling without an actual local runtime. Explain exact blockers and hand over; no circular retries.

**Owner start instruction:** “ORBIS WORK — Setup 01 — Project: ORBIS Khata — Task: [goal]. Read current master SOP, repository docs/index and Drive handover; inspect whole change impact, work locally, run targeted+critical tests; send pre-push review; require approval; after push immediately save handover and stop.”
