# Common account profile checkpoint — 2026-10-16

Central login client already exists. The workspace Settings now reads/edits the
existing authenticated Admin common-profile API; no product credentials or financial
records move. UI remains Bengali/Hindi/English. Profile responses must have canonical
IDs and typed fields. Logout/account changes cancel pending views and writes.
The non-secret central API origin is configured locally; VITE_KHATA_DATA_URL and
live product authorization remain independent checks. No financial data migration,
DB writes, Git commit/push/merge, deployment or production configuration is included.
Owner targeted tests/typecheck/lint/build and later full certification are pending.
