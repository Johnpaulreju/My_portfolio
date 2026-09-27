"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react"
import { AlarmClock, Clock, Hourglass, Timer, type LucideIcon } from "lucide-react"
import type { WindowInstance } from "@/lib/os/types"
import { useAppActive } from "@/lib/os/app-activity"
import { useClockStore, msToDigits } from "@/lib/os/clock-store"
import { usePower } from "@/lib/os/power-store"
import { useWM } from "@/lib/os/wm-store"
import { AlarmTab } from "./clock/alarm-tab"
import { ClockTab } from "./clock/clock-tab"
import { StopwatchTab } from "./clock/stopwatch-tab"
import { TimerTab, type TimerDraft } from "./clock/timer-tab"
import {
  LayoutContext,
  PaceContext,
  SnackContext,
  Snackbar,
  type Layout,
  type Pace,
  type Snack,
  type SnackAction,
} from "./clock/shared"

export type ClockTabId = "alarm" | "clock" | "timer" | "stopwatch"

const TABS: { id: ClockTabId; label: string; icon: LucideIcon }[] = [
  { id: "alarm", label: "Alarm", icon: AlarmClock },
  { id: "clock", label: "Clock", icon: Clock },
  { id: "timer", label: "Timer", icon: Hourglass },
  { id: "stopwatch", label: "Stopwatch", icon: Timer },
]

const isTab = (v: unknown): v is ClockTabId => TABS.some((t) => t.id === v)

/** Below this width the tabs sit at the bottom, like the Android app. */
const BOTTOM_NAV_BELOW = 560
const SHORT_BELOW = 520
const TOP_TABS_H = 52
const navHeight = (short: boolean) => (short ? 56 : 68)

/**
 * Android's Clock: Alarm, Clock, Timer, Stopwatch. The open tab lives in the
 * window payload, so other parts of the OS can open it straight to Alarms.
 */
export function ClockApp({ win }: { win: WindowInstance }) {
  const hydrate = useClockStore((s) => s.hydrate)
  useEffect(() => hydrate(), [hydrate])

  const setPayload = useWM((s) => s.setPayload)
  const wanted = win.payload?.tab
  const tab: ClockTabId = isTab(wanted) ? wanted : "clock"

  // Size decides the layout, not the shell: a narrow desktop window is a phone.
  const root = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<Layout>({ width: 440, height: 600, panel: 532, wide: false, short: false })
  const [phone, setPhone] = useState(false)
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    setPhone(!!el.closest(".portfolio-shell-phone"))
    const measure = () => {
      const width = el.clientWidth
      const height = el.clientHeight
      if (!width || !height) return
      setLayout((l) => {
        const wide = width >= BOTTOM_NAV_BELOW
        const short = height < SHORT_BELOW
        const next = { width, height, panel: height - (wide ? TOP_TABS_H : navHeight(short)), wide, short }
        return l.width === next.width && l.height === next.height ? l : next
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Every frame while in front, once a second while merely visible, else nothing.
  const active = useAppActive()
  const focused = useWM((s) => s.focusedId === win.id)
  const powered = usePower((s) => s.state === "running")
  const [pageShown, setPageShown] = useState(true)
  useEffect(() => {
    const sync = () => setPageShown(document.visibilityState !== "hidden")
    sync()
    document.addEventListener("visibilitychange", sync)
    return () => document.removeEventListener("visibilitychange", sync)
  }, [])
  const pace: Pace = active ? "smooth" : !win.minimized && powered && pageShown && (focused || !phone) ? "second" : "off"

  const [snack, setSnack] = useState<Snack | null>(null)
  const seq = useRef(0)
  const show = useCallback((text: string, action?: SnackAction) => setSnack({ id: ++seq.current, text, action }), [])
  const hide = useCallback(() => setSnack(null), [])
  // A snack belongs to the tab that made it.
  const select = useCallback((next: ClockTabId) => {
    setSnack(null)
    setPayload(win.id, { tab: next })
  }, [setPayload, win.id])

  // The timer keypad keeps what you typed while you visit other tabs.
  const [draft, setDraft] = useState<TimerDraft>(() => ({ digits: msToDigits(useClockStore.getState().timer.duration), fresh: true }))

  const bottom = !layout.wide
  const navH = navHeight(layout.short)
  const ids = useId()
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab)
    let next = -1
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % TABS.length
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i + TABS.length - 1) % TABS.length
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = TABS.length - 1
    if (next < 0) return
    e.preventDefault()
    select(TABS[next].id)
    tabRefs.current[TABS[next].id]?.focus()
  }

  const tabBar = (
    <div
      role="tablist"
      aria-label="Clock"
      aria-orientation="horizontal"
      onKeyDown={onTabKey}
      className={`relative z-20 flex shrink-0 ${bottom ? "border-t" : "border-b px-2"}`}
      style={{ borderColor: "var(--os-border)", background: bottom ? "var(--os-chrome)" : "transparent", height: bottom ? navH : TOP_TABS_H }}
    >
      {TABS.map((t) => {
        const selected = t.id === tab
        const Icon = t.icon
        return (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`${ids}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${ids}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => select(t.id)}
            className={`group relative flex min-w-0 flex-1 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--os-accent)] ${
              bottom ? "flex-col gap-1" : "gap-2 hover:bg-[var(--os-hover)]"
            }`}
            style={{ color: selected ? "var(--os-fg)" : "var(--os-muted)" }}
          >
            {bottom ? (
              <span
                className={`grid w-14 place-items-center rounded-full transition-colors ${layout.short ? "h-7" : "h-8"}`}
                style={{ background: selected ? "var(--os-accent-soft)" : "transparent" }}
              >
                <Icon size={20} strokeWidth={selected ? 2.4 : 1.8} aria-hidden />
              </span>
            ) : (
              <Icon size={18} strokeWidth={selected ? 2.4 : 1.8} aria-hidden />
            )}
            <span className={`truncate ${bottom ? "text-[12px]" : "text-[13.5px]"} ${selected ? "font-semibold" : ""}`}>{t.label}</span>
            {!bottom && (
              <span
                aria-hidden
                className="absolute inset-x-6 bottom-0 h-[3px] origin-center rounded-full transition-transform duration-200"
                style={{ background: "var(--os-accent)", transform: selected ? "scaleX(1)" : "scaleX(0)" }}
              />
            )}
          </button>
        )
      })}
    </div>
  )

  return (
    <div ref={root} data-window={win.id} className="relative flex h-full min-h-0 flex-col overflow-hidden" style={{ background: "var(--os-surface)", color: "var(--os-fg)" }}>
      <PaceContext.Provider value={pace}>
        <LayoutContext.Provider value={layout}>
          <SnackContext.Provider value={{ show, visible: snack !== null }}>
            {!bottom && tabBar}
            <div role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-tab-${tab}`} className="relative min-h-0 flex-1">
              {tab === "alarm" && <AlarmTab />}
              {tab === "clock" && <ClockTab />}
              {tab === "timer" && <TimerTab draft={draft} setDraft={setDraft} />}
              {tab === "stopwatch" && <StopwatchTab />}
            </div>
            {bottom && tabBar}
            <Snackbar snack={snack} onDone={hide} bottom={(bottom ? navH : 0) + 12} />
          </SnackContext.Provider>
        </LayoutContext.Provider>
      </PaceContext.Provider>
    </div>
  )
}
