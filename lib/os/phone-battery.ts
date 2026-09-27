"use client"

import { useEffect, useState } from "react"

type BatteryManager = EventTarget & { level: number; charging: boolean }
export type Battery = { level: number; charging: boolean }

/**
 * The real battery, when the browser shares it (Chromium on Android does).
 * `null` everywhere else: the status bar then draws a plain icon and never
 * makes up a number.
 */
export function useBattery(): Battery | null {
  const [battery, setBattery] = useState<Battery | null>(null)
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }
    if (typeof nav.getBattery !== "function") return
    let manager: BatteryManager | null = null
    let live = true
    const sync = () => { if (live && manager) setBattery({ level: manager.level, charging: manager.charging }) }
    nav.getBattery().then((m) => {
      if (!live) return
      manager = m
      sync()
      m.addEventListener("levelchange", sync)
      m.addEventListener("chargingchange", sync)
    }).catch(() => { /* blocked by policy: stay unknown */ })
    return () => {
      live = false
      manager?.removeEventListener("levelchange", sync)
      manager?.removeEventListener("chargingchange", sync)
    }
  }, [])
  return battery
}
