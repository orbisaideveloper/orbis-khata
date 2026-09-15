# Security Policy

Orbis Khata Boi handles financial and identity data and therefore treats security and tenant isolation as product requirements, not optional hardening.

## Reporting a vulnerability

Do not publish exploitable vulnerability details, secrets or real user financial data in a public issue. Prefer GitHub’s private vulnerability reporting / Security Advisory channel for this repository. If that channel is not enabled, contact the repository owner privately before disclosure.

Never include passwords, tokens, database credentials, service-role keys, production exports, raw personal identifiers or complete sensitive logs in a report.

## Scope priorities

High-priority issues include:

- cross-tenant or unauthorized business-data access;
- authentication/session bypass;
- financial record corruption or duplicate posting;
- unsafe offline-sync conflict behavior;
- exposed secrets or privileged client credentials;
- backup/export disclosure or unrecoverable restore;
- AI actions that bypass user confirmation;
- injection that can change financial or privileged behavior.

## Handling rules

- Preserve evidence without accessing more data than necessary.
- Do not test against real users or production data without explicit authorization.
- Revoke/rotate exposed credentials through an approved owner-controlled process.
- Fix on an isolated branch and add regression coverage.
- Record affected versions, impact, verification and deployment/rollback requirements.
- Never mark a report resolved until the fix is verified in every affected environment.

No production security contact or service-level response time is declared yet; these must be added before public beta.
