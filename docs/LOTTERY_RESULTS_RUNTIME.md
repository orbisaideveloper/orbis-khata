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
