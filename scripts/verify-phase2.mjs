import {phase2SafetyCases} from './phase2-safety-cases.mjs';
import {readFile,readdir} from 'node:fs/promises';
import {setup} from './sql-fixture.mjs';
const db=await setup();
try{
 for(const file of (await readdir('supabase/migrations')).sort().filter(f=>f>='20261031075245')) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 await phase2SafetyCases(db);
 console.log('PASS: clean complete migration chain; shared quota/reset/role denial; eligible profile purge; active/recoverable preservation; dependency rollback and batch isolation');
}finally{await db.close();}
