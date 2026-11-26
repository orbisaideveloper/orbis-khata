#!/usr/bin/env bash
# Used by Work Mode and by the isolated GitHub Actions job.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
umask 077

report="$(mktemp -d "$(mkdir -p quality-reports/phase2b && realpath quality-reports/phase2b)/native-cron.XXXXXX")"
container=''
network=''
outcome=FAIL
docker_socket=${DOCKER_HOST:-unix:///var/run/docker.sock}
docker_cmd=(docker --host "$docker_socket")
cleanup() {
  local exit_code=$? cleanup_failed=0
  trap - EXIT
  set +e
  if [[ -n "$container" ]]; then
    "${docker_cmd[@]}" inspect --format '{{.State.Status}} exit={{.State.ExitCode}}' "$container" > "$report/container-state.txt" 2>/dev/null
    "${docker_cmd[@]}" rm -fv "$container" >/dev/null 2>&1 || { echo 'CONTAINER_CLEANUP_FAILED' >&2; cleanup_failed=1; }
  fi
  if [[ -n "$network" ]]; then
    "${docker_cmd[@]}" network rm "$network" >/dev/null 2>&1 || { echo 'NETWORK_CLEANUP_FAILED' >&2; cleanup_failed=1; }
  fi
  if ((cleanup_failed && exit_code == 0)); then outcome=FAIL; exit_code=1; fi
  printf 'status=%s\nexit=%s\n' "$outcome" "$exit_code" > "$report/result.txt"
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
exec > >(tee "$report/run.log") 2>&1

blocked() { outcome=BLOCKED; echo "$1" >&2; exit 2; }
[[ "$docker_socket" == unix:///* ]] || blocked 'LOCAL_UNIX_DOCKER_SOCKET_REQUIRED'
if ! command -v docker >/dev/null; then
  if command -v podman >/dev/null; then echo 'Podman CLI detected. This runner requires a Docker-compatible local socket and docker CLI.'; fi
  blocked 'DOCKER_CLI_NOT_FOUND'
fi
[[ -S "${docker_socket#unix://}" ]] || blocked 'LOCAL_DOCKER_SOCKET_NOT_FOUND'
"${docker_cmd[@]}" info --format '{{.ServerVersion}}' > "$report/docker-version.txt" || blocked 'LOCAL_DOCKER_DAEMON_UNAVAILABLE'
command -v node >/dev/null || blocked 'NODE_24_REQUIRED'
node -e 'if (Number(process.versions.node.split(".")[0])<24) process.exit(1)' || blocked 'NODE_24_REQUIRED'
node --input-type=module -e 'await import("postgres")' || blocked 'DEPENDENCIES_MISSING_RUN_NPM_CI'
for name in DATABASE_URL SUPABASE_DB_URL SUPABASE_SERVICE_ROLE_KEY; do
  [[ -z "${!name:-}" ]] || blocked 'PRODUCTION_CREDENTIAL_ENV_NOT_ALLOWED'
done
export KHATA_SYNC_V2_TEST_URL=postgres://supabase_admin@127.0.0.1:5432/khata_sync_v2_test
export PHASE2B_CRON_EVIDENCE_DIR="$report"
export GITHUB_SHA="$(git rev-parse HEAD)"

image=supabase/postgres:17.6.1.136
{
  printf 'head=%s\nimage=%s\n' "$GITHUB_SHA" "$image"
  git status --short
  printf 'working_diff_sha256='
  git diff --binary HEAD | sha256sum
} > "$report/provenance.txt"
sha256sum scripts/run-phase2b-business-cron-docker.sh scripts/verify-sync-v2-business-cron-runtime.mjs \
  scripts/sync-v2-disposable-db-fixture.mjs \
  supabase/migrations/{20261028184713_khata_accounting_completion_v3,20261122142011_lottery_live_per_draw,20261121145730_lottery_scheduler,20261121182053_customer_statement_relay}.sql > "$report/sha256.txt"
node scripts/verify-sync-v2-final-gates-source.mjs

"${docker_cmd[@]}" image inspect "$image" >/dev/null 2>&1 ||
  "${docker_cmd[@]}" pull "$image" || blocked 'PINNED_SUPABASE_IMAGE_UNAVAILABLE'
"${docker_cmd[@]}" image inspect --format '{{.Id}} {{json .RepoDigests}}' "$image" > "$report/image.txt"
resource="orbis-phase2b-${report##*.}"
network="$("${docker_cmd[@]}" network create --driver bridge "$resource")"
gateway="$("${docker_cmd[@]}" network inspect --format '{{(index .IPAM.Config 0).Gateway}}' "$network")"
export PHASE2B_COLLECTOR_BIND="$gateway"
container="$("${docker_cmd[@]}" create --name "$resource" --network "$network" \
  --add-host "host.docker.internal:$gateway" \
  -e POSTGRES_PASSWORD=disposable-only -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=khata_sync_v2_test -p 127.0.0.1:5432:5432 \
  "$image" postgres -D /etc/postgresql -c listen_addresses='*' \
  -c cron.database_name=khata_sync_v2_test -c pg_net.database_name=khata_sync_v2_test \
  -c cron.use_background_workers=on)"
"${docker_cmd[@]}" start "$container" >/dev/null

# Wait for final host TCP, never for the temporary initdb Unix socket.
for ((attempt=1; attempt<=90; attempt++)); do
  if [[ "$("${docker_cmd[@]}" inspect --format '{{.State.Running}}' "$container")" != true ]]; then
    echo 'DISPOSABLE_POSTGRES_EXITED_DURING_INIT' >&2
    exit 1
  fi
  if node --input-type=module <<'NODE'
import postgres from 'postgres';
const db=postgres(process.env.KHATA_SYNC_V2_TEST_URL,{max:1,connect_timeout:2});
try {
  const [pg]=await db`select current_user as role,
    (select rolsuper from pg_roles where rolname=current_user) as admin,
    current_setting('server_version_num')::int as version,
    current_setting('shared_preload_libraries') as preload,
    current_setting('listen_addresses') as listen,
    current_setting('config_file') as config_file,
    current_setting('vault.getkey_script',true) is not null
      and current_setting('vault.getkey_script',true)<>'' as vault_key_script,
    current_setting('cron.database_name',true) as cron_db,
    current_setting('pg_net.database_name',true) as net_db,
    current_setting('cron.use_background_workers',true) as cron_workers`;
  const loaded=pg.preload.split(',').map(s=>s.trim());
  const failures=[
    pg.role==='supabase_admin'&&pg.admin ? null : 'DB_ROLE',
    pg.version>=170000&&pg.version<180000 ? null : 'DB_VERSION',
    pg.listen==='*' ? null : 'DB_LISTEN',
    pg.config_file==='/etc/postgresql/postgresql.conf' ? null : 'WRONG_IMAGE_CONFIG',
    pg.vault_key_script ? null : 'VAULT_GETKEY_SCRIPT_NOT_CONFIGURED',
    pg.cron_db==='khata_sync_v2_test'&&pg.cron_workers==='on' ? null : 'WRONG_CRON_SETTINGS',
    pg.net_db==='khata_sync_v2_test' ? null : 'WRONG_PG_NET_DATABASE',
    ...['pg_stat_statements','pg_cron','pg_net','pgsodium','supabase_vault']
      .filter(name=>!loaded.includes(name)).map(name=>'MISSING_PRELOAD_'+name),
  ].filter(Boolean);
  if(failures.length){console.error('DISPOSABLE_PG_PREFLIGHT_FAILED',failures.join(','));process.exitCode=1;}
} catch(error) {
  console.error('DISPOSABLE_PG_PREFLIGHT_SQL_ERROR',error.code??'UNKNOWN');
  process.exitCode=1;
} finally { await db.end({timeout:1}); }
NODE
  then
    echo 'FINAL_HOST_TCP_DATABASE_AND_EXTENSION_PRELOAD_READY'
    node scripts/verify-sync-v2-business-cron-runtime.mjs
    outcome=PASS
    exit 0
  fi
  sleep 2
done
echo 'FINAL_TCP_DATABASE_TIMEOUT' >&2
exit 1
