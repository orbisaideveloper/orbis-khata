import {expect,it} from 'vitest';
import {CostPool} from './cost-pool';

it('settles earlier sales from later receipts without changing the original withdrawal',()=>{
 const pool=new CostPool(),first=pool.withdraw(3n),second=pool.withdraw(2n);
 expect(pool.balance()).toEqual({quantity:-5n,value:0n,known:false});
 pool.receive(4n,101n);
 expect(first).toEqual({cost:76n,missing:0n,unpriced:0n,known:true});
 expect(second).toMatchObject({cost:25n,missing:1n,known:false});
 pool.receive(3n,90n);
 expect(second).toMatchObject({cost:55n,missing:0n,known:true});
 expect(pool.balance()).toEqual({quantity:2n,value:60n,known:true});
 expect(first.cost+second.cost+pool.balance().value).toBe(191n);
});
it('preserves old FIFO stock and exact rounding on partial depletion',()=>{
 const pool=new CostPool();pool.receive(3n,100n);pool.receive(2n,200n);
 expect(pool.withdraw(1n)).toMatchObject({cost:33n,known:true});
 expect(pool.withdraw(3n)).toMatchObject({cost:167n,known:true});
 expect(pool.balance().value).toBe(100n);
 expect(pool.withdraw(1n).cost).toBe(100n);
 expect(pool.balance()).toEqual({quantity:0n,value:0n,known:true});
});
it('keeps moving-average ordinary stock distinct from FIFO',()=>{
 const pool=new CostPool(true);pool.receive(10n,1000n);pool.withdraw(4n);pool.receive(10n,2000n);
 expect(pool.withdraw(8n).cost).toBe(1300n);expect(pool.balance().value).toBe(1300n);
});
it('never declares unpriced opening stock or unknown production cost complete',()=>{
 const pool=new CostPool();const sale=pool.withdraw(2n);pool.receive(2n,0n,false);
 expect(sale).toMatchObject({missing:0n,unpriced:2n,known:false});
 pool.receive(2n,0n,false);expect(pool.balance().known).toBe(false);
 expect(pool.withdraw(1n)).toMatchObject({unpriced:1n,known:false});
});
it('conserves value for varied quantities, fractional allocations and deferred receipts',()=>{
 for(let n=1n;n<=40n;n++){
  const pool=new CostPool(),a=pool.withdraw(n),b=pool.withdraw(n+1n);
  pool.receive(3n*n+2n,101n*n+7n);
  expect(a.known&&b.known).toBe(true);
  expect(a.cost+b.cost+pool.balance().value).toBe(101n*n+7n);
 }
});
