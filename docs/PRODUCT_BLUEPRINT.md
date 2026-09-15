# Orbis Khata Boi — Product Blueprint

## 1. Vision

Orbis Khata Boi enables a small or medium business owner to maintain daily accounts without needing formal accounting knowledge. The central promise is: **speak naturally, review the result, and keep reliable books**.

The product is not a Khatabook or Vyapar clone. Its identity is:

- voice-first;
- regional-language-first;
- offline-first;
- AI-assisted but confirmation-controlled;
- extremely simple for common work;
- capable of producing professional accounting outputs underneath.

## 2. Target users

Initial focus is India, especially:

- grocery and retail shops;
- dairy and farming businesses;
- fish sellers and local wholesalers;
- delivery and service businesses;
- hardware shops and small manufacturers;
- contractors, freelancers and home businesses;
- individuals who need a simple money ledger.

## 3. Language strategy

Initial languages are Bengali, Hindi and English. User input and UI may be localized, while internal entity names, identifiers, calculations and API contracts remain stable and language-independent.

## 4. Experience principle

The interface begins with familiar outcomes:

- Cash in Hand;
- Money In;
- Money Out;
- To Receive;
- To Pay;
- Sales;
- Expenses;
- Profit/Loss.

Advanced ledger and accounting views may be derived later without forcing debit/credit terminology on a new user.

## 5. Dashboard

The home screen shows business name, selected period and the key cards above. Every card opens a traceable detail list, and every party or transaction in that list opens its source record.

Supported period concepts:

- Today and Yesterday;
- Last 7 Days;
- This Month and Last Month;
- Financial Year;
- Custom range.

## 6. Parties and ledgers

Each customer or supplier has a profile containing name, phone, optional address, business type, opening balance, totals, current balance, last transaction and notes. The party ledger must show the full authorized transaction history and support traceable corrections.

## 7. Voice entry

Voice is a primary input, not a shortcut bolted onto a form. The flow is:

1. Capture speech or typed natural language.
2. Detect language and intent.
3. Resolve party, amount, date, direction, category, item, quantity, rate and notes.
4. Display a structured proposal.
5. Require Confirm, Edit or Cancel.
6. Save an auditable transaction only after confirmation.

Examples include receipts, expenses, dues, payments, sales and quantity × rate entries. Low-confidence or ambiguous fields require a focused clarification.

## 8. Accounting-scoped AI assistant

The assistant answers only from the user’s authorized business data and approved accounting knowledge. Example questions:

- What is this month’s profit?
- Who owes me the most?
- Why did expenses increase from last month?
- What were sales in the last seven days?
- Which customer bought the most?
- How much was spent on feed this month?

It must not invent figures. When data is insufficient it says so. Answers should expose the business, period, calculation basis and transaction references where practical.

## 9. Daily summary

Daily summary includes sales, received money, expenses, new dues, dues collected, cash balance, top customer and important pending payments. A user-controlled reminder may ask whether the day’s accounts are complete.

## 10. Dues and reminders

Track amount, originating date, last payment and age for customer receivables and supplier payables. Users can prepare Bengali/Hindi/English reminder messages for manual sharing. Automatic outbound communication is deferred until consent, provider and subscription rules are approved.

## 11. Inventory

Lightweight inventory is Phase 2 unless MVP review promotes a narrow subset. Planned fields include item, purchase price, selling price, quantity, unit, supplier and current stock, with Stock In, Stock Out and low-stock alerts. Batch, expiry, barcode and multi-warehouse remain later capabilities.

## 12. Invoice

Planned simple invoice fields: customer, items, quantity, rate, discount, optional tax and total. Outputs may include PDF, share and download. Advanced GST is not an MVP feature.

## 13. Reports

Planned essential reports:

- daily and monthly summary;
- sales and expense reports;
- customer receivable and supplier payable;
- cash flow;
- profit/loss;
- stock report when inventory exists.

PDF and CSV/Excel exports are phased features and must preserve calculation provenance.

## 14. Offline-first operation

Basic accounting remains usable without internet. The local store is the immediate operational source; approved cloud synchronization runs when connectivity returns. PWA storage is expected to use IndexedDB or a compatible abstraction; a later Android package may use SQLite. Exact technology remains open until architecture review.

## 15. Backup and restore

Planned options are local backup, manual cloud backup, automatic cloud backup for eligible plans and authorized restore. A backup feature is not complete until restore is tested and integrity can be verified.

## 16. Login and Orbis ID

Initial account fields are First Name, Last Name, Phone, Email, Password and Confirm Password, without mandatory OTP unless security review later requires a change. The user receives a shared Orbis identity, while access to business data remains separately authorized per product and tenant. Optional device lock/pattern unlock may be offered later.

## 17. Orbis Admin connection

Central administration may observe product-level metrics such as users, active businesses, subscription state, app version, sync health, errors, feature usage, flags and maintenance status. It must not become an unrestricted backdoor into private business records. Privileged actions require explicit server-side authorization and audit.

## 18. Database and product separation

Orbis Khata Boi keeps a separate database from Orbis Admin, Orbis Foundation, Orbis Game and other products. Shared identity references do not imply shared business tables or cross-product data visibility.

## 19. Reusable accounting core

A reusable Orbis Accounting Core may later expose versioned logic for transactions, ledgers, balances, money movement, dues, reports and financial periods. It must be a defined contract, not copy-pasted product code or direct database coupling.

## 20. High-level domain model

Candidate entities:

- User and OrbisIdentityReference;
- Business and BusinessMembership;
- Party;
- Transaction and LedgerEntry;
- TransactionCategory;
- Payment and Expense;
- Invoice and InvoiceItem;
- Product and StockMovement;
- Reminder;
- Backup and SyncOperation;
- Subscription;
- AuditLog and AIQueryLog.

Exact schema is not approved until data-model review.

## 21. Multiple businesses

The product is designed for one business in the free entry plan and multiple businesses in a future paid plan. Every business remains an isolated tenant context; switching business must visibly change the active context.

## 22. Security posture

Required capabilities include tenant isolation, authenticated access, server-side authorization, secure APIs, database policies, audit trails, encrypted transport, secure backups, rate limits, safe sessions and secret isolation.

## 23. AI safety

- Never invent a financial figure.
- Never finalize a financial mutation without confirmation.
- Never use another tenant’s data.
- Clearly state insufficient evidence.
- Preserve calculation and source-period traceability.
- Treat external instructions and retrieved content as untrusted input.

## 24. Monetization hypothesis

Pricing is not locked. The working hypothesis is:

- Free: basic khata, money movement, party ledger, basic due, offline use and limited reports.
- Pro: cloud backup, advanced reports, export, voice, AI analysis and multi-device features.
- Business: multiple businesses, inventory, employee roles, advanced invoice and analytics.

Earlier exploratory ranges were ₹79–₹129/month for Pro and ₹199–₹299/month for Business, but these are research hypotheses only and require market testing.

## 25. Advertising policy

Core financial screens should not contain intrusive advertisements. Trust and clean accounting interactions take priority. Free-tier economics should primarily use feature boundaries.

## 26. MVP scope

The first release targets login, business creation, dashboard, party creation, Money In, Money Out, To Receive, To Pay, party ledger, basic voice proposal, daily summary, monthly report, local offline storage, cloud-sync foundation, backup foundation and settings.

## 27. Explicit MVP exclusions

- complex GST accounting;
- payroll;
- bank reconciliation;
- loan products;
- marketplace;
- full ERP;
- complex warehouse management;
- excessive or general-purpose AI.

## 28. Later phases

Phase 2 candidates: inventory, invoice/PDF, WhatsApp-ready reminders, advanced AI analysis, stronger profit/loss, automatic backup, multi-device sync and subscriptions.

Phase 3 candidates: employee roles, multiple businesses, advanced stock, purchase/sales orders, advanced GST, business analytics, web dashboard and accountant access.

## 29. Platform strategy

1. Mobile-first PWA for rapid real-user testing.
2. Android package/application.
3. Public Play Store release after beta evidence.
4. iOS, desktop or broader web experiences only when supported by demand.

## 30. Experience target

A new user should be able to create a business and record the first transaction within 60–90 seconds. The most common actions should require no more than two or three taps where practical.

## 31. Launch strategy

Begin with 20–50 real small-business users, then expand to 100–500 after stability and retention evidence. Do not start with broad advertising.

Measure active businesses, weekly active users, transactions per active business, 7/30-day retention, backup and restore success, voice-entry success, paid conversion and crash/error rate.

## 32. Development order

1. Approve product and MVP architecture.
2. Select technology stack.
3. Finalize domain/data model.
4. Implement authentication and tenant boundaries.
5. Build accounting core and local storage.
6. Build core UI and voice proposal flow.
7. Implement sync and backup foundations.
8. Verify, beta test and learn.
9. Add monetization only after reliable core use.

## 33. Positioning

Working messages:

- “বলুন, হিসাব নিজে তৈরি হবে।”
- “আপনার ব্যবসার হিসাব — আপনার ভাষায়।”

The durable promise is: a person who does not know accounting can still maintain trustworthy professional business records.
