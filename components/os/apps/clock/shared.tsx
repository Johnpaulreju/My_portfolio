"use client"

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import styles from "@/components/os/clock/clock.module.css"

/**
 * How often the Clock redraws. `smooth` is every frame (the app is in front),
 * `second` is once a second (the window is visible but not focused), `off`
 * means nobody can see it, so nothing runs at all.
 */
export type Pace = "smooth" | "second" | "off"
/** `height` is the whole app; `panel` is what is left for the open tab. */
export type Layout = { width: number; height: number; panel: number; wide: boolean; short: boolean }

export const PaceContext = createContext<Pace>("off")
export const LayoutContext = createContext<Layout>({ width: 440, height: 560, panel: 492, wide: false, short: false })
export const usePace = () => useContext(PaceContext)
export const useLayout = () => useContext(LayoutContext)

/** Waits until just after the next whole second, so ticks land on the change. */
const toNextSecond = () => 1005 - (Date.now() % 1000)

/**
 * Calls `draw` with the time: after every render, then every frame or once a
 * second while `running`. Draw writes straight to refs, so React never
 * re-renders per frame.
 */
export function useFrame(draw: (now: number) => void, running = true) {
  const pace = usePace()
  const ref = useRef(draw)
  ref.current = draw
  useLayoutEffect(() => ref.current(Date.now()))
  useEffect(() => {
    if (!running || pace === "off") return
    if (pace === "smooth") {
      let id = requestAnimationFrame(function loop() {
        ref.current(Date.now())
        id = requestAnimationFrame(loop)
      })
      return () => cancelAnimationFrame(id)
    }
    let id: ReturnType<typeof setTimeout>
    const step = () => {
      ref.current(Date.now())
      id = setTimeout(step, toNextSecond())
    }
    id = setTimeout(step, toNextSecond())
    return () => clearTimeout(id)
  }, [pace, running])
}

/** The current time as state, updated once a second while the app is on screen. */
export function useSecond(): number {
  const pace = usePace()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    if (pace === "off") return
    let id: ReturnType<typeof setTimeout>
    const step = () => {
      setNow(Date.now())
      id = setTimeout(step, toNextSecond())
    }
    id = setTimeout(step, toNextSecond())
    return () => clearTimeout(id)
  }, [pace])
  return now
}

export function useReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)"
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return reduced
}

/** "4:05", "1:02:09": a timer or stopwatch reading without centiseconds. */
export function clockDigits(ms: number, roundUp = false) {
  const total = Math.max(0, roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const two = (n: number) => String(n).padStart(2, "0")
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`
}

/* ------------------------------------------------------------ snackbar */

export type SnackAction = { label: string; run: () => void }
export type Snack = { id: number; text: string; action?: SnackAction }

export const SnackContext = createContext<{ show: (text: string, action?: SnackAction) => void; visible: boolean }>({
  show: () => {},
  visible: false,
})
export const useSnack = () => useContext(SnackContext)

/** A short message at the bottom, like Android's. Pauses while hovered or focused. */
export function Snackbar({ snack, onDone, bottom }: { snack: Snack | null; onDone: () => void; bottom: number }) {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (!snack || held) return
    const t = setTimeout(onDone, snack.action ? 6000 : 4000)
    return () => clearTimeout(t)
  }, [snack, held, onDone])
  useEffect(() => setHeld(false), [snack])

  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-4" style={{ bottom }}>
      {snack && (
        <div
          key={snack.id}
          className={`${styles.rise} pointer-events-auto flex min-h-12 w-full max-w-[420px] items-center gap-2 rounded-xl py-1 pl-4 pr-1 text-[13.5px] shadow-xl`}
          style={{ background: "var(--os-fg)", color: "var(--os-surface)" }}
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
        >
          <span className="min-w-0 flex-1 py-2">{snack.text}</span>
          {snack.action && (
            <button
              type="button"
              onClick={() => {
                snack.action?.run()
                onDone()
              }}
              className="min-h-11 shrink-0 rounded-lg px-3 text-[13px] font-bold uppercase tracking-wide underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--os-accent)]"
            >
              {snack.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ controls */

/** An Android-style on/off switch with a proper switch role. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="grid h-12 w-[60px] shrink-0 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--os-accent)]"
    >
      <span
        className="relative block h-7 w-12 rounded-full transition-colors duration-200"
        style={{ background: checked ? "var(--os-accent)" : "var(--os-active)", boxShadow: checked ? "none" : "inset 0 0 0 2px var(--os-muted)" }}
        aria-hidden
      >
        <span
          className="absolute left-1 top-1 block h-5 w-5 rounded-full transition-transform duration-200"
          style={{
            background: checked ? "var(--os-on-accent)" : "var(--os-muted)",
            transform: checked ? "translateX(20px)" : "translateX(0) scale(.75)",
          }}
        />
      </span>
    </button>
  )
}

/** Round icon button used by the timer and stopwatch. */
export function RoundButton({
  label,
  onClick,
  children,
  primary = false,
  size = 64,
  disabled = false,
  wide = false,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  primary?: boolean
  size?: number
  disabled?: boolean
  wide?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid shrink-0 place-items-center rounded-full transition-[transform,opacity] active:scale-95 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--os-accent)]"
      style={{
        height: size,
        width: wide ? size * 1.5 : size,
        background: primary ? "var(--os-accent)" : "var(--os-hover)",
        color: primary ? "var(--os-on-accent)" : "var(--os-fg)",
        border: primary ? "none" : "1px solid var(--os-border)",
      }}
    >
      {children}
    </button>
  )
}

export const cardStyle = { background: "var(--os-card)", border: "1px solid var(--os-border)" } as const
export const muted = { color: "var(--os-muted)" } as const
