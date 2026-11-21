import {expect,it,vi} from 'vitest'
import type {Route} from '@playwright/test'
import {emptyStatementRelay} from '../e2e-central/statement-relay-fixture'
function fixture(path='/khata/customer-relay',method='POST',body:unknown={version:'orbis.khata.data.v1',operation:'customer-relay',input:{action:'list'}},token='Bearer test.access') {
 const fulfill=vi.fn().mockResolvedValue(undefined)
 const route={request:()=>({url:()=> 'https://data.example.test'+path,method:()=>method,headers:()=>({authorization:token}),postDataJSON:()=>body}),fulfill} as unknown as Route
 return {route,fulfill}
}
it('leaves unrelated accounting requests with their original scenario backend',async()=>{
 const f=fixture('/khata');expect(await emptyStatementRelay(f.route)).toBe(false);expect(f.fulfill).not.toHaveBeenCalled()
})
it('supports preflight and returns the exact empty list contract',async()=>{
 const preflight=fixture('/khata/customer-relay','OPTIONS');expect(await emptyStatementRelay(preflight.route)).toBe(true);expect(preflight.fulfill).toHaveBeenCalledWith(expect.objectContaining({status:204}))
 const f=fixture();expect(await emptyStatementRelay(f.route)).toBe(true);expect(f.fulfill).toHaveBeenCalledWith(expect.objectContaining({status:200,json:{data:[]}}))
})
it.each([
 {version:'bad',operation:'customer-relay',input:{action:'list'}},
 {version:'orbis.khata.data.v1',operation:'post',input:{action:'list'}},
 {version:'orbis.khata.data.v1',operation:'customer-relay',input:{action:'publish'}},
 {version:'orbis.khata.data.v1',operation:'customer-relay',input:{action:'list',owner:'forged'}},
])('rejects unexpected operations instead of masking a product regression',async body=>{
 await expect(emptyStatementRelay(fixture('/khata/customer-relay','POST',body).route)).rejects.toThrow('UNEXPECTED_STATEMENT_RELAY_REQUEST')
})
it('retains the authenticated protocol boundary',async()=>{
 await expect(emptyStatementRelay(fixture('/khata/customer-relay','POST',{},'Bearer other').route)).rejects.toThrow('UNEXPECTED_STATEMENT_RELAY_REQUEST')
})
