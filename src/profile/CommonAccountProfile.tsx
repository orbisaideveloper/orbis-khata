import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { authClient } from '../auth/client'
import { requestAccountProfile, type AccountProfile, type ProfileResult } from './common-profile'
const translations={
 bn:{title:'সাধারণ অ্যাকাউন্ট প্রোফাইল',name:'নাম',address:'ঠিকানা',phone:'বিকল্প ফোন',birth:'জন্মতারিখ',gender:'লিঙ্গ',unset:'উল্লেখ করা হয়নি',male:'পুরুষ',female:'মহিলা',other:'অন্যান্য',private:'বলতে চাই না',save:'প্রোফাইল সংরক্ষণ করুন',reload:'আবার পড়ুন',loading:'প্রোফাইল যাচাই হচ্ছে…',saved:'কেন্দ্রীয় অ্যাকাউন্টে প্রোফাইল সংরক্ষিত হয়েছে।',failed:'প্রোফাইল পাওয়া বা সংরক্ষণ নিশ্চিত হয়নি। আবার চেষ্টা করুন।'},
 en:{title:'Common account profile',name:'Name',address:'Address',phone:'Alternate phone',birth:'Date of birth',gender:'Gender',unset:'Not specified',male:'Male',female:'Female',other:'Other',private:'Prefer not to say',save:'Save profile',reload:'Reload',loading:'Checking profile…',saved:'Profile saved to your central account.',failed:'Profile could not be loaded or saved. Please retry.'},
 hi:{title:'साझा अकाउंट प्रोफ़ाइल',name:'नाम',address:'पता',phone:'वैकल्पिक फ़ोन',birth:'जन्मतिथि',gender:'लिंग',unset:'नहीं बताया',male:'पुरुष',female:'महिला',other:'अन्य',private:'नहीं बताना चाहते',save:'प्रोफ़ाइल सहेजें',reload:'फिर पढ़ें',loading:'प्रोफ़ाइल की जाँच हो रही है…',saved:'प्रोफ़ाइल केंद्रीय अकाउंट में सहेजी गई।',failed:'प्रोफ़ाइल पढ़ना या सहेजना सुनिश्चित नहीं हुआ। फिर प्रयास करें।'},
}
export function CommonAccountProfile({userId,language}:Readonly<{userId:string;language:'bn'|'en'|'hi'}>){
 const [attempt,setAttempt]=useState(0)
 return <ProfileEditor key={`${userId}:${language}:${attempt}`} userId={userId} language={language} onReload={()=>setAttempt(n=>n+1)}/>
}
function ProfileEditor({userId,language,onReload}:Readonly<{userId:string;language:'bn'|'en'|'hi';onReload:()=>void}>){
 const t=translations[language]
 const [result,setResult]=useState<ProfileResult|null>(null),[busy,setBusy]=useState(true),[message,setMessage]=useState('')
 const operation=useRef<AbortController|null>(null)
 useEffect(()=>{
  let active=true
  const controller=new AbortController();operation.current=controller
  const read=()=>authClient!.auth.getSession()
  void requestAccountProfile(read,userId,AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])).then(value=>{
   if(active)setResult(value)
  }).catch(()=>{if(active)setMessage(t.failed)}).finally(()=>{if(active)setBusy(false)})
  return()=>{active=false;operation.current?.abort()}
 },[userId,t.failed])
 async function save(event:SyntheticEvent<HTMLFormElement>,current:ProfileResult){
  event.preventDefault();if(busy)return
  const data=new FormData(event.currentTarget),read=(key:string)=>String(data.get(key)??'').trim()
  const patch:AccountProfile={name:read('name'),address:read('address')||null,alternatePhone:read('alternatePhone')||null,dateOfBirth:read('dateOfBirth')||null,gender:(read('gender')||null) as AccountProfile['gender']}
  const controller=new AbortController();operation.current=controller
  setBusy(true);setMessage('')
  try{
   const saved=await requestAccountProfile(()=>authClient!.auth.getSession(),userId,AbortSignal.any([controller.signal,AbortSignal.timeout(25000)]),patch)
   if(saved.customer.orbisIdentityId!==current.customer.orbisIdentityId)throw new Error('PROFILE_IDENTITY_CHANGED')
   if(!controller.signal.aborted){setResult(saved);setMessage(t.saved)}
  }catch{if(!controller.signal.aborted)setMessage(t.failed)}
  finally{if(!controller.signal.aborted)setBusy(false)}
 }
 return <section aria-label={t.title}><h2>{t.title}</h2>{busy&&<output>{t.loading}</output>}
  {result&&<><p>{result.contact.email}</p>
   <form onSubmit={event=>{void save(event,result)}}><fieldset disabled={busy}>
    <label>{t.name}<input name="name" autoComplete="name" required maxLength={120} defaultValue={result.profile.name}/></label>
    <label>{t.address}<input name="address" autoComplete="street-address" maxLength={1000} defaultValue={result.profile.address??''}/></label>
    <label>{t.phone}<input name="alternatePhone" type="tel" maxLength={40} defaultValue={result.profile.alternatePhone??''}/></label>
    <label>{t.birth}<input name="dateOfBirth" type="date" min="1900-01-01" max={new Date().toISOString().slice(0,10)} defaultValue={result.profile.dateOfBirth??''}/></label>
    <label>{t.gender}<select name="gender" defaultValue={result.profile.gender??''}><option value="">{t.unset}</option><option value="male">{t.male}</option><option value="female">{t.female}</option><option value="other">{t.other}</option><option value="prefer-not-to-say">{t.private}</option></select></label>
    <button type="submit">{t.save}</button>
   </fieldset></form></>}
  {message&&<output>{message}</output>}<button type="button" disabled={busy} onClick={onReload}>{t.reload}</button>
 </section>
}
