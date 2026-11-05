import {money} from '../accounting/model';
import {inLanguage} from '../localize';
import type {Language} from '../i18n';
import type {InventoryReport} from './model';
import {displayQuantity} from './model';
import {inventoryCopy} from './copy';
export function StockTable({data,language,search,onSelect,onEdit,valuation}:Readonly<{data:InventoryReport;language:Language;search:string;valuation?:{id:string;value:bigint;complete:boolean}[];onEdit?:(item:InventoryReport['items'][number])=>void;onSelect:(id:string,name:string)=>void}>){
 const t=inventoryCopy[language],collator=new Intl.Collator(language,{numeric:true,sensitivity:'base'});
 const label=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en);
 const quantities=new Map<string,bigint>(),valueById=new Map(valuation?.map(v=>[v.id,v]));
 for(const stock of data.stocks)quantities.set(stock.item,(quantities.get(stock.item)??0n)+BigInt(stock.closing));
 const items=data.items.filter(row=>`${row.name} ${row.code}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a,b)=>collator.compare(a.name,b.name));
 const incomplete=items.some(item=>(quantities.get(item.id)??0n)!==0n&&!valueById.get(item.id)?.complete);
 return <div className="stock-table"><table><thead><tr><th>{t.name}</th><th>{t.unit}</th><th>{t.balance}</th>{valuation&&<th>{label('মূল্য','मूल्य','Value')}</th>}{onEdit&&<th>{language==='bn'?'এডিট':'Edit'}</th>}</tr></thead><tbody>{items.map(row=>{const amount=quantities.get(row.id)??0n;const valued=valueById.get(row.id),known=amount===0n||Boolean(valued?.complete);return <tr key={row.id}><td><button type="button" onClick={()=>onSelect(row.id,row.name)}>{row.name}</button>{row.code&&<small>{row.code}</small>}</td><td>{row.unit}</td><td className={amount<0n?'negative':''}>{displayQuantity(String(amount))}</td>{valuation&&<td>{known?money(valued?.value??0n):'—'}</td>}{onEdit&&<td><button type="button" aria-label={language==='bn'?'এডিট':'Edit'} onClick={()=>onEdit(row)}>✎</button></td>}</tr>;})}</tbody>{valuation&&<tfoot><tr><th colSpan={3}>{search?label('দেখানো স্টকের মূল্য','दिखाए स्टॉक का मूल्य','Displayed stock value'):label('মোট স্টকের মূল্য','कुल स्टॉक मूल्य','Total stock value')}</th><td>{money(items.reduce((sum,item)=>sum+(valueById.get(item.id)?.value??0n),0n))}</td>{onEdit&&<td/>}</tr></tfoot>}</table>{valuation&&incomplete&&<output role="alert">{label('কিছু স্টকের মূল্য অসম্পূর্ণ; মোটটি শুধু জানা মূল্যের।','कुछ स्टॉक की लागत अधूरी है; कुल केवल ज्ञात मूल्य है।','Some stock cost is incomplete; total includes known values only.')}</output>}{!items.length&&<p>{t.empty}</p>}</div>;
}
