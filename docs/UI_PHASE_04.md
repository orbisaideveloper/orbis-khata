# Phase 4 — Approved UI implemented in React (20 September 2026)

## Approval and exact scope

The owner approved `ORBIS-KHATA-APP-UI-APPROVAL-PREVIEW.html` as the fixed design for these four screens:
Welcome → Login → Workspace → Khata Boi. This file is included unmodified in the installation bundle under `reference/`.

- Welcome: preserve the approved orbit logo, three-line heading, gradient, empty-account illustration, two buttons and mobile sizing. No invented rupee value, growth rate, guest profile or demo disclaimer.
- Login: preserve the visible layout, field labels, disabled credential inputs and disabled real-sign-in button. Allow a temporary **Open app without signing in** UI-only route until secure Orbis ID/Auth is implemented. Do not store any credential, fake auth token or guest session; reload starts at Welcome.
- Workspace: preserve greeting, colored information card, and the exact Khata Boi → Farming → Lottery ordering. Remove demo user/avatar, demo-session setting and pretend account. Farming and Lottery are visibly not active.
- Khata Boi: replace the previous placeholder with the approved empty Dashboard shell: Money In, Money Out, To Receive, To Pay all show an em dash until real accounting data exists. Sales, Purchase, Receive and Payment actions stay disabled.
- All four screens: Bengali, English and Hindi from the owner-approved copy. Persist only the non-sensitive language preference in localStorage.

## Auth gate, boundaries and truthful status

`VITE_KHATA_GUEST_UI=false` removes the guest entry and prevents in-app guest Workspace/Khata navigation; this is **only a UI flag**, not a security boundary. Implement and verify server-side AuthN, AuthZ, tenant isolation and authenticated navigation before any real account, payment data, API or persistence is connected. Existing Demo Session persistence is removed. Automatic deploy is not introduced.

This completes the **approved four-screen UI slice**, not the accounting product. Real login, sign-up, company setup, durable accounting, stock/party ledgers, one-entry posting, sync, exports and release certification are distinct future tasks requiring architectural approval and implementation. Do not present them as done or expose unprotected financial data.

## Verification and release gate

Bundle installer must check the expected main HEAD and exact hashes for each target, make a backup and a report in Android Downloads, run TypeScript, localized UI unit tests, lint and build, roll back on failure, and never run commit/push/merge/deploy. Verify visuals on the owner's Android browser; perform one final `orbis verify` certification only when owner declares the work ready for GitHub. Owner alone performs the main push; Actions/Sonar must be Green before any manual release.
