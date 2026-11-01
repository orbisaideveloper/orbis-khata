import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sonarReport} from './check-sonar.mjs';
const scope={project:'test',branch:'main',taskId:'current-task'};
function fixture(overrides={}) {
 const data={
  '/api/ce/task':{task:{status:'SUCCESS',analysisId:'current-analysis'}},
  '/api/qualitygates/project_status':{projectStatus:{status:'OK',conditions:[{metricKey:'new_coverage',status:'OK',errorThreshold:'80',actualValue:'95'}]}},
  '/api/issues/search':{total:0,issues:[]},
  '/api/hotspots/search':{paging:{total:0}},
  '/api/measures/component':{component:{measures:[{metric:'coverage',value:'95'},{metric:'duplicated_lines_density',value:'0'}]}},...overrides};
 return async(path,params)=>{if(path==='/api/qualitygates/project_status')assert.equal(params.analysisId,'current-analysis');const value=data[path];if(value instanceof Error)throw value;return value;};
}
test('passes only the current analysis with all strict policies intact',async()=>{const result=await sonarReport(fixture(),scope);assert.deepEqual(result.failures,[]);assert.match(result.lines.join('\n'),/SONAR_CONDITION/);assert.equal(result.lines.at(-1),'STRICT SONAR CHECK: PASS');});
test('failed gate and issues do not hide hotspot or overall metrics',async()=>{const result=await sonarReport(fixture({
 '/api/qualitygates/project_status':{projectStatus:{status:'ERROR',conditions:[{metricKey:'new_coverage',status:'ERROR',errorThreshold:'80',actualValue:'70'}]}},
 '/api/issues/search':{total:2,issues:[{key:'issue',rule:'rule',component:'file.ts',line:12,severity:'MAJOR',message:'Fix this'}]},
 '/api/hotspots/search':{paging:{total:1},hotspots:[{key:'hotspot',component:'file.ts',line:13,message:'Review'}]},
 '/api/measures/component':{component:{measures:[{metric:'coverage',value:'89'},{metric:'duplicated_lines_density',value:'1'}]}}
 }),scope);assert.equal(result.failures.length,4);const lines=result.lines.join('\n');for(const expected of ['SONAR_ISSUE','SONAR_HOTSPOT','Showing first 1 of 2','coverage: 89%','duplication: 1%','STRICT SONAR CHECK: FAIL'])assert.ok(lines.includes(expected));});
test('API error and missing data remain failed while other evidence is collected',async()=>{const result=await sonarReport(fixture({'/api/issues/search':new Error('HTTP 403'),'/api/hotspots/search':{},'/api/measures/component':{}}),scope);assert.equal(result.failures.length,3);assert.match(result.lines.join('\n'),/Quality gate: OK/);assert.match(result.lines.join('\n'),/HTTP 403/);});
test('never substitutes an old successful gate when the current analysis is missing',async()=>{let called=false;const get=fixture({'/api/ce/task':{task:{status:'FAILED'}}});const result=await sonarReport(async(path,params)=>{if(path==='/api/qualitygates/project_status')called=true;return get(path,params);},scope);assert.equal(called,false);assert.match(result.failures[0],/Current analysis is not ready/);});
