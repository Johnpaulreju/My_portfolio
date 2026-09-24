"use client"

import { create } from "zustand"
import { useNotify } from "./notify-store"

export type ConnState = "disconnected" | "connecting" | "connected"

/**
 * The three layers a real machine distinguishes, which the old single `conn`
 * field conflated:
 *
 *   1. radio      — is the Wi-Fi adapter on?          (simulated; no web API exposes this)
 *   2. association— are we joined to a network?       (simulated)
 *   3. reachability— can we actually reach the internet?
 *
 * Layers 1 and 2 are pure fiction and the simulation stays authoritative for
 * them. The real browser signal gets exactly one job: `navigator.onLine === false`
 * VETOES layer 3. That asymmetry is deliberate — per MDN, only `false` is
 * trustworthy; `true` can still mean a captive portal or a dead uplink.
 */
export type NetStatus =
  | "airplane"
  | "radio-off"
  | "disconnected"
  | "connecting"
  | "no-internet"
  | "online"
export type WifiNetwork = { ssid: string; strength: 1 | 2 | 3; secured: boolean; known: boolean }

export const HOME_SSID = "JP's Hotspot"

const NETWORKS: WifiNetwork[] = [
  { ssid: HOME_SSID, strength: 3, secured: true, known: true },
  { ssid: "Bangalore_Fiber_5G", strength: 3, secured: true, known: false },
  { ssid: "Odyssey-Guest", strength: 2, secured: true, known: false },
  { ssid: "CAFE_FREE_WIFI", strength: 1, secured: false, known: false },
]

const STORAGE_KEY = "jp-os-system-v1"

/** Only preferences survive a reload - never the transient connection state. */
type Persisted = {
  brightness: number
  volume: number
  muted: boolean
  nightLight: boolean
  nightLightStrength: number
  grayscale: boolean
}

type SystemState = Persisted & {
  hydrated: boolean
  // network
  wifiOn: boolean
  btOn: boolean
  airplane: boolean
  /** What was on before airplane mode, so switching it off restores exactly that. */
  preAirplane: { wifi: boolean; bt: boolean } | null
  hotspotOn: boolean
  batterySaver: boolean
  ssid: string | null
  conn: ConnState
  networks: WifiNetwork[]

  /** Mirror of navigator.onLine. Nothing but the listener writes this. */
  realOnline: boolean
  setRealOnline: (v: boolean) => void

  hydrate: () => void
  /** True only when the simulation says connected AND the browser isn't offline. */
  online: () => boolean
  /** The single derived field every UI should read. */
  status: () => NetStatus

  toggleWifi: () => void
  setWifi: (on: boolean) => void
  connectTo: (ssid: string) => void
  disconnect: () => void
  toggleBt: () => void
  toggleAirplane: () => void
  toggleHotspot: () => void
  toggleBatterySaver: () => void

  setBrightness: (v: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  setNightLight: (on: boolean) => void
  setNightLightStrength: (v: number) => void
  toggleGrayscale: () => void
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function save(s: SystemState) {
  try {
    const p: Persisted = {
      brightness: s.brightness,
      volume: s.volume,
      muted: s.muted,
      nightLight: s.nightLight,
      nightLightStrength: s.nightLightStrength,
      grayscale: s.grayscale,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* private mode - preferences just won't persist */
  }
}

/** A connect takes a beat, the way a real one does. One handle so it can't double-fire. */
let connectTimer: ReturnType<typeof setTimeout> | null = null

export const useSystem = create<SystemState>((set, get) => ({
  hydrated: false,
  // Brightness floors at 20: a fully black screen is a trap, not a feature.
  brightness: 100,
  volume: 65,
  muted: false,
  nightLight: false,
  nightLightStrength: 40,
  grayscale: false,

  wifiOn: true,
  btOn: true,
  airplane: false,
  preAirplane: null,
  hotspotOn: false,
  batterySaver: false,
  ssid: HOME_SSID,
  conn: "connected",
  networks: NETWORKS,
  realOnline: true,

  hydrate: () => {
    if (get().hydrated) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const p = JSON.parse(raw) as Partial<Persisted>
        set({
          brightness: clamp(p.brightness ?? 100, 20, 100),
          volume: clamp(p.volume ?? 65, 0, 100),
          muted: !!p.muted,
          nightLight: !!p.nightLight,
          nightLightStrength: clamp(p.nightLightStrength ?? 40, 0, 100),
          grayscale: !!p.grayscale,
        })
      }
    } catch {
      /* fall through to defaults */
    }
    set({ hydrated: true })
  },

  setRealOnline: (realOnline) => set({ realOnline }),

  // The browser can veto, never grant.
  online: () => get().conn === "connected" && get().realOnline,

  status: () => {
    const s = get()
    if (s.airplane) return "airplane"
    if (!s.wifiOn) return "radio-off"
    if (s.conn === "connecting") return "connecting"
    if (s.conn !== "connected") return "disconnected"
    return s.realOnline ? "online" : "no-internet"
  },

  setWifi: (on) => {
    if (connectTimer) clearTimeout(connectTimer)
    if (!on) {
      set({ wifiOn: false, conn: "disconnected", ssid: null })
      useNotify.getState().push({
        appId: "settings",
        source: "Network",
        title: "No internet",
        body: "Wi-Fi is off. Turn it back on from Quick Settings.",
        sound: "device-disconnect",
      })
      return
    }
    set({ wifiOn: true, conn: "connecting" })
    connectTimer = setTimeout(() => {
      set({ conn: "connected", ssid: HOME_SSID })
      useNotify.getState().push({
        appId: "settings",
        source: "Network",
        title: `Connected to ${HOME_SSID}`,
        body: "Secured · You're online",
        sound: "device-connect",
      })
    }, 1100)
  },

  toggleWifi: () => get().setWifi(!get().wifiOn),

  connectTo: (ssid) => {
    if (connectTimer) clearTimeout(connectTimer)
    set({ wifiOn: true, conn: "connecting" })
    connectTimer = setTimeout(() => {
      set({ conn: "connected", ssid })
      useNotify.getState().push({
        appId: "settings",
        source: "Network",
        title: `Connected to ${ssid}`,
        body: "Secured · You're online",
        sound: "device-connect",
      })
    }, 1100)
  },

  disconnect: () => {
    if (connectTimer) clearTimeout(connectTimer)
    set({ conn: "disconnected", ssid: null })
  },

  toggleBt: () => set((s) => ({ btOn: !s.btOn })),

  // Airplane mode kills Wi-Fi and Bluetooth together and remembers what to restore.
  toggleAirplane: () => {
    const s = get()
    if (s.airplane) {
      const prev = s.preAirplane ?? { wifi: true, bt: true }
      set({ airplane: false, preAirplane: null, btOn: prev.bt })
      if (prev.wifi) get().setWifi(true)
      return
    }
    if (connectTimer) clearTimeout(connectTimer)
    set({
      airplane: true,
      preAirplane: { wifi: s.wifiOn, bt: s.btOn },
      wifiOn: false,
      btOn: false,
      hotspotOn: false,
      conn: "disconnected",
      ssid: null,
    })
    useNotify.getState().push({
      appId: "settings",
      source: "Network",
      title: "Airplane mode is on",
      body: "Wireless is off. You can turn Wi-Fi back on separately.",
      sound: "device-disconnect",
    })
  },

  toggleHotspot: () => set((s) => ({ hotspotOn: s.airplane ? false : !s.hotspotOn })),

  // Battery saver dims the panel, exactly as it does on a real laptop.
  toggleBatterySaver: () =>
    set((s) => {
      const on = !s.batterySaver
      return { batterySaver: on, brightness: on ? Math.min(s.brightness, 60) : s.brightness }
    }),

  setBrightness: (v) => {
    set({ brightness: clamp(Math.round(v), 20, 100) })
    save(get())
  },
  setVolume: (v) => {
    set({ volume: clamp(Math.round(v), 0, 100), muted: false })
    save(get())
  },
  toggleMute: () => {
    set((s) => ({ muted: !s.muted }))
    save(get())
  },
  setNightLight: (on) => {
    set({ nightLight: on })
    save(get())
  },
  setNightLightStrength: (v) => {
    set({ nightLightStrength: clamp(Math.round(v), 0, 100) })
    save(get())
  },
  toggleGrayscale: () => {
    set((s) => ({ grayscale: !s.grayscale }))
    save(get())
  },
}))
