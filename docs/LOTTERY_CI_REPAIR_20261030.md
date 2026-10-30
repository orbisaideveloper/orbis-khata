# Lottery CI payment refresh repair

Recorded: 2026-10-30T11:46:02+05:30 (India). Parent main: `5c65314db7b221c4d769ecc0eff8e21d965616ff`.

## Verified failure

GitHub Actions run41011880020, job123919361517 failed Playwright mobile smoke:22/24 passed. Both Lottery cases expected two payments but saw the first17000-paise receipt only. The674 unit tests/coverage, lint, typecheck and build had passed. Sonar analysis/strict metrics were skipped after browser failure; this run did not establish a Sonar result.

The test's request-count>0 condition was satisfied by the first receipt and did not confirm the separate3000-paise receipt before reload. Additionally, a real form issue was reproduced deterministically: write30 in Payment Cash, refresh accounting workspace, and the field becomes empty. The account-list object was recreated on refresh and an effect reset all amounts even though the selected party did not change.

## Fix

- Preserve payment amounts through refreshes for the same selected account. Clear on actual account/type/expense-category changes; successful save still explicitly clears the form. Financial formulas and stored records are unchanged.
- Await the matching second payment response, assert the successful saved amount and form reset, then reload. Keep exact two-payment, cash13000/bank5000/PWD2000 and single-bill assertions.
- Serialize fixture gateway requests like production's owner lock. Add latency to the second receipt so request receipt cannot stand in for commit confirmation. Verify draft retention through refresh and clearing on account-type change.
- Consolidate ModulePicker i18n imports ahead of the next Sonar analysis. No gate, timeout or expected financial assertion was weakened.

## Current checks

- Deterministic refresh regression: fails before fix (expected30, received empty), passes after fix.
- Complete Playwright suite:24/24 PASS on mobile and desktop, including account/login, bill PDF, business reports, Lottery, masters, overview and offline PWA.
- Related unit tests:31/31 PASS. Typecheck, lint (existing vendor advisories), production/PWA build, KNIP and zero-clone JSCPD PASS. Local recommended SonarJS source scan has no findings.
- No SQL, Edge, Render deployment or user financial data mutation in this repair. Existing Edgev13 remains compatible.
- Corrective main push authorized by owner. New Actions/Sonar result remains pending; do not claim remote green until that run completes. No post-push polling.
