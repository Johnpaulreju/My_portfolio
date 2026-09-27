"use client"

import { useMemo, useRef } from "react"
import { AlarmClock, Battery, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, BellOff, Plane, Signal, Wifi, WifiLow, WifiOff } from "lucide-react"
import { useNotify } from "@/lib/os/notify-store"
import { useSystem } from "@/lib/os/system-store"
import { useClockStore, nextAlarm } from "@/lib/os/clock-store"
import { useBattery } from "@/lib/os/phone-battery"
import { SLOP, batteryGlyph, statusLabel, statusTime, unreadApps, velocityOf } from "@/lib/os/phone-shade"
import { iconFor } from "@/components/os/app-icon"
import { shadeBus } from "./shade/shade-bus"
import { prefersTwelveHour, useMinuteClock } from "./shade/use-now"

const BATTERY = { charging: BatteryCharging, full: BatteryFull, medium: BatteryMedium, low: BatteryLow, unknown: Battery }

/**
 * A Pixel status bar. The whole bar is one button: tap or Enter opens the
 * shade, a pull drags it down under the finger.
 */
export function StatusBar({ overApp, open, onOpen }: { overApp: boolean; open: boolean; onOpen: () => void }) {
  const now = useMinuteClock()
  const twelve = useMemo(() => prefersTwelveHour(), [])
  const unread = useNotify((s) => s.unread)
  const center = useNotify((s) => s.center)
  const dnd = useNotify((s) => s.dnd)
  const net = useSystem((s) => s.status())
  const alarms = useClockStore((s) => s.alarms)
  const battery = useBattery()
  const { apps, more } = unreadApps(center, unread)
  const hasAlarm = !!now && !!nextAlarm(alarms, now.getTime())
  const BatteryIcon = BATTERY[batteryGlyph(battery?.level ?? null, battery?.charging ?? false)]
  const WifiIcon = net === "online" ? Wifi : net === "connecting" || net === "no-internet" ? WifiLow : WifiOff

  const drag = useRef<{ id: number; y: number; samples: { t: number; y: number }[]; pulling: boolean } | null>(null)
  const swallowClick = useRef(false)

  return (
    <div className="phone-status relative z-30 shrink-0" data-over-app={overApp || undefined}>
      <button
        type="button"
        className="phone-status-bar"
        aria-label={statusLabel(unread)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerDown={(e) => {
          swallowClick.current = false
          if (!e.isPrimary || e.button !== 0) return
          drag.current = { id: e.pointerId, y: e.clientY, samples: [{ t: e.timeStamp, y: e.clientY }], pulling: false }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || d.id !== e.pointerId) return
          const dy = e.clientY - d.y
          d.samples.push({ t: e.timeStamp, y: e.clientY })
          if (d.samples.length > 8) d.samples.shift()
          if (!d.pulling && dy > SLOP && shadeBus.ready) { d.pulling = true; shadeBus.begin() }
          if (d.pulling) shadeBus.move(dy)
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          if (!d || d.id !== e.pointerId) return
          const dy = e.clientY - d.y
          if (d.pulling) { swallowClick.current = true; shadeBus.end(dy, velocityOf(d.samples)) }
          // No shade listening yet: a plain long pull still opens it.
          else if (dy >= 56) { swallowClick.current = true; onOpen() }
        }}
        onPointerCancel={() => {
          if (drag.current?.pulling) shadeBus.cancel()
          drag.current = null
          swallowClick.current = true
        }}
        onClick={() => {
          if (swallowClick.current) { swallowClick.current = false; return }
          onOpen()
        }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="phone-status-time">{now ? statusTime(now, twelve) : "--:--"}</span>
          {apps.map((id) => { const Icon = iconFor(id); return <Icon key={id} size={14} aria-hidden /> })}
          {more && <span className="phone-status-dot" aria-hidden />}
        </span>
        <span className="flex shrink-0 items-center gap-1.5" aria-hidden>
          {hasAlarm && <AlarmClock size={14} />}
          {dnd && <BellOff size={14} />}
          {net === "airplane" ? <Plane size={14} /> : <><WifiIcon size={15} className={net === "connecting" ? "phone-status-pulse" : undefined} /><Signal size={14} /></>}
          <span className="flex items-center gap-0.5">
            <BatteryIcon size={17} />
            {battery && <span className="text-[11px] tabular-nums">{Math.round(battery.level * 100)}%</span>}
          </span>
        </span>
      </button>
    </div>
  )
}
