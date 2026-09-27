"use client"

import { create } from "zustand"

/**
 * Alarms, the timer and the stopwatch. Everything is saved in this browser,
 * and nothing rings unless this tab is open: a web page cannot wake a phone.
 * The pure helpers below are what AlarmService, the Clock app and the phone
 * shell all read, so "next alarm" means the same thing everywhere.
 */
const KEY = "jp-os-clock-v1"

/** Sunday = 0, like Date#getDay. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type Alarm = {
  id: string
  /** Local wall-clock time, 0-23 and 0-59. */
  hour: number
  minute: number
  label: string
  enabled: boolean
  /** Repeat days. Empty means once: it rings one time, then turns off. */
  days: Weekday[]
  /** When it was last switched on or edited. A one-time alarm rings at its first slot after this. */
  armedAt: number
  /** A snoozed alarm rings again at this time. */
  snoozeUntil: number | null
}

export type TimerState = {
  /** The length the visitor picked, in ms. */
  duration: number
  /** While running: when it ends. Otherwise null. */
  endsAt: number | null
  /** While paused or idle: what is left, in ms. */
  remaining: number
}

export type StopwatchState = {
  /** While running: when the current run started. Otherwise null. */
  startedAt: number | null
  /** Time from earlier runs, in ms. */
  banked: number
  /** Total elapsed at each lap, oldest first. */
  laps: number[]
}

export type Ringing =
  | { kind: "alarm"; alarmId: string; label: string; since: number }
  | { kind: "timer"; label: string; since: number }

export const SNOOZE_MS = 10 * 60_000
export const DEFAULT_TIMER_MS = 5 * 60_000
/** How long anything rings before it gives up and becomes a missed alarm. */
export const RING_MS = 60_000
/** The longest timer: 23:59:59. Longer keypad entries are clamped to it. */
export const MAX_TIMER_MS = 24 * 3_600_000 - 1000

const IDLE_TIMER: TimerState = { duration: DEFAULT_TIMER_MS, endsAt: null, remaining: DEFAULT_TIMER_MS }
const IDLE_STOPWATCH: StopwatchState = { startedAt: null, banked: 0, laps: [] }

/* ------------------------------------------------------------ pure helpers */

function slotOn(day: Date, alarm: Pick<Alarm, "hour" | "minute">, addDays: number) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + addDays, alarm.hour, alarm.minute, 0, 0)
}

/** The first matching wall-clock slot strictly after `from`, or null. */
function firstSlotAfter(alarm: Alarm, from: number): number | null {
  const base = new Date(from)
  for (let add = 0; add <= 7; add++) {
    const slot = slotOn(base, alarm, add)
    if (slot.getTime() <= from) continue
    if (alarm.days.length === 0 || alarm.days.includes(slot.getDay() as Weekday)) return slot.getTime()
  }
  return null
}

/**
 * When this alarm next rings, strictly after `from` (epoch ms), or null when
 * it never will: switched off, or a one-time alarm whose slot has passed.
 */
export function nextOccurrence(alarm: Alarm, from: number): number | null {
  if (!alarm.enabled) return null
  const snooze = alarm.snoozeUntil !== null && alarm.snoozeUntil > from ? alarm.snoozeUntil : null
  let slot: number | null
  if (alarm.days.length === 0) {
    const only = firstSlotAfter(alarm, alarm.armedAt)
    slot = only !== null && only > from ? only : null
  } else {
    slot = firstSlotAfter(alarm, from)
  }
  if (snooze === null) return slot
  return slot === null ? snooze : Math.min(snooze, slot)
}

/** The soonest alarm to ring after `now`, or null when none is set. */
export function nextAlarm(alarms: Alarm[], now: number): { alarm: Alarm; at: number } | null {
  let best: { alarm: Alarm; at: number } | null = null
  for (const alarm of alarms) {
    const at = nextOccurrence(alarm, now)
    if (at !== null && (best === null || at < best.at)) best = { alarm, at }
  }
  return best
}

/** Alarms that should ring in the window (since, now]. Oldest first. */
export function dueAlarms(alarms: Alarm[], since: number, now: number): { alarm: Alarm; at: number }[] {
  const due: { alarm: Alarm; at: number }[] = []
  for (const alarm of alarms) {
    const at = nextOccurrence(alarm, since)
    if (at !== null && at <= now) due.push({ alarm, at })
  }
  return due.sort((a, b) => a.at - b.at)
}

/** One-time alarms whose only slot passed while no tab was open to ring them. */
export function missedAlarms(alarms: Alarm[], now: number): Alarm[] {
  return alarms.filter((alarm) => {
    if (!alarm.enabled || alarm.days.length > 0) return false
    const only = firstSlotAfter(alarm, alarm.armedAt)
    const snoozed = alarm.snoozeUntil !== null && alarm.snoozeUntil > now
    return only !== null && only <= now && !snoozed
  })
}

export function timerLeft(timer: TimerState, now: number): number {
  return timer.endsAt === null ? timer.remaining : Math.max(0, timer.endsAt - now)
}

export function stopwatchElapsed(sw: StopwatchState, now: number): number {
  return sw.banked + (sw.startedAt === null ? 0 : Math.max(0, now - sw.startedAt))
}

/** "Alarm in 7 h 5 min", the way a phone says it after you set one. */
export function alarmInText(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  const parts = [days ? `${days} d` : "", hours ? `${hours} h` : "", mins && !days ? `${mins} min` : ""].filter(Boolean)
  return `Alarm in ${parts.join(" ")}`
}

/** "Once", "Every day", "Weekdays", "Weekends" or "Mon, Wed". */
export function repeatSummary(days: Weekday[]): string {
  const set = [...new Set(days)].sort((a, b) => a - b)
  if (set.length === 0) return "Once"
  if (set.length === 7) return "Every day"
  const key = set.join("")
  if (key === "12345") return "Weekdays"
  if (key === "06") return "Weekends"
  return set.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")
}

/** A new alarm starts at the next full hour, the way a phone suggests one. */
export function nextFullHour(now: number): { hour: number; minute: number } {
  return { hour: (new Date(now).getHours() + 1) % 24, minute: 0 }
}

/** Timer keypad: "130" means 1 min 30 s. Digits fill hh:mm:ss from the right. */
export function digitsToMs(digits: string): number {
  const d = digits.replace(/\D/g, "").slice(-6).padStart(6, "0")
  const ms = (Number(d.slice(0, 2)) * 3600 + Number(d.slice(2, 4)) * 60 + Number(d.slice(4))) * 1000
  return Math.min(ms, MAX_TIMER_MS)
}

/** The keypad digits for a length, without leading zeros: 5 min is "500". */
export function msToDigits(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const two = (n: number) => String(n).padStart(2, "0")
  return `${two(Math.min(99, Math.floor(s / 3600)))}${two(Math.floor((s % 3600) / 60))}${two(s % 60)}`.replace(/^0+/, "")
}

/** A length the way people say it: "5 min", "1 h 30 min", "1 min 30 s". */
export function durationText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const parts = [h ? `${h} h` : "", m ? `${m} min` : "", s && !h ? `${s} s` : ""].filter(Boolean)
  return parts.length ? parts.join(" ") : "0 s"
}

/** "7:05 AM" or "07:05", following the visitor's own clock format. */
export function alarmTimeText(hour: number, minute: number): string {
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

/* ------------------------------------------------------------ persistence */

function isAlarm(a: unknown): a is Alarm {
  if (!a || typeof a !== "object") return false
  const x = a as Partial<Alarm>
  return (
    typeof x.id === "string" &&
    Number.isInteger(x.hour) && x.hour! >= 0 && x.hour! <= 23 &&
    Number.isInteger(x.minute) && x.minute! >= 0 && x.minute! <= 59 &&
    typeof x.label === "string" &&
    typeof x.enabled === "boolean" &&
    Array.isArray(x.days) && x.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
    typeof x.armedAt === "number" &&
    (x.snoozeUntil === null || typeof x.snoozeUntil === "number")
  )
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n)

function isTimer(t: unknown): t is TimerState {
  if (!t || typeof t !== "object") return false
  const x = t as Partial<TimerState>
  return finite(x.duration) && x.duration > 0 && finite(x.remaining) && x.remaining >= 0 && (x.endsAt === null || finite(x.endsAt))
}

function isStopwatch(s: unknown): s is StopwatchState {
  if (!s || typeof s !== "object") return false
  const x = s as Partial<StopwatchState>
  return finite(x.banked) && x.banked >= 0 && (x.startedAt === null || finite(x.startedAt)) && Array.isArray(x.laps) && x.laps.every(finite)
}

type Saved = { alarms: Alarm[]; timer: TimerState; stopwatch: StopwatchState }

function save(state: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ alarms: state.alarms, timer: state.timer, stopwatch: state.stopwatch }))
  } catch {
    /* private mode - alarms just won't survive a reload */
  }
}

const sortDays = (days: Weekday[]) => [...new Set(days)].sort((a, b) => a - b)

let seq = 0
const newId = () => `alarm-${Date.now().toString(36)}-${++seq}`

/* ------------------------------------------------------------ store */

type ClockState = Saved & {
  hydrated: boolean
  /** What is ringing right now. Never saved. */
  ringing: Ringing | null

  hydrate: () => void
  addAlarm: (a: { hour: number; minute: number; label?: string; days?: Weekday[] }) => string
  updateAlarm: (id: string, patch: Partial<Pick<Alarm, "hour" | "minute" | "label" | "days" | "enabled">>) => void
  removeAlarm: (id: string) => void

  setTimerDuration: (ms: number) => void
  startTimer: () => void
  pauseTimer: () => void
  resetTimer: () => void
  /** "+1:00": more time on a running or paused timer. Reset still returns to the picked length. */
  extendTimer: (ms: number) => void

  startStopwatch: () => void
  pauseStopwatch: () => void
  lapStopwatch: () => void
  resetStopwatch: () => void

  ring: (r: Ringing) => void
  /** Alarm: ring again in SNOOZE_MS. Timer: one more minute. */
  snooze: () => void
  stopRinging: () => void
}

export const useClockStore = create<ClockState>((set, get) => {
  /** Apply a change to the saved parts, then write them once. */
  const commit = (patch: Partial<Saved>) => {
    set(patch)
    const s = get()
    save({ alarms: s.alarms, timer: s.timer, stopwatch: s.stopwatch })
  }

  return {
    hydrated: false,
    alarms: [],
    timer: IDLE_TIMER,
    stopwatch: IDLE_STOPWATCH,
    ringing: null,

    hydrate: () => {
      if (get().hydrated) return
      let saved: Partial<Saved> = {}
      try {
        const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null
        if (raw && typeof raw === "object") saved = raw
      } catch {
        /* unreadable - start fresh */
      }
      set({
        hydrated: true,
        alarms: Array.isArray(saved.alarms) ? saved.alarms.filter(isAlarm) : [],
        timer: isTimer(saved.timer) ? saved.timer : IDLE_TIMER,
        stopwatch: isStopwatch(saved.stopwatch) ? saved.stopwatch : IDLE_STOPWATCH,
      })
    },

    addAlarm: ({ hour, minute, label = "", days = [] }) => {
      const id = newId()
      const alarm: Alarm = { id, hour, minute, label: label.trim(), enabled: true, days: sortDays(days), armedAt: Date.now(), snoozeUntil: null }
      commit({ alarms: [...get().alarms, alarm].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)) })
      return id
    },

    updateAlarm: (id, patch) => {
      const now = Date.now()
      commit({
        alarms: get().alarms
          .map((a) => {
            if (a.id !== id) return a
            const days = patch.days ? sortDays(patch.days) : a.days
            // Any edit re-arms it from now and cancels a snooze, like a phone.
            return { ...a, ...patch, days, label: (patch.label ?? a.label).trim(), armedAt: now, snoozeUntil: null }
          })
          .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)),
      })
    },

    removeAlarm: (id) => {
      const ringing = get().ringing
      if (ringing?.kind === "alarm" && ringing.alarmId === id) set({ ringing: null })
      commit({ alarms: get().alarms.filter((a) => a.id !== id) })
    },

    setTimerDuration: (ms) => {
      const duration = Math.max(1000, Math.min(Math.round(ms), MAX_TIMER_MS))
      commit({ timer: { duration, endsAt: null, remaining: duration } })
    },
    startTimer: () => {
      const t = get().timer
      if (t.endsAt !== null) return
      const remaining = t.remaining > 0 ? t.remaining : t.duration
      commit({ timer: { ...t, endsAt: Date.now() + remaining, remaining } })
    },
    pauseTimer: () => {
      const t = get().timer
      if (t.endsAt === null) return
      commit({ timer: { ...t, endsAt: null, remaining: timerLeft(t, Date.now()) } })
    },
    resetTimer: () => {
      const t = get().timer
      commit({ timer: { duration: t.duration, endsAt: null, remaining: t.duration } })
    },
    extendTimer: (ms) => {
      const t = get().timer
      const now = Date.now()
      const left = Math.min(timerLeft(t, now) + ms, MAX_TIMER_MS)
      commit({ timer: t.endsAt === null ? { ...t, remaining: left } : { ...t, endsAt: now + left, remaining: left } })
    },

    startStopwatch: () => {
      const sw = get().stopwatch
      if (sw.startedAt !== null) return
      commit({ stopwatch: { ...sw, startedAt: Date.now() } })
    },
    pauseStopwatch: () => {
      const sw = get().stopwatch
      if (sw.startedAt === null) return
      commit({ stopwatch: { ...sw, startedAt: null, banked: stopwatchElapsed(sw, Date.now()) } })
    },
    lapStopwatch: () => {
      const sw = get().stopwatch
      if (sw.startedAt === null) return
      commit({ stopwatch: { ...sw, laps: [...sw.laps, stopwatchElapsed(sw, Date.now())].slice(-99) } })
    },
    resetStopwatch: () => commit({ stopwatch: IDLE_STOPWATCH }),

    ring: (ringing) => {
      set({ ringing })
      if (ringing.kind === "alarm") {
        // A one-time alarm has used its slot; turn it off like a phone does.
        commit({ alarms: get().alarms.map((a) => (a.id === ringing.alarmId ? { ...a, snoozeUntil: null, enabled: a.days.length > 0 } : a)) })
      } else {
        const t = get().timer
        commit({ timer: { duration: t.duration, endsAt: null, remaining: t.duration } })
      }
    },
    snooze: () => {
      const r = get().ringing
      if (!r) return
      const now = Date.now()
      if (r.kind === "alarm") {
        commit({ alarms: get().alarms.map((a) => (a.id === r.alarmId ? { ...a, enabled: true, snoozeUntil: now + SNOOZE_MS } : a)) })
      } else {
        const t = get().timer
        commit({ timer: { ...t, endsAt: now + 60_000, remaining: 60_000 } })
      }
      set({ ringing: null })
    },
    stopRinging: () => set({ ringing: null }),
  }
})
