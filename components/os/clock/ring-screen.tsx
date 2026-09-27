"use client"

import { useEffect, useId, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode, type RefObject } from "react"
import { AlarmClock, BellRing, Hourglass, Plus, X, Zap } from "lucide-react"
import { SNOOZE_MS, type Ringing } from "@/lib/os/clock-store"
import type { Theme } from "@/lib/os/types"
import styles from "./clock.module.css"

type Props = {
  ringing: Ringing
  mobile: boolean
  theme: Theme
  onStop: () => void
  onSnooze: () => void
}

/** "7:05" and "AM", so the period can sit smaller beside the digits. */
export function timeParts(at: number) {
  const parts = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).formatToParts(new Date(at))
  const period = parts.find((p) => p.type === "dayPeriod")?.value ?? ""
  const main = parts.filter((p) => p.type !== "dayPeriod").map((p) => p.value).join("").trim()
  return { main, period }
}

function overtime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `-${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/**
 * What rings. A native modal <dialog> in the top layer, so it sits above the
 * lock screen and every window: full screen on the phone, a card on the desktop.
 * Stop has focus, Escape stops, and the bell can be swiped on touch screens.
 */
export function RingScreen({ ringing, mobile, theme, onStop, onSnooze }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const stopButton = useRef<HTMLButtonElement>(null)
  const settled = useRef(false)
  const titleId = useId()
  const descId = useId()
  const [now, setNow] = useState(() => Date.now())
  const [announce, setAnnounce] = useState("")
  const timer = ringing.kind === "timer"
  const { main, period } = timeParts(now)
  const heading = timer ? "Time's up" : main
  // An alarm with no label shows the date, so the screen never says "Alarm" twice.
  const label = ringing.label || new Date(now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
  const snoozeText = timer ? "+1:00" : "Snooze"

  const act = (fn: () => void) => () => {
    if (settled.current) return
    settled.current = true
    fn()
  }
  const stop = act(onStop)
  const snooze = act(onSnooze)
  const stopRef = useRef(stop)
  stopRef.current = stop

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    const previous = document.activeElement as HTMLElement | null
    if (!el.open) el.showModal()
    stopButton.current?.focus()
    // Filled a beat after mount so screen readers announce it as a change.
    const say = setTimeout(() => setAnnounce(timer ? `Time's up. ${label}.` : `Alarm ringing. ${main} ${period}. ${label}.`), 120)
    return () => {
      clearTimeout(say)
      settled.current = true
      if (el.open) el.close()
      if (previous?.isConnected && previous !== document.body && !previous.closest("[inert]")) previous.focus({ preventScroll: true })
    }
    // One dialog per ring; the label cannot change underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  return (
    <dialog
      ref={dialog}
      data-theme={theme}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className={`fixed inset-0 z-[10000] m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 ${mobile ? styles.phoneBackdrop : styles.backdrop}`}
      style={{ color: "var(--os-fg)" }}
      // Escape is Stop. If the browser closes the dialog itself, that is Stop too.
      onCancel={(e) => { e.preventDefault(); stopRef.current() }}
      onClose={() => stopRef.current()}
      // The lock screen underneath wakes on any tap or key; stopping the alarm
      // should leave it exactly as it was.
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key !== "Tab") return
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }}
    >
      <p className="sr-only" aria-live="assertive">{announce}</p>
      {mobile ? (
        <div
          className="os-scroll flex h-full w-full flex-col items-center justify-between gap-6 overflow-y-auto px-6 text-center"
          style={{
            background: "radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, var(--os-accent) 30%, var(--os-surface)), var(--os-surface) 72%)",
            paddingTop: "calc(env(safe-area-inset-top, 0px) + clamp(20px, 7vh, 64px))",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + clamp(16px, 4vh, 36px))",
          }}
        >
          <div>
            <p className="flex items-center justify-center gap-2 text-[15px]" style={{ color: "var(--os-muted)" }}>
              {timer ? <Hourglass size={18} aria-hidden /> : <AlarmClock size={18} aria-hidden />}
              {timer ? "Timer" : "Alarm"}
            </p>
            <h2 id={titleId} className={`mt-3 font-extralight leading-none tracking-tight tabular-nums ${timer ? "text-[52px]" : "text-[76px]"}`}>
              {heading}
              {!timer && period && <span className="ml-2 text-[26px] font-light">{period}</span>}
            </h2>
            <p id={descId} className="mt-4 break-words text-[20px]">
              {label}
              {timer && <span className="mt-2 block text-[17px] tabular-nums" style={{ color: "var(--os-muted)" }}>{overtime(now - ringing.since)}</span>}
            </p>
          </div>
          <SwipeBell timer={timer} snoozeText={snoozeText} onSnooze={snooze} onStop={stop} stopRef={stopButton} />
        </div>
      ) : (
        <div className="grid h-full w-full place-items-center p-4">
          <div
            className={`${styles.pop} w-full max-w-[380px] rounded-2xl p-6 text-center shadow-2xl`}
            style={{ background: "var(--os-menu)", border: "1px solid var(--os-border)", backdropFilter: "blur(40px) saturate(170%)" }}
          >
            <Bell timer={timer} size={64} />
            <p className="mt-4 text-[12.5px]" style={{ color: "var(--os-muted)" }}>{timer ? "Timer" : "Alarm"}</p>
            <h2 id={titleId} className="mt-1 text-[44px] font-light leading-none tracking-tight tabular-nums">
              {heading}
              {!timer && period && <span className="ml-1.5 text-[18px]">{period}</span>}
            </h2>
            <p id={descId} className="mt-2 break-words text-[14px]">
              {label}
              {timer && <span className="ml-2 tabular-nums" style={{ color: "var(--os-muted)" }}>{overtime(now - ringing.since)}</span>}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={snooze}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-[13.5px] font-medium transition-colors hover:bg-[var(--os-active)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--os-accent)]"
                style={{ background: "var(--os-hover)", border: "1px solid var(--os-border)" }}
              >
                {timer ? <Plus size={16} aria-hidden /> : <Zap size={16} aria-hidden />}
                {timer ? "1:00 more" : `Snooze ${SNOOZE_MS / 60_000} min`}
              </button>
              <button
                ref={stopButton}
                type="button"
                onClick={stop}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-[13.5px] font-semibold transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--os-fg)]"
                style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
              >
                <X size={16} aria-hidden />
                Stop
              </button>
            </div>
            <p className="mt-3 text-[11.5px]" style={{ color: "var(--os-muted)" }}>Esc stops it too.</p>
          </div>
        </div>
      )}
    </dialog>
  )
}

function Bell({ timer, size }: { timer: boolean; size: number }) {
  return (
    <span className="relative mx-auto grid place-items-center" style={{ width: size, height: size }} aria-hidden>
      <span className={`absolute inset-0 rounded-full ${styles.ripple}`} style={{ background: "var(--os-accent)" }} />
      <span className={`absolute inset-0 rounded-full ${styles.ripple} ${styles.rippleLate}`} style={{ background: "var(--os-accent)" }} />
      <span className="relative grid h-full w-full place-items-center rounded-full" style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}>
        <span className={styles.shake}>{timer ? <Hourglass size={size * 0.42} /> : <BellRing size={size * 0.42} />}</span>
      </span>
    </span>
  )
}

/**
 * Android's alarm screen: drag the bell toward Snooze or Stop. Both ends are
 * real buttons, so a tap or the keyboard does the same thing. The drag writes
 * the transform straight to the element; React never renders per move.
 */
function SwipeBell({ timer, snoozeText, onSnooze, onStop, stopRef }: {
  timer: boolean
  snoozeText: string
  onSnooze: () => void
  onStop: () => void
  stopRef: RefObject<HTMLButtonElement | null>
}) {
  const track = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; x0: number; max: number; dx: number } | null>(null)

  const place = (dx: number, animate: boolean) => {
    const el = knob.current
    if (!el) return
    el.style.transition = animate ? "transform .28s cubic-bezier(.22,1,.36,1)" : "none"
    el.style.transform = `translateX(${dx}px)`
  }

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    const t = track.current
    const k = knob.current
    if (!t || !k || drag.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: e.pointerId, x0: e.clientX, max: Math.max(40, (t.clientWidth - k.clientWidth) / 2), dx: 0 }
  }
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    d.dx = Math.max(-d.max, Math.min(d.max, e.clientX - d.x0))
    place(d.dx, false)
  }
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (d.dx > d.max * 0.6) onStop()
    else if (d.dx < -d.max * 0.6) onSnooze()
    else place(0, true)
  }
  const cancel = () => {
    drag.current = null
    place(0, true)
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div ref={track} className="relative flex w-full max-w-[340px] items-center justify-between">
        <RoundButton onClick={onSnooze} label={snoozeText} icon={timer ? <Plus size={26} /> : <Zap size={26} />} />
        <div
          ref={knob}
          aria-hidden
          className="relative z-10 cursor-grab touch-none select-none active:cursor-grabbing"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
        >
          <Bell timer={timer} size={96} />
        </div>
        <RoundButton onClick={onStop} label="Stop" icon={<X size={28} />} primary buttonRef={stopRef} />
      </div>
      <p className="text-[13px]" style={{ color: "var(--os-muted)" }}>Slide the bell, or tap a button.</p>
    </div>
  )
}

function RoundButton({ onClick, label, icon, primary = false, buttonRef }: {
  onClick: () => void
  label: string
  icon: ReactNode
  primary?: boolean
  buttonRef?: RefObject<HTMLButtonElement | null>
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-2xl p-1 text-[15px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--os-accent)]"
    >
      <span
        className="grid h-[72px] w-[72px] place-items-center rounded-full transition-transform active:scale-95"
        style={primary ? { background: "var(--os-fg)", color: "var(--os-surface)" } : { background: "var(--os-hover)", border: "1px solid var(--os-border)" }}
        aria-hidden
      >
        {icon}
      </span>
      {label}
    </button>
  )
}
