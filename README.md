# Orbis Khata Boi

> বলুন, হিসাব নিজে তৈরি হবে।

Orbis Khata Boi is a mobile-first, voice-first, regional-language-first and offline-first business khata and accounting product. It is designed so that a small-business owner can maintain professional records without first learning accounting terminology.

## Product status
**Phase:** Accounting foundation implemented; incremental product completion in progress.
**Runtime code:** Real Auth/company boundary and Accounting v1 foundation are implemented.
**Current foundation:** Multiple companies, company-scoped parties, Sale/Purchase,
Receipt/Payment, advances, Cash/Bank, party ledger/totals, exact money,
retry/idempotency, tenant isolation and immutable reversal.
**Next implementation order:** Party + Ledger Master → Item + Unit Master →
Itemized Sale/Purchase → Inventory → Delete/Void propagation → Dashboard/Reports.
**Certification:** Exact-SHA GitHub Actions/Sonar status is not certified by this document.
**Deployment:** OFF / not authorized.

## Working rule

No AI should infer that a planned feature is implemented. Repository source and verified reports are the source of truth. Every meaningful work session must leave a recoverable checkpoint in `docs/PROJECT_STATUS.md`.

## Ecosystem position

Orbis Khata Boi is customer-facing as an independent app, but owner-facing as one product inside the wider Orbis ecosystem:

- Orbis Admin — central control and product health.
- Orbis ID — shared identity and sign-in.
- Orbis Khata Boi — simple business khata and accounting.
- Orbis Foundation, Orbis Game and future products — independent applications with explicit integration contracts.

## License

No open-source license has been granted. All rights are reserved until the owner chooses a license.
