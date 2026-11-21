import { requestStatementRelay } from '../../accounting/api'
import { readRelayCache, saveRelayCache } from './storage'
import { exchange } from './sync'
import { readSource } from './source'
import type { Cache } from './model'
const pending=new Map<string,Promise<Cache>>()
export function syncStatements(actor: string,active: ()=>boolean) {
  const existing=pending.get(actor)
  if(existing) return existing
  const task=exchange({read:()=>readRelayCache(actor),save:async cache=>{if(!active())throw new Error('SHARE_ACTOR_CHANGED');await saveRelayCache(actor,cache)},request:command=>{if(!active())throw new Error('SHARE_ACTOR_CHANGED');return requestStatementRelay(actor,command)},source:scope=>readSource(actor,scope),active}).finally(()=>pending.delete(actor))
  pending.set(actor,task)
  return task
}
