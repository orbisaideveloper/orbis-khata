// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

it('exports an ordered complete owner partition through the actual Edge SQL without writing', async () => {
  const db = new PGlite()
  try {
    await db.exec('create table khata_lottery_records(owner_id uuid, model text, value jsonb, ordinal bigint)')
    const owner = crypto.randomUUID(), other = crypto.randomUUID()
    const insert = (actor: string, model: string, id: string, ordinal: number) =>
      db.query('insert into khata_lottery_records values($1,$2,$3,$4)', [actor, model, JSON.stringify({ id }), ordinal])
    await insert(owner, 'foundationLotterySale', 'sale', 2)
    await insert(owner, 'foundationLotteryPayment', 'payment', 3)
    await insert(other, 'foundationLotteryPayment', 'foreign', 1)
    const source = await readFile('supabase/functions/orbis-khata-data/index.ts', 'utf8')
    const statement = source.match(/select model, value from public.khata_lottery_records where owner_id=\$\{ledgerOwnerId\}::uuid order by ordinal/)?.[0]
    expect(statement).toBeDefined()
    const result = await db.query(statement!.replace('${ledgerOwnerId}', '$1'), [owner])
    expect(result.rows).toEqual([
      { model: 'foundationLotterySale', value: { id: 'sale' } },
      { model: 'foundationLotteryPayment', value: { id: 'payment' } },
    ])
    expect((await db.query('select count(*)::integer as count from khata_lottery_records')).rows).toEqual([{ count: 3 }])
  } finally {
    await db.close()
  }
}, 30000)
