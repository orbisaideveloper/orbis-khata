# MVP Product Specification

## Status and purpose

This is the baseline for the next review. It defines the smallest useful first product but is not yet an implementation authorization. The owner must approve the screen list, flows, data model and architecture choices before coding begins.

## 1. MVP outcome

A new user can sign in, create one business, create parties, record and review core money movements offline, inspect balances and summaries, and safely synchronize/backup through a foundational cloud path.

Target: first transaction within 60–90 seconds of beginning onboarding.

## 2. Personas

- Business owner who wants a simple daily khata.
- Owner who speaks Bengali/Hindi more comfortably than typing.
- Owner with intermittent connectivity.
- Owner who needs to know cash position and dues without reading formal accounts.

Employee/accountant collaboration is not MVP unless separately approved.

## 3. MVP screen list

1. Welcome and language selection.
2. Sign up / Sign in / recovery entry point.
3. Create Business.
4. Home Dashboard.
5. Quick Entry chooser.
6. Voice/Text Proposal.
7. Confirm/Edit Transaction.
8. Party List and search.
9. Create/Edit Party.
10. Party Profile and Ledger.
11. Transaction Detail and Correction.
12. Daily Summary.
13. Monthly Report.
14. Sync and Backup Status.
15. Settings, language and account.

## 4. Core user flows

### Onboarding

Choose language → create/sign into Orbis ID → create business → arrive at dashboard → guided first transaction.

### Manual transaction

Choose Money In, Money Out, To Receive or To Pay → enter amount/party/date/note → preview → confirm → show receipt/detail and updated local projection.

### Voice transaction

Tap microphone → speak → receive structured proposal → clarify or edit ambiguous fields → confirm → save locally → show sync state.

### Party ledger

Open party list → select party → see running summary and chronological entries → open entry → correct through approved reversal/adjustment flow.

### Offline and reconnect

Create confirmed entries offline → see Pending Sync state → reconnect → idempotent sync → see Synced or actionable Conflict/Failed state.

### Backup

Request backup → observe Created/Uploaded/Verified status → provide restore entry point. A restore test is required before marketing backup as reliable.

## 5. Functional scope

### Identity and business

- First Name, Last Name, Email, Phone, Password and Confirm Password.
- One active business in the initial free experience.
- Visible active business on accounting screens.
- Server-authorized business membership.

### Party

- Name required.
- Phone, address/type, opening balance and notes subject to final data review.
- Customer/supplier/both relationship without duplicating one real party unnecessarily.
- Search and duplicate/ambiguity handling.

### Transactions

- Money In.
- Money Out.
- To Receive.
- To Pay.
- Amount, date, party when relevant, category/note and stable reference.
- Local save, audit metadata and correction path.

### Dashboard

- Cash in Hand.
- Money In and Money Out.
- To Receive and To Pay.
- Sales and Expenses where the transaction model supports a correct distinction.
- Period selector and tap-through detail.

### Reports

- Daily summary.
- Monthly summary/report.
- Party balances and ledger.
- Totals reproducible from source entries.

### Voice/AI

- Bengali, Hindi and English utterance acceptance target.
- Structured proposal only.
- Confirm/Edit/Cancel required.
- Focused clarification for missing direction, amount, party, date, quantity or unit.
- No general chatbot.

### Offline, sync and backup

- App shell and core accounting available offline after installation/use.
- Durable local operations and visible sync states.
- Idempotent foundational cloud sync.
- Manual backup/restore foundation; automatic schedules may be paid/later.

## 6. Non-functional gates

- Mobile layout tested at representative Android sizes.
- Accessibility labels for all core actions and status indicators.
- Localized numbers/currency/date without changing stored values.
- Exact money math and tested period boundaries.
- Tenant isolation verified for every cloud read/write.
- No secret or service-role credential in client output.
- Crash recovery for confirmed local entries.
- Clear offline and sync status.
- Performance budgets to be set after stack selection.

## 7. MVP exclusions

- Advanced inventory and warehouse management.
- GST filing or complex tax accounting.
- Payroll and bank reconciliation.
- Loans or financial marketplace.
- Purchase/sales order workflows.
- Employee roles beyond what security review approves.
- Automatic WhatsApp/SMS sending.
- Multiple businesses/devices as a complete paid feature.
- General-purpose AI assistant.
- Production subscription billing before core reliability evidence.

## 8. Acceptance scenarios

The MVP cannot be called beta-ready until evidence shows:

1. New user completes onboarding and first entry within the target journey.
2. Each transaction type saves, appears in details and updates derived totals correctly.
3. Party ledger matches its source transactions and opening state.
4. Date/period filters handle timezone and financial-year boundaries correctly.
5. Bengali/Hindi/English voice examples produce editable proposals and never auto-post.
6. Offline entry survives app restart and syncs once after reconnection without duplication.
7. Cross-business/user access attempts are rejected server-side.
8. Correction preserves an audit trail.
9. Backup can be restored into a verified state.
10. Critical mobile flows pass Playwright/device-oriented checks.
11. Production-relevant migration and smoke checks are documented before release.

## 9. Beta plan

- Internal fixtures and destructive test accounts first.
- 20–50 consenting small-business beta users.
- Measure activation, transactions per business, 7/30-day retention, voice success, sync conflicts, backup/restore success and crash/error rate.
- Expand to 100–500 only after data integrity and recovery are credible.

## 10. Decisions required before implementation

- Approve/adjust screen list and navigation.
- Approve transaction semantics and opening balance.
- Approve correction/deletion policy.
- Approve exact MVP local/cloud boundary.
- Select stack and deployment providers.
- Finalize schema and tenant policies.
- Finalize sync conflict matrix.
- Confirm shared Orbis ID contract and admin metrics.
- Define privacy, audio/transcript retention and backup policy.
- Define beta success thresholds.
