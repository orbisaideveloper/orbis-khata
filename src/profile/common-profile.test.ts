import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseAccountProfile, requestAccountProfile } from './common-profile'
const customer={orbisIdentityId:'11111111-1111-7111-8111-111111111111',displayId:'ORB-U-23456789'}
const profile={name:'Sample',address:null,alternatePhone:null,dateOfBirth:null,gender:null}
const value={version:'orbis.customer.profile.v1',customer,profile,contact:{email:'sample@example.test',phone:null}}
const session={data:{session:{user:{id:'sample-user'},access_token:'sample-token'}},error:null}
const reader=vi.fn()
beforeEach(()=>{reader.mockResolvedValue(session);vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(value)))})
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
describe('common account profile boundary',()=>{
 it('reads validated central data without trusting client metadata',async()=>{
  expect(await requestAccountProfile(reader,'sample-user',new AbortController().signal)).toEqual({customer,profile,contact:value.contact})
  expect(fetch).toHaveBeenCalledWith('https://orbis-admin-staging.onrender.com/api/v1/customer/profile',expect.objectContaining({method:'GET',cache:'no-store',credentials:'omit',redirect:'error'}))
 })
 it('writes only explicit profile fields with the existing bearer session',async()=>{
  const patch={...profile,name:'New',address:'Address',alternatePhone:'+919999999999',dateOfBirth:'2000-01-01',gender:'other' as const}
  await requestAccountProfile(reader,'sample-user',new AbortController().signal,patch)
  expect(fetch).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({method:'POST',body:JSON.stringify(patch),headers:{authorization:'Bearer sample-token','content-type':'application/json'}}))
 })
 it.each([null,'private',[],{}, {...value,version:'wrong'}, {...value,customer:null}, {...value,profile:[]}, {...value,contact:null},
  {...value,customer:{...customer,orbisIdentityId:'auth-user'}}, {...value,customer:{...customer,displayId:'wrong'}},
  ...Object.entries({name:['',1,'x'.repeat(121)],address:[1,'x'.repeat(1001)],alternatePhone:[1,'x'.repeat(41)],dateOfBirth:[1,'x'.repeat(11)],gender:['admin',false]}).flatMap(([field,values])=>values.map(v=>({...value,profile:{...profile,[field]:v}}))),
  {...value,contact:{email:1,phone:null}}, {...value,contact:{email:null,phone:1}},
 ])('rejects malformed profile responses %#',invalid=>{expect(()=>parseAccountProfile(invalid)).toThrow('PROFILE_INVALID')})
 it.each(['male','female','other','prefer-not-to-say',null])('allows profile gender %s',gender=>{
  expect(parseAccountProfile({...value,profile:{...profile,address:'Sample',alternatePhone:'123',dateOfBirth:'2000-01-01',gender},contact:{email:null,phone:'123'}}).profile.gender).toBe(gender)
 })
 it.each([{data:{session:null},error:null},{...session,error:new Error('private')},{data:{session:{user:{id:'other'},access_token:'private'}},error:null}])('rejects missing or changed sessions',async initial=>{
  reader.mockResolvedValue(initial);await expect(requestAccountProfile(reader,'sample-user',new AbortController().signal)).rejects.toThrow('PROFILE_SESSION_CHANGED');expect(fetch).not.toHaveBeenCalled()
 })
 it('does not start an aborted request',async()=>{const c=new AbortController();c.abort();await expect(requestAccountProfile(reader,'sample-user',c.signal)).rejects.toThrow('PROFILE_SESSION_CHANGED')})
 it.each(['http://example.test','https://user:pass@example.test','https://example.test/path','https://example.test/?secret=x','https://example.test/#fragment'])('rejects unsafe endpoints %s',async base=>{
  vi.stubEnv('VITE_ORBIS_CUSTOMER_API_URL',base);await expect(requestAccountProfile(reader,'sample-user',new AbortController().signal)).rejects.toThrow('PROFILE_ENDPOINT_INVALID');expect(fetch).not.toHaveBeenCalled()
 })
 it.each([401,403,503])('reports HTTP %s without exposing provider responses',async status=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private',{status})));await expect(requestAccountProfile(reader,'sample-user',new AbortController().signal)).rejects.toThrow('PROFILE_UNAVAILABLE')
 })
 it('rejects oversized responses',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('x'.repeat(65537))));await expect(requestAccountProfile(reader,'sample-user',new AbortController().signal)).rejects.toThrow('PROFILE_INVALID')})
})
