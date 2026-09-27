"use client"

import { useState, type HTMLAttributes } from "react"
import { AlarmClock, ChevronDown, ChevronUp, Lock, Power, PowerOff, RotateCcw, Settings } from "lucide-react"
import { usePower } from "@/lib/os/power-store"
import { shadeDate, statusTime } from "@/lib/os/phone-shade"
import { COMPACT, EXPANDED, PillTile, RoundTile, Sliders, useTiles } from "./quick-tiles"
import { NotificationList } from "./notification-list"

export type ShadeMode = "compact" | "expanded"

/**
 * One sheet: a big clock, quick tiles, then notifications. The same markup is
 * the drag preview and the settled dialog, so handing over never jumps.
 */
export function ShadePanel({ mode, now, twelveHour, alarmText, torch, onTorch, onAlarm, onSettings, onExpand, onCollapse, onClose, zone }: {
  mode: ShadeMode
  now: Date | null
  twelveHour: boolean
  alarmText: string | null
  torch: boolean
  onTorch: () => void
  onAlarm: () => void
  onSettings: () => void
  onExpand: () => void
  onCollapse: () => void
  onClose: () => void
  /** Pointer handlers for the parts that drag the sheet (header and bottom handle). */
  zone?: HTMLAttributes<HTMLDivElement>
}) {
  const tiles = useTiles({ flashlight: torch, onFlashlight: onTorch, alarmText, onAlarm })
  const expanded = mode === "expanded"
  const [power, setPower] = useState(false)
  const { lock, restart, shutDown } = usePower()

  return (
    <div data-shade-panel className="shade-sheet" data-mode={mode}>
      <div className="shade-zone shade-head" {...zone}>
        <div className="min-w-0">
          <p className="shade-clock">{now ? statusTime(now, twelveHour) : "--:--"}</p>
          <p className="shade-date">{now ? shadeDate(now) : ""}</p>
        </div>
        {alarmText && <button type="button" className="shade-chip" aria-label={`Next alarm ${alarmText}. Open Clock`} onClick={onAlarm}><AlarmClock size={16} aria-hidden />{alarmText}</button>}
      </div>

      <div className="shade-scroll os-scroll">
        {!expanded ? (
          <div className="shade-round-row">{COMPACT.map((id) => <RoundTile key={id} tile={tiles[id]} />)}</div>
        ) : (
          <div className="space-y-3">
            <Sliders />
            <div className="grid grid-cols-2 gap-2">{EXPANDED.map((id) => <PillTile key={id} tile={tiles[id]} />)}</div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] opacity-70">These change this portfolio, not your phone.</p>
              <div className="flex shrink-0 gap-1">
                <button type="button" className="shade-icon-btn" aria-label="Power menu" aria-expanded={power} onClick={() => setPower((v) => !v)}><Power size={18} /></button>
                <button type="button" className="shade-icon-btn" aria-label="Settings" onClick={onSettings}><Settings size={18} /></button>
              </div>
            </div>
            {power && <div role="group" aria-label="Power options" className="grid grid-cols-3 gap-2" onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setPower(false) } }}>
              <button type="button" className="shade-power" onClick={lock}><Lock size={18} aria-hidden />Lock</button>
              <button type="button" className="shade-power" onClick={restart}><RotateCcw size={18} aria-hidden />Restart</button>
              <button type="button" className="shade-power" onClick={shutDown}><PowerOff size={18} aria-hidden />Power off</button>
            </div>}
          </div>
        )}
        <div className="flex justify-center">
          <button type="button" className="shade-icon-btn" aria-label={expanded ? "Show fewer settings" : "Show all settings"} aria-expanded={expanded} onClick={expanded ? onCollapse : onExpand}>
            {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>
        {!expanded && <NotificationList now={now} />}
      </div>

      <div className="shade-zone shade-handle" {...zone}>
        <button type="button" className="shade-grab" aria-label="Close Quick settings and notifications" onClick={onClose}><span aria-hidden /></button>
      </div>
    </div>
  )
}
