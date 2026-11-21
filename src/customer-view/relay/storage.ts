import { androidLocalFirst } from '../../native-local/route'
import type { Cache } from './model'
const empty = (): Cache => ({version:1,links:{}})
function parse(value: unknown): Cache {
  if(value===null || value===undefined) return empty()
  const cache=value as Cache
  if(cache.version!==1 || !cache.links || typeof cache.links!=='object' || Array.isArray(cache.links)) throw new Error('SHARE_LOCAL_CORRUPTED')
  return structuredClone(cache)
}
function result<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('SHARE_STORAGE_READ_FAILED',{cause:request.error}))}) }
async function browserStore(actor: string, value?: Cache): Promise<Cache> {
  const opening=indexedDB.open('orbis-customer-relay-v1',1)
  opening.onupgradeneeded=()=>opening.result.createObjectStore('sealed')
  const db=await result(opening)
  try {
    const read=db.transaction('sealed','readonly').objectStore('sealed')
    const stored=await result(read.get(actor)) as {key:CryptoKey;iv:Uint8Array;data:ArrayBuffer}|undefined
    if(!value) {
      if(!stored) return empty()
      const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(stored.iv)},stored.key,stored.data)
      return parse(JSON.parse(new TextDecoder().decode(bytes)))
    }
    const key=stored?.key??await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt'])
    const iv=crypto.getRandomValues(new Uint8Array(12))
    const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(value)))
    const tx=db.transaction('sealed','readwrite')
    const finished=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('SHARE_STORAGE_WRITE_FAILED',{cause:tx.error}));tx.onabort=()=>reject(new Error('SHARE_SAVE_ABORTED',{cause:tx.error}))})
    tx.objectStore('sealed').put({key,iv,data},actor)
    await finished // ACK is forbidden until the transaction completes.
    return value
  } finally {db.close()}
}
export async function readRelayCache(actor: string): Promise<Cache> {
  if(androidLocalFirst()) return parse(await (await import('../../native-local/runtime')).readNativeStatementRelay(actor))
  return browserStore(actor)
}
export async function saveRelayCache(actor: string,cache: Cache): Promise<void> {
  if(androidLocalFirst()) await (await import('../../native-local/runtime')).saveNativeStatementRelay(actor,cache)
  else await browserStore(actor,cache)
}
