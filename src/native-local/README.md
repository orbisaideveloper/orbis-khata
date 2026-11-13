# Android local-first (closed-test candidate, not approved release)

This build route is Android-only; deployed Web/PWA retains its existing backend.

* First ORBIS Admin sign-in is online. Both paths require hardware KeyStore and SQLCipher. With a screen lock, later launches use the device credential and a local profile with an expiry window. Without a screen lock, a cold launch requires fresh online account sign-in before the existing local books open.
* Android Lottery uses the same calculation engine as PWA with a device-local projection and retry receipts in the encrypted snapshot. Shared customer statements and invitations use the web gateway; Android directs users to the web.
* The local accounting engine uses the existing application demo/test ledger implementation while persisting the complete state as a hardware-AES-sealed record in SQLCipher, serially, before acknowledging a mutation. Khata accounting mutations also append an AES-sealed, operation-ID-based local-only sync draft to the SQLCipher outbox in the SAME database transaction as the accounting projection. It is **not** a substitute for a complete production-grade acceptance suite.
* The queue is NOT accepted by a live server today: server-side protocol mapping/authorization, backup/restore, existing Web-account migration, and multiuser reconciliation remain disabled.
* Never uninstall the app or clear app data while using this mode unless data can safely be discarded. Backup is not enabled.
* The native bridge limits a single sealed record to 1MiB; the adapter chunks state into 60K-character encrypted pieces and atomically updates a checksum-authenticated manifest. The overall prototype-state guard is 32MiB pending large-scale acceptance tests.

Release blockers: exhaustive domain operation parity, real-phone sign-in/unlock/relaunch/reboot/update/switch-account/low-space/large data, user acceptance of 45-day expiry, no-loss backup for production use, and no remote fallback.
