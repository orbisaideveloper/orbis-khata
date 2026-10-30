# Lottery compact periods, appearance settings and commission statement

Recorded: 2026-10-30T14:11:55+05:30 (India). Parent main: b5ee2ee5af007501e9d5d604e0745b1a8c4c6592, Actions41023926540 SUCCESS.

## Behavior

The home period bar has no repeated Dashboard heading. It offers Today, Yesterday, This week, Month and Custom. Yesterday is exactly the prior Indian business day. This week means Monday through Sunday, including month/year boundaries; it is not a rolling seven days. Month retains the existing month-to-date meaning. Custom retains the selected valid range.

Language and the existing glass-green/blue theme choices are in the three-dot Settings disclosure. They reuse saved product preferences. Primary home metrics, navigation, periods, stock/AI summaries and the new statement follow the chosen language; business/party names and money strings stay intact. Header language is removed from the always-visible row. Pastel glass colors are brighter, with blue styling available. Detailed formula text is reserved for tutorial mode. This is not a claim that every inherited Lottery form/tutorial paragraph has been fully translated.

Commission opens a dedicated statement for the selected range, not another inline Difference panel. Each date has stockist commission, seller commission and signed difference, plus full-period footer totals. Zero-entry dates are shown. Long ranges paginate50 dates at a time without truncating totals. Date opens seller detail; either side's amount opens that side's per-party table.

A daily detail includes active party profiles and any archived party's stored commission. It distinguishes an explicitly recorded zero from no entry. “Not entered” means no record exists for that account/day; it does not claim that the person was required to work or that an error definitely occurred. Archived rows retain their amounts but do not open an unrelated active editor. Active names open the original seller/stockist daily screen for exactly that party/date.

Commission amounts are summed from effective posted/draft seller and stockist snapshots already provided by the existing projection. No new commission/TDS formula, rounding, posting or database mutation is introduced.

## Verification

-110 files /686 unit tests PASS. Coverage: statements91.42%, branches88.22%, functions90.91%, lines92.15%; every existing threshold passes.
- New commission UI, period bounds and copy helper100% lines/functions/branches. Commission model100% lines/functions,95.45% branches.
- Complete Playwright mobile/desktop24/24 PASS. Final focused Lottery2/2 also PASS after limiting translation to semantic titles so user names remain raw.
- The expanded end-to-end Lottery scenario has a scoped60-second timeout; assertions, save acknowledgements and global CI settings are unchanged.
- Browser regression covers compact title-free date bar, Yesterday, Monday26Oct–Sunday1Nov, Settings-only language, translated card labels, both theme choices, missing-seller indicator, per-side party lists and original daily entry navigation with exact40.00 commission. Prior bill/payment/refresh/retry/module/scroll checks remain.
- Model tests cover leap-day Yesterday, Sunday/Monday and year-crossing weeks, custom dates, zero-entry dates, drafts, archive totals, service stockists, explicit zero versus absence, exact signed differences and full-period pagination totals.
- Typecheck, production/PWA build, lint (existing vendor advisories only), KNIP, zero-clone JSCPD and local recommended SonarJS checks PASS.

No SQL, Edge, Render or Foundation deployment/change is needed. No owner financial records were edited. Existing Edgev13 remains compatible. Owner controls Render after the new Actions result; no post-push polling or unverified remote-green claim.
