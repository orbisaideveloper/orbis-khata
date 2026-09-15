# Orbis Khata Boi

> বলুন, হিসাব নিজে তৈরি হবে।

Orbis Khata Boi is a mobile-first, voice-first, regional-language-first and offline-first business khata and accounting product. It is designed so that a small-business owner can maintain professional records without first learning accounting terminology.

## Product status

**Phase:** Product and architecture baseline  
**Runtime code:** Not started  
**Next gate:** Review and approve the MVP architecture and product specification before selecting the final technology stack or writing production code.

## Core promise

The interface stays simple—Money In, Money Out, To Receive and To Pay—while the system maintains structured, auditable accounting data underneath.

The primary interaction is natural language. For example, a user may say:

- “রহিমের কাছে আজ ১২০০ টাকা পেলাম।”
- “আজ ডিজেল ৮৫০ টাকা খরচ।”
- “মদনকে ২০ লিটার দুধ দিলাম ৫০ টাকা লিটার।”

The app converts the statement into a proposed transaction and always shows **Confirm / Edit / Cancel** before any financial record is finalized.

## Locked product direction

- Standalone Orbis product with its own repository, deployment, database, environment and release lifecycle.
- Shared Orbis ID for identity and Orbis Admin for central product-level control.
- Business data remains private to this product and its tenant; it is not automatically shared with other Orbis apps.
- Mobile-first PWA for the first release, followed by Android packaging and later public store release.
- Local-first operation with optional secure cloud sync and backup.
- Bengali, Hindi and English from the beginning.
- AI is restricted to the user’s own accounting context; it is not a general-purpose chatbot.
- Pull requests, PR Preview and staging are not part of the default workflow. They are used only when the owner explicitly requests them.

## Repository map

- [AGENTS.md](AGENTS.md) — mandatory operating rules for every AI or contributor.
- [Product blueprint](docs/PRODUCT_BLUEPRINT.md) — full vision, users, capabilities and roadmap.
- [Architecture baseline](docs/ARCHITECTURE.md) — system boundaries, data, offline sync, identity and security.
- [MVP specification](docs/MVP_SPECIFICATION.md) — first-release scope, flows and acceptance gates.
- [Development workflow](docs/DEVELOPMENT_WORKFLOW.md) — branches, tests, direct main updates and production checks.
- [Decision log](docs/DECISIONS.md) — locked decisions and deliberately open questions.
- [Project status](docs/PROJECT_STATUS.md) — latest durable checkpoint and exact resume point.
- [Security policy](SECURITY.md) — vulnerability and sensitive-data handling policy.

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
