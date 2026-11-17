# ORBIS Khata — Real User Acceptance Registry (phase 1)

This is a **portable test contract** kept inside `orbis-khata`. Other ORBIS
applications can reuse the schema and evidence/reporting conventions later.
The JSON catalog deliberately separates `planned`, `blocked`,
`existing_mock_browser`, and `implemented_unverified`; **none means PASS**.

## Two distinct gates

1. **Code gate**: existing Vitest, SQL checks, Playwright browser tests, Sonar,
   KNIP, JSCPD, build and Android package checks. Keep existing workflows.
2. **Real app gate**: actual installed APK and Android WebView (and eventually
   isolated reviewer-style signed-in actions). The first source-level
   instrumentation case covers signed-out Welcome → Login → password
   visibility. It does not submit credentials or write backend records.

The Android emulator workflow already runs
`python3 scripts/khata.py test android-device`, which invokes
`connectedDebugAndroidTest`. This discovers AndroidUserJourneyTest alongside
PackageSafetyTest automatically. The existing workflow preserves Android
diagnostics for seven days. Its recorded success must be checked after push.

## Safe expansion protocol

- Build an **isolated test company/account**; do not overwrite the stable
  Google Play Reviewer demo data.
- Verify every create/update/delete using UI result + local/server state.
- Stamp test ID, app version, commit, UTC time, environment, expected vs actual,
  device details, evidence paths, and PASS/FAIL/BLOCKED/NOT_TESTED.
- Reset synthetic data only after validating the correct test-tenant identity.
- Never log credentials or personal records.
- Add scenarios incrementally: login → company → masters → sales → ledger;
  then lottery, production, inventory, offline, backup and sync.
- Add cross-browser (Chromium/Firefox/WebKit), accessibility, visual and
  performance regression lanes without making unverified cases appear green.
- Avoid production writes and unapproved cloud deployment.

## Current limitations

No authenticated live customer CRUD automation is claimed. Neither this
registry nor successful code-level tests prove all pages work on a phone.
