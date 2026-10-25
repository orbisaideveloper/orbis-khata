import { expect, it, vi } from 'vitest'
import { inventoryReport, postInventory } from './api'
import type { InventoryCommand } from './model'
const gateway=vi.hoisted(()=>vi.fn())
vi.mock('../accounting/api',()=>({requestKhata:gateway}))
it('scopes stock history to the selected company, period and offset',async()=>{
 const data={items:[],warehouses:[],stocks:[],documents:[],count:0}
 gateway.mockResolvedValueOnce(data)
 expect(await inventoryReport('company','2026-10-01','2026-10-25',50)).toBe(data)
 expect(gateway).toHaveBeenLastCalledWith('inventory-report',{company:'company',from:'2026-10-01',to:'2026-10-25',offset:50})
})
it('forwards the exact reviewed command and propagates an uncertain save',async()=>{
 const command:InventoryCommand={id:'id',company:'company',kind:'warehouse',date:'2026-10-25',code:'G1',name:'Shop',unit:'',party:null,reference:'',note:'',lines:[]}
 gateway.mockResolvedValueOnce(undefined)
 await expect(postInventory(command)).resolves.toBeUndefined()
 expect(gateway).toHaveBeenLastCalledWith('inventory-post',command)
 const failure=new Error('network')
 gateway.mockRejectedValueOnce(failure)
 await expect(postInventory(command)).rejects.toBe(failure)
})
