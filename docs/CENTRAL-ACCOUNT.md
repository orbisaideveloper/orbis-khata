# Khata central customer account

Owner decision, 2026-10-12: new unreleased product, central-only account authority.
Existing accounting logic is preserved; independent product Auth is retired.
The central ID is immutable. Common profile belongs in Admin, financial rows in Khata.

Browser configuration: `VITE_ORBIS_CUSTOMER_API_URL` is the HTTPS Admin origin;
`VITE_KHATA_DATA_URL` is the HTTPS product gateway URL. Neither is a secret.
Product Supabase Auth keys do not enable signup or data access in the new client.
Development-only visual preview requires the explicit guest UI flag; release builds
cannot use that flag to access books.

Gateway configuration is server-only: `ORBIS_CUSTOMER_API_URL`, `KHATA_DATABASE_URL`,
`ORBIS_CUSTOMER_VERIFY_KEY` shared only with the Admin backend,
and an exact comma-separated `KHATA_ORIGINS` allowlist. Keep database credentials out
of Vite. TLS certificate verification is mandatory. The fixed database target is
`gqyaxsczlmvppxuoqbox`; an unexpected target fails before the server starts.

Apply `docs/central-auth-empty-product.review.sql` only through a managed migration
after schema/empty-product verification and SQL tests. It locks the relevant tables,
refuses nonempty books and changes the two ownership foreign keys to a private product
principal reference. It never deletes data or creates replacement financial books.

The gateway remotely verifies the central session for every operation, sets the
authenticated role and canonical owner claim transaction-locally, and uses existing
RLS/report/post logic. No client owner_id is accepted. Commands remain idempotent;
database rejections are returned as SQLSTATE only, without messages or connection details.

Deploy the product edge gateway with platform JWT verification disabled ONLY because
the handler independently verifies central JWTs with Admin before every data operation.
Do not expose the function without that verification handler and the restrictive RLS.
No gateway deployment or product schema application is included in the installer.

Remaining release checks: central signup providers/auto-confirmation, API rate limits
for service-to-service verification, full affected-code coverage, product SQL/RLS tests,
real signup/login/reload/refresh/logout and desktop/mobile E2E. Password recovery must
receive a central endpoint before its existing UI is considered working.
