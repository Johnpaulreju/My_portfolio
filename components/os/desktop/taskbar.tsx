"use client"

import { useEffect, useState } from "react"
import { Bell, ChevronUp, Search, Volume2, Wifi, BatteryFull } from "lucide-react"
import { PINNED_APPS, APP_META } from "@/lib/os/app-meta"
import { useWM } from "@/lib/os/wm-store"
import { AppIcon } from "@/components/os/app-icon"
import type { AppId } from "@/lib/os/types"
import type { MenuItem } from "./context-menu"

export const TASKBAR_H = 48

export function Taskbar({
  openMenu,
}: {
  openMenu: (x: number, y: number, items: MenuItem[]) => void
}) {
  const { windows, focusedId, open, toggleMinimize, close, startOpen, setStartOpen, minimizeAll } = useWM()

  // Pinned apps first, then any running app that isn't pinned.
  const pinnedIds = PINNED_APPS.map((a) => a.id)
  const extraIds = Array.from(new Set(windows.map((w) => w.appId))).filter((id) => !pinnedIds.includes(id))
  const slots: AppId[] = [...pinnedIds, ...extraIds]

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-[100] flex items-center px-2"
      style={{
        height: TASKBAR_H,
        background: "var(--os-taskbar)",
        backdropFilter: "blur(34px) saturate(160%)",
        borderTop: "1px solid var(--os-border)",
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        openMenu(e.clientX, e.clientY, [
          { label: "Show desktop", onSelect: minimizeAll },
          { label: "Task view", disabled: true },
        ])
      }}
    >
      {/* Left spacer keeps the app cluster optically centered against the tray. */}
      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Start"
          onClick={() => setStartOpen(!startOpen)}
          className={`grid h-10 w-10 place-items-center rounded-md transition-colors ${
            startOpen ? "bg-[var(--os-hover)]" : "hover:bg-[var(--os-hover)]"
          }`}
        >
          <StartGlyph />
        </button>

        <button
          type="button"
          aria-label="Search"
          onClick={() => setStartOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-md transition-colors hover:bg-[var(--os-hover)]"
        >
          <Search size={18} style={{ color: "var(--os-fg)" }} />
        </button>

        {slots.map((appId) => {
          const wins = windows.filter((w) => w.appId === appId)
          const running = wins.length > 0
          const isFocused = wins.some((w) => w.id === focusedId && !w.minimized)
          return (
            <button
              key={appId}
              type="button"
              title={APP_META[appId].title}
              aria-label={APP_META[appId].title}
              onClick={() => (running ? toggleMinimize(wins[wins.length - 1].id) : open(appId))}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                openMenu(e.clientX, e.clientY, [
                  { label: `Open ${APP_META[appId].title}`, onSelect: () => open(appId) },
                  ...(running
                    ? ([
                        { kind: "sep" },
                        {
                          label: wins.length > 1 ? `Close all ${wins.length} windows` : "Close window",
                          danger: true,
                          onSelect: () => wins.forEach((w) => close(w.id)),
                        },
                      ] as MenuItem[])
                    : []),
                ])
              }}
              className={`relative grid h-10 w-10 place-items-center rounded-md transition-colors ${
                isFocused ? "bg-[var(--os-active)]" : "hover:bg-[var(--os-hover)]"
              }`}
            >
              <AppIcon appId={appId} size={24} />
              {running && (
                <span
                  className="absolute bottom-0.5 h-[3px] rounded-full bg-[var(--os-accent)] transition-all"
                  style={{ width: isFocused ? 16 : 6 }}
                />
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-1 items-center justify-end gap-1">
        <Tray openMenu={openMenu} />
      </div>
    </div>
  )
}

function Tray({ openMenu }: { openMenu: (x: number, y: number, items: MenuItem[]) => void }) {
  const { theme, toggleTheme } = useWM()
  const [now, setNow] = useState<Date | null>(null)

  // Rendered only after mount so server and client markup can't disagree on the time.
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Hidden icons"
        className="grid h-9 w-7 place-items-center rounded-md hover:bg-[var(--os-hover)]"
      >
        <ChevronUp size={14} style={{ color: "var(--os-fg)" }} />
      </button>

      <button
        type="button"
        aria-label="Network, sound and battery"
        onClick={toggleTheme}
        title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        className="flex h-9 items-center gap-2 rounded-md px-2 hover:bg-[var(--os-hover)]"
        style={{ color: "var(--os-fg)" }}
      >
        <Wifi size={15} />
        <Volume2 size={15} />
        <BatteryFull size={16} />
      </button>

      <button
        type="button"
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          openMenu(e.clientX, e.clientY, [{ label: "Adjust date and time", disabled: true }])
        }}
        className="flex h-9 flex-col items-end justify-center rounded-md px-2 text-[11.5px] leading-tight hover:bg-[var(--os-hover)]"
        style={{ color: "var(--os-fg)" }}
      >
        <span>{now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}</span>
        <span>{now ? now.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" }) : ""}</span>
      </button>

      <button
        type="button"
        aria-label="Notifications"
        className="grid h-9 w-7 place-items-center rounded-md hover:bg-[var(--os-hover)]"
      >
        <Bell size={14} style={{ color: "var(--os-fg)" }} />
      </button>
    </div>
  )
}

/** Original four-pane Start glyph. */
function StartGlyph() {
  return (
    <svg width="19" height="19" viewBox="0 0 19 19" aria-hidden>
      {[
        [0, 0],
        [10, 0],
        [0, 10],
        [10, 10],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="9" height="9" rx="1.6" fill="var(--os-accent)" />
      ))}
    </svg>
  )
}
