# Khata bill and expense corrections — 30 October 2026

Starting main: b03ac8e192d61e381f562360892950c783f668b7. Owner authorizes direct main commit/push after verification; Render deployment remains owner-controlled.

## Scope

All requested changes in this batch belong to **Khata Boi**, not Lottery. Lottery and copied Foundation source/formulas are unchanged.

- Reproduced the bill-review rejection: the form rejected a receipt/payment above the net bill, and the SQL workspace transaction enforced the same ceiling. Both now allow the excess. Existing exact balanced party/cash/bank postings carry the credit/advance, including previous balances. No additional financial posting or invented income is created.
- Negative inventory remains allowed. The generic stock warning is replaced by a compact selected-item stock projection beside discount. Repeated rows aggregate before projecting stock; unknown/failed inventory loads show an unknown value rather than an invented zero. The projection uses the selected warehouse and bill date.
- Bill review gives a specific missing/invalid party, number, date, row quantity/rate, godown, discount, payment amount or account error. Missing required fields receive aria-invalid and focus. Known server rejection reasons are translated without exposing arbitrary database errors or secrets.
- The duplicate Khata Boi subheading is removed. Company selection and Modules share one compact row with separate controls. The principal header remains.
- New party creation offers customer, supplier and both. Existing expense-party records remain readable/editable; no old record is converted or deleted.
- Expense entry hides the disabled duplicate Add expense button while the form is already open. Category, optional subcategory and payee have searchable choices, explicit add actions and a bounded scrolling list. Category/subcategory relationship is retained. Saved party names and expense history provide suggestions. Unposted name suggestions are owner/company-scoped on this device; once an expense is saved, its category/payee remains in the existing server journal and is loaded from all history/pages. No zero-amount dummy expense is created merely to add a suggestion.
- Salary needs only Salary + staff name; subcategory may remain blank. Existing category encoding and payee ledger filters are retained. Financial records use the existing auditable review/confirm/retry workflow; review/save controls are labelled clearly and placed above the bottom navigation.

## SQL boundary

The migration only changes the paid-total guard in the existing private legacy workspace function. It preserves canonical-owner/gateway checks, the company transaction lock, original journal posting, invoice numbering, idempotency and correction/reversal paths. No table/data rewrite or owner financial record edit.

The revised atomic rollback acceptance test exercises discount, sequence non-consumption on failure, retries, expense correction, a 45.5-litre sale with negative stock, ₹2,502.50 less ₹2.50 = ₹2,500, a ₹3,000 receipt, ₹500 party credit and complete reversal. Fixtures are rolled back.

## Verification

Full unit coverage115 files/710 tests PASS; final related28 tests PASS. Full browser26/26 PASS, final affected4/4 and expense2/2 PASS with screenshot review. Typecheck, production build/PWA, lint (inherited vendor advisories), KNIP, zero-clone JSCPD and local recommended SonarJS PASS. Coverage91.59% statements,88.58% branches,91.02% functions,92.24% lines. Results and limitations are recorded in PROJECT_STATUS.md. Native remote Actions/Sonar is pending after push; no polling. No Render deployment or Lottery source change. Khata Edge v16 contains the updated safe business-error allowlist; all other 22 deployed files match v15. The canonical central verifier and verify_jwt=false configuration are retained. Retrieved source matches all 23 reviewed files; unauthenticated POST returns 401 KHATA_LOGIN_REQUIRED.
