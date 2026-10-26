# Khata full app visual review — 26 October 2026

## Owner scope
The owner clarified that Figma is for the entire app front, dashboard, typography,
forms and graphic hierarchy, not just an invoice. Keep simple, polished mobile
entry and offer three computerized bill designs from the same financial data.
Continue isolated localhost review before a single final owner-controlled release.

## Evidence and design reference
Read Foundation main source (read-only):
- src/admin/dashboard/sections/AccountingPublicView.tsx
- src/admin/dashboard/sections/accountingPublicTheme.css
- src/public-accounting/PublicAccountingApp.tsx
The first two define its green app header, light cards, regional language greeting,
compact fields and bottom navigation. Reused that visual direction, without importing
its backend, lottery behavior, auth, identity or financial data.
Re-read owner sample upload 70393.png as the blue memo layout reference.

Figma file: https://www.figma.com/design/a2NMZQeGrn0V15ZUUymKhK
Page 6:5, app wrapper 6:11; screens 7:5 (home), 7:87 (parties), 7:129 (item),
7:175 (ledger), 7:225 (expenses), 7:270 (invoice entry).
Bill wrapper 8:20; sample 8:21, classic 8:128, modern 8:235.
Editable text/frame/vector/instance layers; no flattened screenshot UI.
Noto Sans Bengali app text and Noto Serif Bengali memo text. Found and corrected
Figma text-height reset after resize, which had overlapped company headings.
Final dashboard and three-bill composition screenshots checked after that fix.
Figma Starter tool-call limit blocked the final combined six-screen screenshot;
individual remaining screen visual acceptance is not claimed.

## Isolated demo implementation
- Home dashboard with actual demo balances, dated current-month report, clear
  sale/purchase/expense actions, master/stock/accounts shortcuts, recent entries,
  truthful loading/error/empty states; no invented profit metric.
- To-pay total includes both supplier and expense payable. Opening balances and
  advances continue using the reviewed accounting model.
- Green header, light surfaces, consistent typography/fields/buttons across all
  existing demo screens. Profile and tutorial remain in the three-dot menu.
- Fixed bottom home/bills/ledgers/parties navigation, bill-page leave confirmation.
- Touch-friendly item rows: item and quantity/rate/amount fit together without
  horizontal scrolling; stable Add row/Remove behavior and existing 50-row guard.
- Blue sample memo, monochrome office bill and green modern bill radios in entry
  and review, with miniature paper swatches. Switching does not save or change math.
- Optional company address/phone is presentation text on the current demo invoice;
  it is not persisted as a company master or production field.
- Print/PDF action in review and saved states. Review prints visibly marked Draft;
  only explicit Confirm saves. Browser print dialog owns printer/PDF destination.
- Company and party headers repeat across pages, serials continue; final totals
  appear only on the last page. Long item text reserves more row capacity.
- No sample company name, fixed industry artwork, invented tax/GST or legal policy.

## Scope boundary and verification
Base source main 768fec21a3bd31f0b087438c2a7a0a6d54810567; local working copy only.
43 related tests across nine files PASS; typecheck and lint PASS. KNIP and production
build/PWA worker checks PASS earlier in the same scoped change, with the two existing
KNIP unused-ignore hints. No native browser is installed in this executor. Actual
phone layout, mobile zoom and printer pagination require owner review; Figma images
are design verification, not screenshots of the running React application.
Production builds retain the live app path and exclude demo-only UI. No commit,
push, branch, PR, staging, deployment, production DB/financial/Auth mutation occurred.
Latest rich masters, openings and exact-price invoice contracts remain demo-only;
production integration and final certification are still separate pending work.

## Exact next action
Run ORBIS-KHATA-FULL-UI-DEMO-20261026.py in a new Termux session; it checks the base,
uses an isolated copy, visibly runs targeted checks, and updates only a verified
running demo on port 5173 or starts its own foreground Vite. Refresh localhost and
review Home, Parties, Items, Accounts, Ledger, Expenses, Stock and all three bills.
The owner is reviewing this demo before any final release/push.
