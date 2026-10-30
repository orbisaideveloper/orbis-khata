# Independent ORBIS Khata Lottery

Source: `orbisaideveloper/orbis-foundation` commit
`2686780feffcabfefad2e434ecf56dca7b015608` (read-only source inspection).
No user/trial records, credentials, database URLs or Foundation deployment files
are included. This directory is part of the Khata repository and release.

The original daily seller/stockist, masters, payment, ledger and transaction
correction/void forms and pure models are retained under `src/`. Their client
uses the product-local `adminFetch` compatibility shim, which calls Khata's
centrally authenticated data gateway. `/lottery` is an in-process route selector;
it is never fetched from Foundation. UI navigation and IndexedDB/outbox names
use new Khata Lottery namespaces, scoped by the canonical signed-in owner.

`runtime/` contains nine original accounting modules with mechanical CommonJS
require/export conversion to ESM. Unused export surfaces were removed; arithmetic
was not rewritten. Scalar defaults, unique keys and local-model foreign keys
come from the pinned schema, without Prisma or any Foundation database runtime.
The private adapter in `src/lottery/domain-store.ts` provides these operations
inside the owner-locked Khata SQL transaction. Original individual transaction
version/hash controls, correction journal and linked void effects remain.

Integration-only adjustments: product branding, unused React imports/exports,
stockist hooks moved above the empty-list return, and the seller date caption
fixed to Asia/Kolkata. Twelve original domain/property test suites run under
`tests/lottery`; original Prisma migration-string tests are not an assertion
about the new storage. New live SQL rollback checks cover the actual Khata
gateway, owner boundaries, idempotency and versions instead.

Money remains integer paise; rates are basis points. PWT is a non-cash prize
token adjustment and remains distinct from TDS. Morning/day/evening returns,
stockist purchase/commission, seller commission/TDS, customer bills, payments,
expense schedules, financial years, carry-forward, corrections and deletion
retain the pinned domain behavior.

Persistence: `khata_lottery_state` and `khata_lottery_operations` are new, private
Khata-only tables. Each owner has an independently locked aggregate and operation
history. Snapshot scalars retain exact BigInt/date tags. The current transport
is bounded (1.5 MB encoded aggregate per owner); a future relational/paged store
can implement the same domain contract before high-volume rollout. No old
Foundation data is copied and no Foundation API/database connection is required.

Foundation-only public account/identity administration, deployment/version
publishing and real AI-provider calls are not copied into this accounting module.
Existing Orbis central login is reused; deterministic accounting insights stay
within the lottery workspace.
