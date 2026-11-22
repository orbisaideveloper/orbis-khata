import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useRecordDialog } from '../accounting/use-record-dialog'
import type { Language } from '../i18n'
import { inLanguage } from '../localize'
import type { DrawSlot } from './result-data'

export function TicketScanner({ video, onClose, language, date, slot, feedback }: Readonly<{ video: RefObject<HTMLVideoElement | null>; onClose: () => void; language: Language; date: string; slot: DrawSlot; feedback?: string }>) {
  const focused = useRef(document.activeElement)
  const dialog = useRecordDialog(onClose)
  const text = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en)
  useEffect(() => {
    const previous = focused.current
    const camera = video.current
    const back = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); onClose() }
    window.addEventListener('orbis-native-back', back, true)
    return () => {
      window.removeEventListener('orbis-native-back', back, true)
      const stream = camera?.srcObject
      if (stream && 'getTracks' in stream) stream.getTracks().forEach(track => track.stop())
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [onClose, video])
  return createPortal(<dialog ref={dialog} className="ticket-camera" aria-labelledby="ticket-scan-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <header><h2 id="ticket-scan-title">{text('টিকিট স্ক্যান করুন', 'टिकट स्कैन करें', 'Scan your ticket')}</h2><button type="button" onClick={onClose} aria-label={text('ক্যামেরা বন্ধ করুন', 'कैमरा बंद करें', 'Stop camera')}><X size={20} aria-hidden="true"/></button></header>
    <p>{text('টিকিটের QR ফ্রেমের মধ্যে রাখুন।', 'टिकट का QR फ़्रेम के अंदर रखें।', 'Keep the ticket QR inside the frame.')}</p>
    <div className="ticket-camera-frame"><video ref={video} autoPlay muted playsInline aria-label={text('QR ক্যামেরা', 'QR कैमरा', 'QR camera')}/><span aria-hidden="true"/></div>
    {feedback && <p><output>{feedback}</output></p>}
    <p className="ticket-scan-draw">{date} · {slot.toUpperCase()} IST</p>
    <button className="ticket-manual" type="button" onClick={onClose}>{text('নম্বর লিখে যাচাই করুন', 'नंबर लिखकर जाँचें', 'Enter number instead')}</button>
  </dialog>, document.body)
}
