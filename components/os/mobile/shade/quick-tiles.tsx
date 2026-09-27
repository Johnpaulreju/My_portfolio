"use client"

import { AlarmClock, Bluetooth, BluetoothOff, Flashlight, FlashlightOff, CircleMinus, Moon, Plane, SunDim, SunMedium, Volume2, VolumeX, Wifi, WifiOff, type LucideIcon } from "lucide-react"
import { useWM } from "@/lib/os/wm-store"
import { useSystem } from "@/lib/os/system-store"
import { useNotify } from "@/lib/os/notify-store"

export type Tile = { id: string; label: string; state: string; on: boolean; icon: LucideIcon; run: () => void; opens?: boolean }

/** A light tick where the device supports it. Never required. */
export function haptic() {
  try { navigator.vibrate?.(8) } catch { /* not supported */ }
}

/** Every quick setting the shade can show, read live from the stores. */
export function useTiles({ flashlight, onFlashlight, alarmText, onAlarm }: { flashlight: boolean; onFlashlight: () => void; alarmText: string | null; onAlarm: () => void }): Record<string, Tile> {
  const theme = useWM((s) => s.theme)
  const toggleTheme = useWM((s) => s.toggleTheme)
  const sys = useSystem()
  const dnd = useNotify((s) => s.dnd)
  const setDnd = useNotify((s) => s.setDnd)
  const net = sys.status()
  const netState = net === "online" ? sys.ssid ?? "Connected" : net === "connecting" ? "Connecting..." : net === "no-internet" ? "No internet" : net === "airplane" ? "Airplane mode" : net === "disconnected" ? "Not connected" : "Off"
  const onOff = (on: boolean) => on ? "On" : "Off"
  return {
    internet: { id: "internet", label: "Internet", state: netState, on: sys.wifiOn, icon: sys.wifiOn ? Wifi : WifiOff, run: sys.toggleWifi },
    bluetooth: { id: "bluetooth", label: "Bluetooth", state: onOff(sys.btOn), on: sys.btOn, icon: sys.btOn ? Bluetooth : BluetoothOff, run: sys.toggleBt },
    flashlight: { id: "flashlight", label: "Flashlight", state: onOff(flashlight), on: flashlight, icon: flashlight ? Flashlight : FlashlightOff, run: onFlashlight },
    dnd: { id: "dnd", label: "Do not disturb", state: onOff(dnd), on: dnd, icon: CircleMinus, run: () => setDnd(!dnd) },
    dark: { id: "dark", label: "Dark theme", state: onOff(theme === "dark"), on: theme === "dark", icon: Moon, run: toggleTheme },
    night: { id: "night", label: "Night Light", state: onOff(sys.nightLight), on: sys.nightLight, icon: SunDim, run: () => sys.setNightLight(!sys.nightLight) },
    airplane: { id: "airplane", label: "Airplane mode", state: onOff(sys.airplane), on: sys.airplane, icon: Plane, run: sys.toggleAirplane },
    alarm: { id: "alarm", label: "Alarm", state: alarmText ?? "No alarms", on: !!alarmText, icon: AlarmClock, run: onAlarm, opens: true },
  }
}

export const COMPACT = ["internet", "bluetooth", "flashlight", "dnd", "dark", "airplane"]
export const EXPANDED = ["internet", "bluetooth", "flashlight", "dnd", "dark", "night", "airplane", "alarm"]

const tap = (tile: Tile) => () => { if (!tile.opens) haptic(); tile.run() }

/** Quick Quick Settings: a row of round tiles. */
export function RoundTile({ tile }: { tile: Tile }) {
  const Icon = tile.icon
  return (
    <button type="button" className="shade-round" data-on={tile.on || undefined} aria-pressed={tile.opens ? undefined : tile.on} aria-label={tile.opens ? `${tile.label}, ${tile.state}` : tile.label} onClick={tap(tile)}>
      <Icon size={20} aria-hidden />
    </button>
  )
}

/** Full Quick Settings: a pill with a label and a state line. */
export function PillTile({ tile }: { tile: Tile }) {
  const Icon = tile.icon
  return (
    <button type="button" className="shade-pill" data-on={tile.on || undefined} aria-pressed={tile.opens ? undefined : tile.on} onClick={tap(tile)}>
      <span className="shade-pill-icon" aria-hidden><Icon size={18} /></span>
      <span className="min-w-0 text-left">
        <span className="block truncate text-[13px] font-medium">{tile.label}</span>
        <span className="block truncate text-[12px] opacity-80">{tile.state}</span>
      </span>
    </button>
  )
}

/** Brightness keeps its old meaning: 100 is no page dimming, 20 is the darkest. */
export function Sliders() {
  const { brightness, setBrightness, volume, muted, setVolume, toggleMute } = useSystem()
  const level = muted ? 0 : volume
  return (
    <div className="space-y-2">
      <label className="shade-slider">
        <SunMedium size={18} aria-hidden />
        <span className="sr-only">Brightness</span>
        <input type="range" min={20} max={100} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} style={{ ["--fill" as string]: `${((brightness - 20) / 80) * 100}%` }} />
      </label>
      <div className="flex items-center gap-2">
        <button type="button" className="shade-mute" aria-pressed={muted} aria-label="Mute portfolio sounds" onClick={toggleMute}>{muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        <label className="shade-slider flex-1">
          <span className="sr-only">Portfolio sound volume</span>
          <input type="range" min={0} max={100} value={level} onChange={(e) => setVolume(Number(e.target.value))} style={{ ["--fill" as string]: `${level}%` }} />
        </label>
      </div>
    </div>
  )
}
