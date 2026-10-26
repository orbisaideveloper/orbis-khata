# Master details and bill layout — owner review, 2026-10-25

This is an isolated, editable local demo. It never connects an owner account or
financial database. Review must finish before the one owner-controlled source
release. No production completion or activation is implied by this UI review.

## Locked review behavior

- Item name and unit are required. Code and default rate are optional and may be
  added/edited later. A blank code stays blank; no visible fake code is generated.
  The list shows the name once; a distinct code appears only when present. Bill
  rates are independently editable; changing a master rate never rewrites bills.
  Used units cannot be silently changed after stock transactions.
- Parties have name/category, phone, address, email, optional credit limit and
  credit days. Opening due or advance has an explicit amount and effective date.
  Customer due debits receivable; customer advance credits receivable. Supplier
  due credits payable; advance paid debits payable. The other side is opening
  equity, never new sales, purchases or expense. For a dual-role party the user
  explicitly chooses which relationship the one opening balance belongs to.
  Separate simultaneous balances for both roles are not represented by one field.
- Expense opening payable is not recognized as current-period expense. Its linked
  settlement reduces the liability and cash/bank once. New expense bills preserve
  descriptive lines separately from the user's note and do not create stock.
- Used opening balances cannot be silently edited; financial correction needs a
  separate, audited adjustment. Contact and credit metadata can still be edited.
- Sale/Purchase in Accounts opens its dedicated bill page in the demo. A Bills
  menu also opens sale/purchase/expense bills. The header has bill number/date,
  party/category/contact/address; line table has serial, item/description,
  quantity, unit, editable rate and exact amount. Footer has grand total. Review
  precedes explicit Confirm & save. Purchase/sale post one financial voucher and
  matching quantity movements; receipt/payment remains separate. Oversell fails.
- Suggested demo bill numbers use independent S-/P-/E- sequences per company;
  bill references can be edited. Production sequence allocation must be atomic.

## Release integration still required after owner review

Reuse the reviewed UI and replace its demo adapters with reviewed production
contracts; do not redesign the screens again. The current live backend does not
accept optional item codes/default rates, rich contact/credit fields or opening
balance commands. Do not send these new fields to the old gateway.

Production work must include nullable/partial-unique item code, optional exact
minor-unit default rate, contact/credit metadata, append-only opening events with
owner/date/idempotency guards and opening equity in reports. Preserve old records
and Central identity. Add transactional/audited opening correction and settlement
contracts; stock-sensitive unit edits must remain blocked. Store bill line and
party-detail snapshots, and allocate unique bill numbers transactionally.

Activate only after owner acceptance, meaningful SQL/RLS/atomicity checks, final
Termux/Linux certification, the owner's main push and green CI/Sonar. No migration,
Edge deployment, Render deploy, staging, PR or assistant Git write was performed
while preparing this review.

## 2026-10-26 sample memo refinement

Owner supplied 70393.png as a layout reference. Use its blue double frame, centered
selected company name, memo/date header, party details, five-column serial /
particulars / quantity (unit beneath) / rate / amount grid, quantity subtotal,
previous balance and grand total, and signature lines. Do not hardcode the sample
business name, address, loom image or no-return policy into another company's bill.

Both quantity+rate→amount and quantity+amount→rate use integer decimal math.
Quantities retain six decimals; per-unit prices may retain eight decimals so
3 units for ₹100 stays ₹100, instead of silently becoming ₹99.99. The most recently
edited Rate or Amount is authoritative when quantity changes. Empty/zero quantity
cannot trigger division or posting. Monetary line totals round half up to paise.
Mixed units have separate quantity subtotals. Previous dues add, advances subtract;
only this invoice's subtotal posts, never the brought-forward balance a second time.

This is still a local demo contract. Its precise unit_rate field is deliberately
not accepted by the unchanged production command validator. Production storage,
validation and migration must implement this precision before wiring live saves.
