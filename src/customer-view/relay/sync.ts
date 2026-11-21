import { applyEnvelope, difference, sameScope, type Cache, type Dataset, type Envelope, type Link, type RelayCommand, type Scope } from './model'
export type RelayPorts = { read(): Promise<Cache>; save(cache: Cache): Promise<void>; request<T>(command: RelayCommand): Promise<T>; source(scope: Scope): Promise<Dataset>; active(): boolean }
/** One serial exchange: durable save precedes ACK; failures leave server delivery intact. */
export async function exchange(ports: RelayPorts): Promise<Cache> {
  const cache = await ports.read()
  const original=JSON.stringify(cache)
  const links = await ports.request<Link[]>({ action:'list' })
  if (!Array.isArray(links) || links.length>200) throw new Error('SHARE_LIST_INVALID')
  for (const link of links) {
    if (!ports.active()) throw new Error('SHARE_ACTOR_CHANGED')
    const prior = cache.links[link.id]
    if (prior && !sameScope(prior.link,link)) throw new Error('SHARE_SCOPE_CHANGED')
    cache.links[link.id] = { ...prior, link, revision: prior?.revision??0 }
  }
  // Links absent from an authoritative response are no longer accessible.
  const visible = new Set(links.map(link=>link.id))
  for (const id of Object.keys(cache.links)) if(!visible.has(id)) delete cache.links[id]
  if(JSON.stringify(cache)!==original) await ports.save(cache)
  // Deliberately serial: bounds server load and orders save/ack/publish per link.
  let failure: unknown
  await links.reduce(async (previous,link) => {
    await previous
    try { await exchangeLink(ports,cache,link) }
    catch(error) { failure ??= error }
  },Promise.resolve())
  if(failure) throw failure
  return cache
}
async function exchangeLink(ports: RelayPorts, cache: Cache, link: Link) {
  if (!ports.active()) throw new Error('SHARE_ACTOR_CHANGED')
  if (link.status!=='accepted') {
    if (link.status==='revoked') { delete cache.links[link.id].dataset; delete cache.links[link.id].published; await ports.save(cache) }
    return
  }
  if (link.outgoing) return publish(ports,cache,link)
  return receive(ports,cache,link)
}
async function receive(ports: RelayPorts,cache: Cache,link: Link) {
  const local = cache.links[link.id]
  if (!local.dataset && link.acknowledged>0 && !link.resync) { await ports.request({action:'resync',id:link.id}); return }
  if(local.dataset && local.revision>=link.revision && link.acknowledged>=local.revision && !link.resync) return
  const envelope = await ports.request<Envelope|null>({action:'pull',id:link.id})
  if (!envelope) return
  try { cache.links[link.id] = applyEnvelope(local,envelope) }
  catch(error) { if(error instanceof Error && error.message==='SHARE_RESYNC_REQUIRED') { await ports.request({action:'resync',id:link.id}); return } throw error }
  if(cache.links[link.id]!==local) await ports.save(cache)
  if (!ports.active()) throw new Error('SHARE_ACTOR_CHANGED')
  await ports.request({action:'ack',id:link.id,revision:envelope.revision})
}
async function publish(ports: RelayPorts,cache: Cache,link: Link) {
  if (link.revision!==link.acknowledged && !link.resync) return // Never overwrite an unreceived delta.
  const local = cache.links[link.id]
  const next = await ports.source(link)
  if (!sameScope(next.scope,link)) throw new Error('SHARE_SCOPE_CHANGED')
  const previous = !link.resync && local.publishedRevision===link.revision ? local.published : undefined
  const patch = difference(next,previous)
  if(!patch) return
  // Save the exact proposed baseline first. Failed/uncertain POST is safe to replay as a reset.
  const result = await ports.request<{revision:number}>({action:'publish',id:link.id,base:link.revision,patch})
  if (!ports.active()) throw new Error('SHARE_ACTOR_CHANGED')
  cache.links[link.id]={...local,published:next,publishedRevision:result.revision}
  await ports.save(cache)
}
