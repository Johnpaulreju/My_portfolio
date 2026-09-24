"use client"

import { useEffect } from "react"
import { useSystem } from "@/lib/os/system-store"
import { setSfxVolume, unlockAudio } from "@/lib/os/sfx"
import { useNotify } from "@/lib/os/notify-store"

/**
 * Brightness, night light and the colour filter.
 *
 * Deliberately NOT a CSS filter on the shell root: a filter on any ancestor
 * becomes the containing block for position:fixed descendants, which would break
 * every context menu and flyout. The greyscale filter goes on documentElement
 * (already the fixed containing block), and the tints are plain overlays.
 */
export function SystemEffects() {
  const { brightness, nightLight, nightLightStrength, grayscale, volume, muted, hydrate } = useSystem()

  useEffect(() => hydrate(), [hydrate])

  // navigator.onLine is only authoritative when FALSE (MDN). So it can veto the
  // simulated connection, never grant it - and we announce the veto, because a
  // silently-degraded OS is worse than an honest one.
  useEffect(() => {
    const sync = (online: boolean) => {
      const prev = useSystem.getState().realOnline
      useSystem.getState().setRealOnline(online)
      if (prev === online) return
      useNotify.getState().push({
        appId: "settings",
        source: "Network",
        title: online ? "Back online" : "This device lost its connection",
        body: online
          ? "Web features are available again."
          : "Your real network dropped. JP OS still works — Web search doesn't.",
        sound: online ? "device-connect" : "device-disconnect",
      })
    }
    sync(navigator.onLine)
    const on = () => sync(true)
    const off = () => sync(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
    }
  }, [])

  // The Quick Settings slider drives real playback volume.
  useEffect(() => setSfxVolume(volume, muted), [volume, muted])

  // Audible playback is blocked until the page has had a gesture. Unlock on the
  // first one, whatever it is, then stop listening.
  useEffect(() => {
    const go = () => unlockAudio()
    const opts = { once: true, capture: true } as const
    window.addEventListener("pointerdown", go, opts)
    window.addEventListener("keydown", go, opts)
    return () => {
      window.removeEventListener("pointerdown", go, true)
      window.removeEventListener("keydown", go, true)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.style.filter = grayscale ? "grayscale(1)" : ""
    return () => {
      root.style.filter = ""
    }
  }, [grayscale])

  const dim = (100 - brightness) / 100
  const warm = nightLightStrength / 100

  return (
    <>
      {dim > 0 && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0"
          style={{ zIndex: 8999, background: `rgba(0,0,0,${dim * 0.72})` }}
        />
      )}
      {nightLight && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0"
          style={{
            zIndex: 9000,
            mixBlendMode: "multiply",
            // Warmer as the strength rises: blue is pulled down fastest, then green.
            background: `rgb(255, ${Math.round(255 - warm * 48)}, ${Math.round(255 - warm * 120)})`,
          }}
        />
      )}
    </>
  )
}
