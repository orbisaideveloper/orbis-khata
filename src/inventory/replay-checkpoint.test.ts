import {expect,it} from 'vitest';
import {ReplayCheckpoints} from './replay-checkpoint';
import {CostPool} from './cost-pool';
it('reuses only matching prefixes and replays edited, removed and tenant-specific history',()=>{
 const cache=new ReplayCheckpoints<{total:number}>(state=>({...state}),2);let calls=0;
 const run=(key:string,docs:number[])=>cache.run(key,docs,()=>({total:0}),(s,i)=>{calls++;s.total+=docs[i];});
 expect(run('a',[1,2,3,4]).total).toBe(10);expect(calls).toBe(4);
 expect(run('a',[1,2,3,4,5]).total).toBe(15);expect(calls).toBe(5);
 expect(run('a',[1,2,30,4,5]).total).toBe(42);expect(calls).toBe(8);
 expect(run('a',[1,2]).total).toBe(3);
 expect(run('b',[1,2]).total).toBe(3);expect(run('c',[1,2]).total).toBe(3);
 cache.clear();expect(run('a',[9]).total).toBe(9);
});
it('copies deferred withdrawals so resumed receipts cannot mutate earlier results',()=>{
 const pool=new CostPool(true),withdrawal=pool.withdraw(3n),copy={...withdrawal};
 const fork=pool.fork(new Map([[withdrawal,copy]]));fork.receive(5n,100n);
 expect(copy).toMatchObject({cost:60n,known:true});expect(withdrawal.known).toBe(false);
 expect(fork.balance()).toMatchObject({quantity:2n,value:40n});expect(pool.balance().quantity).toBe(-3n);
});
it('bounds checkpoint retention and falls back to authoritative replay for oversized histories',()=>{
 const cache=new ReplayCheckpoints<{sum:number}>(s=>({...s}),2);
 const values=Array.from({length:10},(_,i)=>i),run=(docs:number[])=>cache.run('x',docs,()=>({sum:0}),(s,i)=>{s.sum+=docs[i];});
 expect(run(values).sum).toBe(45);expect(run([0,1]).sum).toBe(1);
 const large=Array.from({length:10001},()=>1);expect(run(large).sum).toBe(10001);expect(run([5]).sum).toBe(5);
});
