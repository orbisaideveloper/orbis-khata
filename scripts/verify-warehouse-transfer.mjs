import {readFile} from 'node:fs/promises';
import {setup} from './sql-fixture.mjs';
import {warehouseTransferCases} from './warehouse-transfer-cases.mjs';
const db=await setup(),owner=crypto.randomUUID();
try{
 await db.query('insert into auth.users values($1)',[owner]);
 await db.query('insert into orbis_khata.ledger_owners(id,legacy) values($1,false)',[owner]);
 await db.query("select set_config('request.jwt.claims',$1,false),set_config('orbis.khata.gateway_verified','v1',false)",[JSON.stringify({sub:owner,role:'authenticated'})]);
 await warehouseTransferCases({install:async()=>db.exec(await readFile('supabase/migrations/20261104190750_warehouse_transfer_stock_guard.sql','utf8')),query:(q,p)=>db.query(q,p),write:p=>db.query('select public.khata_inventory_post_v1($1::jsonb)',[JSON.stringify(p)]),owner});
}finally{await db.close();}
