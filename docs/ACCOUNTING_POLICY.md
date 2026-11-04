# Accounting policy — Moving Average v2

Owner-approved simplified cumulative accounting, 4 November 2026. This document describes the prepared implementation; deployment is a separate action. It supersedes the earlier FIFO raw-material valuation decision for this version. Existing transaction records are never rewritten by report calculation. Derived historical numbers can differ from FIFO; a date cutoff is not a permanent period lock.

## Exact stock valuation

One company-wide cost pool per item (not a mix of different items). A godown is a physical location; location transfers are not purchases or expenses. The ordinary/raw-material moving weighted average uses remaining quantity and remaining integer-minor-unit value, plus actual new receipt quantity/value. Transfer cost is allocated proportionally, with residual value retained exactly. Do not multiply rounded displayed rates to rebuild totals. Purchase discounts/roundoff follow the document's actual total.

Example: 10kg × ₹30 + 10kg × ₹31 + 10kg × ₹32 = 30kg / ₹930. Input28kg carries₹868, godown2kg retains₹62. Add10kg / ₹400: remaining12kg / ₹462, displayed average₹38.50/kg.

## Cumulative production, intentionally simple

No compulsory recipe, ratio, daily/monthly cycle or separate consumption form. A recorded production input enters the cumulative production cost pool. Through the selected end date, total recorded input cost is distributed over total recorded output quantity. Purchased and produced receipts of the same finished item join its moving-average pool; physical old-stock-first handling does not require FIFO financial valuation. This average is not evidence of measured daily consumption. Subsequent output/input can change the cumulative rate and the derived sales costs through a later cutoff.

Zero recorded output: input cost is WIP. Once output exists, the simple policy allocates the recorded input pool to output. It does NOT separately infer unused raw material already sent to production. Material left in the godown remains an asset. An exact production recipe/consumption subsystem is outside this slice.

₹600 input /105L output,100L sold: sold cost₹571.43; remaining5L asset₹28.57. Sales₹1000 gives₹428.57 before other paid expenses. Never deduct the same raw purchases again. Record actual output, not fictitious quantities solely to remove negative stock.

## Profit and payments

Selected-period profit = sales minus allocated cost of sold goods minus actual expense cash/bank outflow, respecting reversals. Credit sales are sales; collections are not another sale. Credit purchases are not cash payments. Schedules (salary, fixed commitments, actual variable bills) track due/advance, not an automatic expense payment. A₹20000 salary schedule and₹2000 actual payment deduct₹2000 only from the paid-expense profit. This is an explicitly paid-expense operational report, not a statutory accrual-profit statement. Opening payable settlements retain the established accounting journal treatment.

Cash/bank movement, outstanding and stock value are distinct reports. Sales minus all purchases minus paid expenses is a secondary comparison, not the inventory-adjusted profit.

## Missing data and history

Sales may temporarily make finished stock negative. Later genuine receipt/output through the selected cutoff settles the shortfall without another sale. Future-dated receipts cannot enter an earlier cutoff. Unknown source/opening costs stay unknown. Show known-cost profit as Provisional, explain excluded unknown costs, and keep item quantity/unit warnings visible regardless of Tutorial setting.

Backdated correction/reversal recomputes affected history. No rate is permanently fixed merely because it was once displayed. Disposable in-memory checkpoints compare exact ordered source prefixes; changed/deleted entries invalidate dependent checkpoints. Restart/eviction falls back to full authoritative replay. Cache is bounded to2 contexts,3 checkpoints per context; histories over10000 documents neither retain nor repeatedly clone growing checkpoint state. Deferred negative-sale settlement uses a head-index queue instead of repeated full-array shifts. This accelerates valuation replay only: current APIs still page full report history and compare source data. An additive prepared migration adds a normalized party-name lookup index and company report revisions. Prepared Edge reads lock the revision row for the page transaction; clients reject mixed-revision page/family results. Both are pending tested deployment, not live yet. Persistent server-side financial snapshots and realistic multi-connection load testing remain scale work. Do not claim million-user capacity from these tests.

## Identity, save and tutorials

Party IDs are authoritative. Same normalized name/phone produces a warning; an identical name+phone is rejected on the prepared Edge save path under the existing company master lock. Do not automatically merge real people with a shared name/phone. Existing financial links block unsafe deletion. The owner separately authorized deleting one unused duplicate; its used counterpart was retained and other company-table fingerprints were checked.

Tutorial OFF hides optional teaching paragraphs. Labels, data, validation/retry errors, incomplete-cost warnings and data-loss warnings remain. The independently accessible policy page uses BN/EN/HI dictionaries and English fallback for a future untranslated language; no automatic machine translation is claimed.

## Evidence mapping

- src/production/costing.test.ts: weighted transfer example, exact totals, date cutoff, historical edits/reversal and checkpoint-vs-fresh replay.
- src/inventory/replay-checkpoint.test.ts: prefix invalidation, tenant namespace, removal, clear and deferred withdrawal clone integrity.
- src/accounting/profit-reconciliation.test.ts, production/store.test.ts: later output, assets, negative stock, no double cost, Production OFF history.
- src/accounting/ExpensePayment.test.tsx: actual salary payment, advance confirmation, network retry identity.
- src/demo/party-match.test.ts, Masters.test.tsx, PartyActivity.test.tsx: normalized matches, existing master safety and on-demand party-scoped bill history.
- src/accounting/policy/AccountingPolicy.test.tsx, ProfitSummary.test.tsx: dictionaries, accessible policy, optional teaching and essential warnings.

A policy document and green CI do not certify live deployment, real Android behavior, backup restoration or release readiness. Check current PROJECT_STATUS for actual results and blockers.

## 2026-11-04 follow-up validation and cutoff correction

The owner explicitly authorizes source completion, required migrations/Edge changes and commit/push after all requested checks pass. Original entries must remain unchanged. Synthetic tests cover100000 deferred sale withdrawals and12001 inventory documents with a backdated correction; these do not certify100000 simultaneous users. A disposable20000-party lookup proves the new expression index is used. The additive migration and rollback preserve original accounting/master fingerprints, enforce company/role checks and preserve same-ID retry/transaction rollback behavior. PGlite cannot certify multi-connection contention.

A proven historical cutoff defect in the legacy trade report marked a sale reversed even when its reversal was dated after the report cutoff. The prepared migration guards and changes only that existing function predicate to include reversal.effective_date<=p_to. No voucher is changed. Before/after fixtures show the earlier cutoff retains the sale and the later cutoff sees the reversal.

The browser environment remains blocked: official Chromium download fails; the separate browser cannot reach the canonical local preview (ERR_CONNECTION_REFUSED). These are failed preview attempts, not certification. Release transitions remain held until the requested checks are completed.
