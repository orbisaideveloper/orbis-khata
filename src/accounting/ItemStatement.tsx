import type {Language} from '../i18n';
import type {InventoryReport} from '../inventory/model';
import {displayQuantity} from '../inventory/model';
import {rateDisplay} from '../billing/amounts';
import {money} from './model';
import {inventoryCopy} from '../inventory/copy';
import {accountingCopy} from './copy';
import {keyedRows} from '../list-keys';
export function ItemStatement({language,item,stocks,documents,warehouses}:Readonly<{language:Language;item:InventoryReport['items'][number]|undefined;stocks:InventoryReport['stocks'];documents:InventoryReport['documents'];warehouses:InventoryReport['warehouses']}>){
 const t=inventoryCopy[language];
 return <div className="item-statement"><p className="item-unit">{t.unit}: {item?.unit}</p>
 <div className="statement-scroll"><table><caption>{t.stock}</caption><thead><tr><th>{t.location}</th><th>{t.start}</th><th>{t.incoming}</th><th>{t.outgoing}</th><th>{t.balance}</th></tr></thead><tbody>{stocks.map(row=><tr key={row.warehouse}><td>{warehouses.find(w=>w.id===row.warehouse)?.name}</td><td>{displayQuantity(row.opening)}</td><td>{displayQuantity(row.incoming)}</td><td>{displayQuantity(row.outgoing)}</td><td>{displayQuantity(row.closing)} {item?.unit}</td></tr>)}</tbody></table></div>
 {!documents.length?<p>{accountingCopy[language].empty}</p>:<div className="statement-scroll item-movements" tabIndex={0} role="region" aria-label={t.history}><table><caption>{t.history}</caption><thead><tr><th>{t.date}</th><th>{t.reference}</th><th>{t.party}</th><th>{t.quantity}</th><th>{t.rate}</th></tr></thead><tbody>{documents.flatMap(doc=>keyedRows(doc.lines.filter(line=>line.item===item?.id),line=>`${line.item}:${line.warehouse}:${line.to??''}:${line.quantity}:${line.unit_rate??line.rate}`).map(({row:line,key})=><tr key={`${doc.id}:${key}`}><td><time>{doc.date}</time></td><td><strong>{doc.reference||'—'}</strong><small>{t[doc.kind]}</small></td><td>{doc.party_name||'—'}<small>{warehouses.find(w=>w.id===line.warehouse)?.name}{line.to&&<> → {warehouses.find(w=>w.id===line.to)?.name}</>}</small></td><td>{displayQuantity(line.quantity)} {item?.unit}</td><td>{line.unit_rate?rateDisplay(line.unit_rate):money(line.rate)}</td></tr>))}</tbody></table></div>}
 </div>;
}
