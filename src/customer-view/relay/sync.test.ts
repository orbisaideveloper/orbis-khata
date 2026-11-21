import { expect, it, vi } from 'vitest'
import { applyEnvelope, difference, relayCommand, type Cache, type Dataset, type Link } from './model'
import { exchange, type RelayPorts } from './sync'
const scope={module:'khata' as const,company:'11111111-1111-4111-8111-111111111111',party:'22222222-2222-4222-8222-222222222222',companyName:'Own books',partyName:'Own party'}
const row={id:'bill',date:'2026-11-21',reference:'S1',kind:'sale',account:'receivable' as const,amount:'120'}
const next: Dataset={scope,rows:[row]}
const link: Link={...scope,id:'33333333-3333-4333-8333-333333333333',recipient:'ORB-U-23456789',status:'accepted',outgoing:false,revision:1,acknowledged:0,resync:false}
const envelope={revision:1,base:0,patch:difference(next)!}
function setup() {
 let disk:Cache={version:1,links:{}}
 const order:string[]=[]
 const request=vi.fn(async(command: {action:string})=>{
  order.push(command.action)
  if(command.action==='list')return [link]
  if(command.action==='pull')return envelope
  return {revision:1}
 })
 const save=vi.fn(async(cache:Cache)=>{order.push('save');disk=structuredClone(cache)})
 const ports={read:async()=>structuredClone(disk),save,request,source:async()=>next,active:()=>true} as unknown as RelayPorts
 return {ports,request,save,order,disk:()=>disk}
}
it('durably saves before ACK and replays without duplicate rows',async()=>{
 const f=setup();await exchange(f.ports)
 expect(f.order).toEqual(['list','save','pull','save','ack'])
 await exchange(f.ports)
 expect(f.disk().links[link.id].dataset?.rows).toEqual([row])
})
it('never ACKs a failed disk commit and can recover on the next attempt',async()=>{
 const f=setup();f.save.mockImplementationOnce(async()=>{}).mockRejectedValueOnce(new Error('disk full'))
 await expect(exchange(f.ports)).rejects.toThrow('disk full')
 expect(f.order).not.toContain('ack')
 await exchange(f.ports)
 expect(f.disk().links[link.id].revision).toBe(1)
})
it('retains the durable copy across a lost ACK response',async()=>{
 const f=setup();f.request.mockImplementation(async command=>{if(command.action==='list')return [link];if(command.action==='pull')return envelope;throw new Error('offline')})
 await expect(exchange(f.ports)).rejects.toThrow('offline')
 expect(f.disk().links[link.id].dataset?.rows).toEqual([row])
})
it('applies corrections, deletions and negative balances exactly',()=>{
 const current=applyEnvelope({link,revision:0},envelope)
 const revised:Dataset={scope,rows:[{...row,amount:'-10'},{...row,id:'payment',amount:'-200'}]}
 const patch=difference(revised,next)!
 expect(patch.reset).toBe(false)
 const updated=applyEnvelope(current,{revision:2,base:1,patch})
 const removed=difference({scope,rows:[revised.rows[1]]},revised)!
 expect(removed.remove).toEqual(['bill'])
 expect(applyEnvelope(updated,{revision:3,base:2,patch:removed}).dataset?.rows).toEqual([revised.rows[1]])
 expect(difference(next,next)).toBeNull()
})
it('rejects wrong scope, corrupt data and out-of-order deltas',()=>{
 const current={link,revision:0}
 expect(()=>applyEnvelope(current,{...envelope,patch:{...envelope.patch,scope:{...scope,party:'other'}}})).toThrow('SHARE_DELIVERY_INVALID')
 expect(()=>applyEnvelope(current,{revision:2,base:1,patch:{...envelope.patch,reset:false}})).toThrow('SHARE_RESYNC_REQUIRED')
 expect(relayCommand({action:'publish',id:link.id,base:0,patch:{...envelope.patch,upsert:[{...row,amount:'1.2'}]}})).toBe(false)
 expect(relayCommand({action:'invite',id:link.id,scope,recipient:'ORB-U-23456789',owner:'forged'})).toBe(false)
 expect(relayCommand({action:'publish',id:link.id,base:0,patch:envelope.patch})).toBe(true)
})
it('does not overwrite undelivered data or publish unchanged data',async()=>{
 const f=setup();f.request.mockResolvedValue([{...link,outgoing:true}])
 await exchange(f.ports);expect(f.request).toHaveBeenCalledTimes(1)
 const cache:Cache={version:1,links:{[link.id]:{link:{...link,outgoing:true},revision:0,published:next,publishedRevision:1}}}
 f.ports.read=async()=>cache;f.request.mockClear().mockResolvedValue([{...link,outgoing:true,acknowledged:1}])
 await exchange(f.ports);expect(f.request).toHaveBeenCalledTimes(1)
})
it('requests a full reset after phone cache loss and respects actor changes',async()=>{
 const f=setup();f.request.mockResolvedValue([{...link,acknowledged:1}])
 await exchange(f.ports);expect(f.request).toHaveBeenCalledWith({action:'resync',id:link.id})
 f.ports.active=()=>false
 await expect(exchange(f.ports)).rejects.toThrow('SHARE_ACTOR_CHANGED')
})
it('publishes one reset then remembers its exact baseline',async()=>{
 const f=setup();f.request.mockImplementation(async command=>command.action==='list'?[{...link,outgoing:true,revision:0,resync:true}]:{revision:1})
 await exchange(f.ports)
 expect(f.request).toHaveBeenCalledWith({action:'publish',id:link.id,base:0,patch:envelope.patch})
 expect(f.disk().links[link.id].published).toEqual(next)
})
it('clears a known revoked cached projection and omits removed links',async()=>{
 const f=setup();await exchange(f.ports)
 f.request.mockResolvedValue([{...link,status:'revoked'}]);await exchange(f.ports)
 expect(f.disk().links[link.id].dataset).toBeUndefined()
 f.request.mockResolvedValue([]);await exchange(f.ports)
 expect(f.disk().links).toEqual({})
})
it('validates every command boundary and malformed patch without throwing',()=>{
 expect(relayCommand(null)).toBe(false)
 expect(relayCommand({action:'unknown'})).toBe(false)
 expect(relayCommand({action:'list'})).toBe(true)
 expect(relayCommand({action:'list',extra:true})).toBe(false)
 for(const action of ['accept','revoke','resync','pull']) {
  expect(relayCommand({action,id:link.id})).toBe(true)
  expect(relayCommand({action,id:'bad'})).toBe(false)
 }
 expect(relayCommand({action:'ack',id:link.id,revision:1})).toBe(true)
 expect(relayCommand({action:'ack',id:link.id,revision:0})).toBe(false)
 expect(relayCommand({action:'invite',id:link.id,scope,recipient:'ORB-U-23456789'})).toBe(true)
 for(const patch of [{...envelope.patch,upsert:[{...row,date:'2026-99-99'}]},{...envelope.patch,upsert:[row,row]},{...envelope.patch,remove:['bill']},{...envelope.patch,scope:{...scope,module:'other'}},null]) {
  expect(relayCommand({action:'publish',id:link.id,base:0,patch})).toBe(false)
 }
})
it('recovers a missing incremental base without ACKing it; rejects malformed deliveries',async()=>{
 const f=setup();f.request.mockImplementation(async command=>command.action==='list'?[link]:command.action==='pull'?{revision:2,base:1,patch:{...envelope.patch,reset:false}}:{revision:1})
 await exchange(f.ports)
 expect(f.request).toHaveBeenCalledWith({action:'resync',id:link.id})
 expect(f.request.mock.calls.some(([c])=>c.action==='ack')).toBe(false)
 f.request.mockImplementation(async command=>command.action==='list'?[link]:{...envelope,revision:99})
 await expect(exchange(f.ports)).rejects.toThrow('SHARE_DELIVERY_INVALID')
})
it('does not rewrite or download an already acknowledged local statement',async()=>{
 const f=setup();await exchange(f.ports)
 const acknowledged={...link,acknowledged:1}
 f.request.mockResolvedValue([acknowledged]);await exchange(f.ports)
 f.request.mockClear();f.save.mockClear();await exchange(f.ports)
 expect(f.request).toHaveBeenCalledOnce();expect(f.save).not.toHaveBeenCalled()
})
it('continues other recipients after one isolated source fails and refuses changed scopes',async()=>{
 const f=setup();f.ports.read=async()=>({version:1,links:{[link.id]:{link,revision:0}}})
 f.request.mockResolvedValue([{...link,party:'wrong'}])
 await expect(exchange(f.ports)).rejects.toThrow('SHARE_SCOPE_CHANGED')
 f.request.mockResolvedValue([{...link,outgoing:true,revision:0,resync:true}])
 f.ports.source=async()=>({scope:{...scope,party:'wrong'},rows:[]})
 await expect(exchange(f.ports)).rejects.toThrow('SHARE_SCOPE_CHANGED')
})
