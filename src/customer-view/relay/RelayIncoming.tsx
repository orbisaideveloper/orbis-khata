import { inLanguage } from '../../localize'
import { requestStatementRelay } from '../../accounting/api'
import type { RelayViewProps } from './view-contract'
export function RelayIncoming({cache,language,busy,actor,perform,onOpen}: RelayViewProps & {onOpen:(id:string)=>void}) {
  const t=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en)
  return <> {Object.values(cache.links).filter(item=>!item.link.outgoing).map(item=><article className="customer-link" key={item.link.id}>
      <strong>{item.link.companyName} · {item.link.partyName}</strong><small>{item.link.module==='khata'?'Khata Boi':'Lottery'} · {item.link.status}</small>
      {item.link.status==='pending' && <button disabled={busy} onClick={()=>void perform(async()=>{await requestStatementRelay(actor,{action:'accept',id:item.link.id})})}>{t('গ্রহণ করুন','स्वीकार करें','Accept')}</button>}
      {item.link.status==='accepted' && <><button disabled={!item.dataset} onClick={()=>onOpen(item.link.id)}>{t('হিসাব দেখুন','विवरण देखें','View saved statement')}</button><button disabled={busy} onClick={()=>void perform(async()=>{await requestStatementRelay(actor,{action:'resync',id:item.link.id})})}>{t('আবার সম্পূর্ণ হিসাব চান','पूरा विवरण फिर माँगें','Request full statement again')}</button></>}
      {item.link.status!=='revoked' && <button disabled={busy} onClick={()=>{if(window.confirm(t('লিঙ্ক বন্ধ করবেন?','लिंक बंद करें?','Close this link?')))void perform(async()=>{await requestStatementRelay(actor,{action:'revoke',id:item.link.id})})}}>{t('লিঙ্ক বন্ধ করুন','लिंक बंद करें','Close link')}</button>}
    </article>)} </>
}
