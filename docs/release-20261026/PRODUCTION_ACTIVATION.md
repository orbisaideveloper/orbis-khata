# Production activation — 26 October 2026

Owner authorized database migration, gateway activation and main commit/push.

- Khata only: `gqyaxsczlmvppxuoqbox`.
- Applied migration: `20261026081216_khata_live_masters_precise_bills_v2`.
- Gateway `orbis-khata-data`: ACTIVE version 5, deployment SHA256
  `d3137bc22de1a70420d71746d07ef6becd622c6bff92bb0f915087cd59889fe7`.
- Unauthenticated POST: HTTP 401 `KHATA_LOGIN_REQUIRED`.
- Actual applied schema passed transactional acceptance; fixtures rolled back.
- Preserved counts: 2 companies, 5 parties, 4 vouchers. Two default godowns exist.
- Central identities, Admin project and historical financial rows unchanged.
- New RLS tables have explicit owner + verified-gateway read policies. Client writes
  go through explicit ownership/write-control checks in reviewed RPCs. Anonymous
  function execution revoked; signed-in SECURITY DEFINER advisor notices for the
  eight new RPCs are intentional and require the verified gateway context.
- Pre-existing `rls_auto_enable` anonymous-execution and Auth password-protection
  advisories remain; this release does not alter central authentication settings.

Migration and gateway activation alone do not deploy the web UI. Main push and
Render deployment/owner server acceptance must be recorded separately after gates.
Owner should verify contacts/opening balances survive reload, blank optional item
code/rate, bill party choice, exact line totals, purchase/sale stock, expense partial
settlement and both cancel points of deletion. Historical/opening-balance masters
are blocked from destructive deletion; prior financial records remain auditable.
