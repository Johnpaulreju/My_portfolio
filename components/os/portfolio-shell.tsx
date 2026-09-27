"use client"

import { inertProps } from "@/components/os/shell-dom"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { PowerOverlay } from "./power/power-overlay"
import { DesktopShell } from "./desktop/desktop-shell"
import { PhoneShell } from "./mobile/phone-shell"
import { ShellSessions } from "./shell-sessions"
import { SystemEffects } from "./system-effects"
import { ToastHost } from "./toast-host"
import { AlarmService } from "./clock/alarm-service"
import { useWM } from "@/lib/os/wm-store"
import { useFS } from "@/lib/os/fs-store"
import { usePower } from "@/lib/os/power-store"
import { useWallpaper } from "@/lib/os/wallpaper-store"
import { PHONE_QUERY } from "@/lib/os/viewport"

export function PortfolioShell({ children }: { children?: ReactNode }) {
  const [entered, setEntered] = useState(false)
  const [isPhone, setIsPhone] = useState<boolean | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const theme = useWM((s) => s.theme)
  const running = usePower((s) => s.state === "running")
  const hydrate = useFS((s) => s.hydrate)
  const hydrateTheme = useWM((s) => s.hydrateTheme)
  const hydrateWallpaper = useWallpaper((s) => s.hydrate)

  useEffect(() => hydrate(), [hydrate])
  useEffect(() => hydrateTheme(), [hydrateTheme])
  useEffect(() => hydrateWallpaper(), [hydrateWallpaper])
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY)
    const sync = () => {
      useWM.getState().setPhonePanel("closed")
      useWM.getState().closeFlyouts()
      setIsPhone(mq.matches)
    }
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  // The visual viewport shrinks for the keyboard. Ignore pinch-zoom changes so
  // browser magnification remains a viewport operation, not a layout resize.
  useEffect(() => {
    const viewport = window.visualViewport
    const sync = () => {
      const el = root.current
      if (!el || (viewport && viewport.scale > 1.05)) return
      el.style.setProperty("--phone-height", `${viewport?.height ?? window.innerHeight}px`)
      el.style.setProperty("--phone-offset", `${viewport?.offsetTop ?? 0}px`)
    }
    sync()
    viewport?.addEventListener("resize", sync)
    viewport?.addEventListener("scroll", sync)
    window.addEventListener("resize", sync)
    return () => {
      viewport?.removeEventListener("resize", sync)
      viewport?.removeEventListener("scroll", sync)
      window.removeEventListener("resize", sync)
    }
  }, [])

  return (
    <div ref={root} data-theme={theme} className={!entered || isPhone === null ? "" : `portfolio-shell ${isPhone ? "portfolio-shell-phone" : ""}`}>
      <PowerOverlay entry={!entered} onStart={() => setEntered(true)} />
      {!entered ? (
        <div id="readable-portfolio" data-shell-fallback>{children ?? <p>Johnpaul&apos;s portfolio is loading. About, experience, skills, and contact are available in the portfolio apps.</p>}</div>
      ) : isPhone !== null ? (
        <>
          <div className="absolute inset-0" {...inertProps(!running)} aria-hidden={!running || undefined}>
            {isPhone ? <PhoneShell managed /> : <DesktopShell managed />}
            <ShellSessions mobile={isPhone} />
            <ToastHost mobile={isPhone} />
            <AlarmService mobile={isPhone} />
          </div>
          <SystemEffects />
        </>
      ) : null}
    </div>
  )
}
