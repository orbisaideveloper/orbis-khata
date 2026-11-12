# Android local-first (closed-test candidate, not approved release)

This build route is Android-only; deployed Web/PWA retains its existing backend.

* First ORBIS Admin account login is online and trusted; registration/enrollment requires Android screen lock and hardware KeyStore.
* Later launches use a device-local authenticated profile with an expiry window; no Admin network request on that path.
* The local accounting engine uses the existing application demo/test ledger implementation while persisting the complete state as a hardware-AES-sealed record in SQLCipher, serially, before acknowledging a mutation. Every supported mutation also appends an AES-sealed, operation-ID-based local-only sync draft to the SQLCipher outbox in the SAME database transaction as the accounting projection. It is **not** a substitute for a complete production-grade acceptance suite.
* The queue is NOT accepted by a live server today: server-side protocol mapping/authorization, backup/restore, existing Web-account migration, and multiuser reconciliation remain disabled.
* Never uninstall the app or clear app data while using this mode unless data can safely be discarded. Backup is not enabled.
* The native bridge limits a single sealed record to 1MiB; the adapter chunks state into 60K-character encrypted pieces and atomically updates a checksum-authenticated manifest. The overall prototype-state guard is 32MiB pending large-scale acceptance tests.

Release blockers: exhaustive domain operation parity, real-phone sign-in/unlock/relaunch/reboot/update/switch-account/low-space/large data, user acceptance of 45-day expiry, no-loss backup for production use, and no remote fallback.
