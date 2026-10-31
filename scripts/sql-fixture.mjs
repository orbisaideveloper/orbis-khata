import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
// Scheduler registration is deliberately omitted: PGlite has no pg_cron.
// Every financial/schema statement runs unchanged; scheduling is not certified here.
export async function setup(){
 const db=new PGlite();
 await db.exec(`create role service_role;create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;`);
 for(const file of ['docs/khata-company-proposal.sql','docs/accounting-v1.sql','docs/central-owner-bridge.review.sql','docs/expenses-v1.review.sql','docs/inventory-v1.review.sql']){try{await db.exec(await readFile(file,'utf8'));}catch(e){console.log(file,e.message);throw e;}}
 for(const file of (await readdir('supabase/migrations')).sort().filter(f=>f<'20261031075245')){try{await db.exec((await readFile('supabase/migrations/'+file,'utf8')).replace('create extension if not exists pg_cron with schema pg_catalog;','').replace("select cron.schedule('khata-retired-company-purge','17 3 * * *','select orbis_khata.purge_retired_companies()');",''));}catch(e){console.log(file,e.message);throw e;}}
 return db;
}
