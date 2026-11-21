import { useEffect } from 'react'
import { syncStatements } from './client'
/** Foreground only; no promise that Android executes a killed app. One request at a time. */
export function useStatementRelay(actor: string|null) {
  useEffect(()=>{
    if(!actor) return
    let active=true
    const wake=()=>{
      if(document.visibilityState==='hidden' || !navigator.onLine) return
      void syncStatements(actor,()=>active).then(()=>{if(active)window.dispatchEvent(new Event('khata-statements-received'))},()=>{if(active)window.dispatchEvent(new Event('khata-statements-received'))})
    }
    wake()
    const timer=window.setInterval(wake,60000)
    window.addEventListener('online',wake)
    document.addEventListener('visibilitychange',wake)
    return ()=>{active=false;window.clearInterval(timer);window.removeEventListener('online',wake);document.removeEventListener('visibilitychange',wake)}
  },[actor])
}
