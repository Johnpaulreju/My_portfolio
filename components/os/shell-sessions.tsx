"use client"

import { inertProps } from "@/components/os/shell-dom"

import { useEffect, useRef, useState } from "react"
import { useWM } from "@/lib/os/wm-store"
import { usePower } from "@/lib/os/power-store"
import { AppActivityContext } from "@/lib/os/app-activity"
import { SessionWorkContext } from "@/lib/os/session-work"
import { AppHost } from "./app-host"
import { WindowFrame } from "./desktop/window-frame"

/** One keyed app tree for both layouts. Changing chrome never re-parents an app. */
export function ShellSessions({ mobile = false }: { mobile?: boolean }) {
  const { windows, focusedId, phonePanel, startOpen, qsOpen, notifOpen, closeFlyouts } = useWM()
  const running = usePower((s) => s.state === "running")
  const covered = mobile ? phonePanel !== "closed" : startOpen || qsOpen || notifOpen
  const [pageVisible, setPageVisible] = useState(false)
  const previousApp = useRef<string | null>(null)
  useEffect(() => {
    const sync = () => setPageVisible(document.visibilityState !== "hidden" && document.hasFocus())
    sync()
    document.addEventListener("visibilitychange", sync)
    window.addEventListener("focus", sync)
    window.addEventListener("blur", sync)
    return () => {
      document.removeEventListener("visibilitychange", sync)
      window.removeEventListener("focus", sync)
      window.removeEventListener("blur", sync)
    }
  }, [])
  useEffect(() => {
    const focused = windows.find((win) => win.id === focusedId)
    if (focused) { previousApp.current = focused.appId; return }
    if (!previousApp.current || covered || !running) return
    const appId = previousApp.current
    previousApp.current = null
    const raf = requestAnimationFrame(() => {
      const selector = mobile ? "[data-phone-home]" : `[data-task-app="${appId}"]`
      const target = document.querySelector<HTMLElement>(selector) ?? document.querySelector<HTMLElement>('[aria-label="Start"]')
      if (target && !target.closest("[inert]")) target.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [windows, focusedId, mobile, covered, running])

  return (
    <div
      data-shell-sessions
      className={`pointer-events-none absolute z-20 ${mobile ? "phone-session-area" : "inset-x-0 top-0 bottom-12"}`}
      style={{ isolation: "isolate" }}
      {...inertProps(!running || covered)}
      aria-hidden={!running || covered || undefined}
      onPointerDown={closeFlyouts}
    >
      {windows.map((win) => {
        const visible = !win.minimized && (!mobile || win.id === focusedId)
        return (
          <WindowFrame key={win.id} win={win} mobile={mobile} visible={visible} powered={running}>
            <AppActivityContext.Provider value={visible && win.id === focusedId && running && !covered && pageVisible}>
              <SessionWorkContext.Provider value={win.id}>
                <AppHost appId={win.appId} win={win} />
              </SessionWorkContext.Provider>
            </AppActivityContext.Provider>
          </WindowFrame>
        )
      })}
    </div>
  )
}
