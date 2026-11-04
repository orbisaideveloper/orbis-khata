# Native database concurrency verification

The GitHub quality workflow uses a disposable PostgreSQL 17 service. The fixture
requires a localhost test database and rejects nonempty databases. It does not
connect to a production database.

Bootstrap SQL containing BEGIN/COMMIT runs on one reserved connection. The test
pool remains multi-connection. The fixture models authenticated access to
`auth.uid()` without granting access to `auth.users`.

## Verified baseline

Commit `867d5285e8bf3796db3d3e7ff4eaa8863ac50411`, Actions run `41824991583`:

- Eight distinct, overlapping database sessions.
- Thirty-two concurrent requests with one ID create exactly one voucher.
- Replay/conflict preserve report revision integrity.
- Thirty-two distinct concurrent saves preserve exact total amounts.
- Rollback and foreign-owner rejection preserve stored results.
- A report read lock blocks a writer until the reader commits.
- All 880 unit tests and 52 browser cases passed.

That run failed Sonar with seven issues. The next correction uses explicit Error
constructors, an equivalent phone regex, and a localeCompare comparator only for
checkpoint-key ordering. It does not alter accounting formulas. Its own exact-SHA
CI and Sonar results must be checked; this baseline does not certify a newer SHA.

These are scoped transaction fixtures, not a production throughput or real-device
release certification. No production migration or deployment is part of this test.
