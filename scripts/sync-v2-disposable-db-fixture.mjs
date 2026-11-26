import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import postgres from 'postgres';
import {setup} from './sql-fixture.mjs';

const bootstrap = [
  '20261031075245_lottery_row_storage.sql',
  '20261031081126_continuous_production.sql',
  '20261101144338_expense_profile_schedules.sql',
  '20261101191307_lottery_party_sharing.sql',
  '20261102075520_master_party_link_metadata.sql',
  '20261104122849_report_revision_and_party_lookup.sql',
  '20261105040047_warehouse_transfer_stock_guard.sql',
  '20261105084705_gateway_request_admission.sql',
  '20261105101338_safe_retired_company_purge.sql',
  '20261115120000_drive_account_recovery.sql',
  '20261121145334_lottery_draw_cache.sql',
  '20261121182053_customer_statement_relay.sql',
  '20261124173000_private_lottery_sync_payment.sql',
  '20261125100000_lottery_immutable_feed_recovery.sql',
  '20261125103000_sync_device_pairing.sql',
];

export function disposableDatabase() {
  const url = new URL(process.env.KHATA_SYNC_V2_TEST_URL ?? 'http://missing');
  assert.equal(url.href, 'postgres://postgres@127.0.0.1:5432/khata_sync_v2_test', 'DISPOSABLE_NATIVE_TEST_URL_REQUIRED');
  return {url, sql: postgres(url.href, { max: 8, connection: { statement_timeout: 15000, lock_timeout: 5000 } })};
}

// The stock postgres:17 test service starts with no Supabase roles. In contrast,
// supabase/postgres:17 includes globally initialized roles; repeating CREATE ROLE
// fails even on an empty dedicated database. Keep the standard fixture unchanged
// for all existing tests, and opt in only for the isolated business-cron job.
async function setupSupabaseRolesAlreadyInitialized(init) {
  const required=['service_role','anon','authenticated'];
  const roles=await init.unsafe('select rolname from pg_roles where rolname = any($1)',[required]);
  for(const name of required) assert(roles.some(row=>row.rolname===name),`SUPABASE_BOOTSTRAP_ROLE_MISSING:${name}`);
  await init.unsafe('create schema if not exists auth');
  await init.unsafe('create table if not exists auth.users(id uuid primary key)');
  const [{uid}]=await init.unsafe("select to_regprocedure('auth.uid()') is not null as uid");
  if(!uid) await init.unsafe(`create function auth.uid() returns uuid language sql as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$`);
  for(const file of (await readdir('supabase/migrations')).sort().filter(f=>f<'20261031075245')) {
    const migration=(await readFile('supabase/migrations/'+file,'utf8'))
      .replace('create extension if not exists pg_cron with schema pg_catalog;','')
      .replace("select cron.schedule('khata-retired-company-purge','17 3 * * *','select orbis_khata.purge_retired_companies()');",'');
    await init.unsafe(migration);
  }
}

export async function initializeDisposableDatabase(sql,{supabaseRolesAlreadyInitialized=false}={}) {
  const [preflight] = await sql`select current_setting('server_version_num')::int as version,
    (select count(*)::int from information_schema.tables where table_schema='public') as tables`;
  assert(preflight.version >= 170000 && preflight.version < 180000, 'NATIVE_POSTGRES_17_REQUIRED');
  assert.equal(preflight.tables, 0, 'DISPOSABLE_EMPTY_DATABASE_REQUIRED');
  const init = await sql.reserve();
  try {
    if(supabaseRolesAlreadyInitialized) {
      const [{role,admin}]=await init.unsafe(`select current_user as role,
        (select rolsuper from pg_roles where rolname=current_user) as admin`);
      assert.equal(role,'supabase_admin','SUPABASE_DISPOSABLE_ADMIN_ROLE_REQUIRED');
      assert.equal(admin,true,'SUPABASE_DISPOSABLE_ADMIN_PRIVILEGES_REQUIRED');
      await setupSupabaseRolesAlreadyInitialized(init);
    } else {
      await setup({
        exec: statement => init.unsafe(statement),
        query: async (statement, parameters = []) => ({rows: await init.unsafe(statement, parameters)}),
      });
    }
    for (const file of bootstrap) await init.unsafe(await readFile('supabase/migrations/' + file, 'utf8'));
    for (const file of [
      '20261125_private_company_financial_capture.review.sql',
      '20261125_private_company_group_recovery.review.sql',
      '20261126_private_company_historical_snapshot.review.sql',
    ]) await init.unsafe(await readFile('supabase/review-candidates/' + file, 'utf8'));
    await init.unsafe('grant usage on schema auth to authenticated');
  } finally {
    init.release();
  }
}
