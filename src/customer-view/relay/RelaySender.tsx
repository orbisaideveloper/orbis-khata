import { useState } from 'react'
import { sourceChoices } from './source'
import { displayIdentity } from '../contract'
import type { Scope } from './model'
import { inLanguage } from '../../localize'
import { requestStatementRelay } from '../../accounting/api'
import type { RelayViewProps } from './view-contract'
export function RelaySender({cache,language,busy,actor,perform}: RelayViewProps) {
  const t=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en)
  const [choices,setChoices]=useState<Scope[]|null>(null),[selected,setSelected]=useState(''),[recipient,setRecipient]=useState('')
  return (    <details><summary>{t('নিজের হিসাব শেয়ার করুন','अपना खाता साझा करें','Share my account')}</summary>
      <button type="button" disabled={busy} onClick={()=>void perform(async()=>setChoices(await sourceChoices()))}>{t('হিসাব বাছুন','खाता चुनें','Choose account')}</button>
      {choices && <form onSubmit={e=>{e.preventDefault();const scope=choices[Number(selected)];if(scope&&displayIdentity.test(recipient))void perform(async()=>{await requestStatementRelay(actor,{action:'invite',id:crypto.randomUUID(),scope,recipient});setRecipient('')})}}>
        <label>{t('পার্টির হিসাব','पार्टी का खाता','Party account')}<select required value={selected} onChange={e=>setSelected(e.target.value)}><option value="">—</option>{choices.map((scope,index)=><option key={[scope.module,scope.company,scope.party].join(':')} value={index}>{scope.module==='khata'?'Khata':'Lottery'} · {scope.companyName} · {scope.partyName}</option>)}</select></label>
        <label>ORBIS ID<input required value={recipient} pattern="ORB-U-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}" maxLength={14} onChange={e=>setRecipient(e.target.value.toUpperCase().trim())}/></label>
        <button type="submit" disabled={busy||selected===''||!displayIdentity.test(recipient)}>{t('অনুরোধ পাঠান','अनुरोध भेजें','Send invitation')}</button>
      </form>}
      {Object.values(cache.links).filter(item=>item.link.outgoing).map(item=><article className="customer-link" key={item.link.id}><strong>{item.link.companyName} · {item.link.partyName}</strong><small>{item.link.recipient} · {item.link.status} · {item.link.revision>0&&item.link.revision===item.link.acknowledged?t('পৌঁছেছে','पहुँचा','Delivered'):t('পৌঁছানো বাকি','पहुँचना बाकी','Awaiting delivery')}</small>{item.link.status!=='revoked'&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm(t('লিঙ্ক বন্ধ করবেন?','लिंक बंद करें?','Close this link?')))void perform(async()=>{await requestStatementRelay(actor,{action:'revoke',id:item.link.id})})}}>{t('লিঙ্ক বন্ধ করুন','लिंक बंद करें','Close link')}</button>}</article>)}
    </details>
  )
}
