# Compact Lottery home and money statement

Recorded: 2026-10-30T13:32:30+05:30 (India). Base main34261639bc1ff0bc83c6c382bb25693a24e91340; its Actions41013232432 SUCCESS.

## Delivered

- Sticky centered Lottery header with module picker, live shared language selector and three-dot account/tutorial/logout menu. Main-shell clipping no longer creates a scroll container that defeats sticky positioning.
- Compact organization selector, small actual synchronization status dot and refresh button share one row. Sync status remains distinct from authentication; the title/accessibility text preserves the complete status. The repeated organization/dashboard title and separate sync row are removed. Period buttons fit a single five-column row.
- The large Current Money panel is replaced by one Cash card in the sixth dashboard grid position, beside Expenses. Cash opens the payment-method list; selecting a method opens one statement table of date, name/reference, received, paid and running balance. Outgoing money and negative balances are red. Back returns through methods to dashboard.
- Liquid total includes cash/bank and historical UPI/cheque, excluding non-cash prize tokens. PWD remains explicitly available as a separate non-cash adjustment in method details. Historical UPI/cheque methods appear when relevant rather than losing old data. No financial records or posting formulas are changed.
- Statements carry balances before the chosen start date into opening, use Indian business dates, retain reference ordering with stable ID ties, and reconcile period receipts/payments, expenses and closing balances with exact paise. They use current effective workspace records, so existing correction/void projection is retained.

## Verification

- Full coverage:106 files /678 tests PASS; statements91.28%, branches88.09%, functions90.77%, lines91.98%. All existing thresholds pass. New cash statement UI/model have100% lines and functions; statement model100% branches.
- Complete mobile/desktop Playwright24/24 PASS. Stronger final Lottery2/2 PASS asserts header stays within top40 pixels after scrolling over100 pixels, language changes title, the menu opens, old money panel is absent, six-card Cash total excludes PWD, exact cash rows/totals appear and back/module switching work. Existing daily entry, failed-save retry, refresh-safe payments and restoration assertions remain.
- Typecheck, production/PWA build, lint (inherited vendor warnings only), KNIP and zero-clone JSCPD PASS. Recommended local SonarJS scan clean. New remote Actions/Sonar result is pending the push.
- Screenshots inspected for mobile header/statement layout. A test expectation was updated to the intentional date/reference ordering; organization creation now waits for the loaded dashboard before choosing Masters. No arbitrary timing wait replaces a save acknowledgement.

No SQL, Edge, Foundation or Render changes in this release. Existing Edgev13 is compatible. Owner controls Render deployment after Actions. No post-push Actions polling.
