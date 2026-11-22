# Lottery Results runtime

## Scope and source identity

Lottery Results is independent of accounting. No payment, company balance, sale, PWD or customer financial record is written. Manual entry uses the visible selected IST date and slot as the paper-ticket draw. Users must match the printed ticket date/time. Series and number alone do not identify a ticket's printed date. The response must match every submitted field; another draw is never substituted.

Dear1PM/8PM are Nagaland; Dear6PM is Sikkim. Sambad identifies all three as `lottery=dear`; its `lottery=sikkim` is the separate Labhlaxmi family. Supported history is today plus29previous IST dates. Plain-number QR parsing still requires selected-draw confirmation; actual printed QR date/time extraction is NOT certified.

## Private full-draw cache

The ticket Edge now requests `/v2/dear/result` once for a missing draw and stores a strictly normalized full result in `lottery_private.draw_cache`. Six tiers, documented match modes and exact counts1/1/10/10/10/100, unique zero-preserving number strings, positive integral prize amounts, first/consolation consistency and date/slot identity are required. Missing/incomplete/unpublished data cannot become `no_prize`. Matching prioritizes first prize, consolation, second and then lower tiers. Private cached data is revalidated on every use.

Only individual ticket verdicts or public PDF link metadata are returned to phones. Full datasets never enter public GitHub feeds, app responses, localStorage or logs. Provider token and Supabase service-role key remain server-side. Published cache rows are reused until the30-day retention boundary; cleanup never touches financial tables. The Python validator is a diagnostic counterpart; the TypeScript validator serves the Edge runtime.

Both ticket and document requests use one database-backed lease system. An outstanding45-second per-draw lease prevents duplicate collectors across isolates. A singleton provider gate prevents overlapping requests and enforces at least2.1seconds after completion, protecting1/second and30/minute quotas. Expired leases recover after worker failure; stale acknowledgements cannot replace cached data. Provider429/authorization failures impose persistent global backoff. This is request control, NOT a capacity/SLA guarantee. External diagnostic API calls using the same token are outside the gate.

## PDF collection and phone refresh

Existing public `documents.json` remains a backwards-compatible source of verified links. PDFs open on their original hosts; the server stores JSON and link metadata, not complete PDF copies. Links are opaque and never constructed from filenames. A new link must be HTTPS, match an allowed Sambad host, have no credentials/query/hash, and return a PDF signature without redirects. Response size/time limits and stream cancellation prevent a full PDF memory download. PDF availability is separate from complete JSON availability; valid JSON remains usable if its PDF is pending.

For a missing selected draw, ResultSheet calls the public metadata-only `/orbis-lottery-ticket/document` sibling route with `{action:'document',date,slot}` on opening and every30seconds while visible until a link is available. The PDF button can request the same recovery and opens the validated URL in a user-initiated window. Concurrent requests reuse the cache/lease. Pending, busy and unavailable states remain explicit; selecting a different draw aborts stale UI work. No account balance operation is invoked. Old frontend ticket requests remain compatible. Ticket verdicts retain central authentication; anonymous PDF viewers can request only selected public link metadata, never the result dataset.

Official gazette links retain independent government validation and existing form behavior. Government files that return404 or cannot be validated remain unavailable. The central collector in this change gathers Sambad data/PDFs; it does not claim to repair an unpublished government file. The manual official-only workflow can recheck government links. Nagaland index filenames do not establish PDF availability; Sikkim6PM uses its selected-date archive POST rather than guessing a Nagaland filename.

## Independent scheduler and missed-draw recovery

`orbis-lottery-collector` accepts only a dedicated256-bit worker token held in Supabase Vault; its hash is stored privately. It does not accept browser origins, user tokens, arbitrary target URLs or request-selected draw queues. A database worker lease coalesces duplicate ticks. The worker selects at most one due pending draw per invocation, prioritizing the current draw within its publication window and otherwise the least recently attempted missing record across30days. Future draws are excluded. This bounded queue avoids losing a6PM draw merely because8PM became current.

Supabase Cron calls `lottery_private.tick()` every30seconds. Tick only dispatches during IST13:10–13:30,18:10–18:30,20:10–20:30, plus bounded history catch-up at minutes05/20/35/50 outside those windows. Cached complete draws need no provider request. Cron registration is deliberately a separate activation step after deployment. `pg_net` HTTP calls have a25-second timeout. Cron and on-demand requests share all collection locks and quotas.

The old GitHub workflow is now manual-only, tests collector safety and rechecks government links. It no longer makes automatic Sambad API requests. A green GitHub Quality run is not evidence of a scheduled result tick.

## Deployment and rollback

Local source preparation does not activate production. Required order after owner authorization:

1. Apply `20261121145334_lottery_draw_cache.sql`; inspect role grants/RLS and source-only tables.
2. Apply `20261121145730_lottery_scheduler.sql` (`pg_cron`, `pg_net`, existing Supabase Vault required).
3. Deploy matching `orbis-lottery-ticket` and `orbis-lottery-collector` with gateway JWT checks disabled only because each handler performs its own central-user or dedicated-worker authorization. Retain `SAMBAD_API_TOKEN`, existing central verification settings/origins and built-in Supabase server environment. Never copy service credentials to clients or GitHub logs.
4. As the database owner, call `select lottery_private.start_scheduler('https://PROJECT.supabase.co');`. This creates/reuses a dedicated Vault secret without returning it and registers exactly one named cron job.
5. Verify actual cron execution, safe worker logs, exact draw cache status and live API/local positive+negative equivalence before declaring acceptance. Deploy frontend/new Android assets separately.

Rollback: `select cron.unschedule('orbis-lottery-collector');`, restore the prior ticket Edge and prior frontend. Leave private result cache for inspection; no financial reversal or destructive migration is necessary. Stop scheduling before revoking functions. Do not delete an existing unrelated Vault secret.

Local SQL acceptance runs in isolated PGlite. Native32-request lease concurrency has a separate localhost-only PostgreSQL CI check; PGlite is not concurrency certification. Cron extension/runtime, real-provider JSON and actual installed Android acceptance must be reported separately from mocked tests.

## Presentation and data conditions

ApprovedB uses a light top and soft blue depth toward the bottom, one continuous background, compact header/back/Modules/language, ticket search above PDF actions and a persistent translated prize-verification disclaimer. Dear logo is the unmodified distributor asset from `https://tigerassociates.in/assets/img/dear-lottery-logo.png`. The ad slot remains empty until a separately approved integration. Scanner remains a centered modal with focus restoration, native-back handling and media cleanup; no scan photo is uploaded.

Provider documentation supports private database storage but restricts dataset/API/feed redistribution. This implementation returns only a single verdict or public link, never the stored result dataset. Attribution/license text and API overview differ; no new legal agreement is accepted by this source change. Full phone/offline dataset delivery is outside this scope.

### SQL fixture integration

The full Phase2 migration-chain acceptance harness uses the same explicit Vault/Cron/net test doubles as the dedicated scheduler test when applying the scheduler migration under PGlite. Only its two exact extension-install statements are replaced; the scheduler tables, function bodies and permission statements still execute. No production migration is skipped or changed. Native PostgreSQL concurrency and live Cron evidence remain separate gates.

Native cache concurrency setup reserves one PostgreSQL connection while executing the migration's explicit BEGIN/COMMIT, then releases it before the32-connection race. Applying transaction-control SQL directly through a multi-connection pool is rejected by postgres.js as UNSAFE_TRANSACTION; the pool remains32 for the actual contention assertions.

### Quality run 44930533181 follow-up

All SQL, native concurrency, coverage and Chromium gates passed; strict Sonar
stopped on eight source findings (coverage 90.5%, duplication 0%). Clarify popup
cleanup control flow, use implicit output status and dedicated null assertions,
replace the single-candidate worker loop with an explicit branch, read the
bounded PDF signature recursively, and extract gateway input parsing. The
request contract, cache leases and security checks remain unchanged. Targeted
regressions include fragmented and truncated PDF streams. No database migration
is required. Runtime Edge sources should be included in the next deployment
after CI review; this corrective push does not deploy live services.

## Physical ticket QR recognition — 22 November 2026

The scanner now recognizes structured printed Dear ticket text (state, game,
IST draw time, draw number, DDMMYY date, series and five-digit ticket number).
The supplied Sikkim6PM sample was decoded locally and matched its printed fields;
its valuable ticket image is not included in this public repository. Raw QR text
is bounded and parsed locally, never followed as a URL. Malformed dates/series,
wrong state/slot combinations and tickets outside the30-day window are rejected.
Other physical ticket formats remain unverified until samples are available.

A structured scan selects its date/slot in the result page, retains the decoded
series/number and displays confirmation. The user explicitly presses Check number.
A bare series/number QR still uses the visibly selected paper-ticket draw. A
structured scan cannot be checked under a different unapplied draw. Changing draw
resets ticket state and aborts stale work; existing verdict validation rejects any
response with a different date, slot, series or number. Service failure remains
unknown, never a losing ticket.

Camera capture requests rear-facing high-resolution video, decodes the central
square guide before the full frame, and continues after unrelated QR text. Modal
feedback, playback, close/back/hidden-page cleanup and late-callback guards remain.
This changes frontend code only: no new migration or Edge deployment is required.
Image decoding/unit tests do not certify a live Android camera; physical-device
acceptance is still required before a signed release. Exact local checks and pushed
SHA belong to the existing Runtime, CI Repairs & Release Log in Drive.

### Quality duplication follow-up and offline boundary

Quality44980700886 passed its tests but stopped at JSCPD: two scanner test
setups repeated76tokens. Extract their shared camera-start helper; keep every
assertion and the zero-duplication gate. A navigator-offline regression verifies
QR field extraction without calling the ticket service. Installed Android assets
and the PWA's previously installed static shell include the decoder. A first-ever
web visit still needs the shell downloaded. Ticket result verification currently
needs the authenticated server; the private complete-draw JSON is not downloaded
to the phone, and offline QR recognition is not offline prize verification.

## Approved B design — local checkpoint, 22 November 2026

Header reads ORBIS Khata; the Dear brand row reads Dear Lottery Results and
30-day results/Sync (or honest offline status). Results-only CSS gives Modules
and Language identical responsive width and44px height. Native date/time controls
cover their full field, keep the system calendar/options and use an outer
focus-within ring rather than an inner square. Their Android interaction and
actual visual dimensions still require browser/device acceptance.

The documents heading is removed; Sambad PDF and Government Gazette remain paired.
LiveDraw appears above them and uses the current IST day independently of selected
historical results. Its visible target switches to6PM at17:50 and8PM at19:50;
the morning target is1PM, including12:50. A15second timer and visibility refresh
update the label, never the user's ticket/PDF selection. This is a target label,
not evidence that a video is live. Existing QR dialog and exact-draw ticket checks
are unchanged; no accounting or shared module CSS is modified.

VIDEO ACTIVATION LOCAL IMPLEMENTATION READY: owner reports YOUTUBE_DATA_API_KEY
saved in Khata Edge Secrets. New orbis-lottery-live endpoint and private singleton
live_cache migration are released after owner approval: migration20261122112424 applied, Edgev1 ACTIVE. Shared35second lease,
60second refresh and10minute failure cooldown protect cross-isolate quota.
Search for upcoming/live videos only in each draw's -10/+20minute window;
outside it use channel uploads plus batched video metadata. Maximum90 shared
searches/day if constantly requested (project quota still applies). Responses
must match channel,title date/slot,public embeddable video and actual/scheduled
start window. Ambiguous/missing metadata is unavailable, never inferred live.
Front-end checks exact draw/ID and90second freshness, opens a modal YouTube iframe,
labels upcoming/live/ended separately and removes the player on close. No raw
video download/rehosting. Live status includes broadcaster pre-show; actual game
start is not inferred. Public endpoint is metadata-only, no financial/auth changes.
Real provider acceptance returned today1PM videoGt05c6Akz8k as completed; actualStart2026-11-22T07:25:28Z (12:55:28IST). This is broadcast/pre-show start, not proven game start. Frontend Render deploy remains owner-operated.

Setup: create/select a Google Cloud project, enable YouTube Data API v3, create
an API key restricted to that API, then keep it only in the future server/Edge
secret YOUTUBE_DATA_API_KEY, never VITE variables or source. The consumer is implemented locally but not yet deployed. See Google's
https://developers.google.com/youtube/data/getting-started . No key is required
for local layout tests. One shared server lookup/cache should serve many viewers;
actual/scheduled start times must remain distinct from upload publication times.

Owner subsequently approved commit/push, migration and Edge release. Detailed local
checks and remaining live/device acceptance are recorded in the existing Drive
Runtime, CI Repairs & Release Log; Start Here is not expanded.

### 2026-11-22 — Strict Sonar follow-up for B live layout

Quality run 45017348136 on 6ead187 failed only the strict zero-open-issues step: four CSS S4666 duplicate selectors, TypeScript S6582 optional chaining, and S7773 Number.NaN. The Sonar quality gate, mobile smoke, and Android candidate passed; coverage was 90.4%, duplication 0%, and unreviewed hotspots 0. Consolidated the four selectors while retaining their effective property values and replaced the two TypeScript expressions with equivalent forms. Gate thresholds and exclusions remain unchanged. This repair needs no database migration or runtime configuration change. Local targeted tests: 25/25; TypeScript and scoped lint passed. Remote certification remains pending after the repair push.
