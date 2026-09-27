"use client"

import { useRef } from "react"
import { Flag, Pause, Play, RotateCcw } from "lucide-react"
import { stopwatchElapsed, useClockStore } from "@/lib/os/clock-store"
import { RoundButton, muted, useFrame, useLayout, useReducedMotion } from "./shared"

const two = (n: number) => String(n).padStart(2, "0")

/** "01:02" and "33" (centiseconds); hours appear only when needed. */
function parts(ms: number) {
  const t = Math.max(0, Math.floor(ms))
  const s = Math.floor(t / 1000)
  const h = Math.floor(s / 3600)
  const main = h ? `${h}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${two(Math.floor(s / 60))}:${two(s % 60)}`
  return { main, cc: two(Math.floor(t / 10) % 100) }
}
const text = (ms: number) => {
  const p = parts(ms)
  return `${p.main}.${p.cc}`
}

export function StopwatchTab() {
  const sw = useClockStore((s) => s.stopwatch)
  const start = useClockStore((s) => s.startStopwatch)
  const pause = useClockStore((s) => s.pauseStopwatch)
  const lap = useClockStore((s) => s.lapStopwatch)
  const reset = useClockStore((s) => s.resetStopwatch)
  const reduced = useReducedMotion()
  const { width, panel, wide, short } = useLayout()
  const running = sw.startedAt !== null
  const started = running || sw.banked > 0
  const side = wide && short
  // The ring makes room for the lap list once there is one.
  const ring = side ? Math.min(200, panel - 60) : Math.min(260, width - 80, Math.floor(panel * (sw.laps.length ? 0.36 : 0.46)))
  const showRing = ring >= 150

  const main = useRef<HTMLSpanElement>(null)
  const cc = useRef<HTMLSpanElement>(null)
  const dot = useRef<HTMLSpanElement>(null)
  const lapNow = useRef<HTMLTableCellElement>(null)
  const totalNow = useRef<HTMLTableCellElement>(null)
  const last = sw.laps[sw.laps.length - 1] ?? 0

  useFrame((now) => {
    const e = stopwatchElapsed(sw, now)
    const p = parts(e)
    if (main.current) main.current.textContent = p.main
    if (cc.current) cc.current.textContent = `.${p.cc}`
    if (dot.current) dot.current.style.transform = `rotate(${((e % 60_000) / 60_000) * 360}deg)`
    if (lapNow.current) lapNow.current.textContent = text(e - last)
    if (totalNow.current) totalNow.current.textContent = text(e)
  }, running)

  const splits = sw.laps.map((t, i) => t - (sw.laps[i - 1] ?? 0))
  const marked = splits.length >= 2 && Math.min(...splits) !== Math.max(...splits)
  const fastest = marked ? splits.indexOf(Math.min(...splits)) : -1
  const slowest = marked ? splits.indexOf(Math.max(...splits)) : -1

  const display = (
    <p className={`font-light tabular-nums leading-none ${showRing && ring < 200 ? "text-[44px]" : "text-[54px]"}`} role="timer">
      <span ref={main} />
      <span ref={cc} className="text-[0.55em]" style={muted} />
    </p>
  )

  const controls = (
    <div className="flex items-center justify-center gap-6">
      <RoundButton
        label={running ? "Lap" : "Reset"}
        onClick={() => (running ? lap() : reset())}
        disabled={!started}
      >
        {running ? <Flag size={22} aria-hidden /> : <RotateCcw size={22} aria-hidden />}
      </RoundButton>
      <RoundButton label={running ? "Pause" : started ? "Resume" : "Start"} onClick={() => (running ? pause() : start())} primary size={short ? 64 : 76} wide>
        {running ? <Pause size={30} fill="currentColor" aria-hidden /> : <Play size={30} fill="currentColor" aria-hidden />}
      </RoundButton>
    </div>
  )

  return (
    <div className={`flex h-full min-h-0 ${side ? "flex-row" : "flex-col"}`}>
      <div className={`flex shrink-0 flex-col items-center justify-center ${short ? "gap-3 py-3" : "gap-6 py-6"} ${side ? "w-1/2 px-4" : "px-4"}`}>
        {showRing ? (
          <div className="relative grid place-items-center rounded-full" style={{ width: ring, height: ring, boxShadow: "inset 0 0 0 2px var(--os-border)" }}>
            {!reduced && (
              <span ref={dot} className="absolute inset-0" aria-hidden style={{ transform: "rotate(0deg)" }}>
                <span className="absolute left-1/2 top-0 block h-3 w-3 -translate-x-1/2 -translate-y-[4px] rounded-full" style={{ background: "var(--os-accent)" }} />
              </span>
            )}
            {display}
          </div>
        ) : (
          display
        )}
        {controls}
      </div>

      <div className={`os-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4 ${side ? "border-l pt-3" : "border-t"}`} style={{ borderColor: "var(--os-border)" }}>
        {sw.laps.length === 0 ? (
          <p className="pt-6 text-center text-[13px]" style={muted}>
            {running ? "Tap the flag to save a lap." : "Laps show up here. Go fast."}
          </p>
        ) : (
          <table className="mx-auto w-full max-w-[460px] text-[14px] tabular-nums">
            <caption className="sr-only">Laps, newest first</caption>
            <thead>
              <tr className="text-[12px]" style={muted}>
                <th scope="col" className="py-2 text-left font-normal">Lap</th>
                <th scope="col" className="py-2 text-right font-normal">Lap time</th>
                <th scope="col" className="py-2 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {running && (
                <tr style={muted}>
                  <th scope="row" className="py-2 text-left font-normal"># {sw.laps.length + 1}</th>
                  <td ref={lapNow} className="py-2 text-right" />
                  <td ref={totalNow} className="py-2 text-right" />
                </tr>
              )}
              {sw.laps
                .map((total, i) => ({ total, i }))
                .reverse()
                .map(({ total, i }) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--os-border)" }}>
                    <th scope="row" className="py-2 text-left font-normal">
                      # {i + 1}
                      {i === fastest && <span className="ml-2 text-[11.5px]" style={{ color: "var(--os-accent-fg)" }}>Fastest</span>}
                      {i === slowest && <span className="ml-2 text-[11.5px]" style={muted}>Slowest</span>}
                    </th>
                    <td className="py-2 text-right">{text(splits[i])}</td>
                    <td className="py-2 text-right" style={muted}>{text(total)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
