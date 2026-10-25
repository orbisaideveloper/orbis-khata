import { expect, it, vi } from 'vitest'
import { createKhataGateway, khataOperation } from '../accounting/server-gateway'
const id='11111111-1111-4111-8111-111111111111'
const principal={orbisIdentityId:'11111111-1111-7111-8111-111111111111',displayId:'ORB-U-23456789'}
const envelope=(operation:string,input:unknown)=>({version:'orbis.khata.data.v1',operation,input})
const master={id,company:id,kind:'item',date:'2026-10-25',code:'A1',name:'Rice',unit:'kg',party:null,reference:'',note:'',lines:[]}
const range={company:id,from:'2026-10-01',to:'2026-10-25',offset:0}
it('accepts only exact, scoped inventory write and report contracts',()=>{
 expect(khataOperation(envelope('inventory-post',master))?.input).toEqual(master)
 expect(khataOperation(envelope('inventory-report',range))?.input).toEqual(range)
 for(const patch of [{company:'wrong'},{to:'2026-09-01'},{offset:-1},{offset:'0'},{offset:0.5},{extra:true}])expect(khataOperation(envelope('inventory-report',{...range,...patch}))).toBeNull()
 expect(khataOperation(envelope('inventory-post',{...master,owner_id:principal.orbisIdentityId}))).toBeNull()
})
it('verifies the live Central session for every inventory request before execution',async()=>{
 const verify=vi.fn().mockResolvedValueOnce(principal).mockResolvedValueOnce(null),execute=vi.fn().mockResolvedValue({items:[]})
 const handler=createKhataGateway({origins:[],verify,execute})
 const request=()=>new Request('https://gateway.example',{method:'POST',headers:{authorization:'Bearer central.token'},body:JSON.stringify(envelope('inventory-report',range))})
 expect((await handler(request())).status).toBe(200)
 expect((await handler(request())).status).toBe(401)
 expect(verify).toHaveBeenCalledTimes(2);expect(execute).toHaveBeenCalledOnce()
 expect(execute).toHaveBeenCalledWith(principal,{operation:'inventory-report',input:range})
})
