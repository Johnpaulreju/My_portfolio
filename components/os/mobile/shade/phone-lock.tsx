"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlarmClock, Bell, ChevronUp, LockOpen } from "lucide-react"
import { usePower } from "@/lib/os/power-store"
import { useWM } from "@/lib/os/wm-store"
import { useNotify } from "@/lib/os/notify-store"
import { useClockStore, nextAlarm, alarmTimeText } from "@/lib/os/clock-store"
import { PHONE_QUERY } from "@/lib/os/viewport"
import { SLOP, alarmChip, shadeDate, statusTime, velocityOf } from "@/lib/os/phone-shade"
import { Wallpaper } from "@/components/os/wallpaper"
import { prefersTwelveHour, useMinuteClock } from "./use-now"

/** True while the phone shell is showing. `false` on the server and before the first check. */
export function usePhoneViewport(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY)
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return phone
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches

/** A Pixel lock screen: big clock, date, next alarm, what is waiting, and a swipe (or button) to get in. */
export function PhoneLockScreen() {
  const unlock = usePower((s) => s.unlock)
  const theme = useWM((s) => s.theme)
  const unread = useNotify((s) => s.unread)
  const alarms = useClockStore((s) => s.alarms)
  const now = useMinuteClock()
  const twelve = useMemo(() => prefersTwelveHour(), [])
  const next = now ? nextAlarm(alarms, now.getTime()) : null
  const alarm = next && now ? alarmChip(next.at, now.getTime(), alarmTimeText(new Date(next.at).getHours(), new Date(next.at).getMinutes())) : null
  const content = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; y: number; samples: { t: number; y: number }[]; active: boolean } | null>(null)

  const place = (dy: number) => {
    const el = content.current
    if (!el) return
    const lift = Math.min(0, dy)
    el.style.transform = reduced() ? "" : `translate3d(0, ${lift}px, 0)`
    el.style.opacity = String(1 - Math.min(1, -lift / (window.innerHeight * 0.35)))
  }
  const springBack = () => {
    const el = content.current
    if (!el) return
    el.style.transition = reduced() ? "none" : "transform .22s ease, opacity .22s ease"
    place(0)
  }

  return (
    <div
      className="phone-lock fixed inset-0 z-[9999] overflow-hidden text-white"
      onPointerDown={(e) => {
        if (!e.isPrimary || e.button !== 0 || (e.target as HTMLElement).closest("button")) return
        drag.current = { id: e.pointerId, y: e.clientY, samples: [{ t: e.timeStamp, y: e.clientY }], active: false }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || d.id !== e.pointerId) return
        const dy = e.clientY - d.y
        d.samples.push({ t: e.timeStamp, y: e.clientY })
        if (d.samples.length > 8) d.samples.shift()
        if (!d.active && Math.abs(dy) > SLOP) { d.active = true; e.currentTarget.setPointerCapture(e.pointerId); if (content.current) content.current.style.transition = "none" }
        if (d.active) place(dy)
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        if (!d || d.id !== e.pointerId || !d.active) return
        const dy = e.clientY - d.y
        if (dy < -window.innerHeight * 0.22 || velocityOf(d.samples) < -0.6) unlock()
        else springBack()
      }}
      onPointerCancel={() => { drag.current = null; springBack() }}
    >
      <Wallpaper theme={theme} />
      <div className="absolute inset-0 bg-black/40" />
      <div ref={content} className="phone-lock-content">
        <div className="text-center">
          <p className="phone-lock-clock">{now ? statusTime(now, twelve) : "--:--"}</p>
          <p className="mt-2 text-[16px] text-white/90">{now ? shadeDate(now) : ""}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[14px] text-white/85">
            {alarm && <span className="inline-flex items-center gap-1.5"><AlarmClock size={15} aria-hidden />{alarm}</span>}
            {unread > 0 && <span className="inline-flex items-center gap-1.5"><Bell size={15} aria-hidden />{unread === 1 ? "1 notification" : `${unread} notifications`}</span>}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <ChevronUp size={22} aria-hidden className="phone-lock-hint" />
          <p className="text-[13px] text-white/80">Swipe up to unlock</p>
          <button type="button" autoFocus onClick={unlock} className="phone-lock-button"><LockOpen size={18} aria-hidden />Unlock</button>
          <p className="text-[12px] text-white/60">No PIN. It&rsquo;s a portfolio, not a vault.</p>
        </div>
      </div>
    </div>
  )
}

/** Sleep on a phone: a dim always-on clock on black. Any touch or key wakes to the lock screen. */
export function PhoneSleepScreen() {
  const go = usePower((s) => s.go)
  const now = useMinuteClock()
  const twelve = useMemo(() => prefersTwelveHour(), [])
  useEffect(() => {
    const wake = () => go("locked")
    window.addEventListener("pointerdown", wake)
    window.addEventListener("keydown", wake)
    return () => {
      window.removeEventListener("pointerdown", wake)
      window.removeEventListener("keydown", wake)
    }
  }, [go])
  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-black" aria-label="Display is asleep">
      <div className="text-center text-white/55">
        <p className="text-[56px] font-extralight leading-none tabular-nums">{now ? statusTime(now, twelve) : ""}</p>
        <p className="mt-2 text-[13px]">{now ? shadeDate(now) : ""}</p>
      </div>
    </div>
  )
}
