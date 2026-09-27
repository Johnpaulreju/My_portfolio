"use client"

import { useRef, type PointerEvent as RPointerEvent } from "react"
import { X } from "lucide-react"
import { useWM } from "@/lib/os/wm-store"
import { APP_META } from "@/lib/os/app-meta"
import { haptic, reducedMotion } from "@/lib/os/phone-home"
import type { WindowInstance } from "@/lib/os/types"
import { AppIcon } from "@/components/os/app-icon"

/** Android-style recents: a snap carousel of big cards. Swipe a card up (or tap X) to close it. */
export function Recents() {
  const windows = useWM((s) => s.windows)
  const list = useRef<HTMLUListElement>(null)
  const ordered = [...windows].sort((a, b) => b.z - a.z)

  const closeWin = (win: WindowInstance) => {
    const index = ordered.findIndex((w) => w.id === win.id)
    if (!useWM.getState().close(win.id)) return false
    haptic()
    // Keep focus inside the sheet: the next card, else the sheet itself.
    requestAnimationFrame(() => {
      const cards = list.current?.querySelectorAll<HTMLElement>("[data-recent-open]")
      const next = cards?.[Math.min(index, cards.length - 1)]
      ;(next ?? document.querySelector<HTMLElement>("dialog[open] [data-sheet-body]"))?.focus({ preventScroll: true })
    })
    return true
  }

  if (!ordered.length) return <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
    <p className="text-base font-medium">No open apps. A clean stack.</p>
    <p className="text-sm opacity-70">Open something from Home and it will wait here.</p>
  </div>

  return <div className="flex min-h-0 flex-1 flex-col">
    <p className="shrink-0 px-6 text-center text-xs opacity-70">Swipe a card up to close it.</p>
    <ul ref={list} className="phone-recents os-scroll flex min-h-0 flex-1 snap-x snap-mandatory items-center gap-4 overflow-x-auto" aria-label="Open apps">
      {ordered.map((win) => <RecentCard key={win.id} win={win} onClose={() => closeWin(win)} />)}
    </ul>
    <div className="flex shrink-0 justify-center py-2">
      <button type="button" className="phone-touch rounded-full px-5 text-sm font-medium" style={{ background: "var(--os-hover)" }} onClick={() => { haptic(); useWM.getState().closeAll() }}>Clear all</button>
    </div>
  </div>
}

function RecentCard({ win, onClose }: { win: WindowInstance; onClose: () => boolean }) {
  const card = useRef<HTMLLIElement>(null)
  const drag = useRef<{ id: number; x: number; y: number; t: number; dy: number; active: boolean } | null>(null)
  const dragged = useRef(false)
  const [from, to] = APP_META[win.appId].tint

  const setY = (dy: number, animate: boolean) => {
    const el = card.current
    if (!el) return
    el.style.transition = animate ? "transform .2s cubic-bezier(.2,0,0,1), opacity .2s" : "none"
    el.style.transform = dy ? `translateY(${dy}px)` : ""
    el.style.opacity = dy ? String(Math.max(0.2, 1 + dy / 500)) : ""
  }

  const onPointerDown = (e: RPointerEvent<HTMLLIElement>) => {
    dragged.current = false
    if (!e.isPrimary || e.button !== 0) return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dy: 0, active: false }
  }
  const onPointerMove = (e: RPointerEvent<HTMLLIElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x, dy = Math.min(0, e.clientY - d.y)
    if (!d.active) {
      if (Math.abs(e.clientY - d.y) < 10 || Math.abs(e.clientY - d.y) < Math.abs(dx)) {
        if (Math.abs(dx) > 10) drag.current = null
        return
      }
      d.active = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    d.dy = dy
    setY(dy, false)
  }
  const onPointerUp = (e: RPointerEvent<HTMLLIElement>) => {
    const d = drag.current
    drag.current = null
    if (!d?.active) return
    dragged.current = true
    const height = card.current?.offsetHeight ?? 400
    const fling = d.dy / Math.max(1, e.timeStamp - d.t) < -0.8
    if (d.dy < -height * 0.3 || (fling && d.dy < -40)) dismiss()
    else setY(0, true)
  }
  const dismiss = () => {
    if (reducedMotion()) { if (!onClose()) setY(0, false); return }
    setY(-(card.current?.offsetHeight ?? 400) - 80, true)
    window.setTimeout(() => { if (!onClose()) setY(0, true) }, 200)
  }

  return (
    <li
      ref={card}
      data-recent-card
      className="phone-recent-card flex shrink-0 snap-center flex-col"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null; setY(0, true) }}
      onClickCapture={(e) => { if (dragged.current) { dragged.current = false; e.preventDefault(); e.stopPropagation() } }}
    >
      <div className="flex shrink-0 items-center gap-2 pb-1 pl-2">
        <AppIcon appId={win.appId} size={28} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{win.title}</span>
        <button type="button" className="phone-touch rounded-full" aria-label={`Close ${win.title}`} onClick={() => dismiss()}><X size={18} /></button>
      </div>
      <button
        type="button"
        data-recent-open
        aria-label={`Open ${win.title}`}
        onClick={() => useWM.getState().focus(win.id)}
        className="phone-recent-preview relative min-h-0 flex-1 overflow-hidden rounded-[26px] text-left"
        style={{ background: `linear-gradient(160deg, ${from}, ${to})` }}
      >
        <span aria-hidden className="absolute inset-x-4 top-4 flex flex-col gap-2 opacity-80">
          <span className="h-3 w-1/2 rounded-full bg-white/45" />
          <span className="h-2.5 w-4/5 rounded-full bg-white/30" />
          <span className="h-2.5 w-2/3 rounded-full bg-white/30" />
          <span className="mt-2 h-20 rounded-2xl bg-white/20" />
          <span className="h-2.5 w-3/4 rounded-full bg-white/25" />
        </span>
        <span aria-hidden className="absolute inset-0 grid place-items-center"><AppIcon appId={win.appId} size={72} /></span>
      </button>
    </li>
  )
}
