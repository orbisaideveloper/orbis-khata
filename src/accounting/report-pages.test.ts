import {expect,it,vi} from 'vitest';
import {allPages,assertReportRevision} from './report-pages';
it('keeps each page on the same committed company revision',async()=>{
 const first={count:51,revision:'7',entries:['a']},load=vi.fn(async()=>({count:51,revision:'7',entries:['b']}));
 expect((await allPages(first,'entries',load)).entries).toEqual(['a','b']);expect(first.entries).toEqual(['a']);
 await expect(allPages(first,'entries',async()=>({...first,revision:'8'}))).rejects.toThrow('REPORT_CHANGED_RETRY');
 await expect(allPages(first,'entries',async()=>({...first,count:52}))).rejects.toThrow('REPORT_CHANGED_RETRY');
});
it('rejects mixed concurrent report families but preserves explicit legacy compatibility',()=>{
 expect(()=>assertReportRevision({revision:'7'},{revision:'8'})).toThrow('REPORT_CHANGED_RETRY');
 expect(()=>assertReportRevision({},{revision:'7'})).toThrow('REPORT_CHANGED_RETRY');
 expect(()=>assertReportRevision({revision:'7'},{})).toThrow('REPORT_CHANGED_RETRY');
 expect(()=>assertReportRevision({},{})).not.toThrow();expect(()=>assertReportRevision({revision:'7'},{revision:'7'})).not.toThrow();
});
