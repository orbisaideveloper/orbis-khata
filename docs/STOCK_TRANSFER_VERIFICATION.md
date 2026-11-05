# Stock transfer and payment preview — verification scope

Base: main 0be7bb450abf03255c9a66ca1a49310b049d41c5.

One existing godown remains sufficient. Optional additional godowns use the existing
warehouse master and transfer RPC. The stock page supports direct Production Input,
company-average location values, a conserved total, and current/draft party balances.
Production Output, source documents and Accounting Policy v2 remain unchanged.

The new warehouse-transfer migration is prepared, NOT applied to production.
It checks duplicate lines, dated availability and later history under the existing
company lock. Sales may still create negative finished stock. No source records are rewritten.

Focused SQL tests verify legacy fingerprints, rollback, retry and negative sales.
The native PostgreSQL CI test additionally races two withdrawals against one stock.
PGlite success must never be called native concurrency success.

Hindi previously relied on system fonts; bundled Noto Sans Devanagari now provides it.
Screenshots await font loading, including the already bundled Bengali font.
BN/HI/EN mobile and desktop workflow previews were inspected.

The permanent scripts/khata.py runner performs native Ubuntu or Termux/proot checks
and reports the actual environment. Full coverage is last. Local quality checks
do not certify exact-SHA GitHub Actions, Sonar, real Android, production migration
or deployment. These require their own evidence. No Render/Edge deployment or
live financial write is part of this change.

Native CI correction: run 41950973245 passed the existing concurrency checks,
but the new fixture sent an already-stringified string into the driver's JSONB
serializer. Use tx.json(command) so the server receives an object once. No
production RPC, stock guard or financial calculation changes in this correction.
The next exact-SHA CI result must certify the corrected native fixture.

Run 41951338771 verified native parallel transfers, 890 unit tests and 58 browser
cases. The Sonar gate passed but strict zero-open-issues rejected 16 findings.
The scoped correction merges a duplicate import, uses explicit conditional blocks,
renames a state setter, uses SyntheticEvent and narrows FormData values, and moves
the existing panel-action expression into a helper. Calculations and posting
commands are unchanged. Four related suites / 21 tests and typecheck passed.
The final corrected source requires its own full runner and exact-SHA CI results.
