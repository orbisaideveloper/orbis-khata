# Lottery Results — first implementation checkpoint

Date: 20 November 2026 (IST). Setup 01. Remote base: `d559fab38384e3522bc5287b00b16961f37f0099`; local source-equivalent HEAD: `41da5e3b314529074fa075550653a5a637043668`. Initial working tree clean.

## Impact and implemented boundary

The existing sixth workspace card was a planned, non-opening tile. It now opens a separate signed-in Results page. Existing card ordering and styling are preserved. Navigation policy, owner-scoped remembered location and App route include `results`. The page has Bengali/Hindi/English copy, IST date selection, three draw slots, an explicit source-not-connected state and a link to the government's gazette calendar. Responsive controls stack on narrow screens.

No Lottery Accounts, accounting gateway, database, bills, receipts, PWD, auth backend, backup or sync data changed. No result, winning ticket or verification evidence has been fabricated. This is a UI foundation, **not a completed live result checker**. Date/slot select local UI state only; the government link opens its calendar, not a filtered draw. No ticket checking/QR, cache or scheduled retrieval is enabled.

## Source findings and next implementation gate

Primary government calendar: https://nagalandlotteries.com/results.php . Examined PDFs include image-based gazettes; reliable extraction must be proved on actual samples before automatic publication. No documented government JSON API was found in inspected pages; this does not establish that no API exists.

A private candidate, https://api.sambad.com/ , advertises a token-based v2 Dear feed. No token was obtained, live authenticated response tested, license accepted or external account created. Permission for distributing normalized offline result data remains unverified. Never place a provider token in Vite/client variables.

Next: establish an authorized source and actual response/sample fixtures; define exact draw identity, series and tier matching from official rules; implement server-only retrieval and official comparison. Publish only verified versioned JSON. Proposed IST attempts are 13:15/13:20, 18:15/18:20 and 20:15/20:20; these are proposed polling times, not guaranteed publication times or an active schedule.

Then implement a rolling 30-day device cache, strict draw-specific lookup, leading-zero preservation and pending/unverified states. Keep source URL, source digest, verification time and revision. PDFs are temporary verification inputs, with cleanup after successful processing; do not claim independent verification merely because a provider supplied JSON. A provider gazette must be labeled private. Missing/unverified data must never produce “no prize”. QR scanning follows validated manual lookup. Future accounting/PWD integration requires a separate reviewed change.

## Verification

- Three targeted suites / 11 tests PASS: workspace card opening/reordering, independent translated result page, IST boundary, route access and owner-scoped location.
- Initial new UI test isolation failed because automatic cleanup is not enabled in this repository. Explicit cleanup added; all three suites passed on rerun.
- TypeScript PASS; scoped Oxlint PASS; diff whitespace PASS.
- App/entry regressions: 2 suites / 17 tests PASS. Production TypeScript/Vite build and PWA worker checks PASS. Existing chunk-size and mixed static/dynamic SQLite import warnings remain; not introduced by this feature. Total targeted verification: 5 suites / 28 tests PASS.
- Full coverage, Sonar and Chromium reserved for GitHub after a separately approved push. No CI run created for this unpushed work. Real-device/visual acceptance not performed.

## Release state

Uncommitted local checkpoint only. No commit, push, migration, Edge/Render deployment or Android release. Do not release this as a working live scanner. Complete the source and verification gate first.

## Sample result checkpoint — 20 November 2026, 23:28 IST

Owner authorized today's sample first; automatic download and 30-day offline retention follow after acceptance. Existing local edits are this same task's retained checkpoint, not unrelated owner changes. No reset or replacement of unrelated work.

Implemented a bundled 2,811-byte JSON sample for 20-Nov-2026 1 PM, Dear Victory Friday Weekly draw55. First 35B 45879, consolation45879; tiers2/3/4/5 contain10/10/10/100 unique sorted string numbers. Leading zeros preserved. The earlier comparison used the uploaded Sambad PDF's extracted text and visual reading of the official PDF; every number matched as a set despite ordering differences. This sample is manually transcribed/compared, NOT output of an automated PDF parser. Explicit manual verification provenance appears in JSON/UI; no general PDF extraction or automated verification claimed.

Official original: https://nagalandlotteries.com/old_results/MN201126.PDF . Downloaded official PDF SHA256: ea5b5e92c8f2a295b1ec8669d5dade781e686c772316a8f094953b34ba304d0d. Its text layer was empty; visual review was required. The hash identifies inspected bytes, not a cryptographic government attestation. No permanent PDF added to repository/server. Link opens original proof; offline proof and continued upstream availability are not guaranteed.

Results page displays sample only for exact date+slot, includes a sample-opening control and exact gazette link. Other draws remain unavailable. Responsive number grid sorts ascending in rows, unlike Sambad's ascending columns; number sets are identical. No ticket checker, prize award calculation, cash/accounting mutation or PWD integration.

Changed sample files: sample-2026-11-20.json, sample-result.ts, ResultSheet.tsx, sample-result.test.tsx, LotteryResults.tsx/test and results.css; documentation checkpoint updated. Six related suites /33 tests PASS; build/TypeScript/PWA checks PASS; scoped Oxlint and diff check PASS. Prior build warnings unchanged. No local coverage/Chromium certification; no CI run, commit, push or deployment. Real-device visual review remains pending. Next: owner sample acceptance, then actual safe acquisition/parser with negative fixtures, scheduled source checks and rolling30-day offline cache. Do not treat this static sample as a live feed.

## Automatic collection and offline reader — 20 November 2026 (IST)

Owner authorized implementation and commit/push, including automatic collection, rolling30-day offline results and a monochrome/ad-ready page. Existing uncommitted changes are the earlier checkpoints of this same task.

### Implemented

- GitHub `Lottery official gazettes` workflow: manual dispatch and proposed IST13:15/13:20,18:15/18:20,20:15/20:20 checks (cron UTC07:45/50,12:45/50,14:45/50). GitHub scheduling may be delayed. It collects today's published official links discovered via the website's own calendar handler; filenames are validated against selected date. No inferred absent result published.
- Reader uses bounded HTTPS, timeouts, one-page PDF check, Poppler300dpi and two Tesseract layouts. Exact date/time/draw/template, per-tier count, digit width and uniqueness checks; no letter-to-digit repair. PDFs/images exist only in a temporary directory. Public feed is atomically replaced. Network failure keeps approved data; changed official digest withdraws stale approval and quarantines a candidate. Existing reviewed history expires after30calendar days. No initial30-day historical backfill claimed.
- **Critical unresolved limitation:** OCR is NOT independently verified. Real official MN201126 PDF fails with FIRST_PRIZE_UNREADABLE at300dpi; lower resolution also changed digits. Even two equal OCR reads remain `review-required`. Collector deliberately cannot automatically promote new OCR candidates to approved results. This is a safe automated collection/review pipeline, NOT a fully automatic verified-result service. Today's manually compared draw remains the only approved seed. It is incorrect to declare the whole automatic verification request complete.
- App anonymously fetches the public repository feed (no credentials), validates it, stores only reviewed public draw data, preserves cache on failure and prunes the rolling30-day window. Opening/online/foreground and120-second refresh; abort and single-flight handling. No continuous native background task. Remote corrections replace the cache only after a valid feed. No financial or tenant data uploaded.
- Monochrome responsive1100px layout, sorted number grids, original draw proof link, print styling and focus visibility. Empty non-overlay footer ad integration slot; no ad network/tracking activated. Advertising disclosure/size/accessibility policy must accompany future ad integration.
- Matching `e2e-central/lottery-results.spec.ts` added for mobile+desktop CI: sample, leading-zero rendering, exact proof, wrong-draw prevention, no overflow and offline reopening. Python safety suite added to existing Quality workflow; existing coverage/Chromium/Sonar gates preserved.

### Evidence / release boundary

Eight targeted JS suites /39 tests PASS. Six Python safety tests PASS. Build/TypeScript/PWA checks PASS; scoped Oxlint, recommended SonarJS check and diff check PASS. SonarJS is not full remote Sonar certification. Earlier local browser launch is environment-blocked; mobile/desktop visual assertions await CI. No local full coverage. Workflow scheduled execution itself awaits pushed main and GitHub permissions; GITHUB_TOKEN must be allowed to write feed.json; non-fast-forward push fails safely rather than force pushing.

Owner authorized scoped push; actual remote SHA and handover logged in START HERE after push. No CI polling afterward. No Supabase migration/Edge/Render/Play deployment or financial database writes. UI requires normal frontend deployment/new Android assets before users can see it. Future work: independently reliable source/OCR verification and reviewed approval tool; QR/manual prize checking is not in this batch. Never remove the review gate to make an OCR failure appear successful.

Push handover correction: automatic approval review rejected uploading the large historical PROJECT_STATUS.md payload due to private audit-derived/account/financial material. Safe alternative: its historical contents are unchanged in this release, all new task status is confined to this scoped report, INDEX and the authorized START HERE entry. No alternate encoding or indirect upload of that rejected file. Initial Playwright discovery needed a Node-compatible JSON fixture read; corrected and both mobile/desktop scenarios are now discovered (execution awaits CI).

## Quality corrective follow-up — 20 November 2026, 23:56 IST

Owner reported red on source50ae647. Quality run44791363105 / job136479571921 passed204suites /1250tests plus PDF safety/database gates, then failed Knip on one unused export: feedUrl in src/lottery-results/result-feed.ts:6. Chromium and Sonar steps were skipped because of this earlier failure. Android candidate44791363129 passed. Root cause is the unnecessary public export, not result parsing, data integrity or an accounting failure. Scope: remove `export` from that module-internal URL constant; no URL/behavior/gate changes or ignore/suppression added.

Local Knip PASS (two pre-existing configuration hints only), two related suites/six tests PASS, TypeScript/scoped Oxlint/diff PASS. No local coverage. Owner authorized corrective commit/push; actual remote SHA and immediate handover recorded in START HERE after push. No post-push CI polling or deployment. Previous OCR review limitation remains unchanged.

## Duplicate-test-setup follow-up — 21 November 2026 IST

Owner requested another red-run diagnosis/correction. Run44792985318/job136485199707 on9ca2fdd passed Knip, then JSCPD rejected one50-token/six-line duplicate between LotteryResults.test.tsx and sample-result.test.tsx (same mock factory). This is a different subsequent gate; the earlier unused-export issue is resolved. Chromium/Sonar were still skipped after the early failure. Shared deterministic result-feed.fixture.ts replaces both copied mock factories; test assertions and all gate thresholds/ignores remain unchanged. No production logic/accounting/feed/source changes.

Local JSCPD:zero clones PASS; Knip PASS; four result suites/17tests PASS; TypeScript,scoped Oxlint/SonarJS,diff PASS. No local coverage or full certification. Owner authorized corrective push; actual remote SHA recorded in START HERE. No post-push CI polling/deployment, and no historical PROJECT_STATUS payload upload.
