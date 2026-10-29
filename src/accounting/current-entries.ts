/** Reports contain the immutable journal; statements show its effective records. */
export function currentEntries<T extends {id:string;kind:string;reversed:boolean;reverses_id?:string|null}>(entries:T[],complete=false):T[]{
 const reversed=new Set(entries.filter(row=>row.kind==='reversal').map(row=>row.reverses_id).filter(Boolean));
 return entries.filter(row=>row.kind!=='reversal'&&!reversed.has(row.id)&&(!row.reversed||(complete&&'reverses_id' in row)));
}
