"use client"

import { AlarmClock, FileBadge, Hand } from "lucide-react"
import { PROFILE } from "@/lib/os/content"
import { nextAlarm, useClockStore } from "@/lib/os/clock-store"
import type { Launch } from "./app-tile"

/** Pixel's At a Glance: the time, the date and the next alarm. Tapping it opens Clock. */
export function AtAGlance({ now, onLaunch, compact = false }: { now: Date | null; onLaunch: Launch; compact?: boolean }) {
  const alarms = useClockStore((s) => s.alarms)
  const next = now ? nextAlarm(alarms, now.getTime()) : null
  const parts = now ? new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).formatToParts(now) : []
  const digits = parts.filter((p) => p.type !== "dayPeriod").map((p) => p.value).join("").trim() || "--:--"
  const period = parts.find((p) => p.type === "dayPeriod")?.value
  const date = now?.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) ?? ""
  const alarm = next ? new Date(next.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null
  return (
    <button
      type="button"
      onClick={(e) => onLaunch("clock", e.currentTarget)}
      aria-label={`Clock. ${digits}${period ? ` ${period}` : ""}, ${date}.${alarm ? ` Next alarm ${alarm}.` : ""}`}
      className="phone-glance block w-full rounded-3xl px-2 py-1 text-left text-white"
    >
      <span className={`block font-light leading-none tracking-tight drop-shadow-lg ${compact ? "text-[40px]" : "text-[56px]"}`}>
        {digits}{period && <span className="ml-1.5 text-[0.36em] font-normal tracking-normal opacity-85">{period}</span>}
      </span>
      <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-white/90 drop-shadow">
        <span>{date}</span>
        {alarm && <span className="inline-flex items-center gap-1"><AlarmClock size={14} aria-hidden />{alarm}</span>}
      </span>
    </button>
  )
}

/** The hero: who I am today, and what I am growing into. */
export function ProfileWidget({ onLaunch, compact = false }: { onLaunch: Launch; compact?: boolean }) {
  return (
    <section aria-label="About Johnpaul" className={`phone-profile rounded-[28px] text-white ${compact ? "px-3.5 py-3" : "p-4"}`}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-300 to-indigo-600 text-[15px] font-semibold shadow-lg">{PROFILE.initials}</span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] text-white/85">{PROFILE.name}</span>
          <span className="block text-[21px] font-semibold leading-tight">{PROFILE.title}</span>
        </span>
      </div>
      <p className={`phone-next-chip inline-flex ${compact ? "mt-2" : "mt-3"} max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium`}>
        <span className="phone-pulse relative inline-flex h-2.5 w-2.5 shrink-0" aria-hidden><span className="absolute inset-0 rounded-full bg-emerald-300" /></span>
        <span className="min-w-0">{PROFILE.next}<span className="sr-only">, in progress</span></span>
      </p>
      <p className={`text-[13.5px] leading-snug text-white/90 ${compact ? "mt-1.5" : "mt-2.5"}`}>{PROFILE.tagline}</p>
      <div className={`flex gap-2 ${compact ? "mt-2" : "mt-3"}`}>
        <button type="button" onClick={(e) => onLaunch("contact", e.currentTarget)} className="phone-pill-btn inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium" data-primary>
          <Hand size={16} aria-hidden />Say hi
        </button>
        <button type="button" onClick={(e) => onLaunch("resume", e.currentTarget)} className="phone-pill-btn inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium">
          <FileBadge size={16} aria-hidden />Resume
        </button>
      </div>
    </section>
  )
}
