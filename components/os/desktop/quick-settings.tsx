"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  Accessibility, BatteryLow, Bluetooth, ChevronLeft, ChevronRight, Lock, Moon, MoonStar,
  Pencil, Plane, RadioTower, Settings as Gear, Sun, SunMoon, Volume2, VolumeX, Wifi, WifiOff,
} from "lucide-react"
import { useSystem, type WifiNetwork } from "@/lib/os/system-store"
import { useNotify } from "@/lib/os/notify-store"
import { useWM } from "@/lib/os/wm-store"
import { Slider } from "@/components/os/ui/slider"
import { TASKBAR_H } from "./taskbar"

type Page = "root" | "wifi" | "a11y"

export function QuickSettings() {
  const qsOpen = useWM((s) => s.qsOpen)
  const setQsOpen = useWM((s) => s.setQsOpen)
  const open = useWM((s) => s.open)
  const theme = useWM((s) => s.theme)
  const toggleTheme = useWM((s) => s.toggleTheme)
  const sys = useSystem()
  const dnd = useNotify((s) => s.dnd)
  const setDnd = useNotify((s) => s.setDnd)
  const [page, setPage] = useState<Page>("root")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (qsOpen) setPage("root")
  }, [qsOpen])

  useEffect(() => {
    if (!qsOpen) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (ref.current?.contains(t) || t.closest("[data-qs-trigger]")) return
      setQsOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setQsOpen(false)
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [qsOpen, setQsOpen])

  if (!qsOpen) return null

  // When airplane mode is on the tile is greyed; repeating "Airplane mode" here
  // would just duplicate the tile next to it.
  const wifiSub = sys.airplane
    ? "Wi-Fi"
    : !sys.wifiOn
      ? "Off"
      : sys.conn === "connecting"
        ? "Connecting…"
        : sys.ssid ?? "Available"

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Quick Settings"
      className="absolute right-3 z-[150] w-[360px] rounded-xl p-2 shadow-2xl"
      style={{
        bottom: TASKBAR_H + 10,
        background: "var(--os-menu)",
        border: "1px solid var(--os-border)",
        backdropFilter: "blur(40px) saturate(170%)",
        color: "var(--os-fg)",
        animation: "start-rise .16s ease-out",
      }}
    >
      {page === "root" && (
        <>
          <div className="grid grid-cols-3 gap-2 p-2">
            <SplitTile
              icon={sys.wifiOn && !sys.airplane ? <Wifi size={19} /> : <WifiOff size={19} />}
              label={wifiSub}
              on={sys.wifiOn && !sys.airplane}
              disabled={sys.airplane}
              onToggle={sys.toggleWifi}
              onExpand={() => setPage("wifi")}
              expandLabel="Manage Wi-Fi connections"
            />
            <Tile icon={<Bluetooth size={19} />} label="Bluetooth" on={sys.btOn} disabled={sys.airplane} onClick={sys.toggleBt} />
            <Tile icon={<Plane size={19} />} label="Airplane mode" on={sys.airplane} onClick={sys.toggleAirplane} />
            <Tile
              icon={<Sun size={19} />}
              label="Night light"
              on={sys.nightLight}
              onClick={() => sys.setNightLight(!sys.nightLight)}
            />
            <Tile icon={<Moon size={19} />} label="Do not disturb" on={dnd} onClick={() => setDnd(!dnd)} />
            <SplitTile
              icon={<Accessibility size={19} />}
              label="Accessibility"
              on={sys.grayscale}
              onToggle={sys.toggleGrayscale}
              onExpand={() => setPage("a11y")}
              expandLabel="Accessibility settings"
            />
            <Tile
              icon={<RadioTower size={19} />}
              label="Mobile hotspot"
              on={sys.hotspotOn}
              disabled={sys.airplane}
              onClick={sys.toggleHotspot}
            />
            <Tile icon={<BatteryLow size={19} />} label="Battery saver" on={sys.batterySaver} onClick={sys.toggleBatterySaver} />
            <Tile
              icon={theme === "dark" ? <MoonStar size={19} /> : <SunMoon size={19} />}
              label={theme === "dark" ? "Dark mode" : "Light mode"}
              on={theme === "light"}
              onClick={toggleTheme}
            />
          </div>

          <div className="space-y-3 px-4 py-3">
            <Slider
              label="Brightness"
              icon={<Sun size={17} />}
              min={20}
              value={sys.brightness}
              onChange={sys.setBrightness}
            />
            <Slider
              label="Volume"
              icon={
                <button type="button" aria-label={sys.muted ? "Unmute" : "Mute"} onClick={sys.toggleMute}>
                  {sys.muted || sys.volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
                </button>
              }
              value={sys.muted ? 0 : sys.volume}
              onChange={sys.setVolume}
              trailing={
                <span className="w-8 shrink-0 text-right text-[11.5px] tabular-nums" style={{ color: "var(--os-muted)" }}>
                  {sys.muted ? 0 : sys.volume}
                </span>
              }
            />
          </div>

          <div
            className="mt-1 flex items-center justify-end gap-1 border-t px-3 py-2"
            style={{ borderColor: "var(--os-border)" }}
          >
            <IconBtn label="Edit quick settings" onClick={() => open("settings")}>
              <Pencil size={15} />
            </IconBtn>
            <IconBtn label="All settings" onClick={() => open("settings")}>
              <Gear size={15} />
            </IconBtn>
          </div>
        </>
      )}

      {page === "wifi" && <WifiPage onBack={() => setPage("root")} />}
      {page === "a11y" && <A11yPage onBack={() => setPage("root")} />}
    </div>
  )
}

function WifiPage({ onBack }: { onBack: () => void }) {
  const sys = useSystem()
  return (
    <div className="p-1">
      <SubHeader title="Wi-Fi" onBack={onBack} />
      {sys.airplane ? (
        <p className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--os-muted)" }}>
          Airplane mode is on.
        </p>
      ) : !sys.wifiOn ? (
        <div className="px-4 py-8 text-center">
          <p className="mb-3 text-[13px]" style={{ color: "var(--os-muted)" }}>
            Wi-Fi is off.
          </p>
          <button
            type="button"
            onClick={() => sys.setWifi(true)}
            className="rounded-md px-3 py-1.5 text-[12.5px]"
            style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
          >
            Turn on
          </button>
        </div>
      ) : (
        <div className="max-h-[260px] overflow-y-auto os-scroll">
          {sys.networks.map((n) => (
            <NetworkRow key={n.ssid} n={n} />
          ))}
        </div>
      )}
      <div className="border-t px-3 py-2" style={{ borderColor: "var(--os-border)" }}>
        <span className="text-[11.5px]" style={{ color: "var(--os-muted)" }}>
          More Wi-Fi settings
        </span>
      </div>
    </div>
  )
}

function NetworkRow({ n }: { n: WifiNetwork }) {
  const sys = useSystem()
  const isCurrent = sys.ssid === n.ssid
  const connecting = isCurrent && sys.conn === "connecting"
  return (
    <div
      className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-[var(--os-hover)]"
      style={isCurrent ? { background: "var(--os-accent-soft)" } : undefined}
    >
      <Bars strength={n.strength} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-[13px]">
          {n.ssid}
          {n.secured && <Lock size={11} style={{ color: "var(--os-muted)" }} />}
        </span>
        <span className="block text-[11.5px]" style={{ color: "var(--os-muted)" }}>
          {connecting
            ? "Checking network requirements…"
            : isCurrent && sys.conn === "connected"
              ? "Connected, secured"
              : n.known
                ? "Saved"
                : n.secured
                  ? "Secured"
                  : "Open"}
        </span>
      </span>
      {isCurrent && sys.conn === "connected" ? (
        <button
          type="button"
          onClick={sys.disconnect}
          className="rounded-md px-2.5 py-1 text-[12px]"
          style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
        >
          Disconnect
        </button>
      ) : (
        <button
          type="button"
          onClick={() => sys.connectTo(n.ssid)}
          disabled={connecting}
          className="rounded-md px-2.5 py-1 text-[12px] disabled:opacity-50"
          style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
        >
          {connecting ? "…" : "Connect"}
        </button>
      )}
    </div>
  )
}

function A11yPage({ onBack }: { onBack: () => void }) {
  const sys = useSystem()
  return (
    <div className="p-1">
      <SubHeader title="Accessibility" onBack={onBack} />
      <ToggleRow label="Colour filter (greyscale)" on={sys.grayscale} onToggle={sys.toggleGrayscale} />
      <ToggleRow label="Night light" on={sys.nightLight} onToggle={() => sys.setNightLight(!sys.nightLight)} />
      <div className="px-4 py-3">
        <Slider
          label="Night light strength"
          icon={<Moon size={16} />}
          value={sys.nightLightStrength}
          onChange={sys.setNightLightStrength}
          disabled={!sys.nightLight}
        />
      </div>
    </div>
  )
}

function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="grid h-8 w-8 place-items-center rounded-md hover:bg-[var(--os-hover)]"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-[14px] font-semibold">{title}</span>
    </div>
  )
}

function ToggleRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-md px-4 py-2.5 text-left text-[13px] hover:bg-[var(--os-hover)]"
    >
      {label}
      <span
        className="relative h-5 w-9 rounded-full transition-colors"
        style={{ background: on ? "var(--os-accent)" : "var(--os-active)" }}
      >
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all"
          style={{ left: on ? 18 : 4, background: on ? "var(--os-on-accent)" : "var(--os-fg)" }}
        />
      </span>
    </button>
  )
}

function tileStyle(on: boolean, disabled?: boolean) {
  return {
    background: on ? "var(--os-accent)" : "var(--os-card)",
    color: on ? "var(--os-on-accent)" : "var(--os-fg)",
    border: "1px solid var(--os-border)",
    opacity: disabled ? 0.4 : 1,
  }
}

function Tile({
  icon, label, on, onClick, disabled,
}: { icon: ReactNode; label: string; on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={on}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && onClick()}
        className="grid h-12 w-full place-items-center rounded-lg transition-colors"
        style={tileStyle(on, disabled)}
      >
        {icon}
      </button>
      <span className="w-full truncate text-center text-[11px]" style={{ color: disabled ? "var(--os-muted)" : "var(--os-fg)" }}>
        {label}
      </span>
    </div>
  )
}

/** Two SIBLING buttons in a wrapper - never a button inside a button. */
function SplitTile({
  icon, label, on, onToggle, onExpand, expandLabel, disabled,
}: {
  icon: ReactNode; label: string; on: boolean
  onToggle: () => void; onExpand: () => void; expandLabel: string; disabled?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex h-12 w-full overflow-hidden rounded-lg" style={{ opacity: disabled ? 0.4 : 1 }}>
        <button
          type="button"
          role="switch"
          aria-label={label}
          aria-checked={on}
          aria-disabled={disabled || undefined}
          onClick={() => !disabled && onToggle()}
          className="grid flex-1 place-items-center transition-colors"
          style={{ ...tileStyle(on, false), borderRight: "none", borderRadius: 0 }}
        >
          {icon}
        </button>
        <button
          type="button"
          aria-label={expandLabel}
          title={expandLabel}
          onClick={() => !disabled && onExpand()}
          className="grid w-8 place-items-center transition-colors hover:brightness-110"
          style={{
            background: on ? "color-mix(in srgb, var(--os-accent) 72%, #fff)" : "var(--os-card)",
            color: on ? "var(--os-on-accent)" : "var(--os-fg)",
            border: "1px solid var(--os-border)",
            borderLeft: "none",
            borderRadius: 0,
          }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <span className="w-full truncate text-center text-[11px]" style={{ color: disabled ? "var(--os-muted)" : "var(--os-fg)" }}>
        {label}
      </span>
    </div>
  )
}

function Bars({ strength }: { strength: 1 | 2 | 3 }) {
  return (
    <span className="flex h-4 w-4 shrink-0 items-end gap-[2px]">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm"
          style={{
            height: 4 + i * 3,
            background: i <= strength ? "var(--os-fg)" : "var(--os-active)",
          }}
        />
      ))}
    </span>
  )
}

function IconBtn({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-md hover:bg-[var(--os-hover)]"
    >
      {children}
    </button>
  )
}
