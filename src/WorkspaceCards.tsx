import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { translations, type Language } from './i18n'
import { inLanguage } from './localize'
import { shareCopy } from './customer-view/copy'
import type { ModuleTarget } from './ModulePicker'
import './workspace-cards.css'
import { dailyLedgerEnabled } from './daily-ledger/availability'

const defaultOrder = ['khata', 'farm', 'customer', 'lottery', 'daily', 'results'] as const
type CardId = typeof defaultOrder[number]
type Point = { x: number; y: number }
type Drag = { source: CardId; start: Point; point: Point; timer: number; active: boolean }
const holdTime = 450

function readOrder(key: string): CardId[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!Array.isArray(raw)) return [...defaultOrder]
    const ordered = raw.filter((id): id is CardId => defaultOrder.includes(id))
    return [...new Set([...ordered, ...defaultOrder])]
  } catch {
    return [...defaultOrder]
  }
}

function moveCard(order: CardId[], source: CardId, target: CardId) {
  const next = order.filter(id => id !== source)
  next.splice(order.indexOf(target), 0, source)
  return next
}

function moduleCard(id: CardId, language: Language, signedIn: boolean) {
  const t = translations[language]
  switch (id) {
    case 'khata': return { title: t.khata, description: t.khataDesc, icon: '📘', target: 'khata' as const }
    case 'farm': return { title: t.farm, description: t.farmDesc, icon: '🌱' }
    case 'customer': return { title: shareCopy(language, 'title'), description: inLanguage(language, 'লিঙ্ক করা হিসাব ও স্টেটমেন্ট', 'लिंक किए खाते और विवरण', 'Linked accounts and statements'), icon: <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="9" y="7" width="30" height="35" rx="6" fill="currentColor" opacity=".12"/><circle cx="24" cy="19" r="6" stroke="currentColor" strokeWidth="2.5"/><path d="M14 35c0-10 20-10 20 0M17 3h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>, target: 'customer' as const }
    case 'lottery': return { title: t.lot, description: t.lotDesc, icon: '🎟️', target: signedIn ? 'lottery' as const : undefined }
    case 'daily': return { title: inLanguage(language, 'দৈনিক হিসাব', 'दैनिक हिसाब', 'Daily accounts'), description: inLanguage(language, 'আয়–খরচ, পাওনা–দেনা ও মাসের বাজেট', 'आय–खर्च, लेना–देना और मासिक बजट', 'Income, expenses, dues and monthly budget'), icon: '📝', target: signedIn && dailyLedgerEnabled() ? 'daily' as const : undefined }
    case 'results': return { title: inLanguage(language, 'লটারি রেজাল্ট', 'लॉटरी नतीजे', 'Lottery results'), description: inLanguage(language, 'টিকিট স্ক্যান করে বা নম্বর দিয়ে ফল দেখুন', 'टिकट स्कैन करें या नंबर से नतीजे देखें', 'Check results by scanning a ticket or entering its number'), icon: '🔎', target: signedIn ? 'results' as const : undefined }
  }
}

function cardAt(node: HTMLElement, point: Point): CardId | undefined {
  const card = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>('[data-workspace-card]')
  return card && node.contains(card) ? card.dataset.workspaceCard as CardId : undefined
}

function useCardDrag(root: React.RefObject<HTMLDivElement | null>, onMove: (source: CardId, target: CardId) => void) {
  const [dragging, setDragging] = useState<CardId>()
  const [hover, setHover] = useState<CardId>()
  useEffect(() => {
    const node = root.current
    if (!node) return
    let drag: Drag | undefined
    let suppressClickUntil = 0
    function begin(target: EventTarget | null, point: Point) {
      if (drag || !(target instanceof Element)) return
      const source = target.closest<HTMLElement>('[data-workspace-card]')?.dataset.workspaceCard as CardId | undefined
      if (!source) return
      setHover(source)
      drag = { source, start: point, point, active: false, timer: window.setTimeout(() => {
        if (!drag) return
        drag.active = true
        setDragging(drag.source)
      }, holdTime) }
    }
    function finish(drop: boolean) {
      if (!drag) return
      window.clearTimeout(drag.timer)
      if (drag.active) {
        suppressClickUntil = Date.now() + 400
        const target = drop && cardAt(node!, drag.point)
        if (target && target !== drag.source) onMove(drag.source, target)
      }
      drag = undefined
      setDragging(undefined)
      setHover(undefined)
    }
    function move(point: Point, event: Event) {
      if (!drag) return
      drag.point = point
      if (drag.active) {
        if (event.cancelable) event.preventDefault()
        setHover(cardAt(node!, point))
      } else if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > 10) {
        finish(false)
      }
    }
    function followTouch(event: TouchEvent) {
      if (event.touches.length !== 1) { finish(false); return }
      const { clientX: x, clientY: y } = event.touches[0]
      if (event.type === 'touchstart') begin(event.target, { x, y })
      else move({ x, y }, event)
    }
    function followMouse(event: PointerEvent) {
      if (event.pointerType === 'touch') return
      const point = { x: event.clientX, y: event.clientY }
      if (event.type === 'pointerdown' && event.button === 0) begin(event.target, point)
      if (event.type === 'pointermove') move(point, event)
    }
    const drop = () => finish(true)
    const cancel = () => finish(false)
    const pointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') finish(event.type === 'pointerup')
    }
    const click = (event: MouseEvent) => {
      if (event.detail && Date.now() < suppressClickUntil) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const menu = (event: MouseEvent) => { if (drag) event.preventDefault() }
    const scroll = window.setInterval(() => {
      if (!drag?.active) return
      const y = drag.point.y
      if (y < 55) window.scrollBy(0, -15)
      else if (y > window.innerHeight - 55) window.scrollBy(0, 15)
      else return
      setHover(cardAt(node, drag.point))
    }, 35)
    node.addEventListener('touchstart', followTouch, { passive: true })
    window.addEventListener('touchmove', followTouch, { passive: false })
    window.addEventListener('touchend', drop)
    window.addEventListener('touchcancel', cancel)
    node.addEventListener('pointerdown', followMouse)
    window.addEventListener('pointermove', followMouse)
    window.addEventListener('pointerup', pointerEnd)
    window.addEventListener('pointercancel', pointerEnd)
    node.addEventListener('click', click, true)
    node.addEventListener('contextmenu', menu)
    return () => {
      cancel()
      window.clearInterval(scroll)
      node.removeEventListener('touchstart', followTouch)
      window.removeEventListener('touchmove', followTouch)
      window.removeEventListener('touchend', drop)
      window.removeEventListener('touchcancel', cancel)
      node.removeEventListener('pointerdown', followMouse)
      window.removeEventListener('pointermove', followMouse)
      window.removeEventListener('pointerup', pointerEnd)
      window.removeEventListener('pointercancel', pointerEnd)
      node.removeEventListener('click', click, true)
      node.removeEventListener('contextmenu', menu)
    }
  }, [root, onMove])
  return { dragging, hover }
}

export function WorkspaceCards({ owner, language, onOpen }: Readonly<{ owner: string | null; language: Language; onOpen: (target: ModuleTarget) => void }>) {
  const titleId = useId()
  const key = 'orbis.khata.workspace.cards.v1:' + (owner ?? 'guest')
  const [order, setOrder] = useState(() => readOrder(key))
  const root = useRef<HTMLDivElement>(null)
  const reorder = useCallback((source: CardId, target: CardId) => setOrder(current => moveCard(current, source, target)), [])
  const { dragging, hover } = useCardDrag(root, reorder)
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(order)) } catch { /* Keep the order for this session. */ }
  }, [key, order])
  const visible = order.filter(id => owner || id === 'khata' || id === 'farm' || id === 'lottery')
  const t = translations[language]
  return <div className="modules" ref={root}>
    {visible.map((id, index) => {
      const card = moduleCard(id, language, Boolean(owner))
      const plannedStatus = id === 'lottery' ? t.soon : t.later
      const contents = <><span className={'ic ' + id} aria-hidden="true">{card.icon}</span><span className="copy"><strong id={titleId + id}>{card.title}</strong><small>{card.description}</small></span><span className="status">{card.target ? t.open : plannedStatus}</span></>
      const target = card.target
      return <div key={id} className="workspace-card" data-workspace-card={id} data-dragging={dragging === id || undefined} data-drop={dragging && hover === id && dragging !== id || undefined}>
        {target ? <button type="button" className="module" onClick={() => onOpen(target)}>{contents}</button> : <div className="module planned">{contents}</div>}
        <button type="button" className="workspace-card-grip" aria-label={inLanguage(language, 'কার্ড সাজান', 'कार्ड सजाएँ', 'Reorder card')} aria-describedby={titleId + id} aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" onKeyDown={event => {
          const direction = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key]
          const destination = direction && visible[index + direction]
          if (!destination) return
          event.preventDefault()
          reorder(id, destination)
        }}>⠿</button>
      </div>
    })}
  </div>
}
