# Lottery settings and simple Khata expenses — 30 October 2026

## Delivered behavior

- The utility menu shows Tutorial text before its checkbox. Lottery input focus uses a thin themed indicator rather than the thick blue ring; keyboard focus remains visible.
- Descriptive seller/stockist instructions, fixed-rate explanations and existing section hints are tutorial-only. Required labels, amounts, validation failures and save notices remain available normally.
- TDS is a utility-menu page, with percentage, effective start date, saved schedule and Save. The inline daily/master controls and external dashboard TDS box were removed. The latest rule whose start date is on or before the entry's Indian business date is selected on both server and entry previews. Before the first scheduled rule, the original rate applies. No compulsory end date: the next start supersedes the previous rate. Zero is valid. Saved historical rows are not rewritten by configuration changes; their original snapshots remain. These are configurable rates, not a claim about statutory tax applicability.
- Payment entry defaults to Cash/PWD/Bank. Organization settings can enable UPI/Online and Cheque, and named Bank folders such as GPay/PhonePe. A folder tags the bank portion of a receipt/payment; it is not additional money. Cash details open Bank before showing its enabled children/folders. Disabled legacy methods remain in Bank's statement total and stored history. The liquid dashboard total still excludes noncash PWD.
- Khata expense entry opens the existing expense journal flow, with Category, optional Subcategory, payee/staff, amount, date, Cash/Bank/unpaid, optional reference and note. No invoice rows, quantities, rates or discount. Sales/purchases retain their invoice flow. Outstanding payments settle the original expense rather than create another cost. Existing invoice-style expense records remain readable and correctable.
- Category/subcategory use the existing bounded category field (`Category › Subcategory`); old names are unchanged. Main category and child ledgers aggregate consistently, and payees without a separate master are discoverable in Ledger. Expense history is a bounded, horizontally scrollable table inside the card; it no longer depends on Lottery CSS loading first.

## Verification

- Complete unit/coverage checkpoint: 113 files, 700 tests PASS; statements91.50%, branches88.54%, functions91.05%, lines92.44%. All established thresholds pass.
- Related checks:76 tests PASS, then15 server/date tests after final validation/refactoring; final expense/cash component/model checks15/15 PASS. Focused new settings/category UI/model coverage has100% lines/functions.
- Full mobile/desktop browser run24/24 PASS. Final affected expense/Lottery flows4/4 PASS after Bank nesting, local table containment and layout adjustments. Includes save/reload, category/subcategory/payee, no quantity column, exact balances, TDS scheduling, optional-method settings, Tutorial toggling, checkbox order, focus style, module/menu bounds and original payment/retry behavior. Phone screenshots were inspected directly.
- Typecheck, production build/PWA, lint (inherited copied-UI advisories only), KNIP and zero-clone JSCPD PASS. Recommended local SonarJS scan clean on changed application sources. Native remote Sonar remains pending for the new commit.
- A browser test initially used an implicit select label that included option text; the method field now has an explicit accessible label. The reload test now reopens Expenses from the intentional module home before asserting the stored record. No accounting assertions or quality gates were weakened.

## External state

Khata `orbis-khata-data` Edge v15 ACTIVE,23 retrieved files match the reviewed bundle. Custom central authentication and `verify_jwt=false` are preserved; unauthenticated access returns401 KHATA_LOGIN_REQUIRED. Existing SQL rollback verification passes verified gateway enforcement, replay/version checks and owner isolation, with all fixtures rolled back. No schema migration, Foundation writes, production owner transaction edits or Render deployment. The existing aggregate storage bound is unchanged.

Owner-authorized main commit/push follows verification. Owner checks the new Actions result and manually deploys Render; no post-push polling.
