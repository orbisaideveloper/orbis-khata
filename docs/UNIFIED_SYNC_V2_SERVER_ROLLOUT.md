# Unified Sync v2 server rollout review

Status: disposable candidates only. Keep separate scopes for Khata companies,
Lottery organizations and the company catalog. Reference the [writer
register](UNIFIED_SYNC_V2_WRITERS.md) and [frozen ADRs](https://docs.google.com/document/d/1rp84i2Cw3AJKvbBAuYL6G8pebelqrdckR2SBwElC33g/edit).

## Migration and activation dependency map

| Order | Reviewable candidate | Gates |
| --- | --- | --- |
| 1 | Private scope/receipt/event and scope-kind allowlist | Review uniqueness across scope + epoch, cursor floors, ordering and privileges. Keep schema inaccessible to clients. Production receipt/tombstone retention requires separate policy. A new module supplies an approved adapter and scope-specific authorization, with no arbitrary registrations. |
| 2 | Company identity reservation, trusted historical backfill and legacy recovery classification | Inventory actual historical marker provenance; fail on active ID/tombstone overlap instead of auto-reconciling. Install reservation triggers and trusted backfill in one locked operation. Approve separate server-generated fresh-ID creation before changing the legacy client-ID endpoint. |
| 3 | Stock-first compatibility, active-company and direct-write fences, purge scheduler candidate | Coordinate legacy SQL and Edge party-lock order before enabling any captures. Rerun lock and arbitration tests with production-like grants and all deployed RPC versions. Retention keeps existing purge dates. Verify actual cron runtime separately. |
| 4 | One capture producer per entity, with isolated alternatives excluded | Install only in private test cohort after rollback, recovery and duplicate checks. The earlier production-output and routed aggregate projections are separate acceptance experiments. Installing both production projections would duplicate effects. Keep captured legacy application receipts distinct from v2 canonical command receipts. |
| 5 | Authorized feed and versioned company, catalog and Lottery bootstrap | Bind Central identity and proven device possession in trusted Edge, enforce entitlements, verify high-water and scope epoch, and support oversized shapes with an explicit recovery path. Client stage/cursor promotion requires end-to-end signoff. Fixture device grants are synthetic. |
| 6 | Activate by separately approved device/version/scope cohort | Require Android/Web rollback compatibility, operation status and encrypted restore evidence. Monitor lock waits, stale snapshot churn, projection bytes, retirement tasks and capture lag. Old apps keep legacy accounting access while activation is disabled. |

The SQL under [Sync v2 fixtures](../supabase/tests/sync-v2/) identifies
reviewable additive schema and trigger changes. Production migration
numbering, DDL execution, scheduling, Edge routes and activation require
separate review and approval.

## Historical purge and recovery

The private classifier returns `reconcile-existing` only for an authoritatively
owned, live, nonpurged company with a matching epoch. Its output allows
reconciliation; it does not authorize a financial write or replay. Foreign,
unknown, missing-epoch, stale, retired or purged IDs return `local-review`.
Preserve the encrypted/source backup and allow local review and export.
When recovery of historic records is authorized, prove provenance and import
into a server-issued new identity with an audited old-to-new mapping for
all child references. Do not mint historical tombstones from client payloads or
rewrite originals. Existing legacy create/import shares a client-ID-shaped
surface and cannot distinguish a truly new company from an undocumented
historical ID. Reconciliation and capability/version policy are release
blockers. A former company UUID must never be reattached on inference alone.

## Snapshot, scale and disposal

Company pages use a bounded materialized image with a high-water,
replacement, explicit disposal and a batch sweep requiring an approved cutoff.
Retention floor invalidates an image whose feed bridge has already expired.
Lottery and company catalog pages use revision-checked, keyset sources and
avoid keeping a second copy. Advancing a relevant revision invalidates any
unfinished image. High write churn, oversized individual rows and transaction
groups have explicit failures. Under current fixture limits they cannot complete
in the background; the release design needs bounded fragments or a resumable
consistent export, plus client staging, backoff and no partial live projection.
Never mark a projection complete from a successful first page.

Budget row and response bytes separately. Measure PostgreSQL TOAST reads,
JSON serialization, per-owner lock hold, event growth (especially profile
state and Lottery audit/journal), historical backfill load and worst-case
scope churn. Keyset indexes and count/byte limits are locally exercised.
Production query plans, real data distributions and device behavior have not
been measured. Owner policy must determine audit/receipt retention,
idempotency horizons, snapshot quotas and paid entitlement behavior. Purging
accounting payload must not erase the minimal nonreuse fence.

## Rollback and evidence gates

Before deployment review, preserve an encrypted pre-change restore point,
record schema/Edge versions and test on production-shaped synthetic data.
On fault, disable Sync ingress and delivery first. Preserve existing
authoritative financial writes, committed receipts, outbox, tombstones and
global reservations. Roll back read/projection code separately from the
financial data path. Rebuild incomplete projections from authoritative data
before reopening. Never delete receipts to clear an error or restore a
snapshot over a newer ledger without proven reconciliation. Deployment,
customer data changes, backups restored to production, release and push each
keep their existing approval boundary.

## Recovery, authority and populated rehearsal

The disposable historical recovery flow now requires a private review ticket
for the canonical actor, original company, archive hash and a trusted hash of
the extracted entity manifest. Its prepared plan generates a new company ID
and new entity IDs, preserves audited parent links and is stable across
duplicate calls. Unknown or revoked ticket, edited manifest and cyclic lineage
fail closed. Preparation creates no company, voucher, inventory or posting.
It is a proposal only. There is no authority to approve a migration, consume a
plan or post restored records. The review/extraction service and approval
record remain separate prerequisites. A proposed ID is not an allocation in
the authoritative company registry. Approved execution must atomically
reserve it there, recheck proof and prevent any second consumption.

For large data, the candidate stages an immutable transfer with server
authorized scope/epoch under repeatable read, a fixed high-water and versioned
manifest. Raw byte fragments are 24 KiB, batched to a 64 KiB encoded response.
Each row has SHA-256, expected offset and length. The assembly contract
checks all items and a group's terminal sequence before returning staged data.
No projection or cursor is written by assembly. Interruption leaves the same
fragments available; replacement, revocation, expiry of the feed bridge or
cleanup refuse the old transfer. Transfer storage is capped at 16,000 items,
2 MiB per item and 16 MiB of raw data per transfer, with one transfer per
registered device and an explicit maintenance cutoff. Above-budget books
fail closed. Durable staging, cancellation UX, device activation, global
quota and production encrypted storage/TTL approval remain required.

The trusted test gateway uses the existing Central session verifier with a
synthetic transport reply and requires a separate device credential. It
passes only a digest into a private PostgreSQL authority. Server records
select primary Android, extra Android or Web capability and constrain
registered device, tenant, scope, epoch and write permission. An accepted
command holds the device/entitlement share locks through commit; revocation
awaits the in-flight transaction and denies subsequent reads and retries.
The voucher path rechecks the authority after stock lock wait. Provisioning,
secure credential storage/rotation and actual live Central session/device
attestation have not been exercised.

The populated native PostgreSQL rehearsal installs additive candidate files in
dependency order across three synthetic tenants with 600 pre-existing vouchers.
It compares pre/post legacy data fingerprints, tests DDL rollback and direct
role denial, admits concurrent old-client commands, then stages a 510-event
group and 727-row image. A first single-fragment implementation took 510 and
727 requests respectively. Batching reduced these to 16 and 23, with encoded
responses below 64 KiB. In one local acceptance run the migration took 86 ms,
sixteen concurrent old writes took 133 ms and the 510-event transaction took
443 ms. Table totals were 540,672 bytes for vouchers, 647,168 for feed and
974,848 for transfer items (8,192 bytes TOAST) at that run's checkpoint.
The large Lottery sample was repetitive UTF-8 fixture text; measured TOAST
must not be extrapolated to customer data. Time is local PostgreSQL + assembly
cost, excluding Edge and WAN latency. The budget test verifies shape and
recovery behavior; it does not certify throughput.

This rehearsal revokes Sync access, keeps legacy accounting usable, then
removes transfer artifacts while retaining feed and financial rows. It does
not replace live migration, Edge deployment, physical device, or production
rollback testing. The browser runtime still blocks Chromium socket() before
application tests start.
