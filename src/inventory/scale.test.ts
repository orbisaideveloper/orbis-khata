import {expect,it,vi} from 'vitest';
import {CostPool} from './cost-pool';
import {ReplayCheckpoints} from './replay-checkpoint';
import {productionCost} from '../production/costing';
import type {InventoryReport} from './model';
it('settles 100000 deferred sales with exact value conservation and no repeated queue shifts',()=>{
 const start=performance.now(),pool=new CostPool(true),requests=Array.from({length:100000},()=>pool.withdraw(1000000n));
 pool.receive(100005000000n,3100155n);
 expect(requests.every(row=>row.known)).toBe(true);
 expect(requests.reduce((sum,row)=>sum+row.cost,0n)+pool.balance().value).toBe(3100155n);
 expect(pool.balance().quantity).toBe(5000000n);
 console.info(JSON.stringify({fixture:'100000-deferred-sales',elapsedMs:Math.round(performance.now()-start)}));
},30000);
it('compacts a partially settled queue and clones only unresolved requests',()=>{
 const pool=new CostPool(true),requests=Array.from({length:5000},()=>pool.withdraw(1n));pool.receive(4000n,400000n);
 expect(requests.filter(row=>row.known)).toHaveLength(4000);expect(pool.balance().quantity).toBe(-1000n);
 const fork=pool.fork();fork.receive(1000n,100000n);expect(fork.balance()).toMatchObject({quantity:0n,value:0n,known:true});expect(pool.balance().quantity).toBe(-1000n);
});
it('avoids copying growing checkpoint state for oversized histories',()=>{
 const clone=vi.fn((state:{value:number})=>({...state})),cache=new ReplayCheckpoints(clone);
 const source=Array.from({length:10001},(_,i)=>i);
 expect(cache.run('company',source,()=>({value:0}),(s,i)=>{s.value+=source[i];}).value).toBe(50005000);expect(clone).not.toHaveBeenCalled();
});
it('recalculates a large raw-material history exactly after a backdated correction',()=>{
 const purchases:InventoryReport['documents']=Array.from({length:12000},(_,i)=>({id:'buy'+String(i).padStart(6,'0'),company:'scale-fixture',kind:'purchase',date:'2026-01-01',code:'',name:'',unit:'',party:null,party_name:null,reference:'',note:'',total:String(3000+i%3*100),reversed:false,lines:[{item:'feed',warehouse:'main',to:null,quantity:'1000000',rate:String(3000+i%3*100)}]}));
 const input={...purchases[0],id:'input',kind:'production-input' as const,total:'0',lines:[{...purchases[0].lines[0],quantity:'8000000000',rate:'0'}]};
 const data:InventoryReport={items:[{id:'feed',name:'Feed',code:'F',unit:'kg'}],warehouses:[],stocks:[],count:12001,documents:[...purchases,input]};
 const start=performance.now(),first=productionCost(data,'2026-01-01');expect(first.inputCost).toBe(24800000n);
 data.documents[0]={...data.documents[0],total:'15000'};const next=productionCost(data,'2026-01-01');
 expect(next.inputCost).toBe(24808000n);expect(next.inputCost+next.rawPools.get('feed')!.balance().value).toBe(37212000n);expect(first.inputCost).toBe(24800000n);
 console.info(JSON.stringify({fixture:'12001-documents-and-correction',elapsedMs:Math.round(performance.now()-start)}));
},30000);
