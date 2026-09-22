# Khata accounting v1 — owner-approved basic ledger

## Implemented scope

INR-only, online, owner-only accounting. One owner may create multiple companies;
there is no artificial one-company limit. Switcher and all data access use company UUIDs.
Each company has its own customers/suppliers/both, immutable dated vouchers, cash and
Bank/UPI accounts, receivables, payables, advances, period totals and party ledger.
No data is shared across owners. No new user account is required.

| Event | Debit | Credit |
| --- | --- | --- |
| Sale | Customer receivable | Sales |
| Purchase | Purchases | Supplier payable |
| Receipt | Cash or Bank | Customer receivable |
| Payment | Supplier payable | Cash or Bank |
| Reversal | Original credit account | Original debit account |

A sale does NOT increase cash. Receipts and payments are separate unlimited events.
Sale 1000 + receipts 600 + 600 => customer balance -200 (advance). A later sale 500
leaves 300 receivable. Purchases/payments follow the corresponding supplier rule.
Dashboard shows positive dues and advances separately, never silently nets different parties.
Party-filtered ledger opening/closing balances do not change company dashboard totals.
Period totals include reversal effects on their effective dates. All balances start at zero.

Amounts are parsed as integer paise using BigInt, transferred as strings, stored as
integer-checked PostgreSQL numeric. No floating-point money arithmetic or silent rounding.
Each posting row is one equal debit/credit pair; the security-invoker journal view expands
it into two lines. This MVP deliberately does not pretend to support arbitrary multi-line
tax invoices. Later tax/item tables and posting APIs require a versioned migration.

## Protection and retry rules

- Owner RLS on companies, parties and vouchers; composite foreign keys prevent cross-company references.
- Anonymous users cannot read/write accounting data or execute accounting RPCs.
- Posted vouchers cannot be updated or deleted by the app. A reasoned opposite entry
  corrects a mistake; reversal-of-reversal and double reversal are rejected.
- Confirmation is required before money is posted. Exact client UUID + payload retries
  are idempotent under an advisory transaction lock. Changed payload conflicts.
- Pending voucher payload is retained in browser sessionStorage by user ID before sending.
  Reload the SAME tab and retry after a lost response. This is NOT an offline backup or
  durable cross-device outbox; closing/clearing the tab can lose the pending request.
  In that case inspect ledger/reference before re-entering any uncertain transaction.
- Definite SQL rejection permits correction/cancel. Unknown connection failures keep the
  same payload locked for retry. Company switching clears stale data and scopes new reads.
- Server aggregate totals cover all rows; entries are paginated in pages of 50. A 1001-row
  rollback test confirms totals are not silently truncated by the Data API row limit.
- Dates follow Asia/Kolkata; future postings rejected. No fiscal-period locking yet.
- Emergency server switch: public.khata_write_controls.enabled=false disables financial
  writes. Only privileged operators can change it; no frontend privilege is granted.

## Remote state / verification — 2026-09-21 UTC

Migration `khata_accounting_v1` applied only to project `gqyaxsczlmvppxuoqbox`.
Existing company retained. Post-migration counts: 1 company, 0 parties, 0 vouchers.
No financial test entries retained; all database acceptance tests ran inside rollback.
No Admin/Foundation changes; no auth settings, user creation, GitHub or deployment writes.

Targeted tests cover frontend confirmation/cancel/retry/isolation and API payloads,
money parsing, existing auth/navigation. TypeScript, source lint and Vite build checked.
SQL tests: multi-company ownership, cash/bank, instalments/advance, supplier dues,
same-ID retry/conflict, reversal and duplicate reversal, immutability, fractional amount
rejection, future dates, 1001-row aggregate/pagination, period opening, anon denial,
cross-company party references, other-user RLS/report rejection.

Not a release certificate: Android visual approval and real browser HTTP/JWT end-to-end
accounting remain pending. Cloud Browser could not reach the local preview
(`ERR_BLOCKED_BY_CLIENT`). Full CI/Sonar/coverage/release gates are not run here.
Existing security advisor warnings remain: public `rls_auto_enable()` SECURITY DEFINER
execute privileges, and leaked-password protection disabled. They were not introduced
by accounting and are not silently changed in this slice.
Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Not yet supported

GST/HSN/tax filings, invoice item lines/printing, inventory/COGS/profit, opening-balance
imports, expenses/general journals, cash-bank transfers, invoice-wise payment allocation,
refund/credit-note business flows, staff permissions, fiscal closing, exports,
local-first/offline sync, automatic backups and subscriptions. This is NOT Tally/BUSY
feature parity. It is the first basic ledger foundation for incremental expansion.
UUIDs, company boundaries and versioned APIs preserve a path for future local/cloud sync.

## Phone handoff

Apply the accounting package only on the installed auth candidate based on main
2eb03ce151d9e80607378e9fa4ce9d69bd5657ed. Installer checks touched-file hashes,
backs them up, checks/applies an incremental patch and runs targeted tests.
No dependency changes or .env overwrite. Existing user edits are not reset.
Keep the already-running 5173 preview; do not start another server on that port.
Refresh browser, open Khata, create a second company and verify switching. Use an
explicit test company for your own trial transactions; real postings are immutable.
Do not rerun the SQL from the phone: it is already applied remotely.
