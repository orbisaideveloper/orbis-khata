import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CirclePlay, X } from 'lucide-react'
import type { Language } from '../i18n'
import { inLanguage } from '../localize'
import { useRecordDialog } from '../accounting/use-record-dialog'
import { liveDraw } from './live-draw'
import { getLiveVideo, parseLiveVideo } from './live-client'
import type { LiveVideo } from './live-provider'

export function LiveDraw({ language }: Readonly<{ language: Language }>) {
  const [playing, setPlaying] = useState<LiveVideo | null>(null)
  const close = useCallback(() => setPlaying(null), [])
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refresh = () => setNow(new Date())
    const timer = window.setInterval(refresh, 15000)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  const draw = liveDraw(now)
  return <><LiveSelection key={draw.date + draw.slot} language={language} draw={draw} now={now} onOpen={setPlaying}/>{playing && <LivePlayer video={playing} onClose={close} language={language}/>}</>
}
function LiveSelection({ language, draw, now, onOpen }: Readonly<{ language: Language; draw: ReturnType<typeof liveDraw>; now: Date; onOpen: (video: LiveVideo) => void }>) {
  const [video, setVideo] = useState<LiveVideo | null>(null)
  const { date, slot } = draw
  useEffect(() => {
    let active = true, request: AbortController | null = null
    let timeout: number | undefined
    let found = false, nextCheck = 0
    const refresh = async () => {
      if (document.visibilityState === 'hidden' || request || Date.now() < nextCheck) return
      const controller = new AbortController(); request = controller
      timeout = window.setTimeout(() => controller.abort(), 12000)
      try { const result = await getLiveVideo({ date, slot }, controller.signal); if (active && !controller.signal.aborted) { if (result) { setVideo(current => current && (current.videoId !== result.videoId || Date.parse(current.checkedAt) > Date.parse(result.checkedAt)) ? current : result); found = true }; nextCheck = Date.now() + (found ? 300000 : 30000) } }
      catch { nextCheck = Date.now() + 30000 }
      finally { window.clearTimeout(timeout); request = null }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 30000)
    const wake = () => { void refresh() }
    window.addEventListener('online', wake); document.addEventListener('visibilitychange', wake)
    return () => { active = false; request?.abort(); window.clearTimeout(timeout); window.clearInterval(timer); window.removeEventListener('online', wake); document.removeEventListener('visibilitychange', wake) }
  }, [date, slot])
  const valid = parseLiveVideo(video, draw, now)
  const copy = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en)
  let message = copy('লাইভ ভিডিও এখনও নিশ্চিত করা যায়নি।', 'लाइव वीडियो अभी सत्यापित नहीं है।', 'Live video is not confirmed yet.')
  const fresh = valid && now.getTime() - Date.parse(valid.checkedAt) <= 90000
  if (valid && !fresh) message = copy('ভিডিও পাওয়া গেছে · বর্তমান অবস্থা অযাচাইকৃত', 'वीडियो उपलब्ध · वर्तमान स्थिति असत्यापित', 'Video available · Current status unverified')
  if (fresh && valid?.status === 'live') message = copy('সম্প্রচার চলছে', 'प्रसारण जारी है', 'Broadcast is live')
  if (fresh && valid?.status === 'upcoming') message = copy('সম্প্রচার শুরুর অপেক্ষায়', 'प्रसारण शुरू होने की प्रतीक्षा', 'Waiting for broadcast')
  if (fresh && valid?.status === 'completed') message = copy('সম্প্রচার শেষ · রেকর্ডিং দেখুন', 'प्रसारण समाप्त · रिकॉर्डिंग देखें', 'Broadcast ended · Watch recording')
  return <section className="results-live" aria-label={copy('লাইভ ড্র', 'लाइव ड्रॉ', 'Live draw')}>
    <button type="button" disabled={!valid} onClick={() => { if (valid) onOpen(valid) }}><CirclePlay size={26} aria-hidden="true"/><span><strong>{copy('লাইভ ড্র দেখুন', 'लाइव ड्रॉ देखें', 'Watch live draw')}</strong><small>{date} · {slot.toUpperCase()} IST</small></span></button>
    <p aria-live="polite">{message}</p>
  </section>
}
function LivePlayer({ video, onClose, language }: Readonly<{ video: LiveVideo; onClose: () => void; language: Language }>) {
  const [offline, setOffline] = useState(() => !navigator.onLine)
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  const [loaded, setLoaded] = useState(false)
  const [slow, setSlow] = useState(false)
  useEffect(() => { const timer = window.setTimeout(() => setSlow(true), 12000); return () => window.clearTimeout(timer) }, [])
  const ref = useRecordDialog(onClose)
  useEffect(() => {
    const back = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); onClose() }
    window.addEventListener('orbis-native-back', back, true)
    return () => { window.removeEventListener('orbis-native-back', back, true) }
  }, [onClose])
  const title = inLanguage(language, 'ড্রয়ের সম্প্রচার', 'ड्रॉ प्रसारण', 'Draw broadcast')
  return createPortal(<dialog ref={ref} className="results-player" aria-label={title} onCancel={event => { event.preventDefault(); onClose() }}>
    <header><strong>{video.date} · {video.slot.toUpperCase()} IST</strong><button type="button" onClick={onClose} aria-label={inLanguage(language, 'বন্ধ করুন', 'बंद करें', 'Close broadcast')}><X size={20}/></button></header>
    {offline && <p role="status">{inLanguage(language, 'ভিডিও দেখতে ইন্টারনেট প্রয়োজন। সংযোগ ফিরলে আবার চেষ্টা করুন।', 'वीडियो के लिए इंटरनेट चाहिए। कनेक्शन आने पर फिर कोशिश करें।', 'Internet is needed for video. Try again when connected.')}</p>}
    {!loaded && <p role="status">{inLanguage(language, slow ? 'ভিডিও দেরি করছে। YouTube-এ খুলতে পারেন।' : 'ভিডিও লোড হচ্ছে…', slow ? 'वीडियो में देर है। YouTube पर खोलें।' : 'वीडियो लोड हो रहा है…', slow ? 'Video is taking longer. Try Open on YouTube.' : 'Loading video…')}</p>}
    <iframe onLoad={() => setLoaded(true)} title={title} src={`https://www.youtube.com/embed/${video.videoId}?playsinline=1`} allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>
    <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer">{inLanguage(language, 'YouTube-এ খুলুন', 'YouTube पर खोलें', 'Open on YouTube')}</a>
  </dialog>, document.body)
}
