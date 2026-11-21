import type { Language } from '../../i18n'
import { inLanguage } from '../../localize'
import { money } from '../../accounting/model'
import type { Dataset, Row } from './model'
export function RelayStatement({dataset,from,to,language}:Readonly<{dataset:Dataset;from:string;to:string;language:Language}>) {
  const t=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en)
  const sorted=dataset.rows.filter(row=>row.date<=to).sort((a,b)=>a.date.localeCompare(b.date)||a.reference.localeCompare(b.reference,undefined,{numeric:true})||a.id.localeCompare(b.id))
  return <section className="customer-statement"><h3>{dataset.scope.companyName} · {dataset.scope.partyName}</h3>{(['receivable','payable','expense_payable'] as const).map(account=>{
    const rows=sorted.filter(row=>row.account===account)
    if(!rows.length)return null
    let running=rows.filter(row=>row.date<from).reduce((sum,row)=>sum+BigInt(row.amount),0n)
    const opening=running
    const visible: (Row & {balance:bigint})[]=rows.filter(row=>row.date>=from).map(row=>{running+=BigInt(row.amount);return {...row,balance:running}})
    return <section key={account}><h4>{account==='receivable'?t('আপনার দিতে হবে / অগ্রিম','आपको देना है / अग्रिम','You owe / advance'):t('আপনার পাওনা / অগ্রিম','आपको मिलेगा / अग्रिम','You receive / advance')}</h4>
      <p>{t('আগের ব্যালেন্স','पिछला शेष','Opening')}: {money(opening)} · {t('শেষ ব্যালেন্স','अंतिम शेष','Closing')}: {money(running)}</p>
      <div className="customer-table"><table><caption>{from} — {to}</caption><thead><tr><th>{t('তারিখ','तारीख','Date')}</th><th>{t('রেফারেন্স','संदर्भ','Reference')}</th><th>{t('বিবরণ','विवरण','Kind')}</th><th>{t('মূল্য','राशि','Amount')}</th><th>{t('পরিবর্তন','बदलाव','Change')}</th><th>{t('ব্যালেন্স','शेष','Balance')}</th></tr></thead><tbody>{visible.map(row=><tr key={row.id}><td>{row.date}</td><td>{row.reference}</td><td>{row.kind}</td><td>{row.value===undefined?'—':money(row.value)}</td><td>{money(row.amount)}</td><td>{money(row.balance)}</td></tr>)}</tbody></table></div>
    </section>
  })}</section>
}
