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

## D-024 — 2026-09-24 — Accounting expansion order

Existing Accounting v1 is the foundation and must not be re-designed. Future
accounting work proceeds in this order:

1. Party/Ledger Master
2. Item/Unit Master
3. Itemized Sale/Purchase
4. Inventory
5. Delete/Void propagation
6. Dashboard/Reports refinement

Each slice requires source implementation, focused tests, local preview/owner
review and evidence before the next slice. GST, offline sync/backup, AI
automation and subscription remain later phases.


## 2026-10-12 — Central account source checkpoint

Owner clarifies Khata is new and unreleased; no active legacy customer/book is assumed.
Preserve accounting rules and UI. Replace independent product Auth with Admin-owned
central identity; common profile remains in Admin, financial data in Khata. The
product-owned gateway enforces existing RLS using a transaction-local canonical ID.
The proposed product schema requires empty company/party/voucher tables and aborts
on unexpected data. No book or identity is deleted. One responsive web source
serves desktop/mobile; a development-only visual preview does not authorize data.

Prepared source: central browser adapter, product data client/gateway and a guarded
review SQL. Await targeted Termux lint/type/tests, actual product SQL/RLS/Deno checks,
central/provider runtime configuration, password recovery and full coverage/E2E.
Admin managed migration 20261012160546 is applied; twelve existing identities remain,
customer count is zero. No Khata product migration, gateway deployment, Git commit,
push, release or real signup/login verification has occurred at this checkpoint.


## D-025 — 2026-10-24 — Owner-requested complete business expense slice

Owner brings expense accounting forward before the remaining general ledger/item
master work. Support named expense accounts, cash/bank or unpaid expense posting,
partial/full linked settlement, date/category reports, as-of unpaid bills, exact
retry and audited corrections. Expense recognition and payment are distinct;
settlement does not expense the same amount twice. Existing cash/bank and journal
checks must include this subledger. Preserve prior companies, vouchers and IDs.
Do not label collections less payments as profit. Stock valuation and complete
P&L remain pending; expense source verification is not production acceptance.
Delivery stays owner-Termux/main with no default commit/push/PR or deployment.
See EXPENSES_ACTIVATION.md for the prepared cloud activation and acceptance steps.

## D-026 — 2026-10-25 — Owner-requested item inventory and normal app presentation

Owner explicitly advances item/unit masters, itemized purchase/sale, godown quantity
stock and custom units together for the next review. This supersedes the deferred
multiple-warehouse scope for simple godowns only. Preserve existing accounting,
Central identity, company isolation and all old rows; never infer quantity from
amount-only books. Exact quantities, atomic posting/retry, no negative godown stock,
period reports and stock-aware bill reversals are part of this slice. Unit conversion,
valuation, GST and delete/void remain separate. Opening/transfer entries are immutable;
review their quantities before confirmation. See INVENTORY_ACTIVATION.md.

Owner also replaces the old inline workspace account/settings form: use a three-dot
menu and separate Account & profile page. Explanatory tutorial copy defaults OFF;
the menu toggle enables it in the current language and remembers the non-sensitive
preference. Safety messages and actual accounting facts are never hidden by the toggle.
This UI instruction supersedes the inline settings portion of the former UI lock.
Release remains source review → owner Termux checks → owner main push → green CI/Sonar
→ separately approved migration/gateway/manual frontend deployment. No new live write
or deployment is made during source implementation.

## D027 — PWA shell caching (2026-10-25)

Owner approved combining installable PWA and static cache with the item release.
Cache only build-owned shell assets; preserve central online authentication and
financial gateway checks. No financial API caching or offline mutation queue.
Never force-update/reload while a bill may be pending. See PWA.md for scope.

## 2026-10-26 — Owner-authorized live masters and release

Owner approves the reviewed isolated UI for server trial and explicitly authorizes
assistant commit/main push and Khata database migration in this session. This is a
session-specific exception to the default owner-Termux push rule; no PR/staging or
cross-product data access is authorized. Party contact/credit/opening fields and
optional item code/rate must persist in the authenticated company. Every exposed
delete action requires two confirmations; cancellation at either prompt performs
no mutation. Used/opening-balance masters cannot be destroyed through master delete;
financial records retain their immutable audit/reversal model. Unused master deletion
is persisted and audited. Exact bill lines and same-ID recovery prevent duplicate
accounting after uncertain network responses. Final checks and server acceptance
remain necessary; a successful isolated demo is not production certification.

### Owner clarification — 26 October 2026

The owner reiterates that routine commits/pushes go through their Termux. They
explicitly authorize finishing the current already-pushed release and necessary
corrective pushes. This exception ends with this release; do not infer permanent
permission for direct GitHub pushes. Preserve the existing manual Render step.


### 26 October 2026 — Live save correction authorization

Owner explicitly authorizes assistant commit/main push for the reported production
master-save fault and phone contact actions. Synchronize the phone source afterward.
Use typed Postgres.js JSON parameters, never pre-serialized strings for JSON RPCs.
Contact access is optional, browser-supported and explicitly user-invoked; retain
manual numbers and dial links. Do not initiate a call automatically. This task does
not authorize unrelated releases or cross-product database changes.


### 26 October 2026 — Compact registers and shareable bill PDFs

Owner requests compact party/item columns and icon edit/delete controls with the
existing two confirmations. Keep bill design selection inside collapsed settings
and retain only the non-sensitive design preference. PDFs must preserve the chosen
bill layout and Bengali names, be prepared locally, and use an explicit native
file-share chooser or a download fallback. No automatic WhatsApp sending, external
PDF service, financial mutation, or forced app reload. Update readiness is a
compact dismissible notice; unfinished bill safety remains unchanged.


### 26 October 2026 — Card-to-ledger hierarchy

Owner requests summary card -> full due-party/account list -> selected ledger,
plus the independent Ledger menu. Due-card totals equal the positive outstanding
rows, including expense bills on To pay; do not net unrelated counterparties'
advances. Preserve signed journals and advance entries in individual ledgers.
Dues are as of the end date; expense movement uses the selected period. Load all
transaction pages for cash/bank details and keep corrections visible. These are
read-only display/navigation changes, not a new bill/payment posting contract.

### 29 October 2026 — Current statements versus immutable corrections

Owner requires edits to appear as the final bill in ordinary statements, with
bill-time settlement in its bill row and independent payments kept separate.
Retain the append-only correction journal for audit; exclude cancelled records
and reversal events from ordinary gross totals. Preserve net journal balances.
For period-boundary corrections, restate statement opening by the excluded net
movement so opening + effective movements equals journal closing. Aggregate
bill-time payments only through explicit bill links or the system-generated
Payment with bill marker with one unique party/date/reference/type match; never
join independent or ambiguous payments merely because references coincide.
All statement exports use the same projection as the screen.

### 29 October 2026 — Compact home and owner-scoped location

Home shows four cards in two columns: receivable/payable with top three positive
counterparty balances; combined cash/bank with separately selectable components;
and expense. Combined negative liquidity uses a light red card, otherwise green;
each negative component remains red independently. Card details retain full lists.
Remember only module/company navigation metadata keyed by authenticated owner;
validate company selection against the server-authorized list. Refresh restores
Khata home and selected company, not the public/module picker. Header/browser Back
returns to module home. Explicit logout clears saved module/company location.
Future modules must use supported routes; planned Farming is not activated here.

### 29 October 2026 — Neutral glass presentation

Replace colored card fills with consistent light translucent glass surfaces.
Keep negative liquidity figures red and nonnegative figures green; expense figures
may remain purple. Selected date presets and press feedback use light saffron.
All five date presets stay in one compact row on phones. This presentation change
must preserve persisted financial data, correction history and delete semantics.

### 29 October 2026 — Audited opening edits and responsive entry

Owner authorizes editing a party's opening amount, side and date after transactions
exist. Keep old/new values in khata_master_audit and retain all vouchers. Existing
used-party kind/account identity, deletion, item-unit, ownership and purge guards
remain. Require two confirmations for an existing opening correction in the UI.
Numeric amount/quantity taps select the previous value for replacement. Party names
open a scoped ledger/details view. Preserve the glass theme and add an optional
simple blue theme under More -> Themes, with device-only theme preference.
Use memory-only duplicate-read coalescing and an 8-second masters/settings cache;
invalidate on writes, explicit refresh, token changes and logout. Do not cache
financial reports or silently queue writes. PWA shell caching is not full offline
financial storage; IndexedDB/offline sync remains a separate unimplemented scope.

## 2026-10-29 — Bill numbering follows the invoice financial year

Company settings select automatic/manual independently for sales, purchases and expenses. Automatic references use configured prefix + Indian financial year (April 1–March 31) + serial, e.g. S-2026-27/42. Next serial changes the current financial year; other years start at 1. A company/kind/year/draft reservation is idempotent and company-locked; retries and same-year date changes retain the reference. Cancelled drafts can leave gaps; reserved/used automatic references are never reused. Historical posted references are not renumbered. Manual mode requires an explicit reference. Unavailable/invalid settings or number allocation disables review and exposes retry; never substitute a UUID reference. Existing bill/payment accounting math and recovery payloads stay intact.

## 2026-10-29 — Owner simplifies visible bill numbers

This supersedes the visible prefix/year format above: automatic bill references are plain positive integers (1, 2, 3 or a configured starting serial). No prefix/date/year appears in the invoice field, persisted reference, preview or export. April–March financial years remain internal allocation scopes; sale/purchase/expense counters remain independent. Existing historical references are not rewritten. Settings expose mode and Next serial; legacy prefix properties remain accepted for compatibility but do not affect new short allocations. A legacy formatted server response is refused rather than silently shown as the new format. Production activation requires the prepared short-number SQL and previously pending dated Edge contract deployment under explicit owner approval.

## 2026-10-29: Invoice numbering commits with the invoice

Previewing a bill never reserves its serial. The server allocates inside the same company-locked transaction as invoice posting and records the original request/result for retries. Manual references remain owner-supplied; old references and consumed historical gaps stay unchanged. Bill-level discounts reuse the existing signed adjustment on trade bills and preserve gross expense lines alongside net expense totals. Print appearance is company settings, not repeated entry controls.

## 29 October 2026 — Business reports and reproducible profit

Reports expose period bill counts/registers and actual cash/bank movements independently. Count only current effective sale/purchase vouchers and expense charges; reversals and superseded bills never add gross bill counts. Load every page and fail closed if any page fails. Every row opens its existing record viewer.

Profit is credit-inclusive net sales minus moving weighted-average cost of items sold minus effective expense charges. Allocate net purchase cost (including bill discount) across lines with exact minor-unit rounding and assign the remainder to the final line. Cost is pooled across godowns; transfers do not change it. With date-only documents, process opening stock, purchases, then sales within each date and use IDs to break ties. Unknown opening value, missing item cost or oversold/production stock makes final profit unavailable, with affected items shown; never assume a zero production cost. Once unknown stock clears to zero, future purchased stock can be valued again. Show sales minus purchases minus expenses separately from profit, and collections minus payments separately from both. Reports do not mutate old financial records or activate the deferred production module.

## 30 October 2026 — Independent Lottery module from the owned Foundation source

Reuse the pinned Foundation lottery domain and forms as a self-contained Khata module, not an iframe, redirect or Foundation API dependency. Do not import trial records, credentials, identity administration or deployment controls. The existing Orbis central customer identity remains the login; each owner's new lottery state is isolated from ordinary Khata companies and other owners.

Retain original commission/TDS/PWT, timed returns, draft versions, stockist/customer/expense books, recurring expenses, fiscal references, carry-forward, corrections and linked void behavior. Original server modules are mechanically converted to ESM, not rewritten as new arithmetic. New owner-locked private SQL aggregates provide exact scalar tags, metadata-derived uniqueness/foreign keys, transactional rollback and replay-safe operation results. Only verified product gateway calls can access that store. It is bounded to1.5MB encoded state per owner; migrate behind the same domain adapter to relational/paged storage before high-volume public rollout. Do not claim imported history or unlimited storage.

Foundation remains unchanged. New source provenance and integration differences are documented in vendor/foundation-lottery/PROVENANCE.md. Keep the copied forms lazy-loaded so normal Khata users do not load the lottery workspace. Use separate lottery navigation, pending and IndexedDB namespaces. Retain original Cloud/Device preference semantics; a successful local draft status must not be mistaken for cloud confirmation.

## 31 October 2026 — Lottery changed-row persistence and production clarification

Owner authorizes eliminating the 1.5MB whole-owner aggregate storage restriction rather than raising it. Save only changed records and all domain-related records together, retaining exact existing formulas, rollback, owner isolation and retry results. Existing PostgreSQL history stays; no client database replacement. The local v2 migration preserves a legacy backup and refuses old aggregate writers; live activation is separate. Full-state hydration and paged reads remain explicit scaling work.

Production inputs are purchased raw materials; an optional purchase-bill checkbox routes all purchased quantities into production atomically. Consume old stock first. Farm milk enters own stock from production without a second supplier purchase/payable. Cumulative input cost divided by cumulative output gives the date-selected average; additional output can reduce that average. Preserve stock/history when disabling the company production mode. Owner subsequently clarifies that this is one continuous company pool: no batches, exhaustion reset or manual batch close. Later input cost and later output accumulate indefinitely; as-of reports exclude future activity. Consume old purchased raw materials and milk first, while unrelated stock retains its existing policy.

## 1 November 2026 — Paid-expense profit and salary/bill accounts

Owner explicitly chooses paid-expense profit in both Khata and Lottery: only actual expense payments reduce period profit. Salary/bill accrual and historical opening balances remain separate account balances; old journal records are preserved. Revenue, stock costs, commissions, TDS and PWT rules are unchanged. This supersedes the earlier expense-accrual part of the reporting decision.

Salary supports calendar months or anniversary cycles, using actual cycle days and integer-paise rounding. Stop means the last paid work day inclusive; resume means the first paid work day inclusive. Repeated unpaid intervals retain history. No paid/unpaid leave selector. Bills charge in full per cycle and have no salary stop/start. Used categories cannot be removed; unused categories require explicit confirmation.

Khata uses a separate compact Expenses → Salary and bills account page. Payment posts to the existing expense journal in the same locked transaction as account state and replay receipt. Schedule creation itself posts no expense/cash. Lottery retains its own owner-scoped record store and uses the same date calculation. Legacy profiles are not silently converted; profiles with existing expense bills must retain that history and use a separate new schedule profile to avoid overlapping charges. Migration, matching Edge and frontend activation remain separate from source push.

## 1 November 2026 — Lottery payment balances and PWD total

Owner explicitly allows cash and bank ledger balances to become negative when paying, including expense payments and payment corrections. Cash/bank balances describe recorded movement; they are not a payment budget. Positive input amounts, valid splits, tenant ownership, expense-account due limits and immutable journal/correction history remain enforced.

PWD (internal pwtPaise) remains a separate prize-token ledger usable for stockist payment, with incoming/outgoing movement. Include it in the dashboard's combined money total alongside the existing money-method balances. Never merge it into cash/bank journal entries or TDS, and retain the genuine cash-flow measure separately. New payments and corrections cannot overdraw PWD; date-selected checks and chronological daily balances also protect later commitments against backdated spending or receipt reductions. No historical amount is rewritten.

## 1 November 2026 — Independent stockist returns and customer statement request

Stockist returns may be saved before or without seller returns, including separate stockist-only bookkeeping. Seller/stockist return differences are advisory reconciliation information displayed in a red panel; they cannot block initial save or an audited correction. Quantity validity, fixed rate, commission/TDS calculation, tenant isolation and existing ledger history remain enforced. A failed unchanged autosave must not run an endless retry loop; keep the pending entry, visibly mark it unsaved, and allow manual retry or another edit. Preserve edits made during an in-flight save.

Owner also requests a future Customer view: link a party's statement to the recipient's immutable central Orbis ID and permit only that party's bills, quantities, returns, payments and balance to be viewed. Proposed product-local consented binding: owner/organization(or company)/party/recipient/module, accepted by the recipient and revocable by the owner. Central identity remains in Orbis Admin; commercial records remain in Khata. The same identity can own its books and view explicitly shared statements from other businesses. Customer view requires a server-filtered read-only endpoint and authorization, not merely hidden edit buttons. No sharing schema or access grants are implemented in this repair; milk statements can reuse the approved contract later.

### 2026-11-01 — Consented Lottery Customer view

Owner approves implementing the per-party Customer view described above. This is a product-local read-only link, not a second ledger or an Admin role. An owner invites the customer's verified human Orbis display ID; acceptance binds the immutable canonical central UUID. The same person may retain independent books and multiple shared statements. No email/phone search, global central-directory privilege, shared credentials or mirrored commercial transactions are introduced.

party-sharing is a strictly validated Khata gateway operation. The server derives ledger ownership, canonical UUID and display ID from the live central session. Private-schema sharing tables have forced RLS and no direct client grants. The internal SQL function checks the canonical-to-legacy owner mapping, owner/org/party boundary, invitation acceptance and revocation. A shared statement always derives its source from the accepted binding, never recipient-supplied owner/organization/party. Pending/revoked invitations expose only their relationship metadata. Existing financial tables and formulas remain unchanged.

Only an explicit one-party projection leaves Edge: opening and running balances, bills/drafts, quantities/returns, rates, commission/TDS and payments including PWD. Internal organization hydration stays server-side; read projection disables recurring-expense materialization and never commits the disposable store. Draft rows are explicitly labeled and follow the owner's existing statement policy. India business dates and integer paise are retained. Date filtering carries prior balances; responses page at100 rows without losing the closing total. No financial sharing response is saved in localStorage or offline caches; each read verifies the current live session and binding again. A previously delivered statement cannot be remotely erased from someone's memory/device; revocation denies subsequent reads.

Access path: signed-in main Modules → Customer view, also reachable through the Lottery menu. Link account offers only the owner's eligible existing parties. The recipient accepts in Customer view, views statements and can separately open My Lottery books. Refresh retrieves current source entries. Owner revoke and recipient removal preserve accounting history. Milk statements remain future work; no milk sharing is claimed.

Activation is a coordinated backend/frontend release: review exact-commit CI, apply the new sharing migration to Khata only, deploy matching Edge imports and then frontend, and verify with consenting accounts. The old frontend remains compatible with the additive schema. Neither Render-only deployment nor source push alone activates sharing. No Admin/central schema or permissions change is needed.

### 2026-11-02 — Link from Lottery Masters; recipient-only Customer view

Owner chooses the existing master profile as the link entry point. Seller/stockist/customer create/edit forms expose an optional Orbis ID. Saving without an ID retains the ordinary profile workflow. Saving with a valid ID first persists that profile, then sends the consented read-only invitation for the exact returned party ID. Financial profile persistence and invitation delivery are separate operations; a failed invitation must visibly retain the saved profile and ID so retry edits the same party rather than creating a duplicate. Existing active links show their display ID and pending/accepted state; revocation requires confirmation and never deletes the party or its history.

Customer view displays incoming personal statements only. Owner invitation forms and outgoing relationship lists belong in Masters. Recipients may still open their separate full Lottery books explicitly; no global viewer role, subscription/fee change, financial edit capability or duplicated journal is introduced. Existing date-filtered balances, payment splits, consent and server-side one-party authorization remain unchanged.

Relationship metadata must include exact organizationId/partyId values; never infer a link from a possibly duplicate name. The reviewed SQL candidate docs/master-party-links.review.sql replaces only the existing sharing RPC to add these metadata fields. It creates no new account/financial table and preserves grants and gateway/consent checks. It is tested in disposable PostgreSQL. Apply this reviewed function update after exact-commit CI and before the matching frontend deployment. The existing Edge list path forwards the additive metadata and requires no new business operation. The original historical migration is unchanged. No new migration filename is invented; the reviewed SQL is prepared for the separately authorized migration application.

### 2026-11-02 — Date-wise shared statement and explicit freshness

The owner requests a larger read-only statement with serial/date/reference, dispatch, total unsold, net tickets, rate, commission, TDS, bill, payment and running balance in dedicated columns. Total unsold reuses the existing return total; server projections and accounting formulas are unchanged. Only Customer view expands to desktop page width; mobile tables scroll within the viewport.

Default to the last30 India business dates, with current/previous-month presets and editable dates. Explain that earlier transactions contribute to opening balance. Refresh rechecks permission and fetches the open statement for the selected dates at page one. Failed/revoked responses remove stale output. Last checked means this client received a successful response, not the source transaction update or delivery time to another device. No polling, push notification, persistent financial cache or financial edit capability is introduced. Own Lottery books remain separate.

### 2026-11-02 — Expense preview, report drill-down and shared module entry

Owner requests the latest three expense details on the existing Home expense card, actionable report summary cards, bill-to-party/item details and Customer view in the shared module picker. Show the newest three effective paid-expense transactions in the selected period (cash/bank charge or payment), excluding unpaid accruals and cancelled records. Keep summary totals unchanged. Fetch older expense pages only if the first page cannot supply three eligible entries; keep preview rows separate from the original report page to prevent downstream pagination duplication.

Report Sales/Purchases/Total bills open their matching bill-register filters; paid Expenses opens expense money movements; Money received/paid open the corresponding movement direction. Exact bill reference/name still opens the saved entry. Inside a bill, party and inventory-item names open their existing company-scoped ledgers as of the bill date, within the same modal, with Back restoring that bill. Expense payees open expense ledgers; free-text expense descriptions do not invent stock-item bindings. No accounting entries are generated by drill-down.

Customer view is a direct target in the same Modules picker used by Khata and Lottery; it uses that picker for the reverse route. Existing signed-in route guards, company selection and separate own-books behavior remain. Owner withdrew the additional Main Home control request; no new Main Home action is added.

Profit remains sales less known cost of sold stock/production and paid expenses. Unknown or insufficient costed stock continues to withhold final profit. The existing diagnostic now always explains why sales minus purchases minus expenses is a separate comparison, including when Tutorial is off. Do not invent cost, rewrite historical stock or change production policy to force a profit number.

### 2026-11-02 — Simple comparison alongside costed profit; preserve production history

Owner approves releasing the preceding Expense/detail/Modules slice with this profit presentation and expressly authorizes main commit/push. Keep the accounting engine and all historical records unchanged. Ordinary stock retains moving-average valuation; historical production retains its existing FIFO input/cumulative output pool regardless of the current Production setting. Production OFF changes available workflow/presentation, never deletes or revalues stored documents.

Always display costed net profit (sales minus cost of SOLD stock minus other paid expenses), the separately named sales-minus-all-purchases-minus-paid-expenses comparison, and cash/bank movement. Incomplete stock costs withhold final net profit rather than assigning a fabricated zero cost. The simple comparison remains visible but is explicitly distinguished from net profit when unsold stock exists. This remains the existing paid-expense reporting policy, not a new statutory accrual-profit claim.

Read the existing company-scoped Production setting. ON exposes consumed inventory input cost, total produced quantity and average output-unit cost cumulatively through the selected report end date; the selected-period sales/cost/expenses remain selected-period amounts. Input costs transfer into output valuation and are deducted once when sold, without expensing all raw purchases again. Other paid expenses remain separate; no automatic allocation of wages/medical costs or Farming module is introduced. An unavailable setting is labeled unavailable while saved-cost calculations remain usable. No backend, migration, financial write or threshold change is necessary.

### 2026-11-03 — Optional scheduled-expense checkbox; ordinary categories retained

Owner replaces the proposed category-triggered scheduling with one small native checkbox: Track monthly / scheduled payments. Category, Subcategory and Paid to / owed to remain in one common form and retain entered values when the checkbox is toggled. No compulsory Salary/Bill/EMI/Interest category routing is introduced. Off means the existing ordinary expense flow; on reveals schedule fields for any category. Saved accounts synchronize and lock common identity fields until explicit Edit. The opt-in section is inline, without another card or nested checkbox layer. Manual suggestion arrows prevent typed-name menus covering the checkbox; accepted schedule names become the existing owner/company-scoped optional name suggestions.

Monthly terms and actual variable bills track due/advance only; only actual payments enter the expense journal, cash/bank and the existing paid-expense profit report. Salary uses its existing active-day accrual; fixed bills use cycle amounts, and variable bills require actual dated amounts. Add optional end dates and stop/resume. Confirmed excess payments become an explicitly labeled advance. Profiles with opening/payment/bill/work history cannot be silently deleted; corrections retain history. Variable-bill cancellation has an as-of date and does not reverse real payments. Lock core schedule terms after bill/payment/work history. This generic expense scheduler does not infer a loan principal/interest split from a category name.

Reuse the existing company-scoped, versioned/replayed JSON profile RPC. New optional metadata and actual-bill history round-trip through the existing SQL schema; no new migration is needed. Release matching shared-model Edge code before/with the frontend. The old frontend does not understand new VARIABLE schedules, so do not mix old frontend code with new schedule records. Lottery retains its prior schedule fields and contract: extensions are opt-in for Khata and new unsupported shapes are rejected by Lottery saves. Home Expense keeps the latest-three paid rows and drill-down but displays name/amount only. No new identity/provider/tenant boundary or journal formula is introduced.

### 2026-11-03 — Owner clarification: closing inventory and profit (approved next accounting slice)

The owner rejects treating every purchase as an immediate cost in the main profit figure. Required accounting basis: opening inventory plus purchases plus applicable conversion costs minus closing inventory equals cost of goods sold; net profit deducts that cost and other applicable expenses from sales. Closing inventory must include warehouse stock, unused production material, work in progress and unsold finished output at cost. Warehouse-to-production movement is a transfer, not automatic consumption or a second expense. Example with zero opening stock: sales200, purchases100, closing inventory10 gives cost90 and profit110 before other expenses. When material60 produces output sold entirely for100, profit is40 before other expenses. Production ON/OFF must not erase or revalue historical accounting. Do not deduct both raw purchases and the same transferred output cost. Missing valuation must be diagnosed, never silently assigned zero. This entry records the approved requirement only: the accounting engine, stored transactions and existing report formulas are NOT changed in this UI slice.

### 2026-11-03 — Personalized module landing

Reuse the existing authenticated central Profile API to display the current owner's name in the workspace greeting. Do not infer a name from email, company, device or display ID, persist a profile copy, or block modules while the optional name loads. Abort reads on identity/view change; reject a mismatched returned identity. Guest and unavailable profile retain the localized generic welcome. Customer view receives the same icon/title/description/Open structure as other active modules, with a local decorative account illustration. A compact blue identity/greeting panel preserves the existing navigation and themes. No financial reads/writes, authentication policy, backend or migration change.
