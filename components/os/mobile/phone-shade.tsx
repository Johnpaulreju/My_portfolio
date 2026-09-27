"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react"
import { ArrowLeft, Home, Square } from "lucide-react"
import { useWM } from "@/lib/os/wm-store"
import { usePower } from "@/lib/os/power-store"
import { useClockStore, nextAlarm, alarmTimeText } from "@/lib/os/clock-store"
import { SLOP, alarmChip, dragProgress, settleShade, velocityOf } from "@/lib/os/phone-shade"
import { inertProps } from "@/components/os/shell-dom"
import { useNativeModal } from "./phone-dialog"
import { shadeBus } from "./shade/shade-bus"
import { prefersTwelveHour, useMinuteClock } from "./shade/use-now"
import { ShadePanel, type ShadeMode } from "./shade/shade-panel"
import { Flashlight } from "./shade/flashlight"

const EASE = "cubic-bezier(.2, 0, 0, 1)"
/** Past the full sheet by this much, a pull lands on the expanded settings. */
const EXPAND_PULL = 96
/** A drag this far on a handle expands or collapses one step. */
const STEP_PULL = 64

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
const parts = (layer: HTMLElement | null) => ({
  sheet: layer?.querySelector<HTMLElement>("[data-shade-panel]") ?? null,
  scrim: layer?.querySelector<HTMLElement>("[data-shade-scrim]") ?? null,
})

/**
 * The notification shade. A pull on the status bar drives a non-modal preview
 * 1:1 under the finger; once it settles open, the real native <dialog> takes
 * over with identical markup, so focus is safe and nothing jumps.
 */
export function PhoneShade({ restoreTo, onHome }: { restoreTo: RefObject<HTMLElement | null>; onHome: () => void }) {
  const panel = useWM((s) => s.phonePanel)
  const setPanel = useWM((s) => s.setPhonePanel)
  const running = usePower((s) => s.state === "running")
  const open = panel === "compact" || panel === "expanded"
  const [preview, setPreview] = useState(false)
  const [instant, setInstant] = useState(false)
  const [torch, setTorch] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const pull = useRef({ h: 0, expand: false })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const now = useMinuteClock()
  const twelveHour = useMemo(() => prefersTwelveHour(), [])
  const alarms = useClockStore((s) => s.alarms)
  const next = now ? nextAlarm(alarms, now.getTime()) : null
  const alarmText = next && now ? alarmChip(next.at, now.getTime(), alarmTimeText(new Date(next.at).getHours(), new Date(next.at).getMinutes())) : null

  /** Glide the sheet to `y` and the scrim to `fade`, then run `done`. Instant under reduced motion. */
  const settle = useCallback((layer: HTMLElement | null, y: number, fade: number, done: () => void) => {
    const { sheet, scrim } = parts(layer)
    const still = reduced()
    if (sheet) { sheet.style.transition = still ? "none" : `transform .22s ${EASE}`; sheet.style.transform = `translate3d(0, ${y}px, 0)` }
    if (scrim) { scrim.style.transition = still ? "none" : "opacity .22s linear"; scrim.style.opacity = String(fade) }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(done, still ? 0 : 230)
  }, [])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  useEffect(() => shadeBus.register({
    begin() {
      if (useWM.getState().phonePanel !== "closed") return
      pull.current = { h: 0, expand: false }
      setPreview(true)
    },
    move(dy) {
      const { sheet, scrim } = parts(previewRef.current)
      if (!sheet || !scrim) return
      const h = pull.current.h ||= sheet.offsetHeight
      sheet.style.transform = `translate3d(0, ${Math.min(0, dy - h)}px, 0)`
      scrim.style.opacity = String(dragProgress(dy, h))
      pull.current.expand = dy > h + EXPAND_PULL
    },
    end(dy, velocity) {
      const layer = previewRef.current
      const h = pull.current.h || parts(layer).sheet?.offsetHeight || 1
      if (settleShade(dragProgress(dy, h), velocity) === "open") {
        settle(layer, 0, 1, () => {
          setInstant(true)
          setPanel(pull.current.expand ? "expanded" : "compact")
          setPreview(false)
        })
      } else settle(layer, -h, 0, () => setPreview(false))
    },
    cancel() {
      const layer = previewRef.current
      settle(layer, -(parts(layer).sheet?.offsetHeight ?? 0), 0, () => setPreview(false))
    },
  }), [setPanel, settle])

  useEffect(() => { if (!open) setInstant(false) }, [open])
  useEffect(() => { if (!running) setTorch(false) }, [running])

  const openClock = () => {
    const wm = useWM.getState()
    // Clock is a singleton, so tell an already-open window to switch tabs too.
    wm.setPayload(wm.open("clock", { tab: "alarm" }), { tab: "alarm" })
  }
  const panelProps = {
    now, twelveHour, alarmText, torch,
    onTorch: () => { setPanel("closed"); setTorch(true) },
    onAlarm: openClock,
    onSettings: () => useWM.getState().open("settings"),
    onExpand: () => setPanel("expanded"),
    onCollapse: () => setPanel("compact"),
  }

  return <>
    {preview && !open && (
      <div ref={previewRef} className="shade-layer shade-preview" aria-hidden {...inertProps(true)}>
        <div className="shade-scrim" data-shade-scrim />
        <ShadePanel mode="compact" {...panelProps} onClose={() => {}} />
      </div>
    )}
    {open && <ShadeDialog mode={panel} instant={instant} restoreTo={restoreTo.current} onHome={onHome} onRecents={() => setPanel("recents")} setPanel={setPanel} settle={settle} panelProps={panelProps} />}
    {torch && <Flashlight onOff={() => setTorch(false)} />}
  </>
}

type PanelProps = Omit<Parameters<typeof ShadePanel>[0], "mode" | "onClose" | "zone">

function ShadeDialog({ mode, instant, restoreTo, onHome, onRecents, setPanel, settle, panelProps }: {
  mode: ShadeMode
  instant: boolean
  restoreTo: HTMLElement | null
  onHome: () => void
  onRecents: () => void
  setPanel: (panel: "closed" | ShadeMode) => void
  settle: (layer: HTMLElement | null, y: number, fade: number, done: () => void) => void
  panelProps: PanelProps
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const drag = useRef<{ id: number; y: number; h: number; samples: { t: number; y: number }[]; active: boolean } | null>(null)
  const swallow = useRef(false)
  useNativeModal(ref, restoreTo)

  const close = () => {
    if (closing.current) return
    closing.current = true
    settle(layerRef.current, -(parts(layerRef.current).sheet?.offsetHeight ?? 0), 0, () => setPanel("closed"))
  }
  // Back, Escape and the scrim all step: expanded, then compact, then closed.
  const back = () => { if (mode === "expanded") setPanel("compact"); else close() }

  const zone = {
    onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
      swallow.current = false
      if (!e.isPrimary || e.button !== 0 || closing.current) return
      drag.current = { id: e.pointerId, y: e.clientY, h: parts(layerRef.current).sheet?.offsetHeight ?? 1, samples: [{ t: e.timeStamp, y: e.clientY }], active: false }
    },
    onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      const dy = e.clientY - d.y
      d.samples.push({ t: e.timeStamp, y: e.clientY })
      if (d.samples.length > 8) d.samples.shift()
      if (!d.active && Math.abs(dy) > SLOP) { d.active = true; e.currentTarget.setPointerCapture(e.pointerId) }
      if (!d.active || mode !== "compact") return
      // Closing follows the finger; pulling down only hints at more.
      const { sheet, scrim } = parts(layerRef.current)
      if (sheet) { sheet.style.transition = "none"; sheet.style.transform = `translate3d(0, ${Math.min(0, dy)}px, 0)` }
      if (scrim) { scrim.style.transition = "none"; scrim.style.opacity = String(dragProgress(d.h + dy, d.h)) }
    },
    onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
      const d = drag.current
      drag.current = null
      if (!d || d.id !== e.pointerId || !d.active) return
      swallow.current = true
      const dy = e.clientY - d.y
      if (mode === "expanded") { if (dy < -STEP_PULL) setPanel("compact"); return }
      if (dy > STEP_PULL) { setPanel("expanded"); return }
      if (settleShade(dragProgress(d.h + dy, d.h), velocityOf(d.samples)) === "open") settle(layerRef.current, 0, 1, () => {})
      else close()
    },
    onPointerCancel() {
      if (drag.current?.active) settle(layerRef.current, 0, 1, () => {})
      drag.current = null
    },
    onClickCapture(e: React.MouseEvent) {
      if (swallow.current) { swallow.current = false; e.preventDefault(); e.stopPropagation() }
    },
  }

  return (
    <dialog
      ref={ref}
      aria-label="Quick settings and notifications"
      className="shade-dialog"
      data-instant={instant || undefined}
      onCancel={(e) => { e.preventDefault(); back() }}
    >
      <div ref={layerRef} className="shade-layer">
        <div className="shade-scrim" data-shade-scrim onClick={back} />
        <ShadePanel mode={mode} {...panelProps} onClose={close} zone={zone} />
        <nav aria-label="Phone navigation" className="phone-nav shade-nav">
          <button type="button" onClick={back} aria-label="Back" className="phone-touch"><ArrowLeft size={20} /></button>
          <button type="button" onClick={onHome} aria-label="Home" className="phone-touch"><Home size={20} /></button>
          <button type="button" onClick={onRecents} aria-label="Recent apps" className="phone-touch"><Square size={18} /></button>
        </nav>
      </div>
    </dialog>
  )
}
