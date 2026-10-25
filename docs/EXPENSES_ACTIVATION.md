# Expense accounting activation

Source installation alone does not enable the cloud RPCs. The installer makes no
remote changes and does not stop any running server. Existing sales/purchases,
receipts/payments and their data remain the previous runtime until activation.

After the owner Termux report passes:

1. Complete the owner-approved final certification/release workflow. Commit/push
   remains owner-controlled; no default PR, staging or automatic deploy.
2. Apply docs/expenses-v1.review.sql as ONE managed migration to Khata project
   gqyaxsczlmvppxuoqbox, with recorded approval and before/after snapshots of
   original companies, parties and vouchers. Do not run it on Admin/Foundation.
3. Deploy orbis-khata-data from these exact sources, including all three files:
   supabase/functions/orbis-khata-data/index.ts,
   src/accounting/server-gateway.ts, src/accounting/expense-model.ts.
   Preserve current DB secrets, Central verifier, exact origins and owner mapping.
4. Publish the matching frontend through the separately approved manual deployment.
   A source-only frontend update against the old gateway cannot save expenses.
5. Verify with an owner-approved disposable trial company: cash and bank expenses,
   unpaid expense plus partial/full payment, no duplicate expense on settlement,
   reload/retry idempotency, correction history, two-company/account isolation,
   and agreement of cash/bank, unpaid expenses and zero journal sum.
   Do not create or delete trial financial records without owner authorization.

If an activation component is unavailable, retain the installed source and report
that activation is pending. Never bypass Central verification/RLS or delete old
financial records to make this feature appear to work.

Custom expense categories are entered by name and reused through suggestions.
Dates follow Asia/Kolkata. Reports paginate 50 entries and explicitly reject more
than 500 simultaneously open bills rather than silently truncating balances.
Expenses paid in cash/bank use one entry; a partially paid bill uses an unpaid
expense and a separate linked payment. Reversal of a bill requires its existing
payments to be reversed first, in date order. The original entries remain auditable.
This slice does not implement stock valuation, net profit, opening-balance import,
GST, document attachments, export, recurring expense automation or general-ledger
master management. Those require their own accounting behavior and verification.
