# Phase 2A — Complete source writer/scope/identity inventory (NOT runtime sync activation)

**Owner:** ORBIS Khata · **Evidence date:** 2026-11-25 IST · **Source baseline:** GitHub `main` `0125db31f8b95f8787bf6aecfe8e8da74f454a86` · **Document revision:** 2A.1 · **Scope:** Phase 2A only

**Frozen authorities:** [Unified Sync v2 Phase 2A–2G Contract](https://docs.google.com/document/d/1rp84i2Cw3AJKvbBAuYL6G8pebelqrdckR2SBwElC33g/edit), `ADR-SYNC-002`, `ADR-ENTITLEMENT-001`, current `AGENTS.md` and ORBIS WORK Setup 01. **This records all currently implemented writer ingress and its mandatory lineage/capture obligations; it does not certify 2B, 2C, 2D, 2E, 2F, live database migrations or physical devices.**

## Phase 2A acceptance boundary

The Phase 2A deliverable is **source-backed accounting writer and compatibility inventory**, not implementation of all server/feed adapters. The typed, **non-authoritative** inventory `src/sync-v2/phase2a-coverage.ts` and its executable drift-detection test `tests/sync-v2/phase2a-coverage.test.ts` cover the current source. A new gateway operation, workspace action, Lottery action, expense profile action, inventory kind or external relay/share action must be added to the register or targeted CI fails. No client payload may expand these routes or turn the register into a production entitlement list.

| Source surface | Enumerated | Evidence and functional boundary |
| --- | ---: | --- |
| HTTP accounting gateway `KhataOperation` | 26 | `src/accounting/server-gateway.ts`, `supabase/functions/orbis-khata-data/index.ts`; reads, mutable operations, recovery, retailer sharing and v2 entrypoint |
| Workspace sub-actions | 14 | `src/accounting/workspace-contract.ts`; bill, invoice, payment, correction, fiscal settings, retire/restore and reads |
| Lottery organization methods | 36 | `src/lottery/protocol.ts`; **29 writes** and 7 reads; dynamic vendor service dispatch is allowlisted, not unlimited |
| Expense profile sub-actions | 9 | `src/expense-profiles/model.ts`; category, profile, payment, bill, void, deletion and list |
| Inventory document kinds | 8 | `src/inventory/model.ts`; sale, purchase, opening, transfer, input/output, item and warehouse |
| Customer View relay | 8 | `src/customer-view/relay/model.ts`; independent recipient-scoped transport |
| Lottery party-sharing | 7 | `src/customer-view/contract.ts`; invitation, acceptance, decline, revoke, statement and reads |
| **Total source routes and sub-routes** | **108** | Targeted Vitest checks compare each declared set to the source, not a handwritten total |
| LIVE Khata-related SQL functions | 26 | Read-only `pg_proc` audit, PostgreSQL 17, connected `gqyaxsczlmvppxuoqbox` project |
| LIVE active non-internal DB triggers | 26 | Read-only `pg_trigger` audit; derived stock and production reversal triggers identified as **writers** |
| LIVE authenticated RPC EXECUTE grants | 19 | Read-only `pg_proc` + `aclexplode`; **direct RPC exposure requires 2B authorization/capture audit** |
| LIVE direct public/Khata table DML grants to `anon`/`authenticated` | 0 observed | Read-only `pg_class` ACL query; does NOT imply 19 EXECUTE-able RPCs are safe or incapable of writes |
| LIVE scheduled job ingress | 4 | Read-only `cron.job` query; retired-company purge, Lottery cache retention/collector, statement relay cleanup |
| Direct SQL gateway `INSERT` table ingress | 3 | `orbis_khata.drive_account_recovery`, `public.khata_companies`, `public.khata_parties` in checked-in Edge index |

**Separate evidence:** [read-only LIVE database catalog](https://docs.google.com/document/d/1bQyj_yxJPoXuPEbfXIkp3MS5DjWgKyW_idDJYmuV6V0/edit). No financial/customer rows, credentials or production writes were accessed. Present deployed migrations contain **30 applied entries through 2026-11-22**. The `sync_v2` schema and its pairing table were **absent at read-only inspection**; checked-in `20261124173000_*`, `20261125100000_*`, `20261125103000_*` Sync v2 migrations remain unexecuted in production. This is a **hard stop for LIVE feature activation**, not a reason to remove historical data.

## The ten writer families (immutable identity, child results, capture obligation)

| Family / scope | Entrypoints and original IDs | Related identities and non-negotiable 2B/2E obligation |
| --- | --- | --- |
| **Account catalog** / account-catalog | `create` / `companies`, `khata_prepare_company_v2`, direct `INSERT khata_companies`: company UUID, owner identity, epoch | Server-owned globally nonreusable company identity; owner catalog update and active scope event in one transaction. Same-owner legacy retry preserves IDs; historic purged UUID unknown = **manual provenance**, never guess. |
| **Ledger/receipts** / company | `post`, `khata_post_v1`, workspace `payment`, voucher/reversal: voucher UUID + operation ID | Payment/settlement ID, party reference, reversal's original UUID and dependent payment link; do not collapse paid sale into cash or unpaid purchase into expense. Receipt, voucher and feed must share commit, no double ACK posting. |
| **Invoice / bill / corrections** / company | workspace `bill`, `invoice-save`, `correct`, `detail`: bill UUID + command operation | Server-generated settlement/payment UUID, inventory document UUID, production route/input UUID and fiscal number reservation. Reversal/replacement group must reference exact originals. Preserve stock and outstanding; no amount/date/name heuristic matching. |
| **Expenses and schedules** / company | `expense-post`, `expense-bill`, `expense-profiles`, workspace `expense`, v1/v2 expense RPCs | Expense ID; payment and void parent IDs; expense-bill line IDs; profile ID + operation/version; child rows and schedule revision captured atomically. Advance and opening amounts remain distinct. |
| **Masters and opening** / company | `party-save`/`item-save`, `party-delete`/`item-delete`, `create` party, `khata_master_*`: party/item UUID | Category/phone and item unit, master audit/linked opening-balance identities; tombstone not silent deletion; isolation from other companies even with equal names. |
| **Stock, Inventory, Production** / company | `inventory-post`, workspace `production`, purchase route, voucher stock/production reversal triggers: document UUID | Ordered movement `(document, ordinal)` identity; transfer endpoints; production input/output UUID, unit cost/rate lineage, reversal UUID; stock-first lock hierarchy, no duplicate movement from v1+v2 triggers. |
| **Settings, fiscal & numbering** / company | workspace `settings-save`, `number`, `number-preview`, `khata_report_revision_v1` | Versioned company settings/accounts, fiscal counter and reserved invoice numbers; updates and report revision in same source-authorized transaction, no monetary last-write-wins. |
| **Lottery financial organization** / lottery-organization | 29 allowlisted writes via `runLottery`, `khata_lottery_store_v2`, `lottery-sync` payment: organization UUID + immutable operation | Seller draft/post ID, seller/party and period ID, Daily Entry, PWD noncash, stockist, TDS/commission, expense and payment/settlement UUID, audit, correction/void/tombstone. Preserve *native* operation receipt and actual generated domain IDs. Do not reuse company-scope authority. |
| **Retire/restore/purge** / account-catalog + company | workspace retire/restore; scheduled `orbis_khata.purge_retired_companies()` and private purge fence | Never reuse historic company UUID. Retire/purge epoch fence and minimal durable tombstone/receipt must be atomic with deleted descendant rows; scheduled purge obeys stock/company lock order, old device cannot resurrect. |
| **External sharing, Customer View, Drive recovery** / separate authorization | `customer-relay`, `party-sharing`, company/lottery export, `drive-recovery`; 2 statement-permission bridge triggers and cleanup cron | Recipient-scoped immutable invitation/delivery revision and ACK, encrypted recovery link/version. **Never** treat recipient read-only sharing as owner-account Web write or include relay data in financial feed. No owner premium entitlement implied. |

The checked-in `src/sync-v2/command.ts` owns typed `protocolVersion:2`, actor, registered device, `(kind,id,epoch)` scope, immutable operation ID, canonical digest, stable `entityId`, `children`, `dependsOn`, `baseRevision`, client sequence and created-at. `readyCommands` holds **only dependent** unresolved commands, not the whole company. `src/sync-v2/module-registry.ts` routes only exact statically registered `(scopeKind,commandType,schemaVersion)` triples; client-supplied unknown scope and command must fail closed. **A catalog row is not an authorized adapter or a live receipt.**

## Live legacy SQL / trigger / cron bypass gates (explicitly assigned to later phases)

- **Direct RPC writes:** `authenticated` still has EXECUTE on 19 listed functions; the register records them all, including `khata_post_v1`, `khata_workspace_v3`, master save/delete, inventory post, expense v1/v2/profiles and Lottery store. Their transaction/grant/receipt/feed coverage is a **Phase 2B** release gate, not automatically covered by the new v2 HTTP route. RLS, `SECURITY DEFINER` and post-lock authorization need read-only and disposable DB verification.
- **Derived triggers:** `public.khata_vouchers.inventory_voucher_reversal` and `public.khata_vouchers.khata_production_purchase_reverse` write additional stock/production records. Their child IDs must be captured in the *same* operation transaction. Revision watcher triggers do **not** themselves mean a financial feed has been emitted.
- **Jobs:** `khata-retired-company-purge` runs at `17 3 * * *` and is active; `orbis-lottery-collector`, `lottery-live-retention` and `orbis-statement-relay-cleanup` are separate jobs. A stock/purge lifecycle event must not be inferred from a report-revision increment. The collector and retention jobs are non-financial result-cache activity, not customer ledger receipts.
- **Old clients:** existing v1 `requestKhata` and Android local-only `android-local-draft` or PWA session storage may have missing child identities. Do not automatically replay unknown historic local effects; encrypted originals remain available and unresolved dependency subgraphs require review. Old client access must remain compatible or explicitly fenced only after the server gate, no silent dual write.

## Versioned interface / policy register (Phase 2A contract locked, policy values NOT approved)

- Identity: ORBIS Admin canonical immutable actor; email/phone mutable. Scopes: `company`, `lottery-organization`, `account-catalog`; lifecycle epoch fences retired/purged scopes. Receipt identifies actor, registered device, exact scope epoch, operation ID and canonical digest; server confirms typed result/child IDs.
- Device/capability interface: `local.accounting`, `drive.backup`, `account.recovery`, `sync.single-primary`, `sync.multi-device`, `sync.web-cross-device`, future `team.access`. Server owns device registration, expiry/revocation, capability/version, organization authorization and receipt/feeder access. No client plan string or Device ID alone is authority.
- Frozen `ADR-SYNC-002` + `ADR-ENTITLEMENT-001` unchanged. Dependency-scoped conflict, immutable posting, verified cash/PWD semantics, offline-first local data remain mandatory.
- **P1** Basic/Free Web + device counts and replacement: **OWNER DECISION PENDING**.
- **P2** Offline grace and revocation: **OWNER DECISION PENDING**.
- **P3** Feed/tombstone retention and privacy deletion: **OWNER DECISION PENDING**.
- **P4** Backup RPO/RTO and responsibility: **OWNER DECISION PENDING**.
- **P5** Financial conflict approval UX: **OWNER DECISION PENDING**.
- **P6** Minimum old-client version and migration cutoff: **OWNER DECISION PENDING**.
- **P7** Load/cost/latency/battery budgets: **OWNER DECISION PENDING**.

**No prices, device numbers, time limits, expiry values or RPO/RTO are invented by this Phase 2A deliverable.** These owner-held parameters gate final 2F/2G and LIVE enablement.

## QA acceptance and decision

Phase 2A source catalog completion means every **currently implemented** input and metadata ingress is explicitly indexed with owner, scope/identity lineage and correct next integration gate; automatic drift checks run on the source, and live metadata is separately inspected read-only. It **does NOT** claim every old call path is already routed through v2. Phase 2B must implement/verify missing transaction/receipt/feed, Phase 2E all financial writer adapters, 2C/2D durable client projections, 2F historic reconciliation/entitlements, 2G physical tests. No preproduction/prod mutation or feature flag activation here.

**Pre-push checks required:** targeted new 2A inventory tests + existing `module-registry`, `command`, device pairing, scoped native/SQL fixtures where relevant; TypeScript, Oxlint (no warnings), source-derived manifest checks, diff check, project build. CI owns full coverage, Sonar, JSCPD and broader regression. A successful CI pass on source-only inventory is **not** a sync production acceptance.

**Blocking rule:** if any previously unseen writer or live DB routine is discovered, mark it `BLOCKED` by default and update this document, never infer it already emits a feed. Rollback of this catalog code is a reviewed non-force revert only; it must not touch accounting/DB/device data.
