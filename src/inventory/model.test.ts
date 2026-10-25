import { inventoryPendingKey, restoreInventory } from './pending'
import { afterEach, expect, it } from 'vitest'
import { billTotal, displayQuantity, inventoryCommand, quantity } from './model'
const id='11111111-1111-4111-8111-111111111111'
const other='22222222-2222-4222-8222-222222222222'
const base={id,company:id,kind:'purchase',date:'2026-10-25',code:'',name:'',unit:'',party:id,reference:'P1',note:'',lines:[{item:id,warehouse:id,to:null,quantity:'1250000',rate:'12345'}]}
it('calculates fractional quantities and rounds each bill line in exact paise',()=>{
 expect(quantity('1.250001')).toBe('1250001')
 expect(displayQuantity('1250001')).toBe('1.250001')
 expect(displayQuantity('-1000000')).toBe('-1')
 expect(billTotal(base.lines)).toBe(15431n)
 expect(billTotal([{...base.lines[0],quantity:'500000',rate:'1'}])).toBe(1n)
})
it.each(['0','-1','1e3','1,5','1.0000001','1000000','NaN'])('rejects invalid quantity %s',value=>{expect(()=>quantity(value)).toThrow()})
it('validates exact fields and rejects arbitrary objects, dates and units',()=>{
 expect(inventoryCommand(base)).not.toBeNull()
 expect(inventoryCommand({...base,extra:true})).toBeNull()
 expect(inventoryCommand({...base,date:'2026-02-30'})).toBeNull()
 expect(inventoryCommand({...base,note:'<script>'})).toBeNull()
 expect(inventoryCommand({...base,lines:[{...base.lines[0],rate:{toString:()=> '123'}}]})).toBeNull()
})
it('supports arbitrary fixed unit names and enforces master and transfer shapes',()=>{
 const item={...base,kind:'item',code:'MILK-01',name:'Milk',unit:'লিটার',party:null,lines:[]}
 expect(inventoryCommand(item)).not.toBeNull()
 expect(inventoryCommand({...item,unit:' '})).toBeNull()
 expect(inventoryCommand({...item,unit:''})).toBeNull()
 const transfer={...base,kind:'transfer',party:null,note:'Move',lines:[{...base.lines[0],rate:'0',to:other}]}
 expect(inventoryCommand(transfer)).not.toBeNull()
 expect(inventoryCommand({...transfer,lines:[{...transfer.lines[0],to:id}]})).toBeNull()
 expect(inventoryCommand({...transfer,note:''})).toBeNull()
})
it('bounds bill size and amount without binary floating point',()=>{
 expect(inventoryCommand({...base,lines:Array(51).fill(base.lines[0])})).toBeNull()
 expect(inventoryCommand({...base,lines:[{...base.lines[0],quantity:'999999999999',rate:'999999999999'}]})).toBeNull()
})

afterEach(()=>sessionStorage.clear())
it('recovers encoded Unicode and legacy pending commands without changing their identity',()=>{
 const command={...base,reference:'বিল-১',note:'দুধ কেনা'}
 for(const stored of [JSON.stringify(command),encodeURIComponent(JSON.stringify(command))]){
  sessionStorage.setItem(inventoryPendingKey('owner'),stored)
  expect(restoreInventory('owner')).toEqual(command)
  expect(restoreInventory('another-owner')).toBeNull()
  expect(sessionStorage.getItem(inventoryPendingKey('owner'))).toBe(stored)
 }
})
it('rejects poisoned, malformed and oversized retry storage without erasing it',()=>{
 const inputs=[
  encodeURIComponent(JSON.stringify({...base,note:'<script>attack</script>'})),
  JSON.stringify({...base,extra:'injected'}),
  '%E0%A4%A',
  'x'.repeat(98305),
  encodeURIComponent(JSON.stringify({...base,note:'x'.repeat(32769)})),
 ]
 for(const stored of inputs){
  sessionStorage.setItem(inventoryPendingKey('owner'),stored)
  expect(restoreInventory('owner')).toBeNull()
  expect(sessionStorage.getItem(inventoryPendingKey('owner'))).toBe(stored)
 }
})
