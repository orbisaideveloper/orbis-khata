# Lottery navigation, opening balances and receipts — verification

Recorded: 2026-10-30T11:32:13+05:30 (India). Parent main: `7dd2c10d55f1995db4855e452dd25511d706c317`.

## Result

- A compact module picker is available in Khata and Lottery. It switches directly between them, preserves existing saved company/module locations and keeps Farming marked unavailable. The oversized Lottery cockpit introduction is removed.
- Seller, stockist and customer profiles accept opening dues or advances with a business date. Missing fields in old snapshots mean zero. Profile and opening changes are atomic. Balanced opening-equity entries, reversal entries and audit metadata preserve the old history; these balances never become sales, purchases, profit or cash.
- Phonebook selection runs only from a user tap and only on supported browsers. Cancellation is harmless; denied permission keeps manual phone entry available.
- Daily seller grid and selected table account show today's bill, old balance, last receipt, today's total receipts, Cash/PWD/Bank and remaining carry-forward. PWD remains the original non-cash prize token field (`pwtPaise`), separate from TDS.
- The existing payment endpoint is reused. Receipt recording waits for confirmed durable seller-row persistence. Failed row save prevents receipt creation and keeps entered money; retry succeeds without duplicating the bill. Re-entrant/double-tap attempts produce one save. Separate universal receipts and daily receipts reconcile to the same history. Legacy UPI/cheque records are preserved; new receipt entry offers three methods.

## Checks

| Check | Result |
| --- | --- |
| Full Vitest coverage | 104 files, 674 tests PASS |
| Statements / branches / functions / lines | 91.28% / 87.96% / 90.86% / 91.92%; every existing threshold passes |
| New module picker, receipt panel, opening writer | 100% lines/functions/branches |
| New profile fields | 100% lines/functions; 96.15% branches |
| TypeScript / production build / PWA worker | PASS |
| Lint | No errors; inherited vendor hook advisory warnings remain |
| KNIP / JSCPD | PASS / zero clones |
| npm dependency tree / production audit | PASS / zero vulnerabilities |
| Mobile + desktop Lottery browser flow | 2/2 PASS on final source |
| Related bill PDF + business report browser flows | 4/4 PASS |
| Recommended local SonarJS rules | No findings on changed/new source scope |
| Previous remote Actions including strict Sonar | 40999670375 SUCCESS |
| New remote Sonar / Actions | Pending new push/run; not claimed green |

Browser flow creates seller/stockist openings and daily entries, checks exact commission/TDS, deliberately fails a draft save and proves no payment is recorded, safely retries with Cash/PWD/Bank, verifies separate payment and restored data, checks a single effective bill, and switches Lottery → Khata → Lottery. Unit tests also cover advances, opening edits/zeroing, wrong organization, invalid dates/amounts, no cash/profit inflation and India business dates.

## External state and limits

Khata `orbis-khata-data` Edge v13 ACTIVE; retrieved 22-file bundle matches the reviewed source. Existing central authentication is preserved; unauthenticated requests remain denied. `docs/lottery-storage.rollback-test.sql` passes load/save/replay, changed-retry rejection, stale version and owner isolation with all fixtures rolled back. No schema migration is needed for additive fields in the existing private aggregate. No user financial rows or Foundation data were edited.

The existing 1,500,000-byte owner aggregate bound is unchanged; high-volume relational/paged storage remains future work. Phonebook support depends on the browser. Render frontend deployment remains owner-controlled after the new Actions result. This session runs the local gates directly in Linux; it does not claim a Termux/device verification. No post-push Actions polling is planned.
