# Project Decision Log

Statuses: **Locked**, **Provisional**, **Open**, **Deferred**.

## Locked decisions

| ID | Decision | Rationale |
|---|---|---|
| D-001 | Product name is **Orbis Khata Boi**; repository is `orbis-khata`. | Clear standalone identity inside Orbis. |
| D-002 | Standalone repository, deploy, database, environment, CI and release lifecycle. | Prevents Foundation or another product from blocking or exposing Khata. |
| D-003 | Integrate through shared Orbis ID/Auth, Orbis Admin and approved versioned contracts only. | Central control without direct cross-product coupling. |
| D-004 | Business data remains tenant-isolated and is not automatically visible to other Orbis products. | Financial privacy and bounded ownership. |
| D-005 | Mobile-first PWA is Stage 1; Android package follows beta evidence. | Fast mobile testing and distribution. |
| D-006 | Voice-first, regional-language-first and offline-first are product invariants. | Primary product differentiation and target-user need. |
| D-007 | Initial product languages are Bengali, Hindi and English. | Matches target users while keeping internal contracts language-neutral. |
| D-008 | AI is accounting-scoped and grounded in authorized business data, not a general chatbot. | Reliability, cost and privacy. |
| D-009 | AI never finalizes a financial mutation without Confirm/Edit/Cancel. | Prevents silent financial corruption. |
| D-010 | UI begins with Money In, Money Out, To Receive and To Pay. | Accessible to non-accountants. |
| D-011 | Owner-approved main-only workflow: targeted local development checks, final local certification, owner-controlled direct main push, then Main GitHub Actions and SonarCloud on Free plan. Red CI requires a corrective commit; deployment stays manual. | The current Free subscription cannot run pre-main branch analysis; owner accepted Main CI repair without PR/staging. |
| D-012 | No PR, PR Preview or staging is created by default. Any one of them requires an explicit owner request for the specific change. | Avoids staging/production mismatch and unnecessary mobile workflow cost. |
| D-013 | Development uses targeted tests; full `khata verify` runs only at final certification. | Efficient mobile workflow without weakening the release gate. |
| D-014 | Final verify order: Ubuntu preflight → KNIP → JSCPD → Playwright → remaining Termux gates → summary. | Stable, approved verification order. |
| D-015 | Unsupported Prisma engines do not run on Android ARM64. | Known platform limitation; Linux/CI is authoritative. |
| D-016 | Long runs write timestamped Downloads reports and remain interruptible. | Mobile resilience and recoverable evidence. |
| D-017 | Every material session updates a durable project checkpoint. | Work survives chat/usage interruption. |
| D-018 | Exact money math and auditable correction/reversal are mandatory. | Accounting integrity. |
| D-019 | Implement screens step-by-step: Welcome/Login UI first, then module selection and Khata Boi; Gopal Dairy is a separate future module inside the Khata product. | Explicit owner direction of 2026-09-19; no cross-tenant sharing implied. |
| D-020 | For the first local UI slice, use the existing React/Vite/TypeScript scaffold and a non-authenticating demo session. Real Auth, persistence and backend choices are not approved. | Enables owner review in Termux without pretending demo is real login. |
| D-021 | Step 2 explicitly replaces the former business-specific dairy module label with **Farming**, keeps **Khata Boi** first, and lists **Lottery** as Upcoming only. Bengali, Hindi and English must cover all Step 2 UI text; the user can change language at any entry screen and that non-sensitive preference persists. | Owner revision on 2026-09-19 supersedes D-019 module naming and the old two-module lineup. UI/documentation-only change; no stable IDs, Auth contracts, data migration, company data, backend, deployment or cross-product integration is authorized. |

| D-022 | Owner-approved 20 Sept four-screen UI uses `ORBIS-KHATA-APP-UI-APPROVAL-PREVIEW.html` as a fixed visual/copy reference. Keep Welcome/Login/Workspace design; use a temporary UI-only no-login route, remove demo accounts/values/session, and add the empty Khata Boi dashboard shell. Real financial data is blocked pending authenticated API and tenant protection. | Owner approval after Android screenshot review; see `docs/UI_PHASE_04.md`. This supersedes demo-only UI details in D-020/D-021, not their module order or trilingual requirement. |

## Provisional decisions requiring formal review

| ID | Decision | Review needed |
|---|---|---|
| P-001 | Sign-up fields: First Name, Last Name, Email, Phone, Password, Confirm Password; no mandatory OTP. | Threat model, recovery and shared Orbis ID contract. |
| P-002 | Free plan begins with one business; paid plans may support multiple businesses. | Pricing and entitlement design. |
| P-003 | Shared Orbis IDs use UUIDv7 internally and `ORB-U-*` / `ORB-O-*` display forms. | Confirm identity service version and ownership. |
| P-004 | IndexedDB for PWA local storage and SQLite for a later native/hybrid package. | Stack and sync-spike results. |
| P-005 | Free/Pro/Business tiers; exploratory prices ₹79–₹129 and ₹199–₹299 monthly. | Market research; prices are not commitments. |

## Open decisions before coding

| ID | Question |
|---|---|
| O-001 | React/Vite/TypeScript is approved for Step 1 UI only; which final PWA/package layout and related architecture? |
| O-002 | Which backend runtime, database and migration tool? |
| O-003 | What is the exact accounting posting model and opening-balance representation? |
| O-004 | What are the local event/outbox schema and sync protocol? |
| O-005 | What is the conflict-resolution matrix for every mutable entity? |
| O-006 | Which speech recognition and AI provider strategy meets language, privacy and cost targets? |
| O-007 | What raw audio/transcript retention policy, if any, is allowed? |
| O-008 | Which Orbis ID/Auth contract version and recovery flow are used? |
| O-009 | Which metrics may Orbis Admin receive without exposing business data? |
| O-010 | Which hosting, monitoring, backup and subscription providers are selected? |
| O-011 | What are the beta success thresholds and performance budgets? |

## Deferred decisions

- Advanced GST, payroll and bank reconciliation.
- Complex inventory, batch/expiry/barcode and multiple warehouse.
- Employee/accountant roles beyond MVP owner access.
- Automatic WhatsApp/SMS sending.
- iOS/desktop builds.
- Full ERP or marketplace capabilities.

## Decision-change rule

### 2026-09-21 — Owner-authorized local Auth preparation

D-023 supersedes the no-real-Auth portion of D-020/D-022 for this incremental slice:
prepare Khata-owned Supabase email/password signup with first name, last name, email,
phone contact and password. No mandatory signup email/phone verification, no repeated
password prompt while a valid saved session exists, app lock off initially.
Optional device lock and later verification are deferred. No shared ORBIS ID or
Admin dependency may block signup; mutable unverified contact details cannot link identities.
P-001 is updated to these owner-specified fields (no confirmation-password field requested).
O-002 is resolved only for this Auth/company slice to the owner's new Khata Supabase
project; accounting, offline sync and remaining architecture questions stay open.
One-owner company preparation follows P-002; paid entitlements are not implemented.
Affected source: `src/auth/*`, App, dependencies, runner test scope and AUTH_SETUP.
Proposed schema: `docs/khata-company-proposal.sql`, not applied. UI appearance is
preserved, with functional account inputs replacing disabled ones when configured.
Production writes/deployment retain the explicit approval gate. No user accounts created.

Changing a locked decision requires an explicit owner instruction and an entry describing the old rule, new rule, reason, affected files/migrations, compatibility impact and effective date. Never silently rewrite architecture history.

### 2026-09-21 — Owner-approved multi-company accounting v1

Supersedes the one-company owner restriction for this slice. Owner explicitly requested
10/20 or more separate company books, company-scoped parties, sale/purchase/receipt/payment,
instalments and negative party balances as advances; approved real double-entry accounting.
TypeScript frontend and PostgreSQL remain the stack; no additional runtime is required.
Migration khata_accounting_v1 removes only the owner uniqueness constraint, preserves
existing company data, and adds owner-scoped immutable balanced vouchers and report APIs.
Future GST, opening-balance import, stock, offline/local-paid-cloud storage and automatic
backup are deferred, not represented as implemented. See ACCOUNTING_V1.md for limitations.
Source: src/accounting/*, CompanyGate, App, runner. Remote migration applied only to
gqyaxsczlmvppxuoqbox after rollback acceptance tests. No GitHub push or deployment.

### 2026-09-22 — Owner-requested deletion and next accounting scope

Owner supersedes the reversal-only user experience: all posted transaction types,
including purchase bills, must offer Delete with two explicit confirmations.
The ordinary ledger must remove the entry without requiring a user-entered opposite
transaction. Implement server-authorized, idempotent, atomic voiding with an internal
audit record; all financial totals exclude voided entries. Future stock movements
must be voided in the same transaction; independent receipts are not silently deleted
with an invoice. Show affected linked records and their remaining advance/dues before
the final confirmation. A date correction uses deletion then a correctly dated entry.
This decision is approved; implementation is pending and no financial rows are deleted now.

Next feature scope after current checkpoint certification/push/Sonar: unified party
and ledger master with contact details and expense accounts; item/unit masters;
itemized sale/purchase; inventory movements/stock reports; deletion propagation.
GST and offline backup remain later phases. Current push approval covers the installed
Auth/accounting checkpoint plus release fixes; it does not authorize deployment.
