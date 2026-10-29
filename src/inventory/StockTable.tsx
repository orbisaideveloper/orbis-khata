import type {Language} from '../i18n';
import type {InventoryReport} from './model';
import {displayQuantity} from './model';
import {inventoryCopy} from './copy';
export function StockTable({data,language,search,onSelect,onEdit}:Readonly<{data:InventoryReport;language:Language;search:string;onEdit?:(item:InventoryReport['items'][number])=>void;onSelect:(id:string,name:string)=>void}>){
 const t=inventoryCopy[language],collator=new Intl.Collator(language,{numeric:true,sensitivity:'base'});
 const items=data.items.filter(row=>`${row.name} ${row.code}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a,b)=>collator.compare(a.name,b.name));
 return <div className="stock-table"><table><thead><tr><th>{t.name}</th><th>{t.unit}</th><th>{t.balance}</th>{onEdit&&<th>{language==='bn'?'এডিট':'Edit'}</th>}</tr></thead><tbody>{items.map(row=>{const amount=data.stocks.filter(s=>s.item===row.id).reduce((sum,s)=>sum+BigInt(s.closing),0n);return <tr key={row.id}><td><button type="button" onClick={()=>onSelect(row.id,row.name)}>{row.name}</button>{row.code&&<small>{row.code}</small>}</td><td>{row.unit}</td><td className={amount<0n?'negative':''}>{displayQuantity(String(amount))}</td>{onEdit&&<td><button type="button" aria-label={language==='bn'?'এডিট':'Edit'} onClick={()=>onEdit(row)}>✎</button></td>}</tr>;})}</tbody></table>{!items.length&&<p>{t.empty}</p>}</div>;
}
