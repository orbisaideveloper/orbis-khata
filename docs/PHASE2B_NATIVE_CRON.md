# Phase 2B native Cron acceptance

Use the isolated `ci/phase2b-final-five-20261126` checkout with the reviewed patch applied. This entrypoint is shared with the corresponding GitHub Actions job. It needs a Linux host with a working local Docker Engine, usable Unix socket, bridge networking, Node 24, npm dependencies and vacant PostgreSQL port 5432. A host with the Docker CLI alone cannot run the test. Use a preloaded image or allow the disposable host to fetch `supabase/postgres:17.6.1.136`. Keep the daemon local to a dedicated development environment.

```bash
npm ci --no-fund
bash scripts/run-phase2b-business-cron-docker.sh
```

The runner accepts `DOCKER_HOST` only for a local Unix socket. It logs the base SHA, working-diff checksum, source hashes and resolved image digest in a new `quality-reports/phase2b/native-cron.*` directory. It starts a fresh container with the image configuration and dedicated bridge, publishes PostgreSQL on loopback and binds the authenticated Collector receiver to that bridge. The temporary container, volume and network are removed at completion. Business SQL comes from the original migrations. Only the fixture's Cron cadence is accelerated. Allow up to 18 minutes after startup for the unchanged Collector time window.

Read `result.txt` first and retain `business-cron.json` when present. Exit 2 means a host prerequisite is missing. A successful native run requires actual Vault round-trip, authenticated HTTP, four distinct job-history receipts, both protected nonzero tenant ledgers and rollback. Save the report and the exact source patch before requesting a GitHub push.
