import {setupLotterySchedulerFixture,lotterySchedulerFixtureSql} from './lottery-scheduler-fixture.mjs';
import {phase2SafetyCases} from './phase2-safety-cases.mjs';
import {readFile,readdir} from 'node:fs/promises';
import {setup} from './sql-fixture.mjs';
const db=await setup();
try{
 for(const file of (await readdir('supabase/migrations')).sort().filter(f=>f>='20261031075245')) {
  let sql=await readFile('supabase/migrations/'+file,'utf8');
  if(file==='20261121145730_lottery_scheduler.sql'){
   await setupLotterySchedulerFixture(db);
   sql=lotterySchedulerFixtureSql(sql);
  }
  await db.exec(sql);
 }
 await phase2SafetyCases(db);
 console.log('PASS: complete migration SQL chain (Supabase scheduler extensions use explicit test doubles); shared quota/reset/role denial; eligible profile purge; active/recoverable preservation; dependency rollback and batch isolation');
}finally{await db.close();}
