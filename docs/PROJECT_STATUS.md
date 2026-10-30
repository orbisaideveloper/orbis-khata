# 2026-10-28 — Accounting v3 release candidate

Local verification: 489 tests /70 files PASS; coverage statements91.04,
branches87.70, functions90.35, lines92.43 with original thresholds. Typecheck,
lint, KNIP, JSCPD0, build/PWA pass. Local Sonar complexity/nested-regex checks0.
Earlier browser run19/20 plus fixed bill PDF mobile/desktop2/2 PASS; final full
browser run in progress. SQL migration and authenticated rollback fixture PASS,
including negative historical stock, partial settlement, exact retry, audited
correction, tenant rejection, retire/restore and expired-company purge. All SQL
experiments rolled back; no live migration, Edge or frontend deployment yet.

Scope: date presets; configurable account and invoice number settings; atomic
sale/purchase settlement and roundoff; signed stock and historical dates; safe
business error reasons; compact party/expense ledger, PDF/XLSX exports, detail
and audited edit/delete; company retirement with30-day restore and private daily
purge. Figma read worked, later plan cap prevented new Figma design. Existing app
style retained and browser tested. Source baseline main80aa957; owner explicitly
authorizes main push and repair until CI green. Render deploy stays owner-owned.
Do not deploy frontend until database migration and matching Edge are installed.

# 2026-10-28 — Accounting completion started, local checkpoint

Owner expands ledger, dates, configurable numbering, negative stock/historical
entries, atomic invoice settlement, correction/delete, account settings and
company retirement. See ACCOUNTING_COMPLETION_CHECKPOINT.md for exact pending
scope and resume instructions. First local slice adds reusable report date presets
and wires them to Home/Accounts/ledger/stock/expenses. Targeted 29 tests pass.
No push, database change or deployment; baseline main remains 80aa957. Entire
accounting completion is NOT finished. Preserve current source on resume.

# 2026-10-26 — Card/ledger release verified green

Main commit 80aa957c9e54d6f6bc54802920b22968a50706d0 is pushed. Actions run
40371513800 is SUCCESS, including 452 tests, 20 mobile/desktop browser cases,
coverage and strict Sonar. Summary -> complete due list -> scoped ledger is
verified; Home, back, refresh and independent Ledger paths remain available.
No API/DB migration, financial write or frontend deployment occurred. Render
production deployment remains pending explicit authorization. This is a local
post-CI checkpoint; no extra documentation-only commit is made.

# 2026-10-26 — Summary card drill-down and simple ledger navigation

Owner asks for tappable receivable/payable/expense cards leading to every matching
party/account, then its ledger, while retaining the independent Ledger menu.
Implement a distinct overview navigation page so Home/brand/back reliably return
to the dashboard. Receivables list positive customer dues; payables include positive
supplier dues plus grouped unpaid expense bills/opening dues. Card sums use those
same complete rows: an unrelated party's advance does not reduce another's due.
Advances and signed journal balances remain intact in the underlying ledgers.
Due lists are as of the selected end date; expenses are for the selected period.

Cash/bank details load every voucher and expense page, show money in/out and
opening/closing balances, and link counterparties to their ledgers. Corrections
retain their signs and IDs. The demo expense report now preserves a reversal's
original payment method, matching production and preventing missing cash rows.
Party-selected ledgers avoid unrelated inventory/expense requests; list/detail
navigation and company/date/version guards prevent stale records. Ledger names
and transaction columns are compact rows. Add a balance-refresh action and preserve
all prior standalone accounting/stock/expense screens.

Local verification: 452 tests and coverage PASS (S/B/F/L 91.92/89.65/91.98/92.32%).
Full mobile/desktop suite 20/20 PASS; subsequent party-table/Home navigation polish
passes targeted unit and both overview browser cases. Typecheck/lint/KNIP and
JSCPD zero duplication pass. Review actual mobile list and ledger screenshots.
Remote CI remains the final exact-commit verification. No database migration,
API deployment, financial posting or central-ID change. Bill-inline payment is
not part of this read/navigation slice. Production frontend deployment still
requires the explicit owner approval requested after prior auto-review rejection;
no deploy attempt or workaround is made here. Termux sync stays deferred.

# 2026-10-26 — Compact masters, bill settings and local PDF sharing

Owner requests aligned party/item columns, compact edit/delete symbols, optional
bill design under settings, shareable invoices, and a smaller update notice.
Implement semantic master tables (party name/category; item name/unit/rate), retain
telephone dial links, keep labelled icon actions and both deletion confirmations.
Design choices live in collapsed Bill settings and remember only the display
preference. Update notices can be dismissed without forcing reload or discarding
unfinished bills; offline/error guidance is retained.

PDF preparation renders the chosen bill pages locally, including Bengali glyphs,
with lazy-loaded html2canvas 1.4.1 / jsPDF 4.2.1. File sharing is invoked only by the
user through the native chooser; unsupported devices can download and attach the
PDF in WhatsApp. No automatic sending or external upload. Bundle Noto Bengali
fonts and their OFL notices. Long-bill page export is sequential to limit memory.
No account, tenant, migration, financial calculation or central-ID change.

Verified local: 443 tests PASS; full mobile/desktop browser suite 18/18 PASS,
including real PDF creation/download and no horizontal overflow. Visually reviewed
compact lists and rendered A4 Bengali PDF; initial missing-glyph defect corrected
with bundled Sans and Serif faces. Typecheck/lint/KNIP and JSCPD 0.00% PASS; npm
audit 0 vulnerabilities. Final local coverage PASS: statements 91.83%, branches
89.96%, functions 92.00%, lines 92.32%; thresholds unchanged. Remote CI remains
pending for this candidate. Native WhatsApp app delivery is owner/device acceptance, not a claimed
automated send. Source is prepared on Khata main only, no staging/PR or API/DB
mutation. Render deployment remains separately authorized; prior automatic review
rejected an ambiguous production deploy and was not bypassed.

# 2026-10-26 — CI trace diagnosis and complete protocol fixture repair

CI 40336662539 failed because the signup mock returned company rows for masters
and inventory-report. The artifact trace records DemoWorkspace reading an undefined
parties.length; the heading timeout was a symptom. The prior assertion-only fix
was incomplete. Local fixture handlers existed but were absent from the pushed
file. Compare against current main and add the two correct response shapes there.
Refuse unsupported mock operations and assert no browser page errors plus the
loaded Parties 0 dashboard. Full local mobile/desktop browser suite: 16/16 PASS.
No retry, timeout, coverage threshold, test exclusion or production code change.
Native gates already passed for this product source. Next: push this exact fixture,
verify all remote gates including strict Sonar, and finish the scoped release.

# 2026-10-26 — Production save correction CI follow-up

Commit 31f854a is pushed and gateway version 7 ACTIVE; unauthenticated POST is
401 KHATA_LOGIN_REQUIRED. Real postgres@3.4.7 wire-protocol probe confirms the old
parameter is JSON text and tx.json preserves objects/optional fields. No customer
fixture retained. CI 40328924291 passed native gates including coverage and 15/16
browser checks; mobile signup still searched the obsolete ORBIS / Test shop text.
Change that assertion to the exact company heading, preserving signup/reload/
ownership checks. Targeted mobile and desktop signup both PASS locally. No product
code, API deployment or gate threshold change in this follow-up. Next: green CI
and strict Sonar, then owner manual Render deploy and real-account acceptance.

# 2026-10-26 — Live save transport and phone contact correction

Owner reported that the new green production UI opens but party/item saves fail.
Render is confirmed live at b26ecde; Edge logs at 12:48–12:52 UTC show POST 422
and product-database PostgresError. Empty optional item fields and party contacts
both succeed through the authenticated database role inside rollback transactions.
Postgres.js 3.4.7 infers jsonb parameters and JSON-serializes them; pre-stringifying
RPC inputs encodes an object as JSON text. Replace those four JSON RPC boundaries
with tx.json(object/array), including expense and inventory commands. JWT claims
remain text for set_config. No schema, grants, tenant boundary or financial history
change is required. Old double-encoded payload rejection was reproduced in SQL.

Add dial links in the party list and edit form. A supported browser may offer a
user-invoked Contact Picker for telephone numbers only; unsupported browsers retain
manual entry. Cancellation keeps the current number. No automatic calls or contact
book upload. Add an actual Edge-entrypoint transport regression harness, contact
permission/cancellation tests, and browser dial-link assertion.

Current authorization: owner explicitly asks assistant to repair and commit/push
this task as before, then provide Termux synchronization steps. This is within
Khata main only; no cross-product changes, staging, PR or force push. Manual Render
frontend deployment remains the owner step. Final CI/deployment evidence follows
verification; this checkpoint does not claim unrun gates or real-device acceptance.

# 2026-10-26 — Release completion evidence

Main b26ecde8f70db246d6ab8819ee12ab9ccc082698 is pushed. GitHub Actions run
40319841728 succeeds: 430 tests/51 files, 16 browser scenarios, native gates and
strict Sonar pass. Open issues 0; unreviewed security hotspots 0; Sonar coverage
91.1%, duplication 0%. All 120 original findings were corrected without policy
reductions. Gateway source aligned as ACTIVE version 6; migration 20261026081216
remains applied. Unauthenticated final API probe returns 401 KHATA_LOGIN_REQUIRED.
Frontend Render remains manual and was not deployed; next exact owner step is
Manual Deploy -> Deploy latest commit b26ecde. Future pushes remain Termux-first.
The user-facing final report holds this post-CI evidence; no extra documentation-
only remote commit was made after the verified green source commit.

# 2026-10-26 — Strict Sonar corrective candidate

Main has feature commit 4463c94 and diagnostic commit e8a1f39. The first run passed
all native/browser gates and Sonar standard quality gate, but strict zero-open-
issues failed with 120 findings. Source corrections now address every listed rule:
extract accounting/invoice validators and command builders, remove unreachable
form-preview branches, stabilize Context values and ledger/paper row identities,
use native status output, avoid unsafe object coercion and regex backtracking,
and add explicit assertions to the three scenario tests. No rule suppression,
issue dismissal, threshold reduction or accounting/data contract change.

Local: 430 tests / 51 files PASS. Coverage S/B/F/L 91.67/89.90/91.81/92.07% PASS;
PaperPreview padding-identity follow-up test PASS. Typecheck/lint/KNIP and JSCPD
0.00% PASS. Local SonarJS checks for the reported complexity/nested-condition/
regex/conditional-block rules: zero findings. Mobile eight browser scenarios PASS;
desktop eight PASS on the isolated rerun after a dev-module loading timeout.
Production migration 20261026081216 and gateway v5 remain active. No further DB
migration or financial mutation in this repair. Next: push one coherent correction
onto e8a1f39, verify actual strict Sonar and CI, then align the gateway source.
Render web deployment stays on hold until strict CI is green.

Owner reiterated Termux-first pushes. They authorize completion/corrective pushes
for this already-pushed session only; future default remains owner Termux. No PR,
new branch, staging, force push or frontend deployment has been authorized here.

# 2026-10-26 — Live masters/billing release candidate verified

Owner explicitly authorizes assistant commit/main push and Khata migration for
server trial. Target main; verified parent 768fec21a3bd31f0b087438c2a7a0a6d54810567.
Reviewed UI is connected to authenticated cloud masters and precise bill commands.
Party phone/email/address, credit terms and dated due/advance persist; item name/unit
are required, code/rate optional. Master edits refresh the current company only.
All exposed delete controls require two confirmations. Unused masters are deleted
and audited; opening balances or transaction history block destructive deletion.
Uncertain bills retain their exact ID/payload and can retry only in their company.
Central identity and immutable financial history remain unchanged.

Verification: Ubuntu 24.04, fresh npm-ci lockfile dependencies, Chromium 153 launch.
427 tests / 50 files PASS; additional live expense/recovery cases PASS (3 tests).
Coverage: statements 91.43%, branches 88.17%, functions 91.23%, lines 97.53%; all
existing thresholds pass without exclusions or threshold changes. Typecheck/lint,
KNIP, JSCPD (0 clones / 0.00%), build/PWA worker and npm audit (0 vulnerabilities)
PASS. Two existing KNIP configuration hints remain. Mobile/desktop browser Auth,
profile, session restoration/revocation, cloud master persistence and both delete
cancel points pass; PWA offline-shell checks pass after scoping the status assertion
to the offline notice. Browser protocol mocks prove wiring, not real account entry.
Physical printer and owner real-account acceptance remain pending.

Production changed with authorization: migration
20261026081216_khata_live_masters_precise_bills_v2 applied to Khata only
(gqyaxsczlmvppxuoqbox); gateway orbis-khata-data ACTIVE version 5. HTTP 401 without
login. Full transaction/rollback acceptance passed before and after migration,
including contacts/openings/payments, precise 3 x 33.33333333 = 100.00, idempotency,
expense line persistence and safe deletion. No fixtures retained. Counts preserved:
2 companies, 5 parties, 4 vouchers; 2 default godowns. See release-20261026/
PRODUCTION_ACTIVATION.md and the versioned SQL under supabase/migrations/.

This candidate is ready for the single authorized main commit/push. Remote Actions/
Sonar and Render web deployment are separate pending verification steps; they are
not claimed by local tests or the completed database/API activation. Next: push
with the expected-parent lease, inspect CI/Sonar, then owner/server trial.
Prior isolated-demo checkpoints below remain historical evidence.

## 2026-10-26 — Owner-requested A–Z demo trial and repairs
Completed 12 sequential actual React-control/DOM entry steps and 7 financial/exception
scenarios with fetch forbidden. Found and repaired new-company default warehouse,
rejected inventory atomicity, reversed expense-payment allocation, backdated negative
stock, dated stock reversal, expense-period reversal reporting, expense party ledger,
and selected-company restoration on Accounts remount. Financial expected values and
remaining production contracts are in docs/A_TO_Z_TRIAL_20261026.md.
Full native suite: 393 tests / 41 files PASS; 19 new trials rerun PASS after final changes.
Typecheck/lint/KNIP/build/PWA checks PASS; JSCPD 0 clones and 0.00% (two existing KNIP
ignore hints remain). Browser installation failed with corrupted/truncated downloads;
real mobile rendering, PDF and printer output remain unverified. Formal owner khata
verify and production integration are pending; no coverage/Sonar/deploy claimed.
Base remains 768fec21a3bd31f0b087438c2a7a0a6d54810567 in local copy. No Git or real
account/database/central identity writes. Next: run KHATA-TRIAL-UPDATE.py to review the
corrected isolated phone demo before production integration and final certification.

## 2026-10-26 — Party choice and aligned bill-entry table
Phone's uploaded full setup report confirms typecheck/lint and 43 tests PASS; existing
isolated localhost was updated. Owner reports empty party choices and rejects card-like
item rows. Source evidence: the list is filtered by bill role and the demo starts with
no parties (refresh resets data). Phone UI/root cause was not directly observed.
Made party choice a prominent company/role-scoped panel above bill number/date. Added
inline full PartyMaster creation with bill-appropriate category locked; newly saved
party is selected automatically and bill lines survive save/cancel. No wrong-role or
other-company party can be silently chosen. Existing full contact/credit/opening fields
are reused. Restored an actual visible-header, border-aligned item-entry table instead
of CSS card rows, preserving Add/Remove and bidirectional exact pricing. Also handles
an asynchronously arriving default warehouse instead of permanently keeping it empty.
47 relevant tests across nine files PASS; typecheck/lint PASS. UI/phone visual acceptance
remains pending; no native browser screenshot is claimed. No Git, production, real
account/database or immutable Central ID change. Base remains 768fec21a3bd31f0b087438c2a7a0a6d54810567.
Next: owner runs KHATA-PARTY-TABLE-FIX.py, reviews party selection, new party creation,
line table and preview. Downloads report mechanics preserved from successful repair.

## 2026-10-26 — Downloads reporting repair
Owner received exit1 receipt but no diagnostic attachment; uploaded installer again.
KHATA-DEMO-REPORT-FIX.py preserves the 49-file full UI payload and base guard.
Adds full exception tracebacks, explicit Downloads save errors, one report filename,
and a verified HTTP200 startup checkpoint so the same report is available while
foreground localhost remains running. Final stop/error updates that same file.
Mocked missing-repo failure and server-readiness/report timing tests PASS; Python
syntax compile PASS. Prior phone failure cause remains unknown until full report.
No phone, Git, production or real account mutation. Next: run new repair installer
and upload ORBIS-KHATA-DEMO-PREVIEW-LATEST-REPORT.txt from Downloads.

## 2026-10-26 — Full app front and three bill designs (isolated demo)
Owner clarified full-app visual scope. Read Foundation public lottery app shell/theme
and sample 70393.png; designed six editable mobile screens and three paper templates
in Figma, and implemented the coherent green/light demo shell, dashboard, masters/
ledger/expense/stock styling, mobile item-entry cards, design swatches, company bill
contact text, draft/saved printing and repeatable pagination. See APP_DESIGN_REVIEW.md
for exact Figma IDs, evidence, remaining production contracts and limitations.
43 targeted tests across nine files PASS; typecheck/lint PASS; KNIP and build/PWA
worker checks PASS (two pre-existing KNIP configuration hints). Phone browser and
physical/PDF print layout remain owner acceptance; Figma final combined six-screen
check was blocked by its Starter plan limit after dashboard/three-bill visual checks.
Base remains 768fec21a3bd31f0b087438c2a7a0a6d54810567; no Git write, deployment or real
account/data/schema changes. Next: owner runs ORBIS-KHATA-FULL-UI-DEMO-20261026.py,
reviews localhost once, then requests any final production integration/certification.

## 2026-10-26 — Compact Figma paper bill (demo only)
- Editable Figma: https://www.figma.com/design/a2NMZQeGrn0V15ZUUymKhK (720 × 960 paper, Noto Serif Bengali, clear blue table).
- Preview uses scaled paper sheets on mobile, repeated company/party headers, continuous item serials and final totals only once. Long item names use extra row space.
- Add row control directly below the edit table (existing 50-line document limit); removal preserves other rows and bidirectional pricing.
- Entry form stays normal touch size. No production DB, account, deploy, commit or push.
- Phone visual acceptance and printer pagination still require owner review.

# Sample memo layout and bidirectional pricing — 2026-10-26

Owner supplied 70393.png and requires its bill structure with the selected company's
name, quantity+rate→amount and quantity+amount→rate. Implemented a blue double-frame
memo, centered dynamic company heading, party/contact/date/bill header, five-column
line table, quantity totals grouped by unit, subtotal/BF/grand-total box and signature
lines. Review fits all five columns; editing keeps touch-friendly scrollable cells.
No sample business name/address, image or return policy is hardcoded.

Added exact integer billing math with six-decimal quantities and eight-decimal
unit prices. 3 units at total100 derives33.33333333 and posts exactly100. Rate/Amount
last-input authority is retained on quantity edits; zero/empty/invalid division
fails closed. Demo bill lines retain precise unit_rate in inventory/expense history.
Existing production command validation still rejects this new field; no live write
path was widened. Prior balance is captured on party/date selection, shown with
advance sign, and not reposted as part of the invoice. Dynamic newly-created company
name is covered by a full demo navigation regression.

Verification: 35 targeted tests across six files PASS (see final output for count);
typecheck, zero-warning lint, KNIP and production build/PWA validation PASS. KNIP
retains two pre-existing unused-ignore hints. No native browser/mobile visual
acceptance is claimed in this executor. Existing company/party/item data and
Central identity, main, staging and production were unchanged. No Git write,
cloud migration, deployment or real financial entry was made.
Next: owner updates the same isolated localhost preview with
ORBIS-KHATA-BILL-SAMPLE-DEMO-20261026.py, reviews the sample-matched bill and both
input directions; production adapters and the owner-controlled final release
remain pending. See MASTERS_BILLS_REVIEW.md.

# Optional item fields, party opening balances and invoice review — 2026-10-25

Owner's screenshots show required item code, duplicated code/name presentation
and the old amount-only purchase form. Owner explicitly requests a coherent local
review: only item name/unit required; optional editable code/rate; party phone,
contact/credit terms and prior balances/advances; a full invoice table and header.
Base remains main 768fec21a3bd31f0b087438c2a7a0a6d54810567.

Implemented isolated-demo ItemMaster, PartyMaster, InvoicePage and DemoWorkspace.
Name is displayed once; matching code is not echoed. Optional default rate fills
bill lines but remains editable there. Party metadata includes phone/address/email,
credit limit/days, and dated opening due/advance. Opening postings balance against
opening equity and do not create new income/purchases/expense. Customer/supplier
signs and prior expense payable settlement are tested. Used opening values/units
cannot be overwritten silently. A dual-role party chooses which relationship its
one opening amount belongs to; simultaneous independent balances need more fields.

Sale/Purchase from demo Accounts routes directly to a full bill page. Header shows
bill number/date and party/category/contact/address; table shows serial, item or
expense description, quantity, unit, editable rate, amount and grand total. Review
then explicit confirmation; expense lines persist separately and do not affect
stock. Suggested S/P/E numbers are company-scoped and read without render effects.
Demo request routing remains offline/in-memory; no real account session is used.

Local verification: 64 related tests across nine files passed before final
presentation assertions. Final 19 focused checks across five files, typecheck,
zero-warning lint, production build/PWA worker validation PASS. KNIP PASS with
two pre-existing unused-ignore configuration hints. Native browser/mobile layout
acceptance remains owner-verified; no Chromium executable is installed here.
Production contracts are intentionally not activated. Existing production UI still
uses the previous contracts; reviewed demo UI must be wired to the new production
contracts after owner acceptance. See MASTERS_BILLS_REVIEW.md for exact semantics
and remaining release integration. No assistant Git writes, staging, deployment,
production financial/schema writes or Central identity changes were performed.
Next: run ORBIS-KHATA-MASTERS-BILL-DEMO-20261025.py and review all three areas in
one local preview; then finish production adapters and the one owner-controlled
release workflow. Do not claim live/phone acceptance before evidence.

# Phone demo preview timeout repair — 2026-10-25

Owner uploaded ORBIS-KHATA-DEMO-PREVIEW-LATEST-REPORT.txt, run 23:33:31–
23:34:14 IST. Typecheck/lint and both demo store tests passed. Two combined
DemoApp UI tests reached their unchanged 5000ms per-test timeout on Termux;
the installer stopped before activating or starting the new demo. Source main,
production, financial rows and Central ID were not changed by that failed run.
Command receipts are execution receipts, not certification evidence.

Replaced the combined UI tour with six focused tests for contact creation,
contact rename, simple item creation, item rename, ledger item search and
beyond-first-page expense details. Ledger-only tests mount LedgerExplorer instead
of the full accounting workspace. No timeout increase, test skip or threshold
reduction. Installer now runs one jsdom worker instead of two. These are source
and test efficiency changes; actual phone success remains unverified until rerun.

Expense UI/report loads only when opened or when an expense needs recovery.
Added expense-pending.ts and initializes the expense lock from its validated
recovery record so the optimization cannot bypass pending confirmation/company
locking. Added a recovery regression test. Updated the invalid-amount test to
verify unrelated expense reports no longer run in the background. Item edit
assertion waits for the exact item row, avoiding duplicate hidden stock text.

Local verification: 53 targeted tests across six files, typecheck and lint PASS.
Phone verification remains pending.

Next: owner runs ORBIS-KHATA-DEMO-PREVIEW-FIX-20261025.py, then checks the Demo
banner at localhost. No new Git commit/push/deployment/database write was made.
The original main-only owner-controlled release workflow is unchanged.

# Isolated editable demo and unified Ledger — 2026-10-25

Owner clarified local review must allow creation/editing without any real account
or database association, while keeping localhost available before one final push.
Previous preview used live trial endpoints; it must be replaced with this demo.
Base source remains main 768fec21a3bd31f0b087438c2a7a0a6d54810567.

Implemented a development-only demo entry and in-memory data adapter. Demo starts
without Auth, uses a visibly marked demo company, supports companies, Customer/
Supplier/Expense contacts, simple item masters, name/code edits, guarded unit edits,
itemized purchase/sale at editable bill rates, godowns/opening/transfer, vouchers,
expenses and linked payments. Refresh/reset clears demo state; only demo recovery
keys are cleared, never real session or pending records. The transport branches to
the local adapter before token lookup or fetch. Production builds exclude the demo
owner and simulator. It is a UI simulator, not production SQL certification.

Added Ledger menu and unified search for parties, expense contacts/categories and
item codes/names. Selected details show scoped party entries/balances, expense
entries/due, or item stock/movements/bill rates. Pages are collected beyond the
first 50 records, with loading/error state rather than a silently partial result.
Item master screen has Name, Code and Unit only; no date/reference/note/barcode.
A default rate is deliberately omitted; bill line rates remain editable. Billing
and stock tools moved behind Ledger → Bills & godown stock. Demo party-name and
item edits do not add production edit APIs or mutate posted production masters.

Verification: simulator purchase10/sale2 gives8; changed sale rate85 gives170 for2;
expense100/payment40 gives60 due; duplicate retry does not duplicate stock;
oversell rejected; used unit edits blocked; reset clears data; fetch spy sees zero
network requests. UI test creates/edits contacts and items and searches Ledger.
82 targeted tests across ten files PASS, followed by both demo UI tests including
ledger search beyond the first 50 entries. Typecheck, lint and KNIP PASS
(KNIP reports two pre-existing unused-ignore hints). Production build/PWA worker
validation PASS with the demo environment flag explicitly enabled; no demo owner
or simulator sentinel in production JavaScript. Native browser executable is absent
in this executor, so no actual Chromium/mobile layout acceptance is claimed.
Phone owner review remains required. Full release certification/Sonar are pending.

Changed main/EntryApp, local demo adapter/app/tests, API demo routing, navigation/
menu, LedgerExplorer, Accounting/Inventory and CSS. Existing expense-party schema
review stays unapplied; production schema/gateway activation remains a later
release step. No assistant commit/push, staging, Render deployment, production DB
write or Central identity change occurred. Installer updates only a verified local
preview copy or starts a new isolated preview; original ~/orbis-khata is unchanged.
Next: run new demo installer, confirm Demo banner at localhost, owner review, then
combine final source changes and run the owner-controlled release workflow once.

# Simple party/item navigation preview — 2026-10-25

Owner requests a local review before one final source release. Base main is
768fec21a3bd31f0b087438c2a7a0a6d54810567. Local source now provides Parties,
Items, Expenses and Accounts in the workspace three-dot menu. Books shows one
section at a time; inventory separates item list, godown stock and bill history.
Party selection opens its ledger; Expense contacts open expense entry and appear
in its payee suggestions. Expense is a distinct party kind, never a supplier alias.

Read-only production evidence: the previously empty company has two new parties;
khata_items has zero rows across companies. The reported missing item has not
been durably saved. The two-stage item review/confirmation is covered by a new
regression test, including zero-stock master visibility. No item was fabricated.

Changed App/menu/navigation, Accounting/Expenses/Inventory UI, party model and
gateway validation, translations, CSS and targeted tests. Prepared review-only
expense-party.review.sql extends party kind and rejects trade vouchers for expense
contacts. It has NOT been applied or SQL integration tested. Matching gateway and
schema activation must precede live Expense-contact creation. Existing Customer/
Supplier and item operations use their unchanged current backend contracts.

PASS: 78 targeted tests across eight files, then all 24 Accounting tests including
a new preview-write guard; typecheck; lint. The isolated preview explicitly blocks
Expense-contact creation until its matching backend release. No full certification,
Sonar analysis or real phone/browser acceptance is claimed for this preview.
A foreground Vite server started in this executor on 127.0.0.1:5173. That address
is local to this executor, not the owner's phone. The supplied phone preview script
copies the owner checkout into a separate cache folder and applies this scoped UI
there, leaving main and working source unchanged. It runs visible checks, starts
foreground Vite and writes one final Downloads report after exit. It performs no
Git writes, cloud deployment or automatic financial writes. Production, Admin,
Central ID and staging remain unchanged during this UI work. Owner acceptance is
next; final commit/push and expense-party schema/gateway activation remain pending.

# Production expense and inventory activation — 2026-10-25

Owner authorized completing remaining activation to begin acceptance testing.
Authoritative main source: 768fec21a3bd31f0b087438c2a7a0a6d54810567;
GitHub Actions run 40212796558 and strict Sonar gate passed. Owner's Render
frontend deploy dep-dbf3740m7kps73fjo0kg is LIVE at that commit. No assistant
Git write, frontend deployment, staging or Admin/Foundation change was made.

Khata project gqyaxsczlmvppxuoqbox production changes completed:
- Migration 20261025165602 activate_expense_subledger_v1.
- Migration 20261025165618 activate_itemized_bills_inventory_v1.
- orbis-khata-data Edge version 4 ACTIVE. All four deployed source files
  exactly match the authoritative commit. Existing secrets were preserved.

PASS: twelve real database integration checks in a transaction, rolled back:
purchase total; exact same-ID retry; sale decrement; godown transfer quantity
conservation; oversell rejection; reversal stock restoration; expense retry;
partial payment and payable; balanced journal; direct write denial; other-owner
isolation; unmarked JWT read denial. Purchase 10, sale 2 yielded 8; expense
100 with bank settlement 40 yielded payable 60. No test financial rows remain.
All six new public tables have forced RLS. Central-to-legacy owner mapping
was separately verified preserved. Two existing companies, three parties and
four vouchers retain identical before/after row fingerprints:
companies 527259c9a8c6dab8cc1fe684eb778fc8;
parties ad7f057510d1d46004f61c1ac7012019;
vouchers 404cb63102065f734ad10cdbfb47a987.

HTTP: manifest and worker 200; Edge preflight 204; no-session request 401
KHATA_LOGIN_REQUIRED. Manifest JSON is valid but observed Content-Type is
binary/octet-stream; native phone installation remains unverified. No actual
owner-session end-to-end or login latency claim is made. Existing advisor
notes remain: private deny-all RLS tables, guarded SECURITY DEFINER RPCs and
project Auth password-protection setting. No guard was weakened to hide a lint.

Remaining acceptance: close old app windows/reopen, owner login, item and
warehouse creation, itemized purchase/sale, expense partial payment, menu and
tutorial toggle; verify PWA installation on phone. Legacy amount-only vouchers
do not imply stock quantities. GST, unit conversion, stock valuation/COGS,
complete inventory P&L and offline financial sync remain separate scope.
No new Termux installer, source commit or push is needed for this activation.
Only this local checkpoint document was edited after activation; it has not
been pushed to the owner's repository. Next action is owner app acceptance.

# Inventory retry storage hardening — 2026-10-25

Main 9f3900ad5bd298c92761deb0b8b2cf61551ebcc9 pushed successfully after
full local certification. GitHub run 40194902343 passes unit/coverage/build
and browser gates. Previous S3776 gateway complexity issue is resolved.
Sonar API reports one open tssecurity:S8475 at Inventory.tsx storage write,
flowing from pending.ts restore; new security rating B fails required A.
New coverage 96.7%, duplication 0.0%, other gate conditions pass.

Inventory retry storage now encodes the serialized command, matching the
existing voucher recovery pattern. Restore accepts encoded and legacy JSON,
bounds encoded/decoded lengths, and revalidates the full inventory command.
Existing pending commands are not deleted or assigned new IDs. Added tests
for exact same-ID retry, stored encoding, Unicode, legacy data, malicious
markup/extra fields, malformed encoding and size limits.
Local: 49 targeted tests, typecheck, zero-warning lint, KNIP and JSCPD PASS.
No financial/schema/auth changes, no security rule suppression or threshold
reduction. Phone full certification, owner-run commit/push and fresh Sonar
verification remain pending. No assistant remote Git/deploy/database writes.

# Deterministic accounting status assertion repair — 2026-10-25

Main remains 2a7bddf; gateway complexity fix is installed but not pushed.
The 16:25:34 phone certification passed; its subsequent fetch failed DNS.
Owner reran the installer at 16:43:04: 335/336 tests passed; the invalid-amount
Accounting test selected a global single status while both Loading expenses
and the intended invalid-amount output were present. Coverage percentages
were above threshold; the failing assertion, not the threshold, blocked release.

Reproduced the exact multiple-status failure locally by delaying the expense
report deliberately. Test now selects the intended visible output text, still
asserts no financial post and confirms Cancel closes the form, then resolves
the pending expense load. Similar ambiguous status assertions in both Accounting
test files now select their intended message. Production financial code unchanged.
Local red→green: reproduced original failure; all 32 Accounting tests, typecheck
and zero-warning lint PASS. Verification runner now preserves the complete
failed-stage log in the one final report instead of dropping errors above the
last 45 lines. No thresholds/timeouts were changed and no tests were skipped.
Next: guarded phone full certification and owner-run commit/push of gateway,
test and report fixes; verify fresh remote Sonar. No assistant Git/deploy/DB writes.

# Remaining gateway Sonar complexity — 2026-10-25

Owner pushed main 2a7bddf774bcf41d31e604312c18684fb3839871 after full local
certification. GitHub run 40184772142 passes tests/build/browser and standard
Sonar gate; strict zero-issue check fails on exactly one remaining S3776 issue.
Public Sonar API read confirms server-gateway.ts khataOperation complexity 18
(limit 15), reduced from 20 but insufficient in the first repair.

Refactor moves only operation validation into a boolean type-predicate
function with direct switch returns; the public envelope validator checks the
result once and returns the same operation/input object. This removes nested
ternary returns rather than merely extracting one compound condition. All
ownership, session, operation and financial payload rules remain unchanged.
Local: 24 gateway/inventory gateway tests PASS; typecheck, zero-warning lint,
KNIP and JSCPD PASS. No rule suppression or threshold reduction.
Next: owner runs guarded repair → full certification → commit/push, followed
by fresh remote zero-issue verification. No remote Git/deploy/database writes
performed by the assistant. Expense/inventory activation remains pending.

# Sonar issue repair — 2026-10-25

Owner pushed main c88e05819173fad7eda1a52945958b82aa7b871e.
GitHub run 40182058425: all 336 unit tests, coverage, lint, typecheck, build,
KNIP, JSCPD, browser tests and standard Sonar quality gate PASS. Strict overall
checker failed because 11 open issues remained. Uploaded Sonar detail report
20261025-153721 identifies all 11 across five source/test files.

Fixes: native output status notices (block layout preserved); extract shared
paged-report validation; assertion uses toHaveLength; explicit early-return
braces; new Error; item-line keys use complete line identity and duplicate
occurrence rather than array position; Unicode codePointAt; bounded six-digit
trailing-zero regex. No financial command/schema/auth contract changes.
Local: 50 targeted tests, typecheck, zero-warning lint, KNIP and JSCPD PASS.
No lowered thresholds, excluded source or suppressed rules. Fresh phone final
certification, owner-run correction commit/push and remote Sonar zero remain
pending. No remote Git write/deploy/database write performed here.

# Final release coverage repair — 2026-10-25

Phone certification 14:25:55–14:33:19 IST: Ubuntu preflight, KNIP, JSCPD,
14 mobile/desktop browser tests including PWA offline reopen, npm dependency
check, audit (0 vulnerabilities), lint, typecheck and build PASS. All 330 unit
tests PASS; final gate blocked only on global function coverage 88.37% < 90%.
Source/Git integrity PASS; baseline main eca4181. No Git/cloud/financial writes.

Added inventory UI tests for transfer quantities/destination exclusion, line
removal, item search, bill preview/print/close, pagination, failed-report retry,
edit cancellation and definite rejection recovery. Added API tests for exact
company/period/page scoping, reviewed command forwarding and uncertain errors.
Production financial logic, PWA/auth/cache and coverage thresholds unchanged.
Local: 25 inventory tests PASS; targeted inventory coverage S/B/F/L
93.83/89.80/98.91/98.16; typecheck and zero-warning lint PASS. These are targeted
figures, not global phone certification. Final full phone verification and
remote CI/Sonar remain pending. Owner pushes only after reviewed certification.
Expense/inventory migrations, gateway activation and live deploy remain pending.

# PWA source checkpoint — 2026-10-25

Baseline main eca4181; phone item installer report 12:21:52–12:23:26 IST
confirmed typecheck/lint, all 127 selected tests, diff and source integrity PASS.
PWA static cache, trilingual connection/update status, manifest/icon, production
worker checks and offline browser test added to the same uncommitted release.
Local PWA/related UI: 24 tests PASS; typecheck/lint/KNIP/JSCPD PASS; worker VM PASS.
Browser and final coverage/CI/Sonar/phone installation remain unverified.
No Git write, remote setting, deployment, migration or financial data change.
Next: install the reviewed PWA source on phone, then the existing final verify
runner (Ubuntu preflight → KNIP → JSCPD → Playwright → Termux → coverage last).
Owner pushes once only after certification. Expense/inventory cloud activation
still pending; this PWA does not make backend functions live or fix proven latency.

# Current checkpoint — 2026-10-25 pending inventory lock repair

Phone installer: typecheck/lint PASS, 126/127 tests PASS; recovery lock assertion
observed an unlocked company selector. Initialize the Books inventory lock from
the validated stored command immediately, before child effects/report loading.
The test now holds the inventory report pending and checks the lock both before
and after it resolves. Local 32 focused tests, typecheck and zero-warning lint PASS.
No timeout, assertion, coverage gate, financial rule or database data is relaxed.
Phone recheck and all previously documented cloud activation steps remain pending.

# Current checkpoint — 2026-10-25 items, stock and workspace menu source

- Baseline main eca4181b7349023457c7f5d96874ff766927b96b; GitHub quality success;
  owner manual Render deploy dep-dbepe3bncjis73f0kmfg confirmed LIVE at that revision.
- Prepared company item/code/custom fixed unit and godown masters; fractional
  purchase/sale bills, per-godown stock/period balances, opening quantity, godown
  transfer, bill history/view/print and existing-voucher stock-aware reversal.
  Bill/stock/party-dues updates are atomic and exact retries are idempotent.
- Prepared three-dot Account & profile/Tutorial/Log out menu, separate styled
  shared-profile page and tutorial default OFF with trilingual persistent toggle.
- New database objects have RLS, gateway+owner checks, immutable records, private
  privileged write boundary, emergency switch and no direct authenticated writes.
  No old book/owner/actor or Central identity is rewritten.
- Focused React/model/gateway tests, app TypeScript, zero-warning lint, KNIP,
  0.00% JSCPD and Vite build checked locally. Private PGlite 39 checks and mocked
  Edge adapter 11 checks PASS. Evidence is development validation, not live use.
- Updated central browser tests to open the new menu/profile route; those browser
  tests are not run here. Full coverage, final certification and new CI/Sonar
  remain required before release; thresholds/exclusions are unchanged.
- Live read-only schema check found expense table/RPC absent despite frontend
  deployment. Expense activation and new inventory migration/gateway/Frontend
  activation remain pending; do not claim either is working live.
- Prepared SQL: docs/inventory-v1.review.sql, NOT APPLIED. Gateway now requires
  inventory/model.ts as its fourth bundled file. See INVENTORY_ACTIVATION.md for
  limits, activation order, explicit approvals and practical owner acceptance.
- No remote Git write, managed migration, deployment or live financial mutation.
  Next: owner runs the source-only installer and uploads its one Downloads report;
  inspect phone result before final certification or release/activation.

# Current checkpoint — 2026-10-24 expense phone verification repair

- Owner phone expense installation completed, but its 22:24:28–22:25:41 report
  failed: 193/194 tests passed; storage-block test timed out after 5000 ms.
  Typecheck passed. Lint had one set-state-in-effect warning, not zero warnings.
- Test now spies on Object.getPrototypeOf(sessionStorage), the actual storage
  implementation, rather than assuming the global Storage constructor matches
  it on Android Node/jsdom. The synchronous blocking message is asserted directly.
  No test timeout, test count, coverage threshold or safety assertion is relaxed.
- Expense component derives invalid date-range/loading state during render and
  does not set React state synchronously from the invalid-range effect branch.
- Local focused accounting tests: 107/107 PASS; selected-source TypeScript PASS.
  Phone's complete 194-test selection and lint with deny-warnings still required.
- No financial rules, SQL, gateway authorization, deployed code, database rows,
  Git commit/push or Render configuration changes in this repair.
- Next: run the single repair installer, inspect the completed Downloads report,
  then continue the previously documented owner-controlled cloud activation.

# Current checkpoint — 2026-10-24 business expense source delivery

- Owner requested complete ordinary expense accounting. This slice includes
  named expense accounts, payee/reference/notes, direct cash/bank expenses,
  unpaid bills, partial/full settlement, period/category reporting, as-of dues,
  audited opposite-entry corrections and safe exact-ID retries.
- Expenses post when incurred; settlement reduces cash/bank and expense dues
  without posting another expense. No inventory valuation or net-profit figure
  is invented. Complete inventory/P&L and other accounting expansion remain separate.
- Added one immutable, owner-isolated expense event subledger and paired journal.
  Existing cash/bank and journal checks include expense postings. Existing
  company/party/voucher records and Central IDs are not rewritten.
- RPC writes require the real gateway transaction marker, owned company,
  enabled write control, exact amounts, valid dates and linked original entry.
  Company locks serialize settlement/reversal; overpayment and backdating before
  prior linked activity are blocked. Corrections preserve original records and
  historical as-of figures; reverse linked payments before an unpaid expense.
- Added Bengali/English/Hindi expense entry, review/confirm, custom account
  names, reports, bill settlement and explicit correction confirmation.
  Uncertain saves retain the exact command in scoped session storage for retry.
- Local targeted validation: 107 Vitest tests / 9 files PASS; 37 private PGlite
  checks PASS (including original accounting/owner isolation), 9 mocked Edge
  adapter checks PASS; selected-source TypeScript and lint exit 0.
  Fixture originals are preserved. These are not live financial acceptance tests.
- Working base main 5351b05a940c58586817275d8744edf7847faf0e plus installed
  owner bridge and speed fix. Owner phone speed report 21:34:58–21:35:49 IST:
  typecheck/lint, 97 targeted tests and diff check PASS.
- Expense migration docs/expenses-v1.review.sql is PREPARED, NOT APPLIED.
  Gateway expense RPC routing is PREPARED, NOT DEPLOYED. No live expense data,
  Git commit/push, Render deployment/plan or production database change here.
- Next: owner runs one Termux expense installer (backups, hashes, typecheck,
  lint, accounting/session tests, diff check, one Downloads report). Inspect
  that result, then complete the owner-controlled release/activation described
  in docs/EXPENSES_ACTIVATION.md. Real phone/hosted save/reload/retry acceptance,
  full certification and new-source CI/Sonar remain pending.

# Current checkpoint — 2026-10-24 session request performance candidate

- Owner Termux trial setup 18:08:08–18:08:37 IST passed: typecheck, lint
  (zero warnings/errors), 22 gateway tests and diff integrity. Owner confirms
  both existing companies now open; reports more than 20 seconds of waiting.
- Read-only runtime evidence near 18:22 IST: product POST execution 1168 ms and
  642 ms; Central Admin free service restarted shortly before these requests.
  These are backend timings, not measured end-to-end mobile timings.
- Current working base: main 5351b05a940c58586817275d8744edf7847faf0e plus the
  installed trial gateway/ownership checkpoint. No commit/push in this candidate.
- Changed src/auth/customer-session.ts: reuse an in-memory remotely established
  unexpired token for gateway calls; join pending restoration/refresh; retain
  the 60-second refresh margin and cold-storage remote verification. Failed
  verification invalidates runtime reuse. Password changes still force restore.
- Server gateway still verifies the live Central session on EVERY operation;
  no auth-result cache, financial-data cache or authorization bypass was added.
- Added src/auth/session-performance.test.ts: repeated-read request counts,
  cold restore, refresh coalescing, revocation, outage, logout, account switch,
  unverified storage and real gateway denial before database execution.
- Focused local protocol/recovery/API tests: 75 tests / 7 files PASS using
  mocked network responses. Owner Termux typecheck/lint/tests remain required.
- Phone/hosted performance improvement, mobile E2E, full certification and
  latest-source CI/Sonar are NOT certified by these mocked tests. The initial
  login endpoint itself and Render idle wake-up behavior are unchanged.
- This candidate makes no external database, identity, financial, Admin,
  Render plan, deployment or remote Git changes. Free-server idle wake-up is
  a separate hosting decision; no paid upgrade is authorized or applied.
- Next: run the speed installer in Termux; reload local preview and compare
  company changes after login. Inspect the single Downloads report, then
  complete owner-controlled certification/publication before hosted acceptance.
- Pending feature order remains Party/Ledger Master, Item/Unit, itemized bills,
  Inventory, Delete/Void, then Dashboard/Reports. No expansion is claimed here.

# Current checkpoint — 2026-10-24 trial connection setup

- Owner confirmed both existing companies, three parties and four vouchers are
  their unreleased development trial data and approved mapping to ORB-U-365HD9A3.
- Central UUID remains 01a1454a-2134-7365-8d9a-3ed6b49f0b12; Admin identity/profile unchanged.
- Managed Khata migration 20261024042046 central_owner_bridge_preserve_trial_books applied.
  Private mapping resolves to legacy ledger owner 7d88bc43-4768-4279-ae3d-7626830f3a8e.
- All three full-row financial-table fingerprints unchanged after mapping.
- Existing voucher actor IDs, amounts, posting/report functions and immutability retained.
- Live transaction/RLS checks: mapped owner sees two companies and four vouchers;
  direct legacy JWT is blocked; a synthetic new principal sees no legacy rows (rolled back).
- orbis-khata-data Edge Function version 3 deployed with remote central-session
  verification, preserved owner resolution and exact-origin CORS. Configured service key
  selects the service endpoint; without one the existing public central-session endpoint
  verifies the customer. Trial public-session mode shares Admin's 30/min/IP limit;
  review service rate limits before customer release. Platform JWT verification is off
  because the function verifies the user's live Admin session before all data operations.
- Uses server-provided SUPABASE_DB_URL fallback; no DB credential is in source or browser.
- Render Khata deploy dep-dbe36doae00c73bg4osg is live at 5351b05 with VITE_KHATA_DATA_URL
  set. Built asset contains both correct central and product URLs. Auto Deploy remains off.
- Local fixtures: 18 PostgreSQL/PGlite checks and 7 Edge adapter checks pass.
  Public HTTP: preflight 204, missing token 401, denied origin 403. Malformed token
  reaches Admin Auth but currently returns 503 through Admin's upstream-403 mapping;
  it is denied without database access. No real-customer readiness certificate claimed.
- Owner Termux delivery must preserve the deployed Edge source and two SQL review docs,
  configure .env.local, then run targeted tests/lint/typecheck. No automatic commit/push.
- Real signed-in browser book access, expiry/revocation acceptance, full certification,
  mobile E2E and latest-source CI/Sonar remain pending. No customer account was created.

Historical checkpoints below are not the current runtime/deployment state.

# Project Status — Durable Resume Checkpoint

## Latest checkpoint — 2026-09-24 documentation reconciliation

- Current main HEAD inspected: `3d1d7c5145eb62137dbc9c5da834023c5adf14b8`.
- Documentation is being reconciled to the current implemented accounting foundation.
- Implemented foundation: Auth/company boundary, multiple companies, company-scoped
  parties, Sale/Purchase, Receipt/Payment, advances, Cash/Bank, party ledger/totals,
  exact money, retry/idempotency, tenant isolation and immutable reversal.
- Current source audit confirms Party/Ledger Master is still incomplete; Item/Unit,
  itemized Sale/Purchase, Inventory and Delete/Void are not yet implemented.
- Owner-approved next order is: Party + Ledger Master → Item + Unit Master →
  Itemized Sale/Purchase → Inventory → Delete/Void propagation → Dashboard/Reports.
- This documentation update does not implement a product feature and does not authorize
  deployment, database changes, Auth-setting changes or a Git push.
- Exact-SHA GitHub Actions/Sonar status is not certified by this checkpoint.
- Deployment remains OFF/not authorized.
- Historical checkpoints below remain evidence only; they do not override this current
  checkpoint or the current source.

## Latest checkpoint — 2026-09-22 coverage and reporting repair

- Phone final run 20260922-083611-15187 stopped on coverage: one UI wait timeout,
  statements 85.68%, functions 82.4%, branches 80.97%. No commit/push occurred.
- Added observable UI tests for authenticated navigation/logout, company/party scope,
  date/pagination filters, all posting types, exact retry identity, invalid amounts,
  recovery-storage failure, pending navigation and existing correction behavior.
- Android jsdom concurrency limited to 2 workers; asynchronous UI readiness timeout
  5 seconds. Coverage thresholds remain lines/statements/functions 90%, branches 85%.
- Local candidate: 75 tests / 9 files PASS; coverage statements 96.25%, branches
  91.46%, functions 99.2%, lines 99.67%. Typecheck, KNIP, JSCPD PASS (0 clones).
  Lint exits 0 with 3 existing React effect warnings; no clean-warning claim.
- Release wrapper collects exact-run stage logs on both success and failure into its
  Downloads report, with final outcome and timestamp. Phone final certification and
  exact new commit CI/Sonar still pending; local coverage is not a remote certificate.
- No new product features, schema, auth settings or financial records changed here.
  Delete, full party details, items/units and inventory remain the next approved scope.

## Latest checkpoint — 2026-09-22 release preparation

- Phone accounting installer verified exact hashes and passed 59 tests / 8 files;
  TERMUX-CMD-20260922-072905-301042456 exit=0. Source is installed, not yet committed.
- GitHub main remains 2eb03ce151d9e80607378e9fa4ce9d69bd5657ed; its old quality job
  35570208557 is success. This is NOT a scan of the new Auth/accounting source.
- Owner requests current checkpoint commit/push then Sonar before next features.
- Release fix: remove unused exported Party type (KNIP failed then passed); include
  *.test.ts alongside *.test.tsx in Sonar test classification. No threshold reductions.
- KNIP and JSCPD pass on prepared source (0 clones). Final permanent khata verify
  still required on the exact phone source, including Ubuntu browser and coverage gates.
- Next action: apply release-preparation patch and run python scripts/khata.py verify;
  inspect exact-source completed report, repair any failing gate, then authorized push
  and main Actions/Sonar inspection. No new branch/PR/staging/deploy/DB changes.
- Delete-with-two-confirmations and full party/item/stock scope recorded in DECISIONS;
  not implemented yet. Existing reversal-only behavior remains until next migration.

## Latest checkpoint — 2026-09-21 Auth candidate

- Packaging correction: first ZIP failed at `git apply --check` on the owner's clean
  expected HEAD. Reproduced all eight failed paths using exact GitHub blob bytes.
  The packaging copy had appended an extra trailing newline to every baseline file.
  Rebuilt patch from base64-decoded GitHub blobs verified against their Git SHA-1 IDs;
  strict patch application and byte-for-byte comparison of all 19 resulting files pass.
  Earlier synthetic-copy patch verification was insufficient and is superseded.
  User screenshot shows Confirm email OFF; saved server state has not been rechecked.

- Base: main `2eb03ce151d9e80607378e9fa4ce9d69bd5657ed`; prepared copy only, phone not modified.
- Added trilingual signup/login/recovery, persisted session restoration and refresh,
  local logout, company setup UI and an unapplied owner-isolated SQL proposal.
- Owner instruction: verification must not gate signup; app lock off; shared ORBIS IDs later.
- Changed: `src/App.tsx`, `src/App.css`, `src/App.test.tsx`, `src/auth/*`, package manifests,
  `scripts/khata.py` (known new source paths and default account test selection), decisions,
  this checkpoint, `docs/AUTH_SETUP.md`, `docs/khata-company-proposal.sql`.
- Targeted tests, source lint and TypeScript/build run locally; see delivered verification report.
  Full certification/coverage, Android appearance, hosted Auth/recovery and live RLS tests pending.
- Read-only live evidence: Khata public schema empty; email Auth on, signup on,
  `mailer_autoconfirm=false` (Confirm email still enabled). No production settings changed.
- No Git commit/push, GitHub main change, staging, deployment, Auth user creation or DB write.
- Next: owner applies source patch in Termux and previews; separately authorize the proposed
  table/RLS and turn off Confirm email. Configure recovery redirects/SMTP before live release.
- Earlier checkpoints below are historical and do not supersede this entry.

**Last updated:** 2026-09-15 UTC
**Repository:** `orbisaideveloper/orbis-khata`
**Current baseline branch:** `main`
**Main baseline before this work:** `d6f5a00011642c5fc1b6b543b0319244c62fbb6c`
**Baseline content commit:** `154b4e8d1d43083bbd63f1386cd51f19399640db`
**Correction source branch:** `chore/project-baseline`
**PR #1:** GitHub automatically classified it as merged when `main` was fast-forwarded to the same verified commit; no PR merge action was used
**Phase:** Product and architecture baseline
**Production code:** Not started

## Completed in this checkpoint

- Created the standalone public GitHub repository with initial README.
- Confirmed separation from Orbis Foundation and other product databases/deployments.
- Created an isolated baseline branch.
- Converted the earlier full concept into structured, AI-readable repository documentation.
- Recorded mandatory AI/contributor rules, architecture boundaries, MVP scope, workflow and durable decisions.
- Preserved the mobile/Termux verification model and production smoke requirement.
- Corrected the workflow to feature branch → verification → one owner-authorized direct update to `main`, with no default PR, PR Preview or staging.

## Baseline file set

- `README.md`
- `AGENTS.md`
- `SECURITY.md`
- `docs/PRODUCT_BLUEPRINT.md`
- `docs/ARCHITECTURE.md`
- `docs/MVP_SPECIFICATION.md`
- `docs/DEVELOPMENT_WORKFLOW.md`
- `docs/DECISIONS.md`
- `docs/PROJECT_STATUS.md`

## Verification for this documentation-only change

- Repository and main README inspected before work.
- Documentation checked for internal links and conflicting locked/open decisions.
- No runtime tests are applicable because no application code or dependency manifest exists.
- GitHub comparison verified the correction branch against the original main baseline before the direct update.
- Main was updated to the verified correction commit in one authorized fast-forward step.
- PR #1 closed automatically and GitHub classified it as merged because `main` contains the same commits; no PR merge action/API was used.

## External state

- `main`: contains the verified documentation baseline and corrected no-PR/no-staging workflow.
- Staging: not created or changed.
- Production/Render: not created or changed.
- Database/Supabase: not created or changed.
- Deployment, migrations and secrets: none.

## Unverified/open

- Final MVP screen/navigation approval.
- Technology stack, database, sync conflict rules and providers.
- GitHub branch protection/ruleset and future CI checks.
- Orbis ID and Orbis Admin contract versions.

## Exact next action

Begin a **Chat Mode** MVP architecture review using `docs/MVP_SPECIFICATION.md`. Do not write application code until that review resolves the open pre-coding decisions.

## Resume instruction for any AI

Read `AGENTS.md`, then this file, then `docs/DECISIONS.md`. Inspect the current GitHub branch/HEAD before acting. Report any difference from this checkpoint. Do not create a PR, PR Preview or staging unless the owner explicitly requests it. Do not assume coding began.

## 2026-09-18 — Main-only CI bootstrap checkpoint

- Owner chose current SonarQube Cloud Free subscription, direct main workflow, no PR Preview or staging, no automatic production deployment. Sonar scans main after push; a red run needs a new corrective commit and blocks any release.
- Local React/Vite starter is a **quality scaffold only**, not an approved MVP feature or full-stack implementation. Backend and accounting screens have not been built.
- Prepared workflow: main-only GitHub Actions with lint/typecheck/unit coverage/KNIP/JSCPD/build/Playwright browser smoke/Sonar scan and fail-closed overall metrics. GitHub Actions run and Sonar analysis remain unverified until the first remote push and successful result.
- Current Sonar organization plan: Free (user screenshot). Token/organization/project variables configured and verified by metadata, never record secret values.
- Production/Render auto-deploy OFF must be confirmed separately by owner before pushing; CI workflow has no deployment job. No deployment or database write is authorized.
- This quality bootstrap updates only tooling and project governance; product architecture open decisions in `docs/DECISIONS.md` still need owner approval before app feature development.
- Evidence: timestamped `00-SEND-KHATA-MAIN-CI-*.txt` Download report. A successful local run is not proof of remote CI success.
- Exact next steps: review remote CI results/artifacts, repair if red, then resume Chat Mode MVP architecture choices and first approved UI slice.

## 2026-09-19 — Step 1 UI local checkpoint

- Owner approved incremental app UI development: Welcome/Login first; module selection next; Khata Boi general accounting first, Gopal Dairy future dedicated module. Documented in `docs/UI_PHASE_01.md` and D-019/D-020.
- Local candidate replaces the Vite starter with Welcome, disabled real-login form, clearly labeled demo login, demo preference and placeholder Workspace. No server/Auth credentials, financial mutation, product DB or deployment.
- Expected files: `index.html`, `src/App.tsx`, `src/App.css`, `src/index.css`, `src/App.test.tsx`, `e2e/smoke.spec.ts`, this status file, decisions file, and new UI plan.
- Git baseline at preparation: `fa19d1a16a5977117b8b490baced357caaad85e2` (`main`). Termux installer verifies local HEAD before applying.
- Local verification: pending owner Termux installer report; UI review: pending owner; no claimed green result until actual checks return.
- GitHub main unchanged by preparation; staging, production, Supabase and other Orbis repositories untouched. No push or deployment authorized.
- Exact next action: owner runs installer locally, opens `http://127.0.0.1:5173/`, tests Welcome → Login → Demo Workspace → reload/logout and returns report/screenshots; fix Step 1 before working on Step 2.

## 2026-09-19 — Step 2 trilingual module UI

- Owner approved full Bengali/Hindi/English translation for the currently implemented Welcome, Login, Workspace and first-module preview; language choice persists separately from demo preference.
- Current module lineup: Khata Boi (first), Farming (future, generic label only), Lottery (Upcoming only). D-021 supersedes the previous module label; see `docs/UI_PHASE_02.md`.
- Local change scope: `src/App.tsx`, `src/App.css`, new `src/i18n.ts`, `src/App.test.tsx`, `e2e/smoke.spec.ts`, `index.html`, `docs/UI_PHASE_01.md`, `docs/UI_PHASE_02.md`, decisions and this status file. The Termux test-only storage fallback from Step 1 remains untouched.
- Source baseline before local change: `fa19d1a16a5977117b8b490baced357caaad85e2` on main. Targeted tests, TypeScript, lint and build are run by the owner installer, with results in its Downloads report; do not assume remote CI green for these unpublished files. Browser Playwright remains for supported Linux/CI at final certification.
- This is a local candidate only. No commits, pushes, releases, real authentication, company creation, accounting writes, migrations, Supabase, Render or cross-product changes.
- Exact next action: review all 3 languages on the live Termux site, select Khata Boi then Back, refresh to confirm language and demo preference; share installer report and UI feedback before designing the Khata Boi dashboard.

## 2026-09-20 — Approved Opening visual parity patch (prepared, not yet installed)

- Owner reported that the sanctioned Opening Preview and the React implementation diverged, and requested remaining restoration work as one downloadable package.
- Source audit found local HEAD `fa19d1a16a5977117b8b490baced357caaad85e2` with unpublished Step 2 working-tree changes; GitHub main still held starter code. Preserve original local source via guarded backups.
- Candidate patch uses `ORBIS-OPENING-LOGIN-PREVIEW.html` as Welcome reference; restores orbit SVG, three-line heading, hero gradient, sample accounting card composition, badges, safe-area and short-phone spacing. Login icons and workspace greeting/demo notice styling restored without re-enabling credential collection.
- Preserves the owner-approved Bengali/English/Hindi selector and Khata Boi → Farming → Lottery module order. Real Auth, signup, company creation, accounting writes and deployment remain out of scope.
- Status: patch source and a guarded install bundle prepared outside the phone. **Phone install, targeted tests, Android visual review and owner approval pending.** No GitHub commit/push/deployment performed by this packaging task.
- Next: owner installs single ZIP using Termux (SHA/HEAD guarded, Download backup/report), returns installer report and screenshots; then fix any visual feedback before final certification/owner-controlled GitHub main push.

## 2026-09-20 — Phase 4 owner-approved non-demo UI (package prepared, owner install pending)

- Owner approved the single `ORBIS-KHATA-APP-UI-APPROVAL-PREVIEW.html` across Welcome → Login → Workspace → Khata Boi, explicitly replacing demo-only user/amount/session copy and preserving Login appearance without authenticating yet.
- React TSX and CSS ported from this specific approved reference; exact three-language UI dictionary ported; only non-sensitive language preference persists. Temporary guest UI navigation never calls an API or holds financial data.
- Khata Boi renders empty four-card dashboard and visibly disabled financial action controls; **real login, company setup and accounting engine are NOT implemented**.
- New targeted Vitest and Playwright tests cover the approved screen flow, no fabricated balances, disabled login/actions and language persistence. Tests in user Termux still require owner installer output; a prepared package is not a green test run.
- Package changes are local-only; no branch change, commit, push, PR, deployment, database or remote Auth changes. `docs/UI_PHASE_04.md` records the approval and safe handoff.
- Next: owner installs once with backup/rollback and Downloads report, opens Android browser and approves exact visuals, then final certification and owner-operated GitHub push when explicitly ready.


## 2026-09-21 — Local runner hardening

- Baseline main 9ba31088b0111c15a8b1a46813c2385c8271e339; modified scripts/khata.py, scripts/khata-selftest.py and this status file.
- Preserve Git porcelain spaces and NUL paths; candidate/installed selftests passed.
- Full certification pending; no commit, push, deploy, Auth or database writes.
- Report handoff uses verified Downloads TXT and Android share chooser; exact-source CI governs release; deploy OFF.

## 2026-09-21 — Basic accounting candidate

- Multi-company selector/create, company-scoped parties, sale/purchase/receipt/payment,
  cash-bank separation, instalments, advances, immutable reversal and live totals/ledger.
- Remote khata_accounting_v1 migration applied to gqyaxsczlmvppxuoqbox; existing company
  preserved. Rollback tests passed; retained 1 company, 0 parties, 0 vouchers.
- Candidate targeted frontend/API tests: 59 passed in 8 files; typecheck, source lint,
  Vite build passed. Exact incremental installer check is recorded in the package report.
- No new dependencies, Auth changes, Admin/Foundation writes, GitHub writes or deployment.
- Android install/visual approval and real-session accounting smoke test pending. Browser
  local-preview access blocked; full certification/coverage/CI/Sonar not claimed.
- See ACCOUNTING_V1.md for remaining security-advisor warnings and deferred features.


## 2026-10-12 — Central account source checkpoint

Owner clarifies Khata is new and unreleased; no active legacy customer/book is assumed.
Preserve accounting rules and UI. Replace independent product Auth with Admin-owned
central identity; common profile remains in Admin, financial data in Khata. The
product-owned gateway enforces existing RLS using a transaction-local canonical ID.
The proposed product schema requires empty company/party/voucher tables and aborts
on unexpected data. No book or identity is deleted. One responsive web source
serves desktop/mobile; a development-only visual preview does not authorize data.

Prepared source: central browser adapter, product data client/gateway and a guarded
review SQL. Await targeted Termux lint/type/tests, actual product SQL/RLS/Deno checks,
central/provider runtime configuration, password recovery and full coverage/E2E.
Admin managed migration 20261012160546 is applied; twelve existing identities remain,
customer count is zero. No Khata product migration, gateway deployment, Git commit,
push, release or real signup/login verification has occurred at this checkpoint.


## 2026-10-12 — Central password recovery source checkpoint

Admin recovery/verify/password endpoints and Khata recovery-link session adapter are
prepared. Email recovery uses a link; signup remains OTP-free. Accounting 18/18
passed in owner Termux, including failed-report-after-successful-save (473ms).
Recovery tests below must pass before claiming source verification. SMTP, provider
redirect/template configuration, product SQL/RLS/Deno checks, coverage, other product
browser adapters, and real mobile/desktop signup/login/reset remain pending.
No commit/push/deployment or new database write is performed by this patch.
See Admin docs/CENTRAL-RECOVERY-SETUP.md for exact setup and remaining checks.


## 2026-10-12 — Local central-account closeout verification prepared

Dedicated mobile/desktop protocol browser tests and disposable SQL checks are added.
The runner checks exact source hashes, cross-user/company RLS, financial invariants,
idempotency, nonempty/drift aborts, Deno adapter types, Linux gates, builds and
changed-code four-metric 100% coverage. Results must come from the timestamped
ORBIS-LOGIN-CLOSEOUT report; source preparation alone is not a PASS. SQL executes
only in a private temporary cluster; browser APIs use test fixtures. Render Admin
still has the old d0af060 staging deployment and no Khata service was listed.
Real signup/login, deployment/provider/SMTP setup and remote CI/Sonar are pending.
No commit, push, production migration or deployment is performed by this runner.


## 2026-10-14 — Sonar corrective source verification

- Parent main: 6ce1827334855a8012493983295c67926d18c1d2.
- Encode pending voucher storage; validate decoded and legacy recovery data; preserve identical IDs/payloads on reload and uncertain retries.
- Fix six reported code smells and cover money/error-alias gaps without lowering gates.
- Exact-source Ubuntu tests, four-metric 100% coverage, lint/types/build/audit/KNIP/JSCPD and mocked mobile/desktop browser checks passed in the owner foreground runner.
- Corrective owner-authorized main push follows these checks. Remote CI/Sonar result is in the Downloads ORBIS-KHATA-SONAR-FIX report; no production claim is made here.
- Real central/server login, SMTP and deployment remain unverified; no production database or deployment change.


## 2026-10-14 — Sonar remaining storage validation and digit conversion

- Parent main: d211bcd70ca32aafea6ffa3e779f40c8fa516d80.
- Validate a bounded plain-text recovery record before storage; reject markup without silently changing the entry; retain encoded storage, validated restore, identical retry ID/payload and multilingual notes.
- Normalize Bengali/Hindi digits by their explicit digit alphabets; remove code-unit warnings while retaining exact minor-unit math and full coverage.
- Exact-source Ubuntu tests, four-metric 100% coverage, lint/types/build/audit/KNIP/JSCPD and mocked mobile/desktop browser checks passed in the owner foreground runner.
- Corrective owner-authorized main push follows these checks. Remote CI/Sonar result is in the Downloads ORBIS-KHATA-SONAR-FIX report; no production claim is made here.
- Real central/server login, SMTP and deployment remain unverified; no production database or deployment change.


## 2026-10-16 — Central ID five-family closeout prepared

One central account/profile for Admin, Maya and Khata; Maya five cloud birth slots and explicit idempotent family restore. Source verification, private disposable SQL and real API acceptance are recorded separately in the ORBIS-CENTRAL-FINISH report. No commit/push/deployment/remote migration in this runner. Browser/PWA acceptance and owner-role Admin login remain distinct. Next: inspect this report, deliver verified source through the owner Git workflow, then reviewed migration/deployment and browser acceptance.


## 2026-10-16 — Live central-ID proof and birth-storage migration

- Live Khata `841428a` login and reload returned the same `ORB-U-365HD9A3` as Admin.
- Managed Admin migration `20261016154208_maya_five_account_birth_profiles` applied; one account and one common profile preserved, zero birth-profile rows. Forced RLS and service-only RPC grants verified.
- Profile and five-slot browser fixture acceptance added; exact local full certification, Termux publication, remote CI/Sonar and post-deploy persistence remain pending.
- Current Supabase app connections cannot access Khata product `gqyaxsczlmvppxuoqbox`; the financial data gateway is not certified or live-ready. No financial database write or replacement book created.
- Next: run the resumable `ORBIS-CENTRAL-RELEASE-20261016.sh`; successful local gates authorize selected owner-Termux commit/push and an Admin PR. No merge/deployment occurs inside this runner. Inspect the single Downloads report before completing remote release.


## 2026-10-17 — Sonar corrective candidate prepared

See [SONAR-CORRECTIONS-20261017.md](SONAR-CORRECTIONS-20261017.md) for every reported file/line and the source changes. Targeted and final Termux verification, new remote Sonar analysis and owner-controlled commit/push remain pending. No merge, deployment or database change is performed by this candidate.


## 2026-10-29 — Mobile home, record dialog and navigation release

- Simplified the mobile home: one company selector, compact summary/action cards, shared bottom Home/Bills/Ledger/More navigation and a scrollable More menu. Date inputs appear only for Custom ranges.
- Saved invoices open with a compact item/quantity/rate/amount table before explicit Edit. Native modal foreground scrolls while the background is locked. Header and browser Back traverse Khata views; Home returns directly to the Khata dashboard.
- Edit rates display two decimals without altering stored precision until edited. Removed UI-only line keys from correction payloads and duplicate empty signature keys.
- Local validation: 494 tests in 71 files passed; coverage statements 91.52%, branches 88.70%, functions 91.02%, lines 92.39%. All 20 mobile/desktop browser scenarios passed, including reload persistence, double delete confirmation, invoice PDF, foreground lock, view-before-edit, nested Back, home navigation and PWA offline shell. TypeScript, lint and unused-code checks passed; local duplicate scan found zero clones; targeted Sonar rule scan found zero findings.
- No schema, Edge gateway or migration changes in this UI release. Existing accounting v3 migration and gateway remain deployed. Owner controls Render deployment.
- Owner requested one push after local verification and no waiting/polling for GitHub Actions; remote CI result is intentionally not certified by this local report.

## 2026-10-29 — Full-screen invoice editing and compact statements

- Parent main: 6ec27369de89f0dbc0b75222efd37d908a02401a. Owner explicitly authorized one direct main push after local checks, with no Actions polling.
- Invoice details/edit now occupy the full viewport, with company/party header, compact date/reference fields and editable item/quantity/rate/amount table instead of stacked item fieldsets. Original exact rates are retained unless changed; unfocused rates show two decimals. Exact line totals and editable received/paid settlement show signed remaining balance. Zero settlement is valid; correction requests retain original party/warehouse and exclude UI keys.
- Party statements use one-line dates and financial amounts, full references, and a final Actions column for edit/delete. Only the table scrolls horizontally on narrow screens; no page overflow. Existing audited correction and double confirmation rules remain.
- Changed: RecordDetail, PartyLedger, RecordLines, RecordSettlement, exact line/settlement helpers, design CSS and related unit/browser regression tests. Saved-bill PDF controls now share the bill-review container with their printable sheet.
- Local verification: all 20 mobile/desktop browser scenarios pass (including full-viewport bounds, table editor, final Actions column, one-line date, body lock and Back). TypeScript, lint and KNIP pass; JSCPD zero clones; targeted Sonar rule scan zero findings. Full coverage suite passed; exact totals below.
- No schema migration, backend deployment, production data mutation or Render deployment. Main will receive only this owner-authorized UI commit; remote Actions remain unverified until owner follow-up.
- Final local evidence: 497/497 tests across 72 files; coverage statements 91.63%, branches 88.73%, functions 91.27%, lines 92.41%. Browser 20/20. Next action after push: owner checks Actions result, then separately controls deployment.

## 2026-10-29 — Correction-safe statements and reconciliation

- Parent main: 585ab6df7bc53aaea0858c91528de028a7ac3546. Owner requests comprehensive local checks then a single commit/push; do not wait for Actions.
- Reproduced owner screenshot: raw totals incorrectly counted cancelled purchase twice (8660 instead of 6080), while signed closing remained -3500. Current statement projection removes cancelled/reversal rows, merges uniquely identifiable bill-time settlements, keeps independent payments separate, and restates opening for corrections to prior-period records. Immutable history remains available separately in PartyLedger.
- Reused effective-record projection in trade/expense lists and cash/bank movement lists. Expense cash bills show bill and paid in one row. Current item-ledger detail excludes cancelled documents; the explicit inventory history retains its labelled audit records. PDF/Excel use the same PartyLedger projection; source journal and database remain unchanged.
- Demo report now includes reversal/settlement identity metadata and as-of reversed flags, enabling realistic correction/reload tests. Live legacy payloads use the existing system payment marker with unique party/date/reference/type matching; ambiguous references stay separate rather than guessing a link.
- Regression coverage includes screenshot totals 6080/2580/-3500, sale/purchase corrections, linked and independent payments, delete, historical opening adjustment, as-of visibility, duplicate-reference safety, expense credit/cash settlement, export consistency and a real demo command/correction/retry/delete sequence matching cards, cash/bank and stock.
- Local browser 20/20, KNIP/lint/typecheck pass, JSCPD zero clones, targeted Sonar rule scan zero issues. Full suite result recorded below when complete.
- No production write, migration, gateway or Render deployment; current work only changes source and owner-authorized main push. Live deployment verification remains owner-controlled.
- Final clean certification: 505/505 tests in 73 files pass. Coverage statements 91.68%, branches 88.60%, functions 91.12%, lines 92.52%; unchanged thresholds pass. Mobile/desktop browser 20/20. TypeScript/lint/KNIP pass; JSCPD zero clones; targeted Sonar rule scan zero findings. Earlier overlapping coverage attempt was discarded; this result is from a clean single run. No claim of live financial-data certification.
- Next: owner receives the pushed commit, checks Actions result and manually deploys. No Actions waiting/polling authorized in this release workflow.

## 2026-10-29 — Four-card home and refresh continuity

- Parent main: 458b86786c8bb39c5b15b998441061c5caa0eaa8; source synchronized with that exact archive before editing, preserving the correction-safe ledger release.
- Home uses four compact cards: receivable/payable include up to three largest positive counterparties (including expense dues in payable); combined cash+bank shows exact sum and two independent account lines, with red negative card/component styling and green normal total. Expense sits beside liquidity. Each card/line opens its corresponding full details; combined card opens combined cash/bank details. Recent entries use current effective records.
- Added owner-keyed device location metadata (module/company IDs only), restoration after session reload, authorized company-list validation/fallback, and cleanup on explicit logout. Khata header/browser Back returns to home, clearing nested overview/bill state. Planned Farming remains inactive; no new module route is invented.
- Changed dashboard metrics/CSS, overview/account breakdown, App/navigation, DemoWorkspace, location helper and related unit/browser tests. No database schema, gateway, monetary posting or production data changes.
- Local: 509/509 tests across 74 files pass; statements 91.66%, branches 88.58%, functions 91.15%, lines 92.54%. All 20 mobile/desktop browser scenarios pass, including company switch/reload; additional combined-card/home browser scenarios 2/2 pass. TypeScript/lint/KNIP pass, JSCPD zero clones, targeted Sonar rules zero findings. Two final behavior-preserving style/refactor changes were checked again with related tests and browser scenarios.
- Owner authorized one push after verification; do not wait for GitHub Actions. No Render deployment or migration performed. Physical-device post-deploy acceptance remains with owner.

## 2026-10-29 — Neutral glass surfaces and compact phone controls

- Parent main 0ae785ed0b352e4466f9a70d3c3165ce7efbd225. Owner authorizes local verification followed by one commit/push, no Actions waiting.
- Restyled header, company selector, summary/action cards and navigation as restrained translucent glass; no colored card fills for negative/positive liquidity. Only figures are red/green; expense figures purple. Light saffron selected/pressed controls. Five compact date presets remain on one line; narrow header sizes prevent the product name wrapping unnecessarily.
- No financial posting, database schema, API or retention change. Existing save/delete services await the server before refreshing their lists. Audited financial deletion remains cancellation/reversal, not loss of history.
- Local: 509/509 tests in 74 files; coverage statements 91.59%, branches 88.49%, functions 91.08%, lines 92.54%. All 20 browser scenarios pass; final four mobile/desktop scenarios additionally verify one-line presets and deleted-party absence after reload while another item survives. TypeScript/lint/KNIP pass; JSCPD zero clones. Mobile screenshot inspected.
- Supabase read-only inspection of Khata product gqyaxsczlmvppxuoqbox: existing corrections are cancelled. Current two companies have 2 and 7 party records, 4 and 10 current vouchers respectively. Latest workspace correction events are edits rather than deletions; without the owner's deleted record ID/name, that specific recent deletion cannot be positively identified. No live rows changed and no live delete/recreate trial performed.
- Changed CSS, master persistence and overview browser assertions, plus decision/status documentation. No migration/Edge/Render deployment. Owner checks Actions result and controls deployment; targeted live acceptance of the unnamed deletion remains unverified.

## 2026-10-29 — Opening corrections, numeric selection, themes and load reduction

- Parent main eee574573837c6ab18da28e7177bb1981e3f8eed recovered from exact remote source after scratch maintenance. Owner authorizes fixes, local verification and a single commit/push; no Actions waiting or Render deploy.
- Root cause: master_guard blocked used-party opening edits and the UI hid the database reason behind a generic field error. Migration 20261029074356_editable_party_opening_balance applied to Khata product gqyaxsczlmvppxuoqbox. Opening amount/side/date are now editable with old/new audit rows; used category/account identity, deletion, item unit, tenancy and retirement purge guards remain. UI opening corrections require double confirmation. Demo behavior matches live rules; master errors use server reason when supplied.
- Database verification docs/opening-balance.rollback-test.sql passed: supplier opening due 6500 -> net payable 8000 with existing purchase 2000/payment 500; advance 1000 -> net payable 500; audit exists; old entries retained; used deletion/type changes and foreign owner denied. Fixture transaction rolled back. Company/party/voucher counts remained 3/9/20 before/after; no owner financial row edited. Security advisors retained existing private RLS/no-policy/auth informational settings; no access grants expanded.
- Numeric decimal/numeric inputs select existing contents on tap/focus. More -> Themes retains glass and adds device-persistent simple blue. Party name opens scoped ledger/details with contact information and list return; opening normal/expense ledgers use their correct identity.
- Removed date-driven duplicate company/master reads. Identical in-flight reads coalesce; masters/settings use an 8-second bounded memory-only cache. Writes invalidate before/after, Refresh and logout clear it, token changes/no session clear it. Financial reports are not cached; no financial IndexedDB persistence, offline write queue or device-filesystem sync added. Actual phone/network cold-start performance is not certified by emulation.
- New tests cover opening correction/cancellation, exact retained balances, numeric selection, themes persistence, party -> ledger, fewer date-change requests, read coalescing/cache invalidation, server rollback audit and owner isolation. Browser: all 20 mobile/desktop scenarios pass, including an edited opening, party details, deleted-party reload absence, numeric typing and blue-theme reload persistence. Initial browser-environment launch issues were resolved using the official headless shell; no shared browser config changed.
- Local final gates/results appended below. No Edge function or Render deployment performed. Main push follows owner authorization after local verification. Next: owner checks Actions and manually deploys frontend; opening migration is already live.
- Final clean full suite: 519/519 tests in 77 files pass; coverage statements 91.99%, branches 88.73%, functions 91.46%, lines 92.84%. All 20 browser tests pass. TypeScript/lint/KNIP pass; JSCPD zero clones; production files have no findings in the targeted local Sonar complexity/nested-condition scan (existing test-only findings are outside the production result). One earlier timeout during concurrent browser/coverage work was rechecked standalone and in this clean full run; no timeout/coverage thresholds changed.

## 2026-10-29 — Repair Actions run 52

- Parent main d567707f5084f35a0304c0c07aa1d047d51df893. Remote run 40839185389 passed install/audit/lint/typecheck/coverage/KNIP/JSCPD/build, all browser smoke tests and the Sonar quality gate. Strict overall check failed on the single open typescript:S7721 issue in src/theme.tsx: move choose to outer scope.
- Moved the closure-independent theme preference handler to module scope; behavior, storage key and events are unchanged. No quality checks or thresholds weakened.
- Targeted theme/numeric tests: 3/3 pass. Local lint, TypeScript, production build and built-worker offline/API bypass checks pass. No database/migration/Edge/Render change; old financial records unaffected.
- Owner authorizes corrective main commit/push. New remote Actions result remains pending; owner will report it, without assistant polling.

## 2026-10-29 — Compact ledger search, item statement and pinned navigation

- Parent main 0daf5a83ef08e00625d432d97dbc109e490e1f5a. Owner requests a compact, clear mobile presentation. Search now has a localized light placeholder and an integrated ledger-type selector. Matching lists scroll inside their panel without a client-side result cap; a regression verifies 75 names and code-specific lookup.
- Item details now render opening/in/out/closing by godown in a compact summary table, followed by date/reference/party/quantity/rate rows in a bounded scrollable statement. Existing report pagination and reversal filtering remain; no accounting math or financial storage changed.
- Reduced glass company selector to one row, reduced header and quick-entry/cash controls. Header stays pinned while the document scrolls; its menu stays anchored and can scroll internally. Replaced the inherited overflow-hidden scrolling ancestor with overflow:clip using stronger specificity.
- Local: 520/520 unit tests in 77 files pass; coverage statements 91.97%, branches 88.67%, functions 91.40%, lines 92.85%. Lint/typecheck/KNIP pass; JSCPD zero clones; production build and worker checks pass. Browser tests verify mobile/desktop search, sticky header/menu, bounded 20-document item table and no page overflow; related invoice PDF/detail browser scenarios also pass.
- No production data, schema, migration, Edge gateway or Render change. Owner-authorized source push only; remote Actions result remains unverified and is not polled. Owner controls deployment.

## 2026-10-29 — Repair run 54 and contain long party names

- Parent main 88a90090516a349d21fd72713688840a394ba428. Failed run 40864370051 passed local-equivalent gates, Playwright and Sonar quality gate; strict metrics rejected two open issues in ItemStatement: S6819 explicit region role and S6845 non-interactive tabindex. Replaced the container with a labelled native section and removed explicit tabindex. Scroll bounds and table content remain. Stock-summary styling now uses a dedicated class rather than element-type position. No gate thresholds or exclusions changed.
- Due-card party rows use a shrinking name column and intrinsic amount column; names truncate at the end on one line, amounts stay intact within the card. Grid children may shrink without expanding the dashboard.
- Local related tests 10/10 pass; lint, typecheck, production build and worker checks pass. Browser overview regressions pass on mobile and desktop, including a deliberately long Shiva Bikaner Sweets name with full 37,300.00 amount, ellipsis, non-overlap, card bounds, pinned navigation and item statement scrolling. Screenshot visually inspected.
- No financial calculation, existing records, database, migration, Edge or Render deployment changed. Owner authorizes corrective main push; new remote Actions result remains pending without polling.

## 2026-10-29 — Financial-year bill numbering repair

- Parent main ee2cdb5f1e66d9f340c37a5eb08ddaa3357a3172. Owner requests settings-driven automatic/manual references, financial-year restart, logic verification and commit/push. Previous invoice code swallowed number-allocation failures and displayed a UUID fallback. Removed that fallback and made actual allocated numbers visible/read-only; manual references are required/editable. Settings now select mode per sale/purchase/expense. Settings/number failures disable review and expose localized retry; stale async responses cannot overwrite a changed date.
- Added exact April–March year helpers, company/kind/year/draft server reservations and counters, current-year Next serial settings, collision skips, independent historical-year allocation and same-draft/year retry. Demo mirrors these rules. Existing records, calculations and original references are not rewritten. Reservations can leave draft-cancellation gaps.
- Managed migration 20261029123240_fiscal_bill_numbering APPLIED to Khata product gqyaxsczlmvppxuoqbox. Public v3 delegates accounting operations to its private legacy implementation; verified gateway/owner/write guards and company transaction lock remain. New counters/reservations have RLS, no direct client grants and cascading company cleanup. Security advisors show the intentional private/no-policy info for these tables, without opening client access.
- docs/fiscal-numbering.rollback-test.sql PASSED against live schema using only a temporary fixture: saved prefix/42 applies; same-year retry unchanged; April reset to 1; backdated prior year 1; saved current-year seed99 applies; manual allocation and foreign owner denied. All test rows rolled back. No owner financial rows changed.
- Supabase CLI migration generation was blocked by automatic review because of its incidental external telemetry; used the managed migration tool and its actual generated history version instead. No alternate CLI/telemetry workaround used.
- IMPORTANT BLOCKER: live Edge Function deployment was REJECTED by automatic approval review because code fix/testing/push authorization did not explicitly authorize replacing a live function. Edge remains version8; date-bearing number requests require deploying the updated workspace-contract.ts in its existing source bundle. No bypass attempted. Ask owner for this specific live deployment only after source push; Render deployment remains owner-controlled.
- Local clean full suite: 528/528 tests in79 files passed; coverage statements92.04%, branches88.94%, functions91.47%, lines92.92%. Two newly added number-field tests subsequently passed alongside invoice tests (16/16); final settings/hook/field tests also pass. Earlier full attempt exposed outdated test timing/mocks after the new asynchronous/fail-closed behavior; fixtures now wait for actual numbers and supply valid settings. No tests, coverage thresholds or gates weakened.
- Browser20/20 mobile/desktop PASS; final invoice/PDF/number/detail check2/2 PASS after component extraction. Typecheck/lint/build/worker/KNIP PASS; JSCPD0 clones. Local recommended Sonar rules on changed production TS/TSX report zero findings after extracting shared number presentation and allocator helpers. Remote Actions not polled/certified.
- Next action: owner authorizes live orbis-khata-data Edge update, deploy the current contract with the unchanged existing authenticated gateway bundle, verify rejection/auth and dated allocation behavior, then owner deploys frontend. Do not claim the feature is fully live before that step.

## 2026-10-29 — Six Sonar repairs and plain serial numbers

- Parent main5844585eef5aae98e8be1d0bd25e15c9dd4ebbec. Owner requests corrections, proof of actual automatic fields and another commit/push, before further live deployment. Run40876199034 failed strict Sonar on six issues: S7723 x3 (Error construction), S2301 (manual boolean selector helper), S6551 x2 (unknown date stringification). Fixed with new Error, removal of selector helper through undefined/manual fallback, and textValue date normalization. Local recommended Sonar production scan returns no findings; the exact six remote findings are corrected, but new remote CI is not yet certified.
- Automatic numbers are now plain 1,2,3… with configurable initial serial, independent kinds and internal April–March scopes. Removed prefix controls from settings; legacy prefixes remain schema-compatible but are ignored by short allocation. Manual numbers stay editable/required. Automatic response validation refuses old prefix/year values; failed allocation never fabricates an ID or allows review. No financial math changed.
- Demo invoice regression creates and saves two real bills through UI fields: references1 and2, totals60000 minor each and closing stock20000000 scaled units. Other tests verify starting42, next43, annual reset1, backdated year1, independent purchase1, retry preservation, lowering Next serial without reusing reservations and manual denial. Old balance/payment/round-off/A–Z tests pass.
- Server candidate supabase/pending/short_bill_numbers.sql scopes reference uniqueness by company/kind/year, generates only serial text and checks posted collisions within the financial year. It does NOT rewrite old bill references. NOT applied to production. docs/short-numbering.rollback-test.sql passed in an isolated PGlite Postgres engine against the actual allocator SQL, using a minimal local legacy-settings/auth fixture (not a claim of full production gateway certification): custom42, next43, collision skip44, April reset1, backdate1, purchase1, seed99, manual and foreign-owner denial, rollback and anonymous execute restriction. Prior live schema was inspected read-only only.
- Local full suite531/531 in80 files PASS; coverage statements92.06%, branches88.92%, functions91.54%, lines92.92%. Latest targeted invoice/hook19/19 PASS includes one additional legacy-response rejection test added after full-suite collection. Related targeted9-file run57/57 PASS before the final two new regressions. Mobile/desktop invoice/number/PDF/detail2/2 PASS. Lint/typecheck/build/worker/KNIP PASS; JSCPD0 clones. No gate/coverage exclusions weakened and no new application dependencies added.
- No production migration, financial row write, Edge or Render deployment this turn. Live Edge v8 remains pending from the explicit automatic-review rejection recorded above. Next: owner checks Actions, then explicitly authorizes the pending short-number SQL and dated Edge contract update before frontend rollout. Main receives only the owner-authorized corrective source commit/push. Do not claim short numbering is live until those server steps are done.

## 2026-10-29 — Owner-authorized short-number SQL applied

- Owner asks to complete pending SQL before frontend rollout. Applied managed migration20261029131705_short_bill_numbers to Khata gqyaxsczlmvppxuoqbox. Moved reviewed pending source into its actual migration-history filename; SQL is unchanged. Prior unique constraint was inspected before application.
- Live docs/short-numbering.rollback-test.sql PASS: configured42, next43, lowered counter collision skips to44, independent purchase1, April reset1, backdated year1, updated99, manual and foreign owner denial. All fixture rows rolled back; owner financial records and historical references unchanged.
- Edge deployment is still not performed: previous automatic-review rejection requires explicit authorization to replace the live function. Render rollout must wait for dated Edge contract update. Next action: ask owner specifically to authorize live orbis-khata-data Edge deployment, then verify it before owner deploys Render. No Actions polling.

## 2026-10-29 — Explicitly authorized live Edge activation

- Owner explicitly confirms all required live Edge update permission after the previous approval clarification. Deployed orbis-khata-data version9 ACTIVE to Khata gqyaxsczlmvppxuoqbox. Only workspace-contract.ts replaced in the exact retrieved version8 bundle; entrypoint, central session verification, existing source dependencies, origin policy and custom-auth verify_jwt setting retained. No credentials or grants changed.
- Retrieved version9 and verified its contract content exactly matches current source. Live unauthenticated date-bearing number request returns401 KHATA_LOGIN_REQUIRED (no write). Relevant gateway/workspace/numbering tests22/22 pass. SQL migration20261029131705 and its live rollback tests were already completed. No real bill/party/financial row created or edited for this gateway verification.
- Pending SQL/Edge activation blocker is cleared. Owner can manually deploy Render frontend from main. Authenticated real-account invoice/save acceptance remains to be checked after frontend rollout; do not claim that final production UI trial already happened. Render not deployed by assistant; no Actions polling.

## 2026-10-29 — Compact invoices and commit-time serial allocation

- Owner authorizes implementing, locally checking and pushing this release; Render rollout remains owner-controlled. Bill-number previews now read only. New invoice-save allocates a serial and posts the financial command in one transaction, with original-payload idempotency and rollback on failed saves. No historical reference or previous gap is reset.
- Live Khata migrations 20261029141429_atomic_invoice_save and 20261029141757_qualify_expense_correction applied. Real-schema rollback fixture in docs/atomic-invoice.rollback-test.sql passed: repeated preview, successful numbering, retry, overpayment rollback, concurrent drafts, expense discount and expense correction. Fixture transactions rolled back; owner financial data not edited. The test exposed and fixed an existing ambiguous expense-correction SQL column.
- Live Edge orbis-khata-data v10 ACTIVE. Exact v9 bundle retained except current workspace contract and inventory model; retrieved v10 contents match both. Custom central authentication retained; anonymous request returns401 KHATA_LOGIN_REQUIRED.
- Settings now contain bill print identity/details, template and numbering. Invoice editor is a compact item table with Add row and Less/discount. Sale/expense use saved print identity; purchase retains company context. Correction editors use item tables with opaque backgrounds. Stock table sorts alphabetically and opens the selected item statement; negative stock retained.
- Mobile/desktop bill/PDF/ledger/edit browser tests2/2 passed; targeted invoice/expense/atomic tests23/23 passed. Lint, typecheck/build, KNIP, JSCPD (zero clones), and local Sonar recommended-rule scan passed. Full final coverage is running; no current release commit pushed yet. Do not claim authenticated owner production UI acceptance or remote Actions result.

### Final local release evidence

- Full Vitest coverage run completed successfully:82 files,538 tests passed. Statements91.62%, branches88.45%, functions90.89%, lines92.78%; all repository coverage gates pass. Final lint/KNIP/JSCPD pass (zero clones). Earlier exact-source build/typecheck and mobile/desktop invoice PDF/edit tests2/2 pass.
- Release prepared for owner-authorized main push. Live SQL and Edge v10 already active; owner next deploys the frontend from this release and verifies real-account entry. No Actions polling and no assistant Render deployment.

## 2026-10-29 — Business reports and payment-account repair in progress

- Owner authorizes completing payment details, bill counts/register and profit report, checking locally and pushing main. Starting HEAD36643c1710c9dfe69a7d12b7d00a982cc3094f5b. Render remains owner-deployed.
- Reproduced live accounts failure: operator does not exist text ->> unknown. Nested journal.account shadowed unqualified JSON alias. Applied managed migration20261029180310_account_json_alias using qualified acct.value. Real-schema authorized read in rollback transaction now passes; owner financial rows unchanged.
- Added Reports route/home shortcut and bill register with sale/purchase/expense filtering, counts, totals, detail links and all-history pagination. Added actual money-in/out list including expenses, with date/direction filters. Profit uses current effective invoices and moving weighted-average purchase costs (discounts included); unknown opening/production costs and oversold stock block an invented final profit. Purchase comparison and cash movement remain separately labelled.
- Targeted new model/UI tests9/9 pass; related tests17/17 pass after replacing an obsolete no-profit-link assertion. Type/build and mobile/desktop browser checks underway. No current report release pushed; live SQL alias repair only. Next: browser, final coverage/quality, source review and owner-authorized main push without Actions polling.

### Business-report release verification

- Final full coverage run:84 files,547 tests pass. Statements91.93%, branches88.69%, functions91.31%, lines92.91%; all existing gates pass. Lint, typecheck/build/PWA worker, KNIP and JSCPD (zero clones) pass; local Sonar recommended-rule scan has no findings on changed report/controller/math sources.
- Exact-source Playwright mobile/desktop2/2 pass: daily counts, sale filter, weighted-cost net profit, actual cash/bank payment totals, bank card details and no horizontal overflow. Screenshots visually reviewed. New model tests cover discounts/remainders, historical stock, weighted costs, unknown opening/negative stock, corrections/deletions and empty periods.
- Live docs/account-details.rollback-test.sql passes: account-kind balances reconcile to the journal and foreign owner access is denied. No owner transactions edited. No new Edge contract/deploy required; applied SQL alias fix is active. Owner deploys frontend after main push; production report UI acceptance remains owner verification. No Actions polling.

## 2026-10-30 — Independent Lottery module migration in progress

- Owner explicitly authorizes reusing Foundation lottery formulas/forms in Khata, independent of Foundation code runtime, API and data; no trial data transfer. Source Foundation main pinned2686780feffcabfefad2e434ecf56dca7b015608, read-only throughout. Khata starting main b3bc2ba478aeb17ebaf306de7299e30ba8b21789; main push authorized after checks. Render rollout remains owner-controlled.
- Imported source workspace/daily seller/stockist/transaction detail forms and their pure helpers under vendor/foundation-lottery. Imported nine original accounting modules with mechanical CJS-to-ESM conversion (no formula change), and12 inherited domain test suites. A private aggregate-store compatibility adapter bridges those services to Khata-owned lottery storage; no Prisma engines or Foundation database required.
- Added a separate authenticated Lottery entry point, lazy module, local transport and new guarded lottery gateway operation. Pending SQL creates only new khata_lottery_state/operations tables, owner-scoped locks and idempotent operations. No Foundation writes, data reads or imports beyond source code. Live SQL/Edge and new main commit not yet applied; verify adapter, requests, persistence isolation and UI before activation.

### Independent storage activation checkpoint

- Applied only Khata migration20261030031036_independent_lottery. New tables are private/RLS-enabled with no client table grants; verified gateway function owner-locks state and records idempotent operations. Live docs/lottery-storage.rollback-test.sql PASS for gateway denial, save/retry, changed-retry rejection, stale version and owner isolation. Fixture state rolled back; no owner lottery records or Foundation data imported.
- Source-domain regression suites103 tests plus new adapter flow tests pass. Browser mobile/desktop2/2 pass for real copied forms using the original domain service behind a test gateway: create organization/masters, stockist/seller rows, exact commission/TDS, split payment and reload restoration.
- Found and repaired an inherited conditional-hook placement in the copied stockist form, and scoped local storage/navigation names to this independent module. Browser-only recovery no longer imports server crypto: the gateway envelope validator is split into a pure protocol module. No formula changed. Edge v10 not replaced yet; next complete quality checks and activate the reviewed Edge bundle, then push main. Foundation remains read-only and unchanged.

### Lottery gateway release preparation

- New integration flows and the actual Edge-entrypoint transport harness pass: exact sale/TDS math, version conflicts, settlement/split methods, monthly expense, stockist correction and linked void audit, and repeated request protection. Scalar types/defaults/unique keys and local-model foreign keys preserve the original domain assumptions. Browser-only protocol avoids importing server crypto into Khata's recovery UI.
- Original UI/imported functions retain known stylistic React advisory warnings; the conditional-hook error was fixed rather than suppressed. KNIP passes after removing unused export surfaces and explicitly registering the required runtime declaration contract; no ignore/threshold relaxed. Current source/build/typechecks and mobile/desktop browser flow pass; final coverage and Edge activation next.

### Lottery release verification completed

- Full coverage:100 files,663 tests PASS. Statements90.72%, branches87.49%, functions90.28%, lines91.22%; existing gates pass. New src/lottery integration has100% line/function coverage (99.15% statements). Includes103 inherited domain/property tests plus new codec/store, gateway, transport, persistence/correction/void and shell tests.
- Browser6/6 PASS across mobile/desktop: original Khata bill/PDF/edit, business reports, and independent Lottery creation, master profiles, stockist/seller forms, exact760.80 seller payable and150 split receipt, reload restore and610.80 ledger remainder. Screenshots reviewed. Build/PWA worker, typecheck, KNIP, JSCPD zero clones and lint (no errors) pass. Copied UI retains inherited advisory lint warnings; no gates/thresholds suppressed. Local Sonar recommended rules pass on new adapter/shell/gateway sources.
- Live Edge orbis-khata-data v11 ACTIVE after explicit owner authorization for this standalone module; exact retrieved21-file bundle matches prepared source. Central auth and verify_jwt false custom-verifier setting retained. Unauthenticated lottery request returns401 KHATA_LOGIN_REQUIRED. Live SQL storage rollback test already passed; no Foundation or historical Khata transaction touched.
- Release ready for authorized main push from b3bc2ba478aeb17ebaf306de7299e30ba8b21789. Owner next checks Actions and manually deploys Render, then tries real new lottery records. No Actions polling, no assistant Render deployment, and no claim of authenticated owner production UI acceptance. Source and test provenance are recorded in vendor/foundation-lottery/PROVENANCE.md. Foundation was accessed read-only at pinned source commit; no Foundation data migration.

## 2026-10-30 — Repair strict Sonar failures after report and Lottery releases

- Verified remote main00e5077b2702632c1151124b00ae47af5244e8ad and parentb3bc2ba478aeb17ebaf306de7299e30ba8b21789: both failed only the strict zero-open-Sonar-issues step (23 and3 findings respectively); ordinary Quality Gate, unit coverage, build and Playwright passed. Did not weaken or suppress the gate.
- Fixed duplicate React imports, native loading output/optional chains, Error constructors, Promise-returning adapter operations without unnecessary async/await loops, and explicit JSON-string request-body validation. Domain formulas and persistence schema unchanged. Added unsupported-body regression.
- Current checks:100 files/664 tests PASS; coverage statements90.75%, branches87.49%, functions90.37%, lines91.23%. Typecheck, lint (existing vendor warnings), KNIP, zero-clone JSCPD, build/PWA PASS. Targeted exact-source mobile/desktop Playwright6/6 PASS. Local recommended SonarJS scan clean; native remote Sonar result pending.
- Khata Edge v12 ACTIVE with existing central authentication and unchanged verify_jwt=false; retrieved bundle matches prepared files. No SQL/data mutation or Foundation change. The custom1,500,000-byte aggregate lottery-state guard remains unchanged; it is per owner across organizations, not a Supabase quota, and needs redesign for high-volume use.
- Owner-authorized corrective main push next. No Render deployment and no waiting/polling for the new Actions run; owner reports result.

## 2026-10-30 — Lottery navigation, opening balances and daily receipts checkpoint

- Owner authorizes implementation, local certification and direct main commit/push. Starting main7dd2c10d55f1995db4855e452dd25511d706c317 verified Actions40999670375 SUCCESS (strict Sonar included). Foundation stays untouched, Render owner-deployed.
- Added common module picker to Khata and Lottery (Farming remains unavailable), removed oversized Lottery introduction. Profiles accept signed opening dues/advances/date and user-initiated phone contact selection with manual fallback. Opening edit runs atomically with profile save and balanced opening-equity journal/reversal/audit; no fabricated sales or cash.
- Daily seller grid and selected table account show current-day bill, previous balance, last receipt, today's receipts, Cash/PWD/Bank entry and remaining carry-forward. Receipt waits for confirmed bill save; failures retain entered money and block payment. Same existing idempotent payment service is reused. Existing UPI/cheque history remains readable; new receipt inputs have only three methods.
- Targeted21 feature tests PASS; inherited/source regression116 tests PASS before final additions. Browser mobile/desktop2/2 PASS including deliberate failed draft-save/no receipt and safe retry; final related browser run in progress. Typecheck/lint/KNIP/zero JSCPD clones pass at checkpoint; recommended local SonarJS scan clean after one correction. No new remote push, SQL or Edge update yet. Next: finish final browser/coverage, source review, matching Edge activation and main push; no post-push Actions polling.

### Lottery usability release verification

- Final full run104 files/674 tests PASS. Statements91.28%, branches87.96%, functions90.86%, lines91.92%; all coverage gates pass. New module picker, seller receipt and opening writer100% lines/functions/branches; profile fields100% lines/functions. Typecheck/build/PWA, lint (existing vendor warnings), KNIP, zero JSCPD clones and zero production vulnerabilities pass. Recommended local SonarJS scan clean.
- Final-source Lottery mobile/desktop2/2 pass for direct module switching, openings, daily formulas, save-failure blocking, safe receipt retry, no duplicate bill, split PWD/cash/bank, external payment and reload. Related bill-share/report browser4/4 pass. A test fixture type error was corrected before final successful typecheck/build/browser checks.
- Khata Edge v13 ACTIVE; retrieved22-file bundle matches reviewed source, central auth preserved. Existing storage rollback SQL passes owner isolation, commit/replay and stale/changed retry denial with all fixtures rolled back. No SQL schema change, Foundation writes or user financial data edits. Render unchanged.
- Detailed evidence: docs/LOTTERY_VERIFICATION_20261030.md. Owner-authorized main push from7dd2c10 next; new Actions/Sonar run remains unverified until after push. No Actions polling; owner reports result.

## 2026-10-30 — Repair Lottery browser CI failure

- Owner requests diagnosis and direct corrective commit/push. Starting main5c65314db7b221c4d769ecc0eff8e21d965616ff; failed run41011880020/job123919361517. Install/audit/lint/typecheck/674-test coverage/build passed; Playwright22/24 passed, both Lottery cases failed expecting two payments but receiving one. Sonar steps were skipped, not failed/passed.
- The test's wait for recordPayment count>0 was already satisfied by the first daily receipt, allowing reload without second-save confirmation. Replaced it with the matching3000-paise response, successful saved-payment content and cleared successful form before reload; retains exact two-receipt/balance assertions. Fixture now serializes read/write requests like the production owner lock and delays the second receipt to exercise real asynchronous confirmation.
- Also reproduced a real payment draft bug deterministically: enter30, refresh workspace, field becomes empty. PaymentPanel reset all amounts whenever refreshed account-array identity changed. Reset is now tied to actual account/type/category changes; successful save still clears explicitly. Added browser assertions for preservation on refresh and clearing on type switch. No stored records or calculation formulas changed.
- Consolidated ModulePicker i18n imports before the next Sonar pass. Corrected Lottery mobile/desktop2/2 PASS;31 related unit tests and typecheck/lint PASS. Full24-case browser suite in progress. No SQL/Edge/Render changes; existing Edgev13 unaffected. Next: final browser result, quick static checks and owner-authorized corrective main push without Actions polling.

### Lottery CI repair verification

- Final full Playwright24/24 PASS on mobile/desktop. New regression proves30 is retained through refresh, account-type change clears it, and the second3000-paise receipt is confirmed before reload. Two payments and original exact totals remain mandatory.
-31 related unit tests, typecheck, lint (existing vendor advisories), build/PWA, KNIP, zero-clone JSCPD and local recommended SonarJS scan PASS. No SQL/Edge/Render or user financial data changes. Detailed diagnosis/evidence: docs/LOTTERY_CI_REPAIR_20261030.md.
- Owner-authorized corrective main push next from5c65314; new remote Actions/Sonar result pending. No post-push polling.
