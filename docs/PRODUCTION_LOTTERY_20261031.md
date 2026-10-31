# Continuous production and Lottery row saves — 31 October 2026

Repository: `orbisaideveloper/orbis-khata`, main. Baseline: `6743adce65a358a4b4c2247df198d9fa49e0328d`. Owner explicitly authorizes one commit/push after verification. Earlier abandoned checkout was not reused.

## Result

Production is a company setting, off for existing companies unless enabled. Enabling shows the Production entry and the purchase invoice's optional “Send to production” checkbox. Disabling hides entry actions and preserves financial/stock history and valuation.

A checked purchase saves its supplier bill, ordinary payment/advance, invoice number and all item quantities sent into production in one database transaction. Failure in routing rolls everything back. Retry reuses the original result. Reversing that purchase also returns its production input through audited stock reversals.

The Production page previews and confirms raw-material transfers and own-output receipts, with company/user-scoped uncertain-save recovery. Receiving milk creates an internal stock movement, not a supplier bill, payment or payable. One company uses one continuous output item/unit, preventing meaningless averaging across unlike products. There are no production batches, resets or invented daily feed-consumption records.

Raw materials and existing milk stock are consumed oldest first. Ordinary unrelated inventory retains the existing moving-average policy. Production valuation uses all input costs and all produced quantities through the selected report end date; later activity cannot change an earlier as-of report. Operating expenses are deducted once by the existing business report. Purchases are not also expensed a second time. Unknown opening cost or insufficient historical quantity makes profit unavailable rather than inventing a zero cost.

Example verified: ₹25,000 feed / 500 litres = ₹50/litre; another 200 litres with no new input gives ₹35.714285…/litre. Exact integers/rational allocation are used; display rounds to paise. The period's profit uses the output stock actually sold, retaining the unsold stock's cost.

Lottery saves changed records and all related records atomically through a private owner-scoped v2 store. It does not rewrite the owner aggregate. The 1,500,000-byte aggregate storage guard is removed in v2, not increased. Original domain formulas, ownership, version conflicts, write-disable, failed-transaction rollback and request/result replay remain. Existing arrays backfill into ordered records; the original JSON stays as a backup. Legacy aggregate writers are disabled after migration.

## Evidence from final source

| Check | Result |
| --- | --- |
| Full unit suite | 120 files, 732 tests PASS |
| Coverage | 91.98% statements; 88.82% branches; 91.34% functions; 92.46% lines |
| New Production page, costing and command model | 100% lines and functions; page branches 94%, costing 98.43%, command model 100% |
| Full mobile/desktop Playwright | 28/28 PASS, including signup/login/logout, identity refresh/profile, old bills/advances/PDF, Lottery reload, masters, reports, PWA and new production flow |
| Build and PWA worker | PASS in browser preflight on exact local source |
| Typecheck / lint | PASS; inherited vendor warnings retained |
| KNIP / JSCPD | PASS / 0 clones |
| npm audit | 0 vulnerabilities |
| Local recommended SonarJS on changed implementation | No findings; native remote Sonar remains unverified until Actions |
| Isolated SQL acceptance | PASS for both new migrations together, plus original atomic-invoice/account-detail rollback suites |

SQL acceptance verifies old user/company/party/voucher/inventory fingerprints, private table/function grants, owner/gateway isolation, disabled writes/mode, stock guards, internal milk without another payable, checked-purchase replay, conflicting retries, failed-save invoice-number rollback, linked purchase reversal and retired-company restore. Lottery verifies >1.5MB legacy history, unrelated-row update/delete tripwire, linked changes, preserved backup, replay/conflict, full rollback and old-gateway refusal.

`npm run test:sql` runs these checks without production credentials. PGlite is pinned as a development dependency. Its fixture omits only the pre-existing pg_cron registration because that extension is unavailable in PGlite; scheduling is not certified by this test. CI now runs SQL acceptance as an additional gate; no threshold or exclusion was weakened.

The first full-browser attempt used a single-process launch workaround and could not create successive browser contexts. It was discarded. The final 28/28 run used normal-process official Chromium headless shell 153.0.8010.12 (Playwright build 1243), downloaded directly after the CDN installer produced truncated archives. Mobile/desktop production screenshots were visually reviewed. Temporary launch configuration was removed.

The Android `khata verify` wrapper was attempted once but refused this separate restart directory and has no Android Downloads mount here. It did not certify this run. All checks above ran directly on Ubuntu; no Termux-wrapper PASS is claimed.

## Live-data preservation

Read-only snapshots before and after implementation matched exactly:

- 3 product identity mappings, 5 companies, 16 parties, 52 vouchers, 44 inventory documents and 3 Lottery owners.
- Identity mapping fingerprint: `2bf3d8323983e04abb9c96d3b3137456`.
- Company fingerprint: `80696827fe46f852500129c1d2b63ff7`.
- Voucher fingerprint: `f8e67969c27bcb183aca09ef47d78356`.
- Lottery fingerprint: `13c7335da482e58438a9c01efa2d82af`.

No live authentication/identity records, owner financial records, schema, Edge function or Render deployment were changed. Local fixtures are isolated and original SQL acceptance fixture transactions roll back.

## Activation and limits

This commit is source prepared for release, not live activation. Under separate owner deployment authorization, apply the reviewed Lottery row migration and continuous-production migration, deploy the matching Khata Edge bundle, then publish the frontend and verify signed-in flows. Coordinate v2 migration/gateway activation: the old aggregate writer intentionally fails closed once migrated. Keep existing database backups and the preserved legacy Lottery JSON until restore verification is complete. No trial-account cleanup, identity reset or unrelated data deletion is part of these migrations.

The Lottery adapter still hydrates state to execute the unchanged domain service. Existing response-size/transport bounds and paged-read scaling are separate from the removed owner-storage cap; unlimited-scale operation is not claimed. Production history is append-only in this scope; the existing purchase correction/reversal flow includes routed stock, while a separate manual production-entry correction UI is not included.

Next: verify native Actions/Sonar for the pushed commit; live migrations/Edge/frontend activation and production smoke testing require their own authorized step.

## Native Sonar follow-up

The first pushed source `607b901` passed all ordinary remote gates (732 unit tests, SQL acceptance, 28 browser tests and Sonar Quality Gate). Strict zero-open-issues enforcement then reported nine TypeScript findings: optional chaining, two assertion styles, five FormData object-stringification warnings and an array-index history key.

The correction uses the existing string-only `textValue` helper and precise assertions. History quantities are grouped exactly by item/godown within each immutable document, producing a stable unique key even when a purchase contains repeated identical lines. Financial formulas, SQL, authentication and quality thresholds are unchanged. Related 41 tests, typecheck/lint, local SonarJS, KNIP, zero clones and mobile/desktop production 2/2 passed; the corrective native run is verified separately after push.
