# AGENTS.md — Mandatory Project Instructions

These instructions apply to every AI agent and contributor working in this repository. Read this file, `docs/DECISIONS.md`, and `docs/PROJECT_STATUS.md` before changing anything.

## 1. Authority and truth

1. The user’s current explicit instruction has highest authority.
2. The current repository source and verified reports are the implementation truth.
3. This file and locked entries in `docs/DECISIONS.md` define the baseline.
4. Planning documents describe intent, not completed functionality.
5. Never claim a feature, test, migration, deployment or integration is complete without current evidence.
6. If instructions conflict or a decision would materially change scope, security, cost or architecture, stop and ask the user.

## 2. Product boundary

Orbis Khata Boi is a standalone Orbis product. It must retain its own:

- repository and release history;
- application deployment;
- database and tenant boundaries;
- environment variables and secrets;
- CI/CD and operational health;
- subscription and product configuration.

Allowed shared connections are explicit, versioned contracts with Orbis ID/Auth, Orbis Admin and approved shared libraries or services. Never create implicit cross-product database access.

## 3. Baseline product principles

- Simple outside, powerful inside.
- Voice-first and regional-language-first.
- Offline/local-first, with optional secure cloud sync.
- Mobile-first; the user primarily works from Android and Termux.
- Common actions should require at most two or three taps where practical.
- Accounting labels shown to ordinary users start with Money In, Money Out, To Receive and To Pay rather than unexplained debit/credit terminology.
- AI is accounting-scoped and grounded in the user’s authorized business data.
- AI must not invent figures or silently mutate financial data.
- Every AI-proposed financial mutation requires a visible preview and Confirm / Edit / Cancel.
- Missing or insufficient evidence must be stated plainly.

## 4. Current phase gate

This repository is in product/architecture definition. Do not begin production coding until the owner approves the MVP architecture and product specification. Do not prematurely choose frameworks, databases, sync engines, billing providers or AI vendors where the decision log marks them open.

## 5. Git and release safety

- Treat `main` as protected.
- Work only on an isolated feature or chore branch explicitly authorized for the task.
- Never push directly to `main`.
- Never merge a PR, deploy, promote staging, run production migrations or perform a production write without the user’s explicit approval.
- The normal path is: local/Termux work → feature branch → targeted verification → PR checks → manual merge → production verification.
- PR Preview is optional, not a universal gate.
- Use permanent staging for large or risky UI, authentication, database, API, sync or infrastructure changes.
- Production success is separate from staging success. Verify production migration/schema state and critical flows after deployment.

## 6. Verification model

During normal development:

- run only tests, linting and type checks related to the changed area;
- stop on the first meaningful failure and diagnose it;
- do not spend time or credits on unrelated full-repository gates after every small edit.

Only when the user explicitly says the work is finished and ready for GitHub, run one final `orbis verify` certification in this order:

1. Ubuntu preflight/runtime.
2. KNIP.
3. JSCPD.
4. Playwright.
5. Remaining Termux-compatible gates.
6. Final summary.

Android/Termux ARM64 restrictions:

- Do not run Prisma engines directly on Android ARM64 when the platform is unsupported.
- Run Prisma engine/migration validation in Ubuntu, GitHub Actions or an appropriate Linux/cloud environment; use reviewed raw SQL only when explicitly chosen.
- KNIP or JSCPD native-binding failures on Android may be platform failures rather than code failures. Use Linux/CI as the authoritative gate.
- Do not delete `package-lock.json` or `node_modules` merely to react to a platform incompatibility.

Any long run must remain interruptible and write a timestamped report to the device Downloads folder. Keep the prompt responsive with periodic status updates.

## 7. Work Mode and Chat Mode economy

- Use Chat Mode for explanations, options, small decisions and copyable instructions when repository access is unnecessary.
- Use Work Mode for repository inspection, multi-file edits, tests, GitHub operations and evidence-backed audits.
- Do not use an expensive full workflow when a short read-only answer is sufficient.
- Never reduce verification required by risk merely to save credits.

## 8. Recoverable checkpoints

Work in small, coherent checkpoints. After every material checkpoint, update `docs/PROJECT_STATUS.md` with:

- current branch and HEAD/commit if known;
- completed scope;
- changed files;
- tests/checks run and their result;
- unverified or blocked items;
- exact next action;
- explicit confirmation that main, staging and production were or were not changed.

If work may exceed two hours or tool/usage limits may interrupt it, checkpoint earlier. Never leave the only copy of valuable work in an unsaved chat response or an uncommitted temporary file.

## 9. Data and accounting integrity

- Financial records require stable identifiers, timestamps, tenant ownership and audit history.
- Prefer immutable or append-only accounting events with explicit reversal/correction over silent destructive edits.
- Monetary calculations must use an exact decimal or integer-minor-unit representation, never binary floating point.
- Every derived total must have a documented source period and reproducible calculation.
- Local and cloud synchronization must be idempotent and conflict-aware.
- Do not implement last-write-wins for sensitive financial conflicts without an approved conflict policy.
- Backup and restore must be verifiable; “uploaded” does not automatically mean “restorable.”

## 10. Identity, authorization and tenancy

- Orbis-owned permanent identities must remain independent of mutable credentials.
- Use UUIDv7 internally when the shared Orbis identity contract requires Orbis-owned identifiers.
- Human-facing display IDs may follow the shared `ORB-U-*` and `ORB-O-*` conventions when the identity service provides them.
- Authentication does not equal authorization. Enforce business membership and capability-scoped access server-side.
- Every tenant-owned read/write must be scoped to the authenticated user’s authorized business.
- Ambiguous identity matches or person/organization conflicts stop for manual review.
- Never log passwords, tokens, secrets, complete sensitive voice transcripts or unnecessary personal data.

## 11. AI behavior and voice entry

- Preserve the original user utterance only under an approved retention policy.
- Convert speech into a structured proposed command; do not execute directly from raw text.
- Show party, transaction type, amount, date, description, unit/rate and confidence-relevant ambiguity before confirmation.
- If party, amount, date, direction or unit is ambiguous, ask a focused question.
- AI answers must identify the business and period used, and should cite transaction references where practical.
- General knowledge requests outside authorized accounting scope must be declined or routed outside this product.

## 12. Security rules

- Treat all financial and identity data as sensitive.
- Keep secrets server-side; never embed service-role keys in clients.
- Use encrypted transport, secure session handling, rate limits and auditable privileged actions.
- Design an emergency write-disable before enabling privileged or automated writes.
- New integrations begin read-only where possible and fail closed to an explicit unknown/unavailable state.
- Follow `SECURITY.md` for vulnerability handling.

## 13. Documentation discipline

- Update documentation with the implementation that changes it, after relevant verification.
- Record durable architecture decisions in `docs/DECISIONS.md`.
- Do not duplicate conflicting rules across files; link to the authoritative document.
- Do not hardcode invented completion percentages. Percentages require an explicit checklist with counted items.
- Keep instructions concise enough for mobile use; commands should be single copyable blocks when the user must run them.

## 14. Definition of a complete handoff

A handoff is complete only when it states the outcome, branch/commit, changed files, checks performed, remaining risks, whether any external environment changed, and the next exact action. Never merge or deploy merely because checks are green.
