"use client"

import { useCallback, useEffect, useState } from "react"

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void>
  webkitFullscreenEnabled?: boolean
}
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }

/**
 * Fullscreen, honestly.
 *
 * `supported` is a CAPABILITY check, not UA sniffing - which correctly excludes
 * iPhone (no element fullscreen at all) without mis-detecting iPadOS, whose UA
 * reports as macOS.
 */
export function useFullscreen() {
  const [active, setActive] = useState(false)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    const d = document as FsDoc
    setSupported(Boolean(d.fullscreenEnabled ?? d.webkitFullscreenEnabled))
    const sync = () => setActive(Boolean(d.fullscreenElement ?? d.webkitFullscreenElement))
    sync()
    // Esc and F11 exit without telling us otherwise, so track the event.
    document.addEventListener("fullscreenchange", sync)
    document.addEventListener("webkitfullscreenchange", sync as EventListener)
    return () => {
      document.removeEventListener("fullscreenchange", sync)
      document.removeEventListener("webkitfullscreenchange", sync as EventListener)
    }
  }, [])

  /** Must be called inside a user gesture, and NOT after an await. */
  const enter = useCallback(() => {
    const el = document.documentElement as FsEl
    try {
      const p = el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.()
      p?.catch(() => {})
    } catch {
      /* rejected without a gesture - the desktop still works windowed */
    }
  }, [])

  const exit = useCallback(() => {
    const d = document as FsDoc
    try {
      if (d.fullscreenElement ?? d.webkitFullscreenElement) {
        const p = d.exitFullscreen?.() ?? d.webkitExitFullscreen?.()
        p?.catch(() => {})
      }
    } catch {
      /* ignore */
    }
  }, [])

  return { active, supported, enter, exit }
}
