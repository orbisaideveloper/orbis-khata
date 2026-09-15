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
| D-011 | `main` stays unchanged during development; work uses a feature branch; after final verification and explicit owner authorization, the verified state moves directly to `main` without a PR. | Recoverability, fewer repeated steps and owner control. |
| D-012 | No PR, PR Preview or staging is created by default. Any one of them requires an explicit owner request for the specific change. | Avoids staging/production mismatch and unnecessary mobile workflow cost. |
| D-013 | Development uses targeted tests; full `orbis verify` runs only at final certification. | Efficient mobile workflow without weakening the release gate. |
| D-014 | Final verify order: Ubuntu preflight → KNIP → JSCPD → Playwright → remaining Termux gates → summary. | Stable, approved verification order. |
| D-015 | Unsupported Prisma engines do not run on Android ARM64. | Known platform limitation; Linux/CI is authoritative. |
| D-016 | Long runs write timestamped Downloads reports and remain interruptible. | Mobile resilience and recoverable evidence. |
| D-017 | Every material session updates a durable project checkpoint. | Work survives chat/usage interruption. |
| D-018 | Exact money math and auditable correction/reversal are mandatory. | Accounting integrity. |

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
| O-001 | Which frontend/PWA framework and package layout? |
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

Changing a locked decision requires an explicit owner instruction and an entry describing the old rule, new rule, reason, affected files/migrations, compatibility impact and effective date. Never silently rewrite architecture history.
