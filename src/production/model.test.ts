import {expect,it} from 'vitest';
import {validProduction,productionDocument} from './model';
import {inventoryCommand} from '../inventory/model';
import {defaultSettings,validSettings,workspaceInput} from '../accounting/workspace-contract';
const id='11111111-1111-4111-8111-111111111111';
const productionCommand=()=>({company:id,action:'production' as const,id:crypto.randomUUID(),date:'2026-10-01',kind:'input' as 'input'|'output',item:id,warehouse:id,quantity:'1000000',note:'Feed input'});
it('validates a bounded exact command and supports legacy settings and company production flag',()=>{
 const p=productionCommand();expect(workspaceInput(p)).toBe(true);expect(productionDocument(p).kind).toBe('production-input');expect(inventoryCommand(productionDocument(p))).toBeNull();expect(productionDocument({...p,kind:'output'}).kind).toBe('production-output');
 expect(validSettings(defaultSettings())).toBe(true);expect(validSettings({...defaultSettings(),production:true})).toBe(true);expect(validSettings({...defaultSettings(),production:'yes'})).toBe(false);
 for(const change of [{extra:true},{company:'bad'},{action:'bill'},{kind:'bad'},{quantity:'0'},{quantity:1},{quantity:'1000000000000'},{note:''},{note:1},{note:'a'.repeat(501)},{note:'<x>'},{note:'\u0001'},{note:'\u007f'},{date:'2026-02-30'},{date:'bad'},{date:null}])expect(validProduction({...p,...change})).toBe(false);
});
