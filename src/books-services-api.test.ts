import {afterEach,expect,it,vi} from 'vitest'
const request=vi.hoisted(()=>vi.fn().mockResolvedValue('100'))
vi.mock('./accounting/api',()=>({requestKhata:request}))
import {liveBookServices} from './books-services'
import {emptyPartyDetails} from './demo/master-model'
afterEach(()=>vi.clearAllMocks())
it('routes authenticated masters, deletes, balance and expense lines to their versioned gateway operations',async()=>{
 const item={id:'item',company:'company',name:'Milk',code:'',unit:'litre',default_rate:null},party={id:'party',company:'company',name:'Customer',kind:'customer' as const,receivable:'0',payable:'0',...emptyPartyDetails}
 await liveBookServices.saveItem(item);await liveBookServices.saveParty(party);await liveBookServices.deleteItem('company','item');await liveBookServices.deleteParty('company','party');expect(await liveBookServices.previous('company','party','2026-10-25','sale')).toBe('100')
 const command={id:'bill',company:'company',date:'2026-10-25',kind:'charge' as const,amount:'100',category:'Rent',payee:'Landlord',method:null,parent:null,reference:'',note:''},lines=[{description:'Rent',quantity:'1000000',unit:'',rate:'100'}];await liveBookServices.expenseBill(command,lines)
 expect(request.mock.calls).toEqual([['item-save',item],['party-save',party],['item-delete',{company:'company',id:'item'}],['party-delete',{company:'company',id:'party'}],['party-balance',{company:'company',party:'party',date:'2026-10-25',kind:'sale'}],['expense-bill',{command,lines}]])
})
