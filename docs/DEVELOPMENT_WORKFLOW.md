# Development and Release Workflow

## 1. Default lifecycle

1. Discuss and approve scope.
2. Inspect current source before planning edits.
3. Create an isolated feature branch.
4. Implement a small coherent slice.
5. Run changed-area targeted checks.
6. Save a recoverable checkpoint and update project status.
7. When the whole requested work is declared finished, run final certification.
8. Open a PR with scope, evidence, risks and deployment impact.
9. Owner reviews and manually merges.
10. Deploy from protected main through the approved release process.
11. Verify migrations/schema and perform production smoke testing.

## 2. Branch and PR policy

- `main` is protected and must remain releasable.
- Use names such as `feat/...`, `fix/...`, `chore/...` or `docs/...`.
- No direct push to main.
- No AI-initiated merge or production action.
- PRs should remain focused and reviewable.
- The PR description records scope, changed files, tests, migrations, security/tenant impact, screenshots when useful, known gaps and rollout/rollback notes.

## 3. Development verification

Run only what is relevant to changed code during normal development. Examples after the stack exists:

- unit/component tests for changed accounting/domain/UI areas;
- targeted typecheck/lint where supported;
- schema or tenant-policy checks for changed database areas;
- focused Playwright flows for changed user journeys.

Do not run unrelated whole-repository quality suites after every small edit.

## 4. Final certification

Run only when the owner says the work is finished and ready for GitHub. The single `orbis verify` order is:

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

## 6. Preview and staging policy

PR Preview is not mandatory for every change. Use one permanent staging environment for changes that need real cloud behavior, especially:

- authentication/identity;
- database migrations or tenant policies;
- API/integration changes;
- sync and backup;
- large UI redesigns;
- infrastructure/runtime changes.

Small isolated logic, copy or normal component changes may proceed with targeted local checks and CI.

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

Reports are created after verification, not as a substitute for verification. When the repository has implementation work, maintain appropriately scoped implementation, preview/release and audit reports. Completion percentages are allowed only when derived from a named, counted checklist.

## 10. Work Mode vs Chat Mode

- Chat Mode: explanations, design discussion, clarifications and short copyable guidance.
- Work Mode: repository reads/writes, multi-file changes, GitHub operations, tests, audits and live environment checks.
- Choose the lightest mode that can produce reliable evidence.
