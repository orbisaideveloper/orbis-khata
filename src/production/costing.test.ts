import {expect,it} from 'vitest';
import type {InventoryReport,InventoryKind} from '../inventory/model';
import {costOfSales} from '../accounting/business-report';
import {productionCost,purchaseAllocations} from './costing';
function doc(id:string,kind:InventoryKind,item:string,q:bigint,rate:bigint,date='2026-10-01'):InventoryReport['documents'][number]{return {id,company:'company',kind,date,code:'',name:'',unit:'',party:null,reference:id,note:'Test',lines:[{item,warehouse:'w',to:null,quantity:String(q*1000000n),rate:String(rate)}],total:String(q*rate),reversed:false,party_name:null};}
function productionFixture():InventoryReport{return {items:[{id:'feed',name:'Feed',code:'F',unit:'bag'},{id:'milk',name:'Milk',code:'M',unit:'litre'}],warehouses:[{id:'w',name:'Main',code:'W'}],stocks:[],documents:[doc('buy','purchase','feed',500n,5000n),doc('input','production-input','feed',500n,0n),doc('milk1','production-output','milk',500n,0n),doc('sale','sale','milk',100n,6000n)],count:4};}
it('uses one continuous pool, selected date, all output and expenses-independent production cost',()=>{
 const inventory=productionFixture();expect(productionCost(inventory,'2026-10-01')).toMatchObject({inputCost:2500000n,outputQuantity:500000000n,average:5000n,missing:[]});
 inventory.documents.push(doc('milk2','production-output','milk',200n,0n,'2026-10-02'));
 expect(productionCost(inventory,'2026-10-01').average).toBe(5000n);
 const later=productionCost(inventory,'2026-10-02');expect(later.average).toBe(3571n);expect([...later.outputValues.values()].reduce((a,b)=>a+b,0n)).toBe(2500000n);
 expect(costOfSales(inventory,'2026-10-01','2026-10-02')).toMatchObject({missing:[]});expect(costOfSales(inventory,'2026-10-01','2026-10-02').costs.get('sale')).toBe(357143n);
 inventory.documents.push(doc('buy2','purchase','feed',100n,10000n,'2026-10-03'),doc('input2','production-input','feed',100n,0n,'2026-10-03'));
 expect(productionCost(inventory,'2026-10-03').inputCost).toBe(3500000n);expect(productionCost(inventory,'2026-10-03').outputQuantity).toBe(700000000n);
});
it('consumes old stock first, including partial lots, prior sales and exact purchase discounts',()=>{
 const inventory=productionFixture();inventory.documents=[doc('old','purchase','feed',10n,1000n),doc('prior','sale','feed',2n,2000n),doc('new','purchase','feed',10n,3000n,'2026-10-02'),doc('input','production-input','feed',10n,0n,'2026-10-02'),doc('out','production-output','milk',10n,0n,'2026-10-02'),doc('raw-sale','sale','feed',1n,5000n,'2026-10-03')];
 const pool=productionCost(inventory,'2026-10-03');expect(pool.inputCost).toBe(14000n);expect(pool.rawCosts.get('raw-sale:0')?.cost).toBe(3000n);
 expect(costOfSales(inventory,'2026-10-02','2026-10-03').costs.get('raw-sale')).toBe(3000n);
 const multi=doc('multiple','purchase','feed',1n,100n);multi.lines.push({...multi.lines[0],item:'other'});multi.total='101';expect(purchaseAllocations(multi)).toEqual([51n,50n]);
});
it('refuses invented zero costs for missing, negative or opening stock and multiple output units',()=>{
 const inventory=productionFixture();inventory.documents=[doc('input','production-input','feed',1n,0n),doc('clear','purchase','feed',1n,100n,'2026-10-02'),doc('out','production-output','milk',1n,0n)];expect(productionCost(inventory,'2026-10-02').missing).toEqual(['feed']);
 inventory.documents=[doc('opening','opening','feed',2n,0n),doc('input','production-input','feed',1n,0n),doc('out','production-output','milk',1n,0n)];expect(productionCost(inventory,'2026-10-02').missing).toEqual(['feed']);
 inventory.documents=[doc('out','production-output','milk',1n,0n),doc('other','production-output','other',1n,0n)];expect(productionCost(inventory,'2026-10-02').missing.sort()).toEqual(['milk','other']);
 inventory.documents=[];expect(productionCost(inventory,'2026-10-02')).toMatchObject({average:null,outputItem:null,outputQuantity:0n});
});
it('ignores reversed entries and transfers, and recovers after a historical negative quantity clears',()=>{
 const inventory=productionFixture();inventory.documents=[doc('negative','sale','feed',1n,100n),doc('buy','purchase','feed',2n,1000n,'2026-10-02'),doc('input','production-input','feed',1n,0n,'2026-10-03'),doc('out','production-output','milk',1n,0n,'2026-10-03'),{...doc('reversed','production-input','feed',100n,0n),reversed:true},doc('transfer','transfer','feed',1n,0n)];
 const pool=productionCost(inventory,'2026-10-03');expect(pool).toMatchObject({inputCost:1000n,missing:[]});expect(costOfSales(inventory,'2026-10-01','2026-10-03').missing).toEqual(['Feed']);
 inventory.documents.unshift(doc('no-cost-opening','opening','feed',1n,0n));expect(productionCost(inventory,'2026-10-03').inputCost).toBe(1000n);
});

it('finishes old purchased milk before newly produced milk and keeps historical dates reproducible',()=>{
 const inventory=productionFixture();inventory.documents.unshift(doc('old-milk','purchase','milk',100n,2000n,'2026-09-30'));
 expect(costOfSales(inventory,'2026-10-01','2026-10-01').costs.get('sale')).toBe(200000n);
 inventory.documents.push(doc('next-sale','sale','milk',10n,6000n,'2026-10-02'));expect(costOfSales(inventory,'2026-10-02','2026-10-02').costs.get('next-sale')).toBe(50000n);
});
