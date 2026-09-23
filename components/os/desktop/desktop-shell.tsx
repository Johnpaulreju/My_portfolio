"use client"

import { useCallback, useEffect, useState } from "react"
import { FilePlus2, FolderPlus, Monitor, Moon, Palette, RefreshCw, Sun } from "lucide-react"
import { useWM } from "@/lib/os/wm-store"
import { useFS } from "@/lib/os/fs-store"
import { Wallpaper } from "@/components/os/wallpaper"
import { AppHost } from "@/components/os/app-host"
import { ContextMenu, type MenuItem, type MenuState } from "./context-menu"
import { DesktopIcons } from "./desktop-icons"
import { StartMenu } from "./start-menu"
import { Taskbar, TASKBAR_H } from "./taskbar"
import { WindowFrame } from "./window-frame"

export function DesktopShell({ onReboot }: { onReboot: () => void }) {
  const { windows, theme, toggleTheme, setBounds, open, setStartOpen } = useWM()
  const { create, setRenaming } = useFS()
  const [menu, setMenu] = useState<MenuState>(null)

  const openMenu = useCallback((x: number, y: number, items: MenuItem[]) => setMenu({ x, y, items }), [])

  // Keep the store's idea of the usable desktop in sync with the viewport.
  useEffect(() => {
    const sync = () => setBounds({ w: window.innerWidth, h: window.innerHeight - TASKBAR_H })
    sync()
    window.addEventListener("resize", sync)
    return () => window.removeEventListener("resize", sync)
  }, [setBounds])

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
    { label: "Refresh", icon: <RefreshCw size={14} />, onSelect: () => window.location.reload() },
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
      className="relative h-[100dvh] w-full overflow-hidden select-none"
      style={{ color: "var(--os-fg)" }}
      onContextMenu={(e) => {
        // Only the wallpaper itself gets the desktop menu; apps handle their own.
        if ((e.target as HTMLElement).closest("[data-window],[data-taskbar]")) return
        e.preventDefault()
        openMenu(e.clientX, e.clientY, desktopMenu)
      }}
    >
      <Wallpaper theme={theme} />

      {/* Icon + window layer, inset above the taskbar */}
      <div className="absolute inset-x-0 top-0" style={{ bottom: TASKBAR_H }} onPointerDown={() => setStartOpen(false)}>
        <DesktopIcons openMenu={openMenu} />

        {windows.map((win) => (
          <div key={win.id} data-window>
            <WindowFrame win={win}>
              <AppHost appId={win.appId} win={win} />
            </WindowFrame>
          </div>
        ))}
      </div>

      <StartMenu onReboot={onReboot} />

      <div data-taskbar>
        <Taskbar openMenu={openMenu} />
      </div>

      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  )
}
