import { amountFromRate } from '../billing/amounts.ts'
export type InventoryKind = 'item' | 'warehouse' | 'purchase' | 'sale' | 'opening' | 'transfer'
export type StockLine = { item: string; warehouse: string; to: string | null; quantity: string; rate: string; unit_rate?: string }
export type InventoryCommand = {
  id: string; company: string; kind: InventoryKind; date: string; code: string; name: string; unit: string;
  party: string | null; reference: string; note: string; lines: StockLine[]
}
type Item = { id: string; code: string; name: string; unit: string; default_rate?: string | null }
type Warehouse = { id: string; code: string; name: string }
export type InventoryReport = {
  items: Item[]; warehouses: Warehouse[];
  stocks: { item: string; warehouse: string; opening: string; incoming: string; outgoing: string; closing: string }[];
  documents: (InventoryCommand & { total: string; reversed: boolean; party_name: string | null })[];
  count: number
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(v)
function record(v: unknown): v is Record<string, unknown> { return Boolean(v) && typeof v === 'object' && !Array.isArray(v) }
function exact(v: Record<string, unknown>, names: string[]) {
  const allowed = new Set(names)
  return Object.keys(v).length === allowed.size && Object.keys(v).every(k => allowed.has(k))
}
function text(v: unknown, max: number): v is string { return typeof v === 'string' && v.length <= max && !/[<>]/u.test(v) && Array.from(v).every(char=>(char.codePointAt(0)??0)>=32 && (char.codePointAt(0)??0)!==127) }
function integer(v: unknown, positive: boolean): v is string {
  return typeof v === 'string' && /^(0|[1-9]\d{0,11})$/u.test(v) && (!positive || BigInt(v) > 0n)
}
function stockLine(v: unknown, kind: InventoryKind): v is StockLine {
  if (!record(v) || !exact(v,['item','warehouse','to','quantity','rate',...(v.unit_rate===undefined?[]:['unit_rate'])]) || !uuid(v.item) || !uuid(v.warehouse) || !integer(v.quantity,true)) return false
  if (kind === 'transfer') return uuid(v.to) && v.to !== v.warehouse && v.rate === '0'
  if (v.to !== null) return false
  if(v.unit_rate!==undefined){
   if(kind!=='purchase'&&kind!=='sale'||typeof v.unit_rate!=='string'||!integer(v.rate,false))return false
   try{return BigInt(amountFromRate(displayQuantity(v.quantity),v.unit_rate))>0n}catch{return false}
  }
  return kind === 'opening' ? v.rate === '0' : integer(v.rate,true)
}
function details(p: Record<string, unknown>, kind: InventoryKind) {
  if (!Array.isArray(p.lines)) return false
  if (kind === 'item') return p.party === null && p.lines.length === 0 && Boolean(p.code) && Boolean(p.name) && Boolean(p.unit)
  if (kind === 'warehouse') return p.party === null && p.lines.length === 0 && Boolean(p.code) && Boolean(p.name) && p.unit === ''
  if (p.code !== '' || p.name !== '' || p.unit !== '' || p.lines.length < 1 || p.lines.length > 50 || !p.lines.every(line => stockLine(line,kind))) return false
  if (kind === 'purchase' || kind === 'sale') return uuid(p.party)
  return p.party === null && typeof p.note === 'string' && Boolean(p.note.trim())
}
export function inventoryCommand(value: unknown): InventoryCommand | null {
  if (!record(value) || !exact(value,['id','company','kind','date','code','name','unit','party','reference','note','lines'])) return null
  const p = value
  if (!uuid(p.id) || !uuid(p.company) || typeof p.kind !== 'string' || !['item','warehouse','purchase','sale','opening','transfer'].includes(p.kind)) return null
  if (typeof p.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(p.date)) return null
  const date = new Date(p.date+'T00:00:00Z')
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== p.date) return null
  if (!text(p.code,40) || !text(p.name,120) || !text(p.unit,24) || !text(p.reference,80) || !text(p.note,500)) return null
  if (p.code !== p.code.trim() || p.name !== p.name.trim() || p.unit !== p.unit.trim()) return null
  if (!details(p,p.kind as InventoryKind)) return null
  const result = p as unknown as InventoryCommand
  if (billTotal(result.lines) > 999999999999n) return null
  if (['purchase','sale'].includes(result.kind) && result.lines.some(line=>lineTotal(line)<=0n)) return null
  return result
}
export function quantity(input: string): string {
  if (!/^\d{1,6}(\.\d{1,6})?$/u.test(input)) throw new Error('INVALID_QUANTITY')
  const [whole,fraction=''] = input.split('.')
  const scaled = BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'))
  if (scaled <= 0n || scaled > 999999999999n) throw new Error('INVALID_QUANTITY')
  return String(scaled)
}
export function displayQuantity(scaled: string) {
  const n = BigInt(scaled), absolute = n < 0n ? -n : n
  const fraction = String(absolute%1000000n).padStart(6,'0').replace(/0{1,6}$/u,'')
  return `${n<0n?'-':''}${absolute/1000000n}${fraction?'.'+fraction:''}`
}
export function lineTotal(line: StockLine) { return line.unit_rate===undefined?(BigInt(line.quantity)*BigInt(line.rate)+500000n)/1000000n:BigInt(amountFromRate(displayQuantity(line.quantity),line.unit_rate)) }
export function billTotal(lines: StockLine[]) { return lines.reduce((total,line)=>total+lineTotal(line),0n) }
