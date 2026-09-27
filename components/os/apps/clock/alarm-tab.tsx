"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { AlarmClockOff, ChevronDown, Info, Plus, Trash2 } from "lucide-react"
import {
  alarmInText,
  alarmTimeText,
  nextFullHour,
  nextOccurrence,
  repeatSummary,
  useClockStore,
  type Alarm,
  type Weekday,
} from "@/lib/os/clock-store"
import { primeAlarmSound } from "@/lib/os/alarm-sound"
import type { Theme } from "@/lib/os/types"
import { useWM } from "@/lib/os/wm-store"
import { timeParts } from "@/components/os/clock/ring-screen"
import { Switch, cardStyle, muted, useLayout, useSecond, useSnack } from "./shared"

const DAYS: { day: Weekday; short: string; name: string }[] = [
  { day: 0, short: "S", name: "Sunday" },
  { day: 1, short: "M", name: "Monday" },
  { day: 2, short: "T", name: "Tuesday" },
  { day: 3, short: "W", name: "Wednesday" },
  { day: 4, short: "T", name: "Thursday" },
  { day: 5, short: "F", name: "Friday" },
  { day: 6, short: "S", name: "Saturday" },
]

const two = (n: number) => String(n).padStart(2, "0")
const at = (hour: number, minute: number) => new Date(2000, 0, 1, hour, minute).getTime()

/** "Alarm in 7 h 5 min" for an alarm as it is saved right now. */
function setText(id: string) {
  const alarm = useClockStore.getState().alarms.find((a) => a.id === id)
  const now = Date.now()
  const next = alarm ? nextOccurrence(alarm, now) : null
  return next === null ? null : alarmInText(next - now)
}

export function AlarmTab() {
  const alarms = useClockStore((s) => s.alarms)
  const addAlarm = useClockStore((s) => s.addAlarm)
  const theme = useWM((s) => s.theme)
  const { show, visible: snackUp } = useSnack()
  const { short } = useLayout()
  const now = useSecond()
  const [open, setOpen] = useState<string | null>(null)
  const [focusTime, setFocusTime] = useState<string | null>(null)
  // While a card is open the list keeps its order, so editing the time never
  // moves the card (and the focus) out from under you.
  const [frozen, setFrozen] = useState<string[] | null>(null)
  const expand = (id: string | null) => {
    setOpen(id)
    setFrozen(id ? useClockStore.getState().alarms.map((a) => a.id) : null)
  }
  const shown = frozen
    ? [
        ...frozen.map((id) => alarms.find((a) => a.id === id)).filter((a): a is Alarm => !!a),
        ...alarms.filter((a) => !frozen.includes(a.id)),
      ]
    : alarms
  const onFocused = useCallback(() => setFocusTime(null), [])
  const fab = useRef<HTMLButtonElement>(null)

  const add = () => {
    primeAlarmSound()
    const id = addAlarm(nextFullHour(Date.now()))
    expand(id)
    setFocusTime(id)
    const text = setText(id)
    if (text) show(text)
  }

  return (
    <div className="relative h-full">
      <div className={`os-scroll h-full overflow-y-auto px-3 ${short ? "pt-2" : "pt-4"} pb-28`}>
        {alarms.length === 0 ? (
          <div className="flex flex-col items-center px-6 pt-10 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full" style={{ background: "var(--os-hover)", ...muted }} aria-hidden>
              <AlarmClockOff size={30} />
            </span>
            <p className="mt-4 text-[15px]">No alarms yet. Tap + to add one.</p>
            <p className="mt-1 text-[13px]" style={muted}>Future you will say thanks. Probably.</p>
          </div>
        ) : (
          <ul className="mx-auto flex max-w-[560px] flex-col gap-3" aria-label="Alarms">
            {shown.map((alarm) => (
              <AlarmCard
                key={alarm.id}
                alarm={alarm}
                now={now}
                theme={theme}
                open={open === alarm.id}
                onToggleOpen={() => expand(open === alarm.id ? null : alarm.id)}
                focusTime={focusTime === alarm.id}
                onFocused={onFocused}
                onDeleted={() => {
                  expand(null)
                  // The card and its Delete button are gone; keep the focus somewhere useful.
                  fab.current?.focus({ preventScroll: true })
                }}
              />
            ))}
          </ul>
        )}
        <p className="mx-auto mt-5 flex max-w-[560px] items-start justify-center gap-1.5 px-4 text-center text-[12.5px]" style={muted}>
          <Info size={14} className="mt-[2px] shrink-0" aria-hidden />
          Alarms ring only while this page is open.
        </p>
      </div>
      <button
        ref={fab}
        type="button"
        onClick={add}
        aria-label="Add alarm"
        title="Add alarm"
        className="absolute bottom-4 left-1/2 z-10 grid h-16 w-16 place-items-center rounded-2xl shadow-lg transition-transform duration-200 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--os-fg)]"
        style={{
          background: "var(--os-accent)",
          color: "var(--os-on-accent)",
          // Make room for the snackbar, like Android does.
          transform: `translateX(-50%) translateY(${snackUp ? -60 : 0}px)`,
        }}
      >
        <Plus size={30} aria-hidden />
      </button>
    </div>
  )
}

function AlarmCard({
  alarm,
  now,
  theme,
  open,
  onToggleOpen,
  focusTime,
  onFocused,
  onDeleted,
}: {
  alarm: Alarm
  now: number
  theme: Theme
  open: boolean
  onToggleOpen: () => void
  focusTime: boolean
  onFocused: () => void
  onDeleted: () => void
}) {
  const updateAlarm = useClockStore((s) => s.updateAlarm)
  const removeAlarm = useClockStore((s) => s.removeAlarm)
  const addAlarm = useClockStore((s) => s.addAlarm)
  const { show } = useSnack()
  const editor = useId()
  const timeInput = useRef<HTMLInputElement>(null)
  const { main, period } = timeParts(at(alarm.hour, alarm.minute))
  const time = alarmTimeText(alarm.hour, alarm.minute)
  const snoozed = alarm.enabled && alarm.snoozeUntil !== null && alarm.snoozeUntil > now

  useEffect(() => {
    if (!open || !focusTime) return
    timeInput.current?.focus({ preventScroll: true })
    timeInput.current?.closest("li")?.scrollIntoView({ block: "nearest" })
    onFocused()
  }, [open, focusTime, onFocused])

  const update = (patch: Parameters<typeof updateAlarm>[1], announce: boolean) => {
    updateAlarm(alarm.id, patch)
    if (!announce) return
    primeAlarmSound()
    const text = setText(alarm.id)
    if (text) show(text)
  }

  const remove = () => {
    const copy = alarm
    removeAlarm(alarm.id)
    onDeleted()
    show(`Deleted the ${alarmTimeText(copy.hour, copy.minute)} alarm`, {
      label: "Undo",
      run: () => {
        const id = addAlarm({ hour: copy.hour, minute: copy.minute, label: copy.label, days: copy.days })
        if (!copy.enabled) updateAlarm(id, { enabled: false })
      },
    })
  }

  const toggleDay = (day: Weekday) => {
    const days = alarm.days.includes(day) ? alarm.days.filter((d) => d !== day) : [...alarm.days, day]
    update({ days }, alarm.enabled)
  }

  return (
    <li className="rounded-3xl" style={{ ...cardStyle, background: open ? "var(--os-hover)" : "var(--os-card)" }}>
      <div className="flex items-center gap-1 py-2 pl-2 pr-2">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-controls={editor}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-3 py-1.5 text-left hover:bg-[var(--os-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--os-accent)]"
        >
          <span className="min-w-0 flex-1">
            {alarm.label && <span className="block truncate text-[13px]" style={muted}>{alarm.label}</span>}
            <span className="block text-[40px] font-light leading-tight tabular-nums" style={{ color: alarm.enabled ? "var(--os-fg)" : "var(--os-muted)" }}>
              {main}
              {period && <span className="ml-1.5 text-[17px] font-normal">{period}</span>}
            </span>
            <span className="block truncate text-[13px]" style={muted}>
              {repeatSummary(alarm.days)}
              {snoozed && ` · Snoozed until ${new Date(alarm.snoozeUntil!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
            </span>
          </span>
          <ChevronDown size={20} aria-hidden className="shrink-0 transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : "none", ...muted }} />
          <span className="sr-only">Edit</span>
        </button>
        <Switch checked={alarm.enabled} onChange={(enabled) => update({ enabled }, enabled)} label={`${time} alarm`} />
      </div>

      {open && (
        <div id={editor} className="flex flex-col gap-4 px-5 pb-4 pt-1">
          <div className="flex flex-wrap gap-3">
            <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-[12.5px]" style={muted}>
              Time
              <input
                ref={timeInput}
                type="time"
                required
                value={`${two(alarm.hour)}:${two(alarm.minute)}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number)
                  if (!Number.isInteger(h) || !Number.isInteger(m)) return
                  if (h === alarm.hour && m === alarm.minute) return
                  update({ hour: h, minute: m, enabled: true }, true)
                }}
                className="h-12 rounded-xl px-3 text-[16px] tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--os-accent)]"
                style={{ background: "var(--os-input)", border: "1px solid var(--os-border)", color: "var(--os-fg)", colorScheme: theme }}
              />
            </label>
            <label className="flex min-w-[160px] flex-[2] flex-col gap-1 text-[12.5px]" style={muted}>
              Label
              <input
                type="text"
                maxLength={40}
                defaultValue={alarm.label}
                placeholder="Wake up, ship it"
                enterKeyHint="done"
                onBlur={(e) => {
                  if (e.target.value.trim() !== alarm.label) update({ label: e.target.value }, false)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur()
                }}
                className="h-12 rounded-xl px-3 text-[16px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--os-accent)]"
                style={{ background: "var(--os-input)", border: "1px solid var(--os-border)", color: "var(--os-fg)" }}
              />
            </label>
          </div>

          {/* Seven chips always fit: they shrink on a 320px phone instead of spilling out. */}
          <div role="group" aria-label="Repeat on" className="grid grid-cols-7 justify-items-center gap-1">
            {DAYS.map((d) => {
              const on = alarm.days.includes(d.day)
              return (
                <button
                  key={d.day}
                  type="button"
                  aria-pressed={on}
                  aria-label={d.name}
                  title={d.name}
                  onClick={() => toggleDay(d.day)}
                  className="grid aspect-square w-full max-w-11 place-items-center rounded-full text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--os-accent)]"
                  style={
                    on
                      ? { background: "var(--os-accent)", color: "var(--os-on-accent)" }
                      : { background: "transparent", color: "var(--os-fg)", boxShadow: "inset 0 0 0 1px var(--os-border)" }
                  }
                >
                  <span aria-hidden>{d.short}</span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px]" style={muted}>{(now && alarm.enabled && setText(alarm.id)) || "Off"}</span>
            <button
              type="button"
              onClick={remove}
              className="flex min-h-11 items-center gap-2 rounded-full px-4 text-[14px] hover:bg-[var(--os-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--os-accent)]"
            >
              <Trash2 size={18} aria-hidden />
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
