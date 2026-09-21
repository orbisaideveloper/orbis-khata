# ORBIS Khata Boi — Step 2: Trilingual UI and module lineup

Owner instruction: 2026-09-19. Scope: `orbis-khata` only. Status: local candidate; not a production release.

## Current owner-approved order

1. Welcome → Login preview → remembered **demo** Workspace. Language picker available on every reachable screen: Bengali (`bn`), Hindi (`hi`), English (`en`). All user-facing text in this UI slice, including accessible labels, warnings, settings and module captions, has translations for all three languages.
2. Module 1: **Khata Boi** (general accounting). Build this first; its entry route is a deliberately labeled preview and its dashboard is next, not claimed finished.
3. Module 2: **Farming** (general agriculture and farm operations), later dedicated module. No business-specific dairy name should appear as a module name or default demo organization.
4. Module 3: **Lottery** — listed as Upcoming only; no implementation or launch date is approved.
5. Create a business/organization **inside the appropriate module** after a subsequent owner review. Do not invent a default company or mix data between companies/modules. Independent Khata product repository, release, database, and tenant boundaries remain locked.

## UI/session invariants

- The preference key `orbis-khata-ui-language-v1` stores only a language code and is independent of the existing non-sensitive demo-session preference `orbis-khata-demo-session-v1`. No credentials, tokens or real accounting data are stored.
- A remembered demo opens the Workspace on browser restart. A non-remembered demo returns to Welcome. Logout clears the demo preference but preserves the language. No demo flag can grant real access.
- Login/password inputs stay disabled until an approved AuthN/AuthZ implementation. This work does **not** implement ORBIS ID, signup, company creation, real session persistence or database.
- Back navigation returns from Khata Boi placeholder to Workspace and from Login to Welcome; Android browser history remains supported.
- Farming and Lottery cards are visibly upcoming/non-interactive. Never present placeholders as completed features.

## Accounting rules for next increments

One user Save → relevant sale/purchase, stock, party outstanding, cash/bank movement, ledger and reports update together. Cash/bank changes **only when money actually moves**; receiving an amount within a Sale is part of that single entry, not a second user post. Preserve detail, reference links, tenant separation, exact money and audited corrections.

## Verification and deployment

Local implementation only. Run changed-area lint, TypeScript, focused unit tests and build; run browser Playwright in supported Linux/CI at final certification, not Android Prisma/Chromium if unsupported. Store timestamped logs in Android Downloads. No GitHub commit or push, cross-product changes, database writes or deployment without explicit owner approval.

Next owner review: verify language changes at Welcome, Login, Workspace and Khata landing; refresh/reopen, Back and Logout; review module names. Next app slice after review: Khata Boi dashboard, then company creation design.
