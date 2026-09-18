# Development and Release Workflow

## 1. Default lifecycle

1. Discuss and approve scope.
2. Inspect current source before planning edits.
3. Work on local `main` under the owner-approved main-only workflow.
4. Implement a small coherent slice.
5. Run changed-area targeted checks.
6. Save a recoverable checkpoint and update project status.
7. When the whole requested work is declared finished, run final certification.
8. Present the exact staged diff, evidence, risks and deployment impact to the owner.
9. After explicit owner authorization, push the locally verified main commit without a pull request.
10. Run GitHub Actions and SonarCloud Free main-branch analysis; repair any failure with a reviewed new commit before release.
11. Deploy from protected main only through an separately approved release action.
12. Verify migrations/schema and perform production smoke testing.

## 2. Branch and main-update policy

- `main` is owner-controlled; remote verification happens after main push, so a failure means main needs a corrective commit.
- Do not create feature branches by default under the current owner-approved Free plan.
- Do not push incomplete or unverified changes to `main`; local changes may exist during development.
- Do not open a PR, trigger PR Preview or create/use staging in the default workflow.
- Keep main commits focused, reviewable and recoverable; preserve failed CI evidence.
- Before main push, report scope, exact changed files, tests, migrations, security/tenant impact, visual evidence when useful, known gaps and rollout/rollback notes.
- The owner authorizes and executes each main push from Termux; CI/Sonar follow the push. Never force push or erase failing history.
- A PR or staging workflow is allowed only if the owner explicitly requests it for that change.
- No AI-initiated deployment or production action.

## 3. Development verification

Run only what is relevant to changed code during normal development. Examples after the stack exists:

- unit/component tests for changed accounting/domain/UI areas;
- targeted typecheck/lint where supported;
- schema or tenant-policy checks for changed database areas;
- focused Playwright flows for changed user journeys.

Do not run unrelated whole-repository quality suites after every small edit.

## 4. Final certification

Run only when the owner says the work is finished and ready for `main`. The single `orbis verify` order is:

1. Ubuntu preflight/runtime.
2. KNIP.
3. JSCPD.
4. Playwright.
5. Remaining Termux-compatible gates.
6. Final consolidated summary.

No later passing check erases an earlier failure. The final result is green only if required gates are green or an explicitly approved, evidence-backed exception exists.

## 5. Mobile and runtime constraints

The owner works primarily on Android Termux with Ubuntu through proot-distro.

- Keep commands concise and mobile copy-paste friendly.
- Provide one complete command block rather than fragmented commands when the user must execute a workflow.
- Keep long runs interruptible and produce timestamped reports in Downloads.
- Provide progress updates during long work.
- Do not run unsupported Prisma engines on Android ARM64.
- Use Ubuntu/Linux/CI for Prisma, KNIP, JSCPD or other platform-sensitive authoritative gates.
- Treat confirmed platform incompatibility separately from a code defect.

## 6. Cloud validation policy

PR Preview and staging are not default gates and must not be created automatically. When a change involves cloud-only risk—such as authentication, database migrations, tenant policies, API integrations, sync, backup or infrastructure—document that risk before the final main update.

Use Ubuntu/Linux local verification, then perform GitHub Actions and SonarCloud Free analysis after the owner-authorized main push. Create a dedicated preview or staging environment only when the owner explicitly requests it.

## 7. Production validation

Staging success does not prove production success. For relevant releases verify:

- deployed commit/version;
- migration and schema version;
- environment configuration presence without exposing values;
- login/session;
- critical database read/write in an approved test tenant;
- one core accounting flow;
- sync/backup health when affected;
- logs/health signals;
- rollback readiness.

Perform a focused 5–10 minute smoke test after deployment.

## 8. Checkpoint and interruption safety

Every substantial session leaves `docs/PROJECT_STATUS.md` accurate. Checkpoints include:

- branch and commit;
- completed items;
- exact file set;
- verification evidence;
- blockers/unverified items;
- next exact action;
- external environments changed or untouched.

If work approaches two hours, a usage limit or a risky transition, checkpoint before continuing. Temporary chat context is never the only record of completed work.

## 9. Reporting

Reports are created after verification, not as a substitute for verification. When the repository has implementation work, maintain appropriately scoped implementation, release and audit reports. Completion percentages are allowed only when derived from a named, counted checklist.

## 10. Work Mode vs Chat Mode

- Chat Mode: explanations, design discussion, clarifications and short copyable guidance.
- Work Mode: repository reads/writes, multi-file changes, GitHub operations, tests, audits and live environment checks.
- Choose the lightest mode that can produce reliable evidence.
