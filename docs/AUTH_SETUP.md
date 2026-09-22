# Khata account candidate — 21 September 2026

Prepared against main `2eb03ce151d9e80607378e9fa4ce9d69bd5657ed`.
This is local source preparation, not a deployed or live-tested integration.

## Behavior

- First name, last name, phone, email and password signup; no OTP step.
- Email/password authentication with a persisted, automatically refreshed session.
- Passwords are sent to Supabase Auth, never saved by application code.
- Local logout, email password recovery and password reset UI.
- Phone is unverified contact metadata, not a login credential or authorization claim.
- App lock is off. Device lock support and later verification remain future work.
- One company per owner, protected by server RLS in the proposed SQL. No financial writes.
- Khata-local Auth UUIDs are not permanent shared ORBIS IDs. No Admin dependency or linking by unverified email/phone.
- Clearing browser data, logout, session revocation or some recovery events can require login again. This is not an offline accounting implementation.

## Configuration before real signup

Only project `gqyaxsczlmvppxuoqbox` is targeted.
Set in ignored `.env.local` on the phone and separately in a future deployment environment:

```dotenv
VITE_SUPABASE_URL=https://gqyaxsczlmvppxuoqbox.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<project publishable key>
VITE_KHATA_GUEST_UI=false
```

The package supplies the project's public publishable key; it is not a service-role secret.
Without Auth configuration, the legacy UI-only preview remains available, containing no real account data.

Live read on 21 September: signup enabled, email provider enabled, phone provider disabled,
`mailer_autoconfirm=false`. Thus email confirmation is currently REQUIRED server-side.
In Supabase Authentication → Sign In / Providers, disable Confirm email for the requested
immediate signup behavior. No phone sign-in provider is required. This setting has NOT been changed here.

Review `docs/khata-company-proposal.sql` and approve its execution on the Khata project only.
The public schema was empty when inspected. Proposed grants permit owner SELECT and INSERT only;
other users, anonymous visitors, UPDATE and DELETE are denied. Owner ID has a unique index.
This SQL is a proposal, not an applied migration or tested live policy. Record the migration
through the agreed Supabase workflow after approval; do not run it on Admin/Foundation.

Set Auth Site URL and allowed recovery redirects to the exact browser origin used for testing
and eventually the production URL. Configure working SMTP before promising recovery mail
to arbitrary users. Signup itself does not need mail delivery when confirmation is disabled.
Auto-confirmed email is not proof of mailbox ownership: later verified features must use
a distinct server-controlled verification process, never user_metadata or auto-confirm timestamps.

## Validation and remaining gates

Targeted Vitest, source lint and TypeScript/build are checked in the prepared copy.
Existing UI tests explicitly mock no Auth configuration; account tests use mocked SDK responses.
They do not prove hosted Auth, email delivery or RLS enforcement.

Next: apply the patch through Termux; run `python scripts/khata.py test`; preview using
`python scripts/khata.py preview`; approve the mobile appearance. Then configure and verify
live signup/session recovery and two-user isolation after the database change is authorized.
Do not create production users just for this source preparation.
Final `khata verify`, coverage gates, remote CI/Sonar and owner-controlled push remain pending.

## Sources

- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/reference/javascript/auth-signup
- https://supabase.com/docs/guides/database/postgres/row-level-security
