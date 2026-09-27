"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { AlarmClock, ChevronDown, ChevronRight, ChevronUp } from "lucide-react"
import { alarmInText, nextAlarm, useClockStore } from "@/lib/os/clock-store"

const WEEK = [
  ["Su", "Sunday"],
  ["Mo", "Monday"],
  ["Tu", "Tuesday"],
  ["We", "Wednesday"],
  ["Th", "Thursday"],
  ["Fr", "Friday"],
  ["Sa", "Saturday"],
] as const

/** Windows remembers whether you folded the calendar away. So do we, for this visit. */
let rememberCollapsed = false

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
/** Same day in another month, clamped: Jan 31 + 1 month is Feb 28. */
function addMonths(d: Date, n: number) {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), last))
}
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()

const iconButton =
  "grid h-9 w-9 place-items-center rounded-md hover:bg-[var(--os-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--os-accent)]"

/**
 * The Windows 11 calendar card under the notifications: today's date, a month
 * grid you can walk with the arrow keys, and the next alarm from Clock.
 */
export function MonthCalendar({ onOpenAlarms }: { onOpenAlarms: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])
  const today = startOfDay(new Date(now))

  const [collapsed, setCollapsed] = useState(rememberCollapsed)
  // `cursor` is the day that owns keyboard focus; its month is the one on screen.
  const [cursor, setCursor] = useState(today)
  const [selected, setSelected] = useState(today)
  const moveFocus = useRef(false)
  const grid = useRef<HTMLTableElement>(null)
  const monthId = useId()
  const bodyId = useId()

  useEffect(() => {
    if (!moveFocus.current) return
    moveFocus.current = false
    grid.current?.querySelector<HTMLElement>('td[tabindex="0"]')?.focus()
  }, [cursor])

  const view = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const first = addDays(view, -view.getDay())
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)))

  const walk = (next: Date) => {
    moveFocus.current = true
    setCursor(next)
  }
  const onKey = (e: KeyboardEvent<HTMLTableElement>) => {
    let next: Date
    switch (e.key) {
      case "ArrowLeft": next = addDays(cursor, -1); break
      case "ArrowRight": next = addDays(cursor, 1); break
      case "ArrowUp": next = addDays(cursor, -7); break
      case "ArrowDown": next = addDays(cursor, 7); break
      case "Home": next = addDays(cursor, -cursor.getDay()); break
      case "End": next = addDays(cursor, 6 - cursor.getDay()); break
      case "PageUp": next = addMonths(cursor, e.shiftKey ? -12 : -1); break
      case "PageDown": next = addMonths(cursor, e.shiftKey ? 12 : 1); break
      case "Enter":
      case " ":
        e.preventDefault()
        setSelected(cursor)
        return
      default:
        return
    }
    e.preventDefault()
    walk(next)
  }

  const toggle = () => {
    rememberCollapsed = !collapsed
    setCollapsed(!collapsed)
  }

  const alarms = useClockStore((s) => s.alarms)
  const next = nextAlarm(alarms, now)
  const nextAt = next ? new Date(next.at) : null

  return (
    <section
      aria-label="Calendar"
      className="shrink-0 overflow-hidden rounded-xl shadow-2xl"
      style={{ background: "var(--os-menu)", border: "1px solid var(--os-border)", backdropFilter: "blur(40px) saturate(170%)" }}
    >
      <div className="flex items-center justify-between py-1.5 pl-4 pr-2" style={{ borderBottom: collapsed ? "none" : "1px solid var(--os-border)" }}>
        <p className="text-[13.5px] font-semibold">
          {new Date(now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <button type="button" onClick={toggle} aria-expanded={!collapsed} aria-controls={bodyId} aria-label={collapsed ? "Show calendar" : "Hide calendar"} title={collapsed ? "Show calendar" : "Hide calendar"} className={iconButton}>
          {collapsed ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </button>
      </div>

      {!collapsed && (
        <div id={bodyId} className="px-3 pb-2 pt-2">
          <div className="flex items-center justify-between pb-1 pl-2">
            <p id={monthId} className="text-[13px] font-semibold" aria-live="polite">
              {view.toLocaleDateString([], { month: "long", year: "numeric" })}
            </p>
            <div className="flex items-center gap-0.5">
              {!sameMonth(view, today) && (
                <button
                  type="button"
                  onClick={() => {
                    setCursor(today)
                    setSelected(today)
                  }}
                  className="h-9 rounded-md px-2.5 text-[12px] hover:bg-[var(--os-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--os-accent)]"
                >
                  Today
                </button>
              )}
              <button type="button" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Previous month" title="Previous month" className={iconButton}>
                <ChevronUp size={16} aria-hidden />
              </button>
              <button type="button" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month" title="Next month" className={iconButton}>
                <ChevronDown size={16} aria-hidden />
              </button>
            </div>
          </div>

          <table ref={grid} role="grid" aria-labelledby={monthId} className="w-full table-fixed border-separate border-spacing-0 text-center" onKeyDown={onKey}>
            <thead>
              <tr>
                {WEEK.map(([short, long]) => (
                  <th key={long} scope="col" abbr={long} className="h-8 text-[12px] font-normal" style={{ color: "var(--os-muted)" }}>
                    {short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week[0].toDateString()}>
                  {week.map((d) => {
                    const isToday = sameDay(d, today)
                    const isSelected = sameDay(d, selected)
                    const inMonth = d.getMonth() === view.getMonth()
                    return (
                      <td
                        key={d.toDateString()}
                        role="gridcell"
                        tabIndex={sameDay(d, cursor) ? 0 : -1}
                        aria-selected={isSelected}
                        aria-current={isToday ? "date" : undefined}
                        aria-label={d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                        onClick={() => {
                          setCursor(d)
                          setSelected(d)
                        }}
                        className="group h-10 cursor-pointer p-0 outline-none"
                      >
                        <span
                          aria-hidden
                          className={`mx-auto grid h-9 w-9 place-items-center rounded-full text-[13px] tabular-nums transition-colors group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-1 group-focus-visible:outline-[var(--os-fg)] ${
                            isToday ? "font-semibold" : "group-hover:bg-[var(--os-hover)]"
                          }`}
                          style={
                            isToday
                              ? { background: "var(--os-accent)", color: "var(--os-on-accent)" }
                              : {
                                  color: inMonth ? "var(--os-fg)" : "var(--os-muted)",
                                  opacity: inMonth ? 1 : 0.7,
                                  boxShadow: isSelected ? "inset 0 0 0 1.5px var(--os-accent)" : undefined,
                                }
                          }
                        >
                          {d.getDate()}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={onOpenAlarms}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-[var(--os-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--os-accent)]"
        style={{ borderTop: "1px solid var(--os-border)" }}
      >
        <AlarmClock size={18} aria-hidden style={{ color: next ? "var(--os-accent-fg)" : "var(--os-muted)" }} />
        <span className="min-w-0 flex-1">
          {next && nextAt ? (
            <>
              <span className="block truncate text-[13px]">
                Next alarm · {nextAt.toLocaleDateString([], { weekday: "short" })}{" "}
                {nextAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
              <span className="block truncate text-[11.5px]" style={{ color: "var(--os-muted)" }}>
                {alarmInText(next.at - now)}
                {next.alarm.label ? ` · ${next.alarm.label}` : ""}
              </span>
            </>
          ) : (
            <span className="block text-[13px]">Set an alarm</span>
          )}
        </span>
        <ChevronRight size={16} aria-hidden style={{ color: "var(--os-muted)" }} />
      </button>
    </section>
  )
}
