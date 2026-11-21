/** A read-only projection; never a financial command or full company export. */
export type Scope = { module: 'khata' | 'lottery'; company: string; party: string; companyName: string; partyName: string }
export type Row = { id: string; date: string; reference: string; kind: string; account: 'receivable' | 'payable' | 'expense_payable'; amount: string; value?: string }
export type Dataset = { scope: Scope; rows: Row[] }
export type Patch = { reset: boolean; scope: Scope; upsert: Row[]; remove: string[] }
export type Link = Scope & { id: string; recipient: string; status: 'pending' | 'accepted' | 'revoked'; outgoing: boolean; revision: number; acknowledged: number; resync: boolean }
export type Envelope = { revision: number; base: number; patch: Patch }
export type LocalLink = { link: Link; dataset?: Dataset; revision: number; published?: Dataset; publishedRevision?: number; receivedAt?: string }
export type Cache = { version: 1; links: Record<string, LocalLink> }
export type RelayCommand = { action: 'list' } | { action: 'invite'; id: string; scope: Scope; recipient: string } | { action: 'accept' | 'revoke' | 'resync' | 'pull'; id: string } | { action: 'ack'; id: string; revision: number } | { action: 'publish'; id: string; base: number; patch: Patch }
const uuid = (x: unknown) => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(x)
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const text = (x: unknown, max: number) => typeof x === 'string' && x.length > 0 && x.length <= max
const exact = (x: Record<string, unknown>, keys: string[]) => Object.keys(x).every(k => keys.includes(k)) && keys.every(k => Object.hasOwn(x, k))
function validScope(x: unknown): x is Scope {
  return object(x) && exact(x, ['module','company','party','companyName','partyName']) && ['khata','lottery'].includes(String(x.module)) && uuid(x.company) && uuid(x.party) && text(x.companyName,120) && text(x.partyName,120)
}
function validRow(x: unknown): x is Row {
  return object(x) && exact(x,['id','date','reference','kind','account','amount',...(Object.hasOwn(x,'value')?['value']:[])]) && (x.value===undefined || typeof x.value==='string' && /^-?\d{1,18}$/.test(x.value)) && text(x.id,180) && typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && new Date(x.date+'T00:00:00Z').toISOString().slice(0,10) === x.date && typeof x.reference === 'string' && x.reference.length <= 120 && text(x.kind,30) && ['receivable','payable','expense_payable'].includes(String(x.account)) && typeof x.amount === 'string' && /^-?\d{1,18}$/.test(x.amount)
}
export function validPatch(x: unknown): x is Patch {
  try {
    return object(x) && exact(x,['reset','scope','upsert','remove']) && typeof x.reset === 'boolean' && validScope(x.scope) && Array.isArray(x.upsert) && x.upsert.length <= 5000 && x.upsert.every(validRow) && new Set(x.upsert.map(r=>r.id)).size === x.upsert.length && Array.isArray(x.remove) && x.remove.length <= 5000 && x.remove.every(id=>text(id,180)) && new Set(x.remove).size === x.remove.length && !x.remove.some(id=>(x.upsert as Row[]).some(r=>r.id===id)) && (!x.reset || x.remove.length === 0)
  } catch { return false }
}
export function relayCommand(x: unknown): x is RelayCommand {
  if (!object(x)) return false
  switch (x.action) {
    case 'list': return exact(x,['action'])
    case 'invite': return exact(x,['action','id','scope','recipient']) && uuid(x.id) && validScope(x.scope) && typeof x.recipient === 'string' && /^ORB-U-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(x.recipient)
    case 'accept': case 'revoke': case 'resync': case 'pull': return exact(x,['action','id']) && uuid(x.id)
    case 'ack': return exact(x,['action','id','revision']) && uuid(x.id) && Number.isSafeInteger(x.revision) && Number(x.revision)>0
    case 'publish': return exact(x,['action','id','base','patch']) && uuid(x.id) && Number.isSafeInteger(x.base) && Number(x.base)>=0 && validPatch(x.patch) && new TextEncoder().encode(JSON.stringify(x.patch)).length<=750000
    default: return false
  }
}
export function sameScope(a: Scope, b: Scope) { return a.module===b.module && a.company===b.company && a.party===b.party }
export function difference(next: Dataset, previous?: Dataset): Patch | null {
  const old = new Map((previous?.rows??[]).map(row=>[row.id,JSON.stringify(row)]))
  const ids = new Set(next.rows.map(row=>row.id))
  const patch: Patch = { reset: !previous, scope: next.scope, upsert: next.rows.filter(row=>old.get(row.id)!==JSON.stringify(row)), remove: (previous?.rows??[]).filter(row=>!ids.has(row.id)).map(row=>row.id) }
  if (previous && JSON.stringify(next.scope)===JSON.stringify(previous.scope) && !patch.upsert.length && !patch.remove.length) return null
  if (!validPatch(patch)) throw new Error('SHARE_PROJECTION_INVALID')
  return patch
}
export function applyEnvelope(current: LocalLink, envelope: Envelope): LocalLink {
  if (!Number.isSafeInteger(envelope.revision) || envelope.revision<=0 || !Number.isSafeInteger(envelope.base) || envelope.revision!==envelope.base+1 || !validPatch(envelope.patch) || !sameScope(current.link,envelope.patch.scope)) throw new Error('SHARE_DELIVERY_INVALID')
  if (envelope.revision <= current.revision) return current
  if (!envelope.patch.reset && (current.revision!==envelope.base || !current.dataset)) throw new Error('SHARE_RESYNC_REQUIRED')
  const rows = new Map((envelope.patch.reset?[]:current.dataset?.rows??[]).map(row=>[row.id,row]))
  for (const id of envelope.patch.remove) rows.delete(id)
  for (const row of envelope.patch.upsert) rows.set(row.id,row)
  if(rows.size>5000) throw new Error('SHARE_LOCAL_LIMIT')
  return { ...current, revision: envelope.revision, dataset: { scope: envelope.patch.scope, rows: [...rows.values()] }, receivedAt: new Date().toISOString() }
}
