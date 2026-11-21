import { useEffect, useRef, useState } from 'react'
import type { Language } from '../../i18n'
import { inLanguage } from '../../localize'
import { today } from '../../accounting/model'
import { readRelayCache } from './storage'
import { syncStatements } from './client'
import { RelaySender } from './RelaySender'
import { RelayIncoming } from './RelayIncoming'
import type { Cache } from './model'
import { RelayStatement } from './RelayStatement'
export function RelayPanel({actor,language}: Readonly<{actor:string;language:Language}>) {
  const t=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en)
  const mounted=useRef(true)
  const [cache,setCache]=useState<Cache>({version:1,links:{}})
  const [busy,setBusy]=useState(false),[error,setError]=useState(false),[opened,setOpened]=useState<string|null>(null)
  const [from,setFrom]=useState(today().slice(0,7)+'-01'),[to,setTo]=useState(today())
  useEffect(()=>{
    let active=true;mounted.current=true
    const read=()=>{void readRelayCache(actor).then(value=>{if(active)setCache(value)},()=>{if(active)setError(true)})}
    read();window.addEventListener('khata-statements-received',read)
    return ()=>{active=false;mounted.current=false;window.removeEventListener('khata-statements-received',read)}
  },[actor])
  async function perform(work:()=>Promise<void>) {
    if(busy)return
    setBusy(true);setError(false)
    try {await work();setCache(await syncStatements(actor,()=>mounted.current))}
    catch {if(mounted.current){setError(true);setCache(await readRelayCache(actor).catch(()=>cache))}}
    finally {setBusy(false)}
  }
  const current=opened?cache.links[opened]:undefined
  return <section className="customer-relay" aria-label={t('ফোনে সেভ করা হিসাব','फोन में सहेजे खाते','Statements on this device')}>
    <h2>{t('ফোনে সেভ করা হিসাব','फोन में सहेजे खाते','Statements on this device')}</h2>
    <p>{t('প্রাপ্ত হিসাব ফোনে সেভ হলে সার্ভারের পাঠানো কপি মুছে যাবে। নতুন আপডেট অ্যাপ খোলা থাকলে আসবে।','प्राप्त विवरण फोन में सहेजने पर सर्वर की भेजी प्रति मिटेगी। ऐप खुला रहने पर नए अपडेट मिलेंगे।','Received statements save on this device before the server delivery is cleared. Updates arrive while the app is open.')}</p>
    <button type="button" disabled={busy} onClick={()=>void perform(async()=>{})}>{t('আপডেট নিন','अपडेट लें','Sync statements')}</button>
    {error && <p role="alert">{t('আপডেট হয়নি। সেভ করা হিসাব অক্ষত আছে; সংযোগ পেলে আবার চেষ্টা করুন।','अपडेट नहीं हुआ। सहेजा हिसाब सुरक्षित है; कनेक्शन पर पुनः प्रयास करें।','Update unavailable. Saved statements are preserved; retry when connected.')}</p>}
    <RelayIncoming cache={cache} language={language} busy={busy} perform={perform} actor={actor} onOpen={setOpened}/>
    {current?.dataset && current.link.status==='accepted' && <section>
      <p>{t('শেষ আপডেট','अंतिम अपडेट','Last received')}: {current.receivedAt ? new Date(current.receivedAt).toLocaleString(undefined,{timeZone:'Asia/Kolkata'})+' IST':'—'}</p>
      <div className="customer-period"><label>{t('শুরু','से','From')}<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>{t('শেষ','तक','To')}<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label></div>
      <RelayStatement dataset={current.dataset} from={from} to={to} language={language}/>
    </section>}
    <RelaySender cache={cache} language={language} busy={busy} perform={perform} actor={actor}/>
  </section>
}
