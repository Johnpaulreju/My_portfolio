"use client"

import { useRef } from "react"
import { MapPin, MessageCircle } from "lucide-react"
import { durationText } from "@/lib/os/clock-store"
import { useWM } from "@/lib/os/wm-store"
import { timeParts } from "@/components/os/clock/ring-screen"
import { cardStyle, muted, useFrame, useLayout, useReducedMotion, useSecond } from "./shared"

const IST = "Asia/Kolkata"
/** India has one time zone and no daylight saving: always UTC+5:30. */
const IST_OFFSET_MIN = 330

/** A guess at what Johnpaul is up to, from the hour in Bangalore. Hedged on purpose. */
function hint(hour: number) {
  if (hour >= 23 || hour < 6) return "Probably asleep. Messages still welcome."
  if (hour < 9) return "Morning. Brain is still compiling."
  if (hour < 13) return "Probably coding. Good time to say hi."
  if (hour < 14) return "Lunch break. The build can wait."
  if (hour < 19) return "Probably coding, or fixing what the coding broke."
  return "Evening. Probably reading about AI agents."
}

const dayKey = (now: number, timeZone?: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)

export function ClockTab() {
  const now = useSecond()
  const { width, height, wide, short } = useLayout()
  const row = wide && short
  const face = row ? Math.max(120, Math.min(200, height - 48)) : Math.round(Math.max(140, Math.min(280, width - 96, height * (short ? 0.36 : 0.42))))
  const { main, period } = timeParts(now)
  const seconds = String(new Date(now).getSeconds()).padStart(2, "0")

  return (
    <div className="os-scroll h-full overflow-y-auto">
      <div className={row ? "flex min-h-full items-center gap-6 px-6 py-4" : `mx-auto flex max-w-[520px] flex-col items-center px-4 ${short ? "gap-3 py-4" : "gap-5 py-7"}`}>
        <AnalogFace size={face} />
        <div className={`flex w-full min-w-0 flex-col ${row ? "flex-1 items-start" : "items-center"}`}>
          <p className="text-[12.5px]" style={muted}>Your time</p>
          <p className={`font-light leading-tight tabular-nums ${short ? "text-[38px]" : "text-[46px]"}`} aria-live="off">
            {main}
            <span className="text-[20px]" style={muted}>:{seconds}</span>
            {period && <span className="ml-1.5 text-[18px]">{period}</span>}
          </p>
          <p className="text-[14px]" style={muted}>
            {new Date(now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <JohnpaulCard now={now} />
        </div>
      </div>
    </div>
  )
}

/** Hands are rotated straight on the DOM; the second hand sweeps unless motion is reduced. */
function AnalogFace({ size }: { size: number }) {
  const reduced = useReducedMotion()
  const hour = useRef<SVGGElement>(null)
  const minute = useRef<SVGGElement>(null)
  const second = useRef<SVGGElement>(null)

  useFrame((now) => {
    const d = new Date(now)
    const s = d.getSeconds() + (reduced ? 0 : d.getMilliseconds() / 1000)
    const m = d.getMinutes() + s / 60
    const h = (d.getHours() % 12) + m / 60
    hour.current?.setAttribute("transform", `rotate(${h * 30} 100 100)`)
    minute.current?.setAttribute("transform", `rotate(${m * 6} 100 100)`)
    second.current?.setAttribute("transform", `rotate(${s * 6} 100 100)`)
  }, !reduced)

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="Analog clock showing your time" className="shrink-0">
      <circle cx="100" cy="100" r="97" fill="var(--os-card)" stroke="var(--os-border)" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="80" fill="var(--os-accent-soft)" opacity=".35" />
      {Array.from({ length: 60 }, (_, i) => {
        const big = i % 5 === 0
        const a = (i * 6 * Math.PI) / 180
        const r = big ? 86 : 88
        return (
          <circle
            key={i}
            cx={100 + Math.sin(a) * r}
            cy={100 - Math.cos(a) * r}
            r={big ? 3 : 1}
            fill={big ? "var(--os-fg)" : "var(--os-muted)"}
            opacity={big ? 0.9 : 0.5}
          />
        )
      })}
      <g ref={hour}>
        <line x1="100" y1="100" x2="100" y2="54" stroke="var(--os-fg)" strokeWidth="9" strokeLinecap="round" />
      </g>
      <g ref={minute}>
        <line x1="100" y1="100" x2="100" y2="30" stroke="var(--os-accent)" strokeWidth="6" strokeLinecap="round" />
      </g>
      {!reduced && (
        <g ref={second}>
          <line x1="100" y1="116" x2="100" y2="22" stroke="var(--os-danger)" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
      <circle cx="100" cy="100" r="5" fill="var(--os-fg)" />
      <circle cx="100" cy="100" r="2" fill="var(--os-surface)" />
    </svg>
  )
}

function JohnpaulCard({ now }: { now: number }) {
  const open = useWM((s) => s.open)
  const time = new Intl.DateTimeFormat([], { timeZone: IST, hour: "numeric", minute: "2-digit" }).format(now)
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: IST, hour: "numeric", hourCycle: "h23" }).format(now)) % 24
  const mine = dayKey(now)
  const his = dayKey(now, IST)
  const day = his === mine ? "Today" : his > mine ? "Tomorrow" : "Yesterday"
  const diff = IST_OFFSET_MIN + new Date(now).getTimezoneOffset()
  const offset = diff === 0 ? "Same time as you" : `${durationText(Math.abs(diff) * 60_000)} ${diff > 0 ? "ahead of" : "behind"} you`

  return (
    <section className="mt-5 w-full max-w-[440px] rounded-3xl p-4" style={cardStyle} aria-label="Johnpaul's time">
      <p className="flex items-center gap-1.5 text-[12.5px]" style={muted}>
        <MapPin size={14} aria-hidden />
        Johnpaul&apos;s time · Bangalore (IST)
      </p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-[32px] font-light tabular-nums">{time}</p>
        <p className="text-[12.5px]" style={muted}>{day} · {offset}</p>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="min-w-0 text-[14px]">{hint(hour)}</p>
        <button
          type="button"
          onClick={() => open("contact")}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--os-accent)]"
          style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
        >
          <MessageCircle size={16} aria-hidden />
          Say hi
        </button>
      </div>
    </section>
  )
}
