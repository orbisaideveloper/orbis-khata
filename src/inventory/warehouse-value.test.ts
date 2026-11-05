import {expect,it} from 'vitest';
import {warehouseValues} from './warehouse-value';
import type {InventoryReport} from './model';
it('conserves residual value across godowns and keeps unknown/negative stock explicit',()=>{const data={stocks:[{item:'i',warehouse:'b',closing:'2000000'},{item:'i',warehouse:'a',closing:'1000000'}]} as InventoryReport;const values=[{id:'i',value:100n,complete:true}];const a=warehouseValues(data,values,'a')[0],b=warehouseValues(data,values,'b')[0];expect(a.value).toBe(33n);expect(b.value).toBe(67n);expect(a.value+b.value).toBe(100n);data.stocks[0].closing='-1000000';expect(warehouseValues(data,values,'a')[0].complete).toBe(false);});

it('never assigns a negative rounding residual to the last godown',()=>{const data={stocks:['a','b','c','d'].map(warehouse=>({item:'i',warehouse,closing:'1'}))} as InventoryReport;const values=[{id:'i',value:2n,complete:true}];const shares=['a','b','c','d'].map(w=>warehouseValues(data,values,w)[0].value);expect(shares.every(n=>n>=0n)).toBe(true);expect(shares.reduce((a,b)=>a+b,0n)).toBe(2n);});
