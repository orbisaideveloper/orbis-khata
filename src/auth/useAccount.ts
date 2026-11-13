import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { authClient } from './client'
import { androidLocalFirst } from '../native-local/route'
import { nativeAuthDiagnostic, type NativeAuthStage } from '../native-local/diagnostic'

function localUiSession(actorId:string,displayId:string):Session {
  // UI identity ONLY. Empty tokens cannot authorize an online API request.
  return {
    access_token:'',refresh_token:'',token_type:'bearer',expires_in:0,expires_at:0,
    user:{id:actorId,aud:'authenticated',created_at:'',app_metadata:{},
      user_metadata:{orbis_display_id:displayId}},
  } as Session
}
export function useAccount() {
  const [session,setSession]=useState<Session|null>(null)
  const [loading,setLoading]=useState(Boolean(authClient))
  const [recovery,setRecovery]=useState(false)
  const [recoveryLinkFailed,setRecoveryLinkFailed]=useState(false)
  const [unavailable,setUnavailable]=useState(false)
  const [diagnosticCode,setDiagnosticCode]=useState<string|null>(null)
  const [manualLogin,setManualLogin]=useState(false)
  useEffect(()=>{
    const client=authClient
    if(!client)return
    let alive=true
    let observed=false
    let timeout:number|undefined
    let unsubscribe:(()=>void)|undefined
    let onlineObserved=false
    let generation=0
    const stopTimer=()=>{if(timeout!==undefined){window.clearTimeout(timeout);timeout=undefined}}
    const update=(next:Session|null,event?:string)=>{
      if(!alive)return
      setSession(next);setLoading(false);setUnavailable(false)
      setDiagnosticCode(null);setManualLogin(false);setRecoveryLinkFailed(false)
      if(event==='PASSWORD_RECOVERY')setRecovery(true)
      if(event==='SIGNED_OUT')setRecovery(false)
    }
    const failed=(stage:NativeAuthStage,error?:unknown)=>{
      if(!alive)return
      setDiagnosticCode(androidLocalFirst()?nativeAuthDiagnostic(stage,error):null)
      setUnavailable(true);setLoading(false)
    }
    const enroll=async(next:Session)=>{
      if(!androidLocalFirst())return
      const actorId=next.user?.id
      const displayId=next.user?.user_metadata?.orbis_display_id as unknown
      if(typeof actorId!=='string'||typeof displayId!=='string')throw new Error('ANDROID_ACCOUNT_NOT_CENTRAL_VERIFIED')
      const local=await import('../native-local/runtime')
      await local.enrollVerifiedCentralIdentity(actorId,displayId)
    }
    const observeOnline=()=>{
      if(onlineObserved)return
      onlineObserved=true
      const {data}=client.auth.onAuthStateChange((event,next)=>{
        if(!alive)return
        const current=++generation
        observed=true;stopTimer()
        if(event==='SIGNED_OUT'){
          if(androidLocalFirst())void import('../native-local/runtime').then(x=>x.lockNativeOfflineIdentity())
          update(null,event);return
        }
        if(next&&event==='SIGNED_IN'&&androidLocalFirst()){
          setLoading(true);setUnavailable(false);setManualLogin(false)
          void enroll(next).then(()=>{if(alive&&current===generation)update(next,event)})
            .catch(error=>{if(alive&&current===generation)failed('ENROLL_SIGNIN',error)})
          return
        }
        update(next,event)
      })
      unsubscribe=()=>data.subscription.unsubscribe()
    }
    const startOnline=()=>{
      if(!alive)return
      observeOnline()
      timeout=window.setTimeout(()=>{if(alive&&!observed)failed('CENTRAL_WAIT')},90000)
      void client.auth.getSession().then(async({data:initial,error})=>{
        if(!alive||observed)return
        stopTimer()
        if(error?.code==='CENTRAL_RECOVERY_LINK_INVALID'){
          update(null)
          setRecoveryLinkFailed(true)
          return
        }
        if(error){failed('CENTRAL_RESTORE',error);return}
        if(initial.session&&androidLocalFirst()){
          try{await enroll(initial.session)}
          catch(error){
            if(alive&&!observed) failed('ENROLL_RESTORE',error)
            return
          }
        }
        if(alive&&!observed)update(initial.session)
      }).catch(error=>{stopTimer();if(alive&&!observed)failed('CENTRAL_RESTORE',error)})
    }
    if(!androidLocalFirst()){
      startOnline()
    }else{
      void import('../native-local/runtime').then(x=>x.restoreNativeOfflineIdentity())
        .then(result=>{
          if(!alive)return
          if(result){
            // Offline UI still observes local sign-out; do not silently keep the previous account.
            const {data}=client.auth.onAuthStateChange((event)=>{
              if(!alive)return
              if(event==='SIGNED_OUT'){
                void import('../native-local/runtime').then(x=>x.lockNativeOfflineIdentity())
                update(null,event)
              }
            })
            unsubscribe=()=>data.subscription.unsubscribe()
            update(localUiSession(result.actorId,result.displayId));return
          }
          startOnline()
        }).catch(error=>{
          if(!alive)return
          // Expired grants require online reauthentication; damaged encrypted data
          // must remain untouched and must never unlock silently.
          if(error instanceof Error && error.message==='ANDROID_LOCAL_IDENTITY_EXPIRED_OR_INVALID'){
            startOnline();return
          }
          if(error instanceof Error && error.message==='ANDROID_DEVICE_LOCK_ONLINE_SIGNIN_REQUIRED'){
            observeOnline()
            update(null)
            return
          }
          // Keep an explicit sign-in route available, but NEVER clear local records.
          observeOnline()
          failed('OFFLINE_RESTORE',error)
        })
    }
    return()=>{alive=false;generation++;stopTimer();unsubscribe?.()}
  },[])
  const tryOnlineLogin=()=>{
    // No database or session is deleted; explicit Central Login still requires verification.
    if(!authClient||!androidLocalFirst())return
    setSession(null);setLoading(false);setUnavailable(false)
    setManualLogin(true)
  }
  return {session,loading,recovery,setRecovery,recoveryLinkFailed,unavailable,diagnosticCode,manualLogin,tryOnlineLogin}
}
