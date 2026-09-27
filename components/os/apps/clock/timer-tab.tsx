"use client"

import { useRef, type Dispatch, type KeyboardEvent, type SetStateAction } from "react"
import { Delete, Pause, Play, RotateCcw } from "lucide-react"
import { digitsToMs, durationText, msToDigits, timerLeft, useClockStore } from "@/lib/os/clock-store"
import { primeAlarmSound } from "@/lib/os/alarm-sound"
import { RoundButton, clockDigits, muted, useFrame, useLayout } from "./shared"

/** What the keypad shows. `fresh` means the next digit starts over instead of adding on. */
export type TimerDraft = { digits: string; fresh: boolean }
type Props = { draft: TimerDraft; setDraft: Dispatch<SetStateAction<TimerDraft>> }

const PRESETS = [1, 3, 5, 10, 25]
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0"]

export function TimerTab({ draft, setDraft }: Props) {
  const timer = useClockStore((s) => s.timer)
  const idle = timer.endsAt === null && timer.remaining === timer.duration
  return idle ? <Keypad draft={draft} setDraft={setDraft} /> : <Countdown onReset={(duration) => setDraft({ digits: msToDigits(duration), fresh: true })} />
}

function Keypad({ draft, setDraft }: Props) {
  const setTimerDuration = useClockStore((s) => s.setTimerDuration)
  const startTimer = useClockStore((s) => s.startTimer)
  const { short, width, panel } = useLayout()
  const ms = digitsToMs(draft.digits)
  // Keys grow to fill the panel. On short screens Start sits beside the keypad,
  // like Android in landscape, so nothing has to scroll.
  const gapX = short ? 12 : 20
  const startSize = short ? 52 : 64
  const around = short ? 24 + 40 + 36 + 2 * 12 + 3 * 6 : 48 + 52 + 44 + startSize + 3 * 20 + 3 * 8
  const byHeight = Math.floor((panel - around) / 4)
  const byWidth = Math.floor((width - 32 - 2 * gapX - (short ? 2 * (startSize + 12) : 0)) / 3)
  const key = Math.max(40, Math.min(short ? 56 : 68, byHeight, byWidth))

  const press = (k: string) =>
    setDraft((d) => {
      const base = d.fresh ? "" : d.digits
      // Leading zeros mean nothing on a phone keypad either.
      const digits = (base + k).replace(/^0+/, "")
      return { digits: digits.length > 6 ? base : digits, fresh: false }
    })
  const back = () => setDraft((d) => ({ digits: d.fresh ? "" : d.digits.slice(0, -1), fresh: false }))
  const start = () => {
    if (!ms) return
    primeAlarmSound()
    setTimerDuration(ms)
    startTimer()
    setDraft({ digits: msToDigits(ms), fresh: true })
  }
  // Typing digits works too, while any keypad control has focus.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (/^[0-9]$/.test(e.key)) press(e.key)
    else if (e.key === "Backspace") back()
    else return
    e.preventDefault()
  }

  const startButton = (
    <RoundButton label={ms ? `Start ${durationText(ms)} timer` : "Start timer"} onClick={start} primary size={startSize} wide={!short} disabled={!ms}>
      <Play size={short ? 24 : 28} fill="currentColor" aria-hidden />
    </RoundButton>
  )

  const padded = draft.digits.padStart(6, "0")
  const typed = draft.digits.length
  const group = (from: number, unit: string) => (
    <span className="flex items-baseline">
      {[from, from + 1].map((i) => (
        <span key={i} style={{ color: 6 - i <= typed ? "var(--os-fg)" : "var(--os-muted)" }}>{padded[i]}</span>
      ))}
      <span className="ml-0.5 mr-2 text-[18px] last:mr-0" style={muted}>{unit}</span>
    </span>
  )

  return (
    <div className="os-scroll h-full overflow-y-auto" onKeyDown={onKey}>
      <div className={`mx-auto flex max-w-[420px] flex-col items-center px-4 ${short ? "gap-3 py-3" : "gap-5 py-6"}`}>
        <p className={`flex font-light tabular-nums ${short ? "text-[40px]" : "text-[52px]"} leading-none`} aria-hidden>
          {group(0, "h")}
          {group(2, "m")}
          {group(4, "s")}
        </p>
        <p className="sr-only" aria-live="polite">{ms ? `Timer length ${durationText(ms)}` : "No time set"}</p>

        {/* Five equal chips that share the row, so none gets cut off on a small phone. */}
        <div className="flex w-full max-w-[380px] gap-1.5" role="group" aria-label="Quick picks">
          {PRESETS.map((min) => {
            const on = ms === min * 60_000
            return (
              <button
                key={min}
                type="button"
                aria-pressed={on}
                onClick={() => setDraft({ digits: msToDigits(min * 60_000), fresh: true })}
                className={`min-w-0 flex-1 whitespace-nowrap rounded-full px-1 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--os-accent)] ${short ? "h-9" : "min-h-11"}`}
                style={on ? { background: "var(--os-accent)", color: "var(--os-on-accent)" } : { background: "var(--os-hover)", border: "1px solid var(--os-border)" }}
              >
                {min} min
              </button>
            )
          })}
        </div>

        <div className={`relative grid grid-cols-3 ${short ? "gap-x-3 gap-y-1.5" : "gap-x-5 gap-y-2"}`} role="group" aria-label="Keypad">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              aria-label={k === "00" ? "Double zero" : k}
              className="grid place-items-center rounded-full text-[26px] font-light transition-transform active:scale-95 hover:bg-[var(--os-active)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--os-accent)]"
              style={{ width: key, height: key, background: "var(--os-hover)" }}
            >
              {k}
            </button>
          ))}
          <button
            type="button"
            onClick={back}
            aria-label="Delete last digit"
            title="Delete last digit"
            disabled={!draft.digits}
            className="grid place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--os-accent)]"
            style={{ width: key, height: key }}
          >
            <Delete size={26} aria-hidden />
          </button>
          {short && <div className="absolute bottom-0 left-full ml-3">{startButton}</div>}
        </div>

        {!short && startButton}
      </div>
    </div>
  )
}

function Countdown({ onReset }: { onReset: (duration: number) => void }) {
  const timer = useClockStore((s) => s.timer)
  const startTimer = useClockStore((s) => s.startTimer)
  const pauseTimer = useClockStore((s) => s.pauseTimer)
  const resetTimer = useClockStore((s) => s.resetTimer)
  const extendTimer = useClockStore((s) => s.extendTimer)
  const { short, width, panel } = useLayout()
  const running = timer.endsAt !== null
  const size = Math.round(Math.max(150, Math.min(280, width - 64, panel - (short ? 100 : 150))))
  const r = 92
  const c = 2 * Math.PI * r
  const ring = useRef<SVGCircleElement>(null)
  const text = useRef<HTMLSpanElement>(null)

  useFrame((now) => {
    const left = timerLeft(timer, now)
    if (ring.current) ring.current.style.strokeDashoffset = String(c * (1 - Math.min(1, left / Math.max(timer.duration, 1))))
    if (text.current) text.current.textContent = clockDigits(left, true)
  }, running)

  return (
    <div className="os-scroll h-full overflow-y-auto">
      <div className={`mx-auto flex max-w-[420px] flex-col items-center px-4 ${short ? "gap-3 py-3" : "gap-6 py-6"}`}>
        <div className="relative grid place-items-center" style={{ width: size, height: size }}>
          <svg viewBox="0 0 200 200" width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="100" cy="100" r={r} fill="none" stroke="var(--os-hover)" strokeWidth="8" />
            <circle ref={ring} cx="100" cy="100" r={r} fill="none" stroke="var(--os-accent)" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} />
          </svg>
          <div className="relative flex flex-col items-center text-center">
            <span ref={text} role="timer" className={`font-light tabular-nums leading-none ${size < 220 ? "text-[42px]" : "text-[54px]"}`} />
            <span className="mt-2 text-[13px]" style={muted}>
              {durationText(timer.duration)} timer{running ? "" : " · Paused"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <RoundButton
            label="Reset"
            onClick={() => {
              resetTimer()
              onReset(timer.duration)
            }}
          >
            <RotateCcw size={22} aria-hidden />
          </RoundButton>
          <RoundButton label={running ? "Pause" : "Resume"} onClick={() => (running ? pauseTimer() : (primeAlarmSound(), startTimer()))} primary size={short ? 64 : 76} wide>
            {running ? <Pause size={30} fill="currentColor" aria-hidden /> : <Play size={30} fill="currentColor" aria-hidden />}
          </RoundButton>
          <RoundButton label="Add 1 minute" onClick={() => extendTimer(60_000)}>
            <span className="text-[14px] font-semibold tabular-nums">+1:00</span>
          </RoundButton>
        </div>
      </div>
    </div>
  )
}
