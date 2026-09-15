# Architecture Baseline

## Status

This document fixes boundaries and invariants. It does not approve a framework, cloud provider, database engine or sync library. Those choices require an Architecture Decision Record after MVP review.

## 1. System boundary

Orbis Khata Boi is independently deployable and independently recoverable. It owns its business-domain data and operational lifecycle.

External contracts:

- **Orbis ID/Auth:** permanent identity and authentication relationship.
- **Orbis Admin:** product registry, health, version, subscription and approved operational controls.
- **Notification/share providers:** only through explicit consent and server-side adapters.
- **AI/speech providers:** replaceable adapters with data-minimization rules.

No external Orbis product reads Khata business tables directly.

## 2. Logical components

### Client application

Mobile-first PWA with localized UI, offline shell, transaction forms, voice capture, proposal confirmation, ledgers, reports and sync status.

### Local data layer

Stores operational data needed offline, an outbox of pending operations, sync cursors, conflict state and verified backup metadata. IndexedDB is a candidate, not yet a final choice.

### Application API

Validates authentication, tenant membership, commands, idempotency, versions and authorization. It is the only normal path to cloud business writes.

### Accounting domain

Defines transactions, ledger entries, balances, dues, reversals, financial periods and report calculations. Domain logic must be testable independently of UI and storage.

### Sync service

Accepts idempotent operations, detects conflicts, exposes ordered changes and never assumes last-write-wins is safe for financial data.

### AI command layer

Turns speech/text into a structured proposed command. It cannot bypass normal validation, authorization or user confirmation.

### Audit and observability

Records security-relevant and financial mutations with actor, business, timestamp, operation/reference IDs and outcome. Telemetry must avoid raw secrets and unnecessary sensitive content.

## 3. Tenant model

The business is the primary accounting tenant. A user accesses it through a membership and capability/role. Every tenant-owned query and mutation includes authorized business scope on the server. Client-side filtering is not an authorization boundary.

Planned membership capabilities may include owner, manager, accountant and limited employee, but MVP roles require separate approval.

## 4. Identity model

The product stores an immutable reference to the shared Orbis identity rather than treating phone/email as the permanent key. Mutable credentials can change without changing ownership.

Where the shared identity contract applies:

- internal IDs use UUIDv7;
- human-facing IDs may use `ORB-U-*` for people and `ORB-O-*` for organizations;
- exact normalized email/phone matching is required;
- ambiguous or person/organization conflicts require manual review;
- provisional name-only identities must not silently become verified identities.

## 5. Accounting model invariants

- Money uses integer minor units or an approved exact decimal type.
- A transaction has a stable ID, business ID, effective date, creation time, actor and lifecycle state.
- Posted financial effects are corrected through reversal/adjustment rather than invisible mutation.
- Derived balances are reproducible from authoritative entries and a defined opening state.
- Reports state the business, timezone, currency and period boundaries.
- Quantity/rate/unit rounding rules are explicit and tested.

Double-entry internals may be adopted while retaining simple user labels; the exact MVP posting model is an open decision.

## 6. Offline command and sync model

Recommended invariant flow:

1. Client creates a unique operation ID.
2. Local validation produces a proposed command.
3. User confirms.
4. Confirmed command and local projection are committed atomically on device.
5. Command enters an ordered outbox.
6. Cloud accepts it idempotently or returns a typed conflict/rejection.
7. Client reconciles server acknowledgement and ordered remote changes.
8. Unresolved sensitive conflicts remain visible and require an approved resolution.

Required properties:

- retry-safe idempotency;
- per-business ordering or an equivalent consistency rule;
- tombstone/reversal semantics where deletion is unsafe;
- schema and protocol versioning;
- clock-skew tolerance;
- explicit offline, syncing, synced, conflict and failed states;
- recovery after crash during any step.

The exact conflict-resolution matrix must be approved before sync implementation.

## 7. Voice and AI command contract

A proposed command should carry:

- intent and transaction direction;
- party candidate/reference;
- amount and currency;
- effective date/time;
- item, quantity, unit and rate when present;
- category and description;
- ambiguous/missing fields;
- parser/model version and confidence metadata allowed by policy;
- source language.

The raw utterance is not authoritative. Only the confirmed structured command enters accounting. Retention of audio/transcript requires a documented consent and deletion policy.

## 8. Orbis Admin integration

Integration begins read-only and contract-driven. Admin may receive product health, release version, anonymized/aggregated usage, subscription state, sync health and error signals. It must fail closed to `unknown` when a source is unavailable.

Privileged future controls require:

- capability-scoped server authorization;
- an emergency write-disable;
- append-only action/audit records;
- a separate trace ID and actor identity;
- explicit result and retry semantics.

GitHub HEAD, staged release and production release are separate states and must never be conflated.

## 9. Security baseline

- Strong tenant isolation in API and database policies.
- Secrets never shipped in client bundles.
- Encrypted transport and secure session storage.
- Rate limiting and abuse controls for auth, sync, AI and exports.
- Least-privilege service credentials.
- Audited privileged operations.
- Backups encrypted and restore-tested.
- Sensitive logs redacted with defined retention.
- Dependency and supply-chain checks in CI after the stack exists.
- Threat model before enabling employee access, automated messages or admin writes.

## 10. API and contract rules

- Version external and cross-product contracts.
- Use stable machine error codes plus localized messages.
- Mutating endpoints accept idempotency keys.
- Pagination and incremental sync cursors are opaque.
- Breaking schema/protocol changes require migration and backward-compatibility plans.
- Provider-specific logic stays behind adapters.

## 11. Backup and disaster recovery

Backup states must distinguish requested, created, uploaded, verified and restore-tested. Recovery requirements include data export, device loss, account recovery, schema upgrade and partial-sync failure. Recovery-point and recovery-time targets remain open decisions.

## 12. Deployment topology

Expected environments:

- local/Termux for daily development and targeted checks;
- Ubuntu/Linux or GitHub Actions for platform-sensitive verification;
- one permanent staging environment for risky/cloud-dependent validation;
- production from protected main after approved merge.

Per-PR preview deployments are optional. Production migration validation and post-deploy smoke testing remain mandatory for relevant releases.

## 13. Open architecture decisions

- PWA framework and monorepo/package layout.
- Backend/API runtime.
- database and migration tooling;
- local store abstraction;
- sync protocol/conflict matrix;
- accounting posting model;
- speech-to-text and AI provider strategy;
- Orbis ID integration version;
- hosting, monitoring and backup providers;
- subscription/payment provider;
- encryption and retention details.

These must be decided deliberately in `docs/DECISIONS.md`, not assumed during implementation.
