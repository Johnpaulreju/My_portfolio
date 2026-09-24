"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { FilePlus2, FolderPlus, Monitor, Moon, Palette, RefreshCw, Sun } from "lucide-react"
import { useWM } from "@/lib/os/wm-store"
import { usePower } from "@/lib/os/power-store"
import { useFS } from "@/lib/os/fs-store"
import { Wallpaper } from "@/components/os/wallpaper"
import { AppHost } from "@/components/os/app-host"
import { ContextMenu, type MenuItem, type MenuState } from "./context-menu"
import { DesktopIcons } from "./desktop-icons"
import { StartMenu } from "./start-menu"
import { Taskbar, TASKBAR_H } from "./taskbar"
import { QuickSettings } from "./quick-settings"
import { NotificationCenter } from "./notification-center"
import { ToastHost } from "@/components/os/toast-host"
import { SystemEffects } from "@/components/os/system-effects"
import { WindowFrame } from "./window-frame"

export function DesktopShell() {
  const { windows, theme, toggleTheme, setBounds, open, setStartOpen, closeFlyouts } = useWM()
  const { create, setRenaming } = useFS()
  const [menu, setMenu] = useState<MenuState>(null)
  /** Bumped by Refresh; the icon layer blanks for a beat and redraws, as the real desktop does. */
  const [refreshToken, setRefreshToken] = useState(0)
  const [blinking, setBlinking] = useState(false)
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(() => {
    setRefreshToken((t) => t + 1)
    // A 60ms full blank is exactly the kind of flash that harms photosensitive users,
    // so under reduced motion we re-key the layer without any visual change.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (reduced) return
    if (blinkTimer.current) clearTimeout(blinkTimer.current)
    setBlinking(true)
    blinkTimer.current = setTimeout(() => setBlinking(false), 60)
  }, [])

  useEffect(() => () => { if (blinkTimer.current) clearTimeout(blinkTimer.current) }, [])

  // The welcome window greets a first-time visitor once, after the machine boots.
  const powerState = usePower((s) => s.state)
  useEffect(() => {
    if (powerState !== "running") return
    let seen = true
    try {
      seen = localStorage.getItem("jp-os-welcomed") === "1"
    } catch {
      /* private mode: just skip it */
    }
    if (seen) return
    const t = setTimeout(() => {
      open("welcome")
      try {
        localStorage.setItem("jp-os-welcomed", "1")
      } catch {
        /* ignore */
      }
    }, 700)
    return () => clearTimeout(t)
  }, [powerState, open])

  const openMenu = useCallback((x: number, y: number, items: MenuItem[]) => setMenu({ x, y, items }), [])

  // Keep the store's idea of the usable desktop in sync with the viewport.
  useEffect(() => {
    const sync = () => setBounds({ w: window.innerWidth, h: window.innerHeight - TASKBAR_H })
    sync()
    window.addEventListener("resize", sync)
    return () => window.removeEventListener("resize", sync)
  }, [setBounds])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
      if (e.key === "F5") {
        e.preventDefault()
        refresh()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [refresh])

  const desktopMenu: MenuItem[] = [
    {
      label: "New",
      icon: <FolderPlus size={14} />,
      submenu: [
        {
          label: "Folder",
          icon: <FolderPlus size={14} />,
          onSelect: () => setRenaming(create("folder", null)),
        },
        {
          label: "Text Document",
          icon: <FilePlus2 size={14} />,
          onSelect: () => setRenaming(create("text", null)),
        },
      ],
    },
    { kind: "sep" },
    { label: "Refresh", icon: <RefreshCw size={14} />, shortcut: "F5", onSelect: refresh },
    { kind: "sep" },
    {
      label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
      icon: theme === "dark" ? <Sun size={14} /> : <Moon size={14} />,
      onSelect: toggleTheme,
    },
    { label: "Personalise", icon: <Palette size={14} />, onSelect: () => open("settings") },
    { label: "Display settings", icon: <Monitor size={14} />, onSelect: () => open("settings") },
  ]

  return (
    <div
      className={`relative h-[100dvh] w-full overflow-hidden select-none ${
        powerState === "running" ? "shell-entering" : ""
      }`}
      style={{ color: "var(--os-fg)" }}
      onContextMenu={(e) => {
        // Only the wallpaper itself gets the desktop menu; apps handle their own.
        if ((e.target as HTMLElement).closest("[data-window],[data-taskbar]")) return
        e.preventDefault()
        openMenu(e.clientX, e.clientY, desktopMenu)
      }}
    >
      <Wallpaper theme={theme} />
      <SystemEffects />

      {/* Icon + window layer, inset above the taskbar */}
      {/* isolation:isolate gives the window layer its own stacking context, so a
          window's ever-increasing z can never climb above the taskbar or Start menu. */}
      <div
        className="absolute inset-x-0 top-0"
        style={{ bottom: TASKBAR_H, isolation: "isolate" }}
        onPointerDown={closeFlyouts}
      >
        <div className={blinking ? "icon-layer-refreshing" : "icon-layer-settled"}>
          <DesktopIcons key={refreshToken} openMenu={openMenu} />
        </div>

        {windows.map((win) => (
          <div key={win.id} data-window>
            <WindowFrame win={win}>
              <AppHost appId={win.appId} win={win} />
            </WindowFrame>
          </div>
        ))}
      </div>

      <ToastHost />
      <QuickSettings />
      <NotificationCenter />
      <StartMenu />

      <div data-taskbar>
        <Taskbar openMenu={openMenu} />
      </div>

      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  )
}
