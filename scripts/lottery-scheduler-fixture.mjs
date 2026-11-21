// Test doubles only: PGlite does not host Supabase Vault, pg_net or pg_cron.
export async function setupLotterySchedulerFixture(db) {
 await db.exec(`create schema vault;create schema cron;create schema net;
 create table vault.secrets(secret text,name text unique);
 create view vault.decrypted_secrets as select secret as decrypted_secret,name from vault.secrets;
 create function vault.create_secret(text,text,text) returns uuid language plpgsql as $$begin insert into vault.secrets values($1,$2);return gen_random_uuid();end$$;
 create table cron.jobs(name text primary key,schedule text,command text);
 create function cron.schedule(text,text,text) returns bigint language plpgsql as $$begin insert into cron.jobs values($1,$2,$3) on conflict(name) do update set schedule=excluded.schedule,command=excluded.command;return 1;end$$;
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;`)
}
export function lotterySchedulerFixtureSql(sql) {
 return sql.replace(/^create extension if not exists pg_cron with schema pg_catalog;$/m, '').replace(/^create extension if not exists pg_net with schema extensions;$/m, '')
}
