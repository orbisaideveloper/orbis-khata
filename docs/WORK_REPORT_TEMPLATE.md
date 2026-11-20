# ORBIS WORK — Setup 01 Task Report Template

**Status:** TEMPLATE (not evidence) | **Updated:** 2026-11-19 IST | **Active SOP:** https://docs.google.com/document/d/1cthC7dM6Ieg7GD1Kx4UpmKJe1_-nKLnRVT4ZdBTJygw/edit

## 1. Task identity
Setup: 01 CLOUD DEVELOPMENT
Project / Repository:
Task ID (PROJECT-YYYYMMDD-NNN):
Owner-authorized scope:
Start time (IST):
End time (IST):
Outcome: PASS / FAIL / BLOCKED / PARTIAL / NOT TESTED

## 2. Why and baseline
Goal and expected behavior:
Prior handover / linked issue:
Branch / remote:
Git base commit SHA:
Local working tree status / pre-existing changes:
Runtime & tool versions:

## 3. Root cause and impact
VERIFIED observation:
Hypotheses (if any):
Changed and dependent files:
Benefits, behavior preserved, new risks:
Database migration / Supabase Edge/API / Auth / Accounting / Sync / Android impacts:
Expected GitHub workflow triggers / missing triggers:
Rollback / recovery plan:

## 4. Local work and checks
Changed files and exact summary:
Secrets/customer data scrubbed: YES / NO / NOT APPLICABLE
Relevant command, environment, duration, evidence:
Targeted tests: name → PASS / FAIL / BLOCKED / NOT TESTED
Critical regression tests: name → PASS / FAIL / BLOCKED / NOT TESTED
Migration order, disposable DB, RLS and Edge compatibility (if relevant):
**Full local repository coverage: NOT RUN — GitHub Actions responsibility**
Unresolved risks and recommendations:

## 5. GitHub approval and push
Pre-push review provided:
Owner's explicit push approval: YES / NO (link/turn when available)
Planned changed paths:
Actual pushed commit SHA (only after successful push):
Actual remote verified: YES / NO
GitHub commit URL:
CI / Sonar after push: **NOT CHECKED — owner will inspect**
App deploy / database migration / Edge deploy / Play publication: NONE unless separately approved.

## 6. Drive evidence and handover
Drive folder and Task Report URL:
Evidence files/logs (redacted):
Versioned GitHub documents updated (or N/A):
What remains blocked/unverified:
Exact next action for owner:
STOP after authorized push, no waiting for CI.

## 7. Document applicability checklist
README / INDEX:
AGENTS / DEVELOPMENT_WORKFLOW:
DECISIONS:
PROJECT_STATUS:
Accounting / Architecture / Migration / Edge:
Android / Release:
Drive task report:
No forced editing of unrelated documents; preserve old dated evidence and SQL file paths.
