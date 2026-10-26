import {afterEach,expect,it} from 'vitest'
import {restoreBill,retainBill,clearBill} from './recovery'
import type {KhataOperation} from '../accounting/server-gateway'
const id='11111111-1111-4111-8111-111111111111'
const bill:KhataOperation={operation:'inventory-post',input:{id,company:id,kind:'purchase',date:'2026-10-25',code:'',name:'',unit:'',party:id,reference:'বাংলা বিল',note:'',lines:[{item:id,warehouse:id,to:null,quantity:'3000000',rate:'3333',unit_rate:'33.33333333'}]}}
afterEach(()=>sessionStorage.clear())
it('restores the exact bill only for its owner and clears it after a confirmed response',()=>{retainBill('owner',bill);expect(restoreBill('owner')).toEqual(bill);expect(restoreBill('another')).toBeNull();clearBill('owner');expect(restoreBill('owner')).toBeNull()})
it('rejects changed, malformed and oversized recovery data',()=>{for(const raw of ['%xx','x'.repeat(196609),encodeURIComponent(JSON.stringify({version:'orbis.khata.data.v1',...bill,input:{...bill.input,note:'<script>'}}))]){sessionStorage.setItem('khata-bill-recovery-v1:owner',raw);expect(restoreBill('owner')).toBeNull()}})
