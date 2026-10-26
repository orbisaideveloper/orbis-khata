import type { Language } from '../i18n'
import { balance, money, type Report } from '../accounting/model'
import { designCopy } from './design-copy'
import { DesignIcon } from './DesignIcon'
import type { BooksPage } from '../books-navigation'
import type { BillKind } from './InvoicePage'
export function Dashboard({language,companyName,report,failed,onRetry,onOpen,onBill,partyCount,itemCount}:Readonly<{language:Language;companyName:string;report:Report|null;failed:boolean;onRetry:()=>void;onOpen:(page:BooksPage)=>void;onBill:(kind:BillKind)=>void;partyCount:number;itemCount:number}>){
 const t=designCopy[language]
 const metrics=[['receivable',t.receive],['payable',t.pay],['cash',t.cash],['bank',t.bank]] as const
 return <div className="kh-dashboard"><section className="kh-greeting"><span className="kh-eyebrow">{t.hello}</span><h1>{companyName}</h1><p>{t.headline}</p><span className="kh-greeting-mark" aria-hidden="true"><DesignIcon name="ledger"/></span></section>
 <div className="kh-section-heading"><h2>{t.overview}</h2><span>{t.period}</span></div>
 {failed?<output role="alert">{t.error} <button type="button" onClick={onRetry}>{t.retry}</button></output>:!report?<output>{t.loading}</output>:<div className="kh-metrics">{metrics.map(([account,label])=><article key={account} className={'kh-metric kh-metric-'+account}><span>{label}</span><strong>{money(account==='payable'?-balance(report,'payable')-balance(report,'expense_payable'):balance(report,account))}</strong></article>)}</div>}
 <div className="kh-section-heading"><h2>{t.actions}</h2></div><div className="kh-quick-actions">{(['sale','purchase','expense'] as const).map(kind=><button type="button" key={kind} onClick={()=>onBill(kind)}><span><DesignIcon name={kind}/></span>{t[kind]}</button>)}</div>
 <div className="kh-section-heading"><h2>{t.manage}</h2></div><div className="kh-module-grid">{(['parties','items','ledger','stock','accounts','bills'] as const).map(key=><button type="button" key={key} onClick={()=>onOpen(key==='accounts'?'ledger':key==='ledger'?'all-ledgers':key)}><span className={'kh-module-icon kh-module-'+key}><DesignIcon name={key}/></span><span>{t[key]}{key==='parties'&&<small>{partyCount}</small>}{key==='items'&&<small>{itemCount}</small>}</span><span aria-hidden="true">›</span></button>)}</div>
 <div className="kh-section-heading"><h2>{t.recent}</h2></div><section className="kh-recent">{!report?.entries.length?<div className="kh-empty"><DesignIcon name="bills"/><strong>{t.empty}</strong><p>{t.start}</p></div>:report.entries.slice(0,4).map(entry=><article key={entry.id}><span className="kh-list-icon"><DesignIcon name={entry.kind==='sale'?'sale':entry.kind==='purchase'?'purchase':'accounts'}/></span><div><strong>{entry.party_name}</strong><small>{entry.effective_date} · {entry.reference}</small></div><strong>{money(entry.amount_minor)}</strong></article>)}</section>
 </div>
}
