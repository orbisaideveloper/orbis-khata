> **Step 2 update (2026-09-19):** Module names were explicitly revised to Khata Boi, Farming, and Lottery (Upcoming). Step 2 language and navigation details are authoritative in `docs/UI_PHASE_02.md`; this file preserves the Step 1 process.

# ORBIS Khata Boi — Owner-approved phased UI plan

Date: 2026-09-19. Scope: `orbis-khata` only. This plan does not change Orbis Foundation, Orbis Admin or any production environment.

## Module model

- The standalone Orbis Khata Boi product has a Welcome/Login gateway and a Workspace for module selection. UI/module labels may change without changing future stable IDs.
- Module 1: **Khata Boi**, general business accounting. Build and review this first.
- Module 2: **Farming**, dairy/farm operations. Design and implement separately after Khata Boi; intended future areas include milk production, sales, feed purchases, stock/consumption, cow records, farm expenses, party ledger and reports.
- A shared application shell or accounting conventions must **not** imply shared business/tenant data. Existing standalone product, database and Auth/Orbis Admin boundaries remain intact; multi-module data/API design is not approved yet.
- Lottery is listed as an Upcoming third module only, not approved for implementation.

## Screen-by-screen milestones

1. **Current milestone:** Welcome screen → Login UI → Demo Workspace, functional browser back, local Vite dev server on Termux. Do not connect real authentication, collect credentials or write financial data. Current React/Vite/TypeScript scaffold is the UI technology for this step only; wider architecture/package layout remains open.
2. Next, after owner visual approval: module selection screen with two planned modules and Lottery listed as Upcoming; Khata Boi enters first, Farming clearly marked future.
3. Khata Boi UI incrementally: Dashboard → Masters/Party/Item → Sale/Purchase → single Payment (Receive/Pay/Expense) → Stock/Ledger/Reports → Invoice/WhatsApp share → backup/export, then voice. Each slice reviewed before proceeding.
4. Farming is a later separate module with its own design review. Never silently copy real Farming records into a demo or cross tenant boundaries.

## Session requirements

- At first opening, Welcome appears; Login UI offers a 'remember' preference enabled by default. After **real authentication is implemented and approved**, securely maintained sessions should allow reopening the app without repeated login unless signed out, expired or security policy requires re-auth.
- This milestone has **no real sign-in**. Credential inputs are disabled. Only an explicitly marked demo session exists. The demo uses only a non-sensitive session preference flag; the Step 2 language selector separately saves a language code; no password, email, token, or financial data is stored.
- Demo preference OFF means the next reload returns to Welcome. Logout clears the demo preference. Browser/Android Back from Login returns to Welcome. Workspace re-entry after a remembered demo session is intentional.
- Real AuthN/AuthZ, Orbis ID integration, persistent session/revocation and recovery remain open architectural decisions. Never use the demo flag as authorization.

## Accounting requirement to preserve in later phases

A single saved Sale/Purchase/Payment/Expense entry updates all related projections (party ledger, balances, inventory and reports) without another user-post action. A sale is a sale regardless of payment; cash/bank changes only when money actually moves. If sale includes 'received now', it is captured within that one entry and accounted for once. Full references, details, audit/corrections and reproducible balances are mandatory before real posting.

## Workflow and next checkpoint

- Owner edits/previews on Android Termux using Vite bound to 127.0.0.1, then sends feedback. No push/merge/deploy by the assistant.
- Targeted checks only while developing; owner calls for one final certification before main. Timestamped reports belong in Termux Downloads.
- **After this installer:** owner reviews Welcome and Login visually and checks demo persistence. Next action is to approve or request changes; do not build the next screen unprompted.
