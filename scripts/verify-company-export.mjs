import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setup } from './sql-fixture.mjs'

const db = await setup()
try {
  await db.exec(await readFile('supabase/migrations/20261031081126_continuous_production.sql', 'utf8'))
  await db.exec(await readFile('supabase/migrations/20261101144338_expense_profile_schedules.sql', 'utf8'))
  const owner = crypto.randomUUID(), other = crypto.randomUUID()
  const company = crypto.randomUUID(), party = crypto.randomUUID(), sale = crypto.randomUUID(), receipt = crypto.randomUUID()
  await db.query('insert into orbis_khata.ledger_owners(id,legacy) values($1,false),($2,false)', [owner, other])
  await db.query("insert into public.khata_companies(id,owner_id,name) values($1,$2,'Fixture')", [company, owner])
  await db.query("insert into public.khata_parties(id,company_id,name,kind) values($1,$2,'Customer','customer')", [party, company])
  await db.query("select set_config('request.jwt.claims',$1,false),set_config('orbis.khata.gateway_verified','v1',false)", [JSON.stringify({sub:owner,role:'authenticated'})])
  const post = (id, kind, amount) => db.query("select public.khata_post_v1($1::uuid,$2::uuid,$3::uuid,$4,'2026-11-16'::date,$5,'cash','','Fixture',null)", [id, company, party, kind, amount])
  await post(sale, 'sale', '10000')
  await post(receipt, 'receipt', '3500')
  await db.query("insert into public.khata_payment_links values($1,$2,$3,'cash')", [receipt, company, sale])

  const source = await readFile('supabase/functions/orbis-khata-data/company-export.ts', 'utf8')
  const query = source.split('`')[1].replace('${company}', '$1').replace('${owner}', '$2')
  const read = candidate => db.query(query, [company, candidate])
  const { snapshot } = (await read(owner)).rows[0]
  assert.equal(snapshot.company.id, company)
  assert.equal(snapshot.entries.length, 2)
  assert.equal(snapshot.paymentLinks[receipt].bill, sale)
  assert.deepEqual(snapshot.balances, { cash: '3500', sales: '-10000', receivable: '6500' })
  assert.equal((await read(other)).rows.length, 0)
  await db.query('update public.khata_companies set deleted_at=now() where id=$1', [company])
  assert.equal((await read(owner)).rows.length, 0)
  console.log('PASS: company export, bill and payment links, balances, tenant isolation and deleted-company exclusion.')
} finally {
  await db.close()
}
