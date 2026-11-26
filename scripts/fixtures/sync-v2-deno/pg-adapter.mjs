// Test import-map adapter. Production resolves the actual npm import directly.
import postgres from '../../../node_modules/postgres/src/index.js';

export default function connect(checkedUrl, options) {
  const target = new URL(checkedUrl);
  if (target.username !== 'disposable-fixture' || target.password || target.pathname !== '/postgres' ||
      options.ssl?.rejectUnauthorized !== true)
    throw new Error('EDGE_FIXTURE_BOOTSTRAP_UNEXPECTED');
  const local = Deno.env.get('ORBIS_FIXTURE_PG_URL');
  if (local !== 'postgres://postgres@127.0.0.1:5432/khata_sync_v2_test')
    throw new Error('EDGE_FIXTURE_LOOPBACK_REQUIRED');
  return postgres(local, {...options, ssl: false});
}
