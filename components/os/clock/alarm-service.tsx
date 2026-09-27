"use client"

import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import {
  RING_MS,
  SNOOZE_MS,
  alarmTimeText,
  dueAlarms,
  durationText,
  missedAlarms,
  useClockStore,
  type Ringing,
} from "@/lib/os/clock-store"
import { primeAlarmSound, setAlarmVolume, startAlarmSound } from "@/lib/os/alarm-sound"
import { useNotify } from "@/lib/os/notify-store"
import { usePower, type PowerState } from "@/lib/os/power-store"
import { useSystem } from "@/lib/os/system-store"
import { useWM } from "@/lib/os/wm-store"
import { RingScreen } from "./ring-screen"

/** Sleep counts: an alarm wakes the screen to the lock screen, like a phone. */
const CAN_RING: PowerState[] = ["running", "locked", "sleeping"]

/**
 * A background tab only gets its timers once a minute, and a laptop lid can
 * close for a while. Anything due within this window still rings, late;
 * anything older becomes a missed-alarm notification instead.
 */
const GRACE_MS = 5 * 60_000

/** Shared by every mount, so StrictMode's double effects can't ring anything twice. */
const watch = { started: false, lastCheck: 0 }
const announced = new WeakSet<Ringing>()

/** When the last alarm rang, so a reload right after Stop doesn't ring a repeating alarm again. */
const RANG_KEY = "jp-os-clock-rang-v1"
function lastRang(): number {
  try {
    const n = Number(localStorage.getItem(RANG_KEY))
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}
function rememberRang(at: number) {
  try {
    localStorage.setItem(RANG_KEY, String(at))
  } catch {
    /* private mode - a reload may ring it once more */
  }
}

const clockTime = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

function notify(title: string, body: string, quiet = false) {
  useNotify.getState().push({ appId: "clock", source: "Clock", title, body, ...(quiet ? { sound: null } : {}) })
}

function notifyMissed(times: string[], body: string) {
  const list = [...new Set(times)]
  notify(list.length === 1 ? `Missed alarm · ${list[0]}` : `${list.length} missed alarms · ${list.join(", ")}`, body)
}

/** One pass: ring whatever is due now, and report what was missed. */
function check() {
  const power = usePower.getState()
  const clock = useClockStore.getState()
  // Off, booting or shutting down: nothing rings, and the window stays open so
  // the next pass can tell what was missed meanwhile.
  if (!clock.hydrated || !CAN_RING.includes(power.state)) return
  const now = Date.now()

  if (!watch.started) {
    watch.started = true
    watch.lastCheck = Math.max(now - GRACE_MS, Math.min(lastRang(), now))
    const missed = missedAlarms(clock.alarms, watch.lastCheck)
    if (missed.length) {
      missed.forEach((a) => clock.updateAlarm(a.id, { enabled: false }))
      notifyMissed(missed.map((a) => alarmTimeText(a.hour, a.minute)), "This page was closed, so it couldn't ring.")
    }
  }

  // One thing rings at a time. The window does not move meanwhile, so an alarm
  // that comes due during another one rings right after it.
  if (clock.ringing) return

  const { timer } = clock
  if (timer.endsAt !== null && timer.endsAt <= now) {
    if (now - timer.endsAt > GRACE_MS) {
      clock.resetTimer()
      notify("Timer ended", `The ${durationText(timer.duration)} timer finished while this page was away.`)
    } else {
      wake()
      clock.ring({ kind: "timer", label: `${durationText(timer.duration)} timer`, since: now })
      return
    }
  }

  const due = dueAlarms(clock.alarms, watch.lastCheck, now)
  const late = due.filter((d) => now - d.at > GRACE_MS)
  const live = due.filter((d) => now - d.at <= GRACE_MS)
  if (late.length) {
    late.forEach(({ alarm }) => alarm.days.length === 0 && clock.updateAlarm(alarm.id, { enabled: false }))
    notifyMissed(late.map((d) => clockTime(d.at)), "This page was off or asleep, so it couldn't ring.")
  }
  if (!live.length) {
    watch.lastCheck = now
    return
  }

  // Two alarms set for the same minute ring once, with both labels.
  const first = live[0]
  const together = live.filter((d) => d.at === first.at)
  together.slice(1).forEach(({ alarm }) => alarm.days.length === 0 && clock.updateAlarm(alarm.id, { enabled: false }))
  watch.lastCheck = first.at
  rememberRang(first.at)
  wake()
  clock.ring({
    kind: "alarm",
    alarmId: first.alarm.id,
    label: together.map((d) => d.alarm.label).filter(Boolean).join(" · "),
    since: now,
  })
}

function wake() {
  const power = usePower.getState()
  if (power.state === "sleeping") power.go("locked")
}

function canVibrate() {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false
  // Chrome refuses (and logs) vibration before the visitor has touched the page.
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
  return activation?.hasBeenActive !== false
}

/**
 * Watches alarms and the timer while this tab is open, and shows what rings:
 * full screen on the phone, a centered dialog on the desktop. The dialog is
 * portaled to <body> so it escapes the inert shell and sits above the lock screen.
 */
export function AlarmService({ mobile }: { mobile: boolean }) {
  const hydrate = useClockStore((s) => s.hydrate)
  const ringing = useClockStore((s) => s.ringing)
  const theme = useWM((s) => s.theme)
  const volume = useSystem((s) => s.volume)
  const muted = useSystem((s) => s.muted)
  const mobileRef = useRef(mobile)
  mobileRef.current = mobile

  useEffect(() => hydrate(), [hydrate])
  useEffect(() => setAlarmVolume(volume, muted), [volume, muted])

  useEffect(() => {
    const tick = setInterval(check, 1000)
    const onWake = () => check()
    document.addEventListener("visibilitychange", onWake)
    window.addEventListener("focus", onWake)
    const offPower = usePower.subscribe((s, prev) => {
      if (s.state === prev.state) return
      if (CAN_RING.includes(s.state)) check()
      else if (useClockStore.getState().ringing) useClockStore.getState().stopRinging()
    })
    const offClock = useClockStore.subscribe((s, prev) => {
      if (s.hydrated && !prev.hydrated) check()
    })
    // Sound may only start after a touch. Warm it up on any touch while
    // something is set to ring, so it can play later with nobody around.
    const prime = () => {
      const { alarms, timer } = useClockStore.getState()
      if (timer.endsAt !== null || alarms.some((a) => a.enabled)) primeAlarmSound()
    }
    window.addEventListener("pointerdown", prime, true)
    window.addEventListener("keydown", prime, true)
    check()
    return () => {
      clearInterval(tick)
      document.removeEventListener("visibilitychange", onWake)
      window.removeEventListener("focus", onWake)
      window.removeEventListener("pointerdown", prime, true)
      window.removeEventListener("keydown", prime, true)
      offPower()
      offClock()
    }
  }, [])

  // Everything a ring does besides the screen: sound, buzz, tab title, the
  // notification, and giving up after a minute.
  useEffect(() => {
    if (!ringing) return
    const timer = ringing.kind === "timer"
    const what = timer ? "Time's up" : `Alarm · ${clockTime(ringing.since)}`
    if (!announced.has(ringing)) {
      announced.add(ringing)
      notify(what, ringing.label || "Ringing now.", true)
    }

    const stopSound = startAlarmSound(timer ? "timer" : "alarm")

    let buzz: ReturnType<typeof setInterval> | null = null
    if (mobileRef.current && canVibrate()) {
      const pattern = timer ? [200, 120, 200, 680] : [700, 500, 700, 1100]
      navigator.vibrate(pattern)
      buzz = setInterval(() => navigator.vibrate(pattern), 3000)
    }

    const title = document.title
    let flip = true
    document.title = `⏰ ${what}`
    const flash = setInterval(() => {
      flip = !flip
      document.title = flip ? `⏰ ${what}` : title
    }, 1000)

    const giveUp = setTimeout(() => {
      if (useClockStore.getState().ringing !== ringing) return
      useClockStore.getState().stopRinging()
      if (timer) notify("Timer ended", "It rang for a minute. Nobody pressed Stop.")
      else notifyMissed([clockTime(ringing.since)], "It rang for a minute. Nobody pressed Stop.")
    }, Math.max(0, ringing.since + RING_MS - Date.now()))

    return () => {
      stopSound()
      if (buzz) {
        clearInterval(buzz)
        navigator.vibrate(0)
      }
      clearInterval(flash)
      clearTimeout(giveUp)
      document.title = title
    }
  }, [ringing])

  if (!ringing) return null

  const stop = () => useClockStore.getState().stopRinging()
  const snooze = () => {
    const current = useClockStore.getState().ringing
    useClockStore.getState().snooze()
    if (current?.kind === "alarm") notify(`Snoozed · rings again at ${clockTime(Date.now() + SNOOZE_MS)}`, current.label || "10 more minutes. We won't tell.", true)
  }

  return createPortal(
    <RingScreen
      key={`${ringing.kind}-${ringing.since}`}
      ringing={ringing}
      mobile={mobile}
      theme={theme}
      onStop={stop}
      onSnooze={snooze}
    />,
    document.body,
  )
}
