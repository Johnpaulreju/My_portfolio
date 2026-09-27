"use client"

import { inertProps } from "@/components/os/shell-dom"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, Home, Square } from "lucide-react"
import { useWM } from "@/lib/os/wm-store"
import { usePower } from "@/lib/os/power-store"
import { useNotify } from "@/lib/os/notify-store"
import { Wallpaper } from "@/components/os/wallpaper"
import { ShellSessions } from "@/components/os/shell-sessions"
import { SystemEffects } from "@/components/os/system-effects"
import { ToastHost } from "@/components/os/toast-host"
import { markLaunch } from "@/lib/os/phone-home"
import type { AppId } from "@/lib/os/types"
import { PhoneShade } from "./phone-shade"
import { StatusBar } from "./status-bar"
import { HomeScreen } from "./home/home-screen"
import { AppDrawer } from "./drawer/app-drawer"
import { PhoneSheet } from "./drawer/phone-sheet"
import { Recents } from "./recents/recents"

export function PhoneShell({ managed = false }: { managed?: boolean }) {
  const { theme, windows, focusedId, phonePanel, setPhonePanel, minimizeAll } = useWM()
  const running = usePower((s) => s.state === "running")
  const unread = useNotify((s) => s.unread)
  const markRead = useNotify((s) => s.markRead)
  const now = useClock()
  const dialogOrigin = useRef<HTMLElement | null>(null)
  useEffect(() => {
    // Record before the modal render makes the old surface inert.
    const remember = (event: FocusEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target !== document.body && !target.closest("dialog")) dialogOrigin.current = target
    }
    document.addEventListener("focusin", remember)
    return () => document.removeEventListener("focusin", remember)
  }, [])
  const current = windows.find((win) => win.id === focusedId && !win.minimized)
  const shade = phonePanel === "compact" || phonePanel === "expanded"
  const closePanel = useCallback(() => setPhonePanel("closed"), [setPhonePanel])
  const goHome = useCallback(() => {
    minimizeAll()
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-phone-home]")?.focus({ preventScroll: true }))
  }, [minimizeAll])
  const goBack = useCallback(() => {
    if (phonePanel === "expanded") setPhonePanel("compact")
    else if (phonePanel !== "closed") closePanel()
    else goHome()
  }, [phonePanel, setPhonePanel, closePanel, goHome])

  useEffect(() => { if (shade) markRead() }, [shade, unread, markRead])
  useEffect(() => { if (!running) closePanel() }, [running, closePanel])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || phonePanel !== "closed") return
      if ((e.target as HTMLElement)?.closest('[role="dialog"],dialog')) return
      goHome()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goHome, phonePanel])

  const launch = (id: AppId, from?: Element | null) => {
    markLaunch(id, from ?? null)
    const wm = useWM.getState()
    const recent = wm.windows.filter((w) => w.appId === id).sort((a, b) => b.z - a.z)[0]
    if (recent) wm.focus(recent.id)
    else wm.open(id)
    closePanel()
  }
  const drawerSearch = useRef(false)
  const drawerInput = useRef<HTMLInputElement>(null)
  const openDrawer = (search: boolean) => {
    drawerSearch.current = search
    setPhonePanel("drawer")
  }

  return (
    <div className="phone-shell relative flex h-full w-full flex-col overflow-hidden" style={{ color: "var(--os-fg)" }}>
      <Wallpaper theme={theme} />
      <StatusBar overApp={!!current} open={shade} onOpen={() => setPhonePanel("compact")} />

      <div className="phone-safe-sides relative min-h-0 flex-1" {...inertProps(!!current || phonePanel !== "closed")} aria-hidden={!!current || phonePanel !== "closed" || undefined}>
        <HomeScreen now={now} onLaunch={launch} onOpenDrawer={() => openDrawer(false)} onSearch={() => openDrawer(true)} onOpenShade={() => setPhonePanel("compact")} />
      </div>
      <nav aria-label="Phone navigation" className="phone-nav relative z-30 flex shrink-0 items-center justify-around text-white">
        <button type="button" onClick={goBack} aria-label="Back" className="phone-touch"><ArrowLeft size={20} /></button>
        <button type="button" onClick={goHome} aria-label="Home" data-phone-home className="phone-touch"><Home size={20} /></button>
        <button type="button" onClick={() => setPhonePanel("recents")} aria-label={`Recent apps, ${windows.length} sessions`} className="phone-touch"><Square size={18} /></button>
      </nav>
      {!managed && <><ShellSessions mobile /><SystemEffects /><ToastHost mobile /></>}
      <PhoneShade restoreTo={dialogOrigin} onHome={goHome} />

      {(phonePanel === "drawer" || phonePanel === "recents") && <PhoneSheet
        key={phonePanel}
        restoreTo={dialogOrigin.current}
        title={phonePanel === "drawer" ? "All apps" : "Recent apps"}
        onClose={closePanel}
        onBack={goBack}
        onHome={goHome}
        onRecents={() => setPhonePanel(phonePanel === "recents" ? "closed" : "recents")}
        recentsLabel={phonePanel === "recents" ? "Hide recent apps" : `Show recent apps, ${windows.length} sessions`}
        initialFocus={() => { const search = phonePanel === "drawer" && drawerSearch.current; drawerSearch.current = false; return search ? drawerInput.current : null }}
      >
        {phonePanel === "drawer" ? <AppDrawer onLaunch={launch} inputRef={drawerInput} /> : <Recents />}
      </PhoneSheet>}
    </div>
  )
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const sync = () => setNow(new Date())
    sync()
    const timer = setInterval(sync, 15_000)
    document.addEventListener("visibilitychange", sync)
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", sync) }
  }, [])
  return now
}
