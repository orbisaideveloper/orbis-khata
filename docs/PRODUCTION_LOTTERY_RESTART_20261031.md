# Historical restart checkpoint — 31 October 2026

This records the earlier incomplete checkpoint. The owner later confirmed a continuous pool with no batches. Current implementation and final verification: [PRODUCTION_LOTTERY_20261031.md](PRODUCTION_LOTTERY_20261031.md).

Baseline: main `6743adce65a358a4b4c2247df198d9fa49e0328d`. Work in `orbis-khata-restart`; the earlier abandoned checkout is not the implementation baseline.

## Confirmed production behavior

- Production is a company setting. Turning it off hides entry actions, preserving stock, bills, payments, production history and ledgers.
- A purchase invoice has an optional small “Send to production” checkbox. Selecting it sends all invoice item quantities into production in the same atomic save; the original supplier purchase/payable/payment remains exactly once.
- Existing old stock must be consumed before new stock. Never erase it or silently reset its value.
- Milk produced by the farm is received from production into the farm's own stock. This is an internal movement, not another supplier purchase or another payable.
- Production input costs accumulate. Additional output without additional input reduces cumulative average cost. Example: 500 bags at ₹50 = ₹25,000; 500 litres gives ₹50/litre; another 200 litres gives ₹25,000 / 700 = ₹35.714285…/litre. Use exact minor-unit/rational arithmetic, rounding only posted allocations/display.
- Profit and cumulative production valuation must use the selected date. Future inputs/outputs must not alter an earlier as-of report. Preserve current ledger and settlement behavior.
- The owner has not yet specified how feed exhaustion/batch completion is recorded. Do not silently infer that the first milk receipt consumes a fixed fraction of all feed, or invent daily feed consumption.
- Existing opening stock without a recorded cost must not be treated as free. The read-only current database check found 16 purchases, 7 sales, 16 item documents and 5 warehouse documents; no opening document. This aggregate check does not identify which stock belongs in production or constitute a valuation audit.

Production UI, stock movements, purchase checkbox, costing and profit integration are NOT implemented in this checkpoint. No production migration is prepared or activated.

## Lottery checkpoint

Implemented locally:

- Domain adapter records changed model/id values and deletions; repeated changes to one row coalesce. Nested/outer transaction failures restore both state and pending changes. IDs cannot change.
- Gateway commits the change list, not the entire aggregate. Read calls without generated changes avoid commit; reads that materialize recurring bills retain those related changes atomically.
- New v2 SQL store persists owner-scoped rows, preserves array order, backfills old records, keeps the old JSON as a migration backup, and updates version metadata without rewriting that backup.
- No 1,500,000-byte owner-state guard in v2. The old v1 function is disabled after migration so an old gateway cannot overwrite migrated history.
- Owner/gateway checks, write-disable, owner transaction lock, version conflicts and request/result replay remain. All rows from one domain action are committed in the same database transaction.

Verification:

- 15 adapter/domain-service tests pass. Service tests reconstruct persisted state from changes on every command and compare it with the original snapshot, covering seller drafts/posting, payments/settlements, stockists, customers, recurring expenses and settings.
- Isolated PGlite SQL test passes: legacy state above 1.5 MB, unrelated-row rewrite tripwire, linked changes, immutable backup, duplicate replay, request/version conflict, atomic rollback after a later invalid row, disabled writes, owner isolation and gateway denial.
- Typecheck passes. Focused lint completed without findings.

Limits and activation:

- This is local source and isolated SQL verification, not a production migration or deployed Edge verification. Coordinate migration and v2 gateway activation; the old gateway intentionally fails closed after migration.
- The domain adapter still hydrates the owner's state to run the unchanged service. Paged reads and existing response/transport limits are not removed here. This checkpoint does not prove unlimited-scale operation.
- No commit, push, live feature migration, Edge deployment or Render deployment occurred. No owner financial records were modified.

Next: settle the explicit stock-exhaustion boundary, implement production inventory/cost/report integration with atomic purchase routing, then run targeted tests and mobile flow checks. Keep Lottery changes available for review; do not activate a partly completed feature set.
