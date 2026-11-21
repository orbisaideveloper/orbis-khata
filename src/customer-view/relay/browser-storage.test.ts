import { afterEach,expect,it,vi } from 'vitest'
import { indexedDB, IDBObjectStore, IDBDatabase } from 'fake-indexeddb'
import { readRelayCache,saveRelayCache } from './storage'
vi.mock('../../native-local/route',()=>({androidLocalFirst:()=>false}))
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})
it('persists an encrypted browser copy, survives reopen and isolates identities',async()=>{
 vi.stubGlobal('indexedDB',indexedDB)
 expect(await readRelayCache('first')).toEqual({version:1,links:{}})
 const cache={version:1 as const,links:{}}
 await saveRelayCache('first',cache)
 expect(await readRelayCache('first')).toEqual(cache)
 expect(await readRelayCache('second')).toEqual(cache)
 const opening=indexedDB.open('orbis-customer-relay-v1')
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{opening.onsuccess=()=>resolve(opening.result);opening.onerror=()=>reject(opening.error)})
 const req=db.transaction('sealed').objectStore('sealed').get('first')
 const row=await new Promise<{key:CryptoKey;data:ArrayBuffer}>((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})
 expect(row.key.extractable).toBe(false)
 expect(new TextDecoder().decode(row.data)).not.toContain('version')
 db.close()
})
it('does not report a successful save when browser storage rejects the write',async()=>{
 vi.stubGlobal('indexedDB',indexedDB)
 vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(()=>{throw new Error('quota')})
 await expect(saveRelayCache('full',{version:1,links:{}})).rejects.toThrow('quota')
})

it.each([null,new DOMException('synthetic read error','UnknownError')])('normalizes IndexedDB open failures to an Error, including a missing native reason',async error=>{
 const request:{error:DOMException|null;onerror:(()=>void)|null}={error,onerror:null}
 vi.stubGlobal('indexedDB',{open:()=>{queueMicrotask(()=>request.onerror?.());return request}})
 await expect(readRelayCache('failed-open')).rejects.toMatchObject({message:'SHARE_STORAGE_READ_FAILED',cause:error})
})
it.each(['onerror','onabort'] as const)('never reports durable success after a transaction %s with a null native error',async event=>{
 vi.stubGlobal('indexedDB',indexedDB)
 const original=IDBDatabase.prototype.transaction
 vi.spyOn(IDBDatabase.prototype,'transaction').mockImplementation(function(this:IDBDatabase,...args:Parameters<typeof original>){
  if(args[1]!=='readwrite')return original.apply(this,args)
  const tx:{error:null;onerror:(()=>void)|null;onabort:(()=>void)|null;objectStore:()=>unknown}={error:null,onerror:null,onabort:null,objectStore:()=>({put:()=>queueMicrotask(()=>tx[event]?.())})}
  return tx as unknown as ReturnType<typeof original>
 })
 await expect(saveRelayCache('failed-'+event,{version:1,links:{}})).rejects.toMatchObject({message:event==='onerror'?'SHARE_STORAGE_WRITE_FAILED':'SHARE_SAVE_ABORTED',cause:null})
})
