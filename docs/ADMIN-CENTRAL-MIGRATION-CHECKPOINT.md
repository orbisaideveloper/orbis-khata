# Central login checkpoint — 2026-10-12

Admin managed migration `20261012160546_central_customer_account_profile_and_legacy_binding`
was applied successfully to `aqcwhqdzniruvoqwfsij` after the owner's local SQL checks.
Post-application read checks: identities remain 12; customer accounts remain 0;
five customer tables have forced RLS; anon/authenticated cannot directly SELECT
them or execute the five privileged customer RPCs. Service RPC execution is enabled.
Advisors returned informational RLS-without-policy findings for intentionally private
tables. Do not grant public access to silence these notices.

SQL SHA256: `b9404519163e4421b510e7be21de94041cc491da902f74c6368dc73696ddc927`.

Khata owner correction: the app is new and unreleased; do not assume active legacy
customers or financial books. Preserve accounting implementation. Retire independent
product signup/login in favor of the central account; product-owned financial data
remains in Khata. The new product migration refuses nonempty books rather than deleting
or reassigning them. An unexpected nonempty database requires evidence review.

Prepared browser changes use the central session protocol and product-owned data
gateway. They do not deploy that gateway or apply the Khata schema. Real signup,
login, refresh, browser reload, signout, RLS runtime checks, full coverage and mobile
E2E remain unverified. Central password recovery is not implemented in this package.
Maya and Foundation browser integration is still pending. No repository commit,
push, merge or application deployment was performed.

Use one responsive web application for desktop/mobile. No device-specific credential
authority, account creation, or financial ownership scheme is permitted.
