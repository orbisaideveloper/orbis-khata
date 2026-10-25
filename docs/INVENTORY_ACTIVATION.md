# Items, itemized bills, stock and workspace menu — 25 October 2026

Source baseline: main eca4181b7349023457c7f5d96874ff766927b96b.
The owner manually deployed this revision; Render deploy dep-dbepe3bncjis73f0kmfg
is live and GitHub quality succeeded. This does not activate the new source below.

## Behavior

- Company-scoped immutable item code, name and arbitrary fixed unit. Case-insensitive
  code uniqueness; separate company-scoped godown code/name masters.
- Quantities use integer millionths (six decimal places); INR uses exact paise.
  Each line rounds quantity × unit rate to nearest paise, half upward; bill total
  sums the rounded lines. No binary floating-point calculation or invented stock.
- Multi-line purchase increases stock; sale decreases stock in the selected godown.
  Each itemized bill creates exactly one existing balanced sale/purchase voucher.
  Party dues, existing money reports and journal reconcile through that voucher.
  Settlement stays a separate Receive/Pay entry; a bill never means cash was paid.
- Existing amount-only sale/purchase entries remain compatible and do not imply
  item quantities. Use the explicitly named Purchase bill / Sale bill actions in
  Items, bills & stock for inventory. Old vouchers are never converted by guesswork.
- Explicit opening quantity records physical starting stock only. It does not
  import monetary opening balances or create a purchase/cash payment. Transfer
  moves quantity between godowns without creating a financial voucher.
- Server rechecks company/party/item/godown ownership, fixed unit identity, exact
  payload/UUID retries, no oversell (including repeated item lines), future dates
  and chronology. Company locks serialize stock writes/reversals. Backdated stock
  entries before later activity for an affected item/godown are refused.
- Existing financial voucher reversal restores/removes bill stock atomically.
  Purchase reversal is refused if that godown no longer has the quantity. Source
  documents, unit and movements are immutable. Opening/transfer entries are not
  financial vouchers; this slice does not provide deletion/void or arbitrary stock
  adjustment/correction. Check opening counts before confirming.
- Stock report shows opening/in/out/closing per godown and item, plus company
  item totals. Different units are never summed together. History pages 50
  documents and supports itemized bill viewing/browser print. No GST tax invoice.
- Limits: 50 lines/document; 1000 items/company; 100 godowns/company; stock report
  refuses more than 3000 item/godown balances rather than silently truncating.
  There is no unit conversion, batch/expiry, valuation/COGS, full P&L, discounts,
  GST, returns, master editing/archive or offline sync in this delivery.
- Three-dot menu on authenticated workspace/books contains Account & profile,
  Tutorial toggle and Log out. Profile loads on its own page; Central identity
  and shared-profile API remain unchanged. Tutorial defaults OFF, persists only
  a non-sensitive browser preference, and uses the selected Bengali/Hindi/English.
  Explanatory hints hide when OFF; financial facts and safety/error messages stay.

## Activation remains owner controlled

Read-only inspection found no live khata_expense_events table or expense RPC.
The owner-deployed frontend alone therefore does not complete expense activation.
After source review, phone checks and owner-controlled release/green CI:

1. Separately obtain explicit owner approval for managed migrations and matching
   gateway/frontend publication. Never alter Admin/Foundation data.
2. Preserve before/after fingerprints of original company/party/voucher rows.
3. On Khata gqyaxsczlmvppxuoqbox only, apply the reviewed expense migration if still
   absent, then inventory-v1.review.sql as its own managed migration. The inventory
   SQL has been tested privately against the deployed ownership bridge and works
   with the original journal too; it does not depend on an expense-table rewrite.
4. Deploy the gateway with FOUR source files: the Edge index, server-gateway.ts,
   expense-model.ts, and inventory/model.ts. Keep live session verification,
   resolved legacy owner, gateway marker, exact origins and DB secrets intact.
5. Publish matching frontend after the gateway/database are ready; auto-deploy stays OFF.
6. With an explicitly authorized disposable company, verify item/unit/godown,
   purchase 10.25, sale 1.25, stock 9.00, transfer, opening count, partial payment,
   retry/reload, reversal, period report, print and two-company isolation.
   No trial financial record is created on the owner's behalf by the installer.
7. Test Tutorial OFF/ON, language change and reload, menu profile save/back/logout,
   mobile width and desktop. Sonar, coverage and actual phone/live acceptance are
   separate from the focused local checks; do not lower gates to release.
