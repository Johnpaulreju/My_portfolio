"use client"

import { useRef } from "react"
import { X } from "lucide-react"
import { useNotify, type Toast } from "@/lib/os/notify-store"
import { useWM } from "@/lib/os/wm-store"
import { APP_META } from "@/lib/os/app-meta"
import { SLOP, relativeTime, velocityOf } from "@/lib/os/phone-shade"
import { AppIcon } from "@/components/os/app-icon"
import type { AppId } from "@/lib/os/types"

/** Bring the app forward (its newest window, or a fresh one); opening it closes the shade. */
export function launchApp(appId: AppId) {
  const wm = useWM.getState()
  const recent = wm.windows.filter((w) => w.appId === appId).sort((a, b) => b.z - a.z)[0]
  if (recent) wm.focus(recent.id)
  else wm.open(appId)
  wm.setPhonePanel("closed")
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Follow a sideways finger and fling the card away past 40% of its width (or a
 * quick flick). Vertical moves are left alone so the list still scrolls.
 */
export function useSwipeAway(onGone: () => void, { up = false } = {}) {
  const drag = useRef<{ id: number; x: number; y: number; samples: { t: number; y: number }[]; axis: "x" | "y" | null } | null>(null)
  const swallow = useRef(false)
  const spring = (el: HTMLElement) => {
    el.style.transition = reduced() ? "none" : "transform .2s ease, opacity .2s ease"
    el.style.transform = ""
    el.style.opacity = ""
  }
  return {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      swallow.current = false
      if (!e.isPrimary || e.button !== 0) return
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, samples: [{ t: e.timeStamp, y: e.clientX }], axis: null }
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      const dx = e.clientX - d.x, dy = e.clientY - d.y
      if (!d.axis) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP) return
        // Swiping up only counts for heads-up cards; otherwise vertical means scroll.
        d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : up && dy < 0 ? "y" : null
        if (!d.axis) { drag.current = null; return }
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      const el = e.currentTarget
      d.samples.push({ t: e.timeStamp, y: d.axis === "x" ? e.clientX : e.clientY })
      if (d.samples.length > 8) d.samples.shift()
      el.style.transition = "none"
      if (d.axis === "x") {
        el.style.transform = `translate3d(${dx}px, 0, 0)`
        el.style.opacity = String(1 - Math.min(1, Math.abs(dx) / el.offsetWidth) * 0.8)
      } else {
        el.style.transform = `translate3d(0, ${Math.min(0, dy)}px, 0)`
        el.style.opacity = String(1 - Math.min(1, -Math.min(0, dy) / el.offsetHeight) * 0.8)
      }
    },
    onPointerUp(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current
      drag.current = null
      if (!d || d.id !== e.pointerId || !d.axis) return
      swallow.current = true
      const el = e.currentTarget
      const v = velocityOf(d.samples)
      const delta = d.axis === "x" ? e.clientX - d.x : e.clientY - d.y
      const size = d.axis === "x" ? el.offsetWidth : el.offsetHeight
      const gone = d.axis === "x" ? Math.abs(delta) > size * 0.4 || Math.abs(v) > 0.6 : delta < -size * 0.4 || v < -0.6
      if (!gone) return spring(el)
      const dir = d.axis === "x" ? Math.sign(delta || v) || 1 : -1
      el.style.transition = reduced() ? "none" : "transform .18s ease-out, opacity .18s ease-out"
      el.style.transform = d.axis === "x" ? `translate3d(${dir * size * 1.2}px, 0, 0)` : `translate3d(0, ${-size * 1.5}px, 0)`
      el.style.opacity = "0"
      setTimeout(onGone, reduced() ? 0 : 180)
    },
    onPointerCancel(e: React.PointerEvent<HTMLElement>) {
      if (drag.current?.axis) spring(e.currentTarget)
      drag.current = null
    },
    onClickCapture(e: React.MouseEvent) {
      if (swallow.current) { swallow.current = false; e.preventDefault(); e.stopPropagation() }
    },
  }
}

export function NotificationList({ now }: { now: Date | null }) {
  const center = useNotify((s) => s.center)
  const clearCenter = useNotify((s) => s.clearCenter)
  return (
    <section aria-label="Notifications" className="pt-1">
      {center.length === 0 ? <p className="shade-empty">All quiet. No bugs shouting yet.</p> : <>
        <ul className="space-y-2">
          {center.map((item) => <NotificationCard key={item.id} item={item} now={now} />)}
        </ul>
        <div className="flex justify-end py-2"><button type="button" className="shade-clear" onClick={clearCenter}>Clear all</button></div>
      </>}
    </section>
  )
}

function NotificationCard({ item, now }: { item: Toast; now: Date | null }) {
  const remove = useNotify((s) => s.remove)
  const swipe = useSwipeAway(() => remove(item.id))
  const app = APP_META[item.appId].title
  return (
    <li className="shade-card shade-notif" {...swipe}>
      <button type="button" className="shade-notif-open" onClick={() => launchApp(item.appId)} aria-label={`${item.title}. From ${app}. Open ${app}`}>
        <AppIcon appId={item.appId} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] opacity-75">{app}{now ? ` · ${relativeTime(item.at, now.getTime())}` : ""}</span>
          <span className="mt-0.5 block text-[14px] font-medium leading-snug">{item.title}</span>
          {item.body && <span className="mt-0.5 block text-[13px] leading-snug opacity-80">{item.body}</span>}
        </span>
      </button>
      <button type="button" className="shade-icon-btn" aria-label={`Dismiss ${item.title}`} onClick={() => remove(item.id)}><X size={18} /></button>
    </li>
  )
}
