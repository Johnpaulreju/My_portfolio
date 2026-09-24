"use client"

import { create } from "zustand"
import { playSfx, unlockAudio } from "./sfx"

/**
 * The machine's life cycle.
 *
 * `off` exists because browsers refuse fullscreen and audible playback without a
 * user gesture - so the visitor presses a power button, and that single click
 * buys both. It is the honest metaphor rather than a workaround.
 */
export type PowerState =
  | "off"
  | "booting"
  | "running"
  | "locked"
  | "sleeping"
  | "restarting"
  | "shuttingDown"

const ALLOWED: Record<PowerState, PowerState[]> = {
  off: ["booting"],
  booting: ["running"],
  running: ["locked", "sleeping", "restarting", "shuttingDown"],
  locked: ["running", "sleeping", "shuttingDown", "restarting"],
  // Windows wakes to the lock screen, never straight to the desktop.
  sleeping: ["locked"],
  restarting: ["booting"],
  shuttingDown: ["off"],
}

/** One handle, cleared on every transition, so a double-click can't schedule two hand-offs. */
let timer: ReturnType<typeof setTimeout> | null = null
const clear = () => {
  if (timer) clearTimeout(timer)
  timer = null
}

type PowerStore = {
  state: PowerState
  /** Whether the visitor opted into fullscreen on the power screen. */
  wantFullscreen: boolean
  setWantFullscreen: (v: boolean) => void

  go: (next: PowerState) => void
  powerOn: () => void
  sleep: () => void
  lock: () => void
  unlock: () => void
  restart: () => void
  shutDown: () => void
}

export const usePower = create<PowerStore>((set, get) => ({
  state: "off",
  wantFullscreen: true,
  setWantFullscreen: (wantFullscreen) => set({ wantFullscreen }),

  go: (next) => {
    const cur = get().state
    if (cur === next) return
    if (!ALLOWED[cur].includes(next)) return // illegal edge: no-op rather than throw
    clear()
    set({ state: next })
  },

  // Must be called straight from a click handler - the gesture is what unlocks audio.
  powerOn: () => {
    if (get().state !== "off") return
    unlockAudio()

    // A returning visitor has already seen the boot. Showing it again is a toll
    // booth at the exact moment they are least patient.
    let seen = false
    try {
      seen = localStorage.getItem("jp-os-booted") === "1"
    } catch {
      /* private mode - treat as a first visit */
    }
    if (seen) {
      clear()
      set({ state: "running" })
      return
    }
    try {
      localStorage.setItem("jp-os-booted", "1")
    } catch {
      /* ignore */
    }

    playSfx("boot")
    clear()
    set({ state: "booting" })
    // A safety net only: BootScreen normally hands off first, at DONE_AT.
    timer = setTimeout(() => {
      clear()
      set({ state: "running" })
    }, 5600)
  },

  sleep: () => get().go("sleeping"),
  lock: () => get().go("locked"),

  unlock: () => {
    if (get().state !== "locked") return
    playSfx("unlock")
    get().go("running")
  },

  restart: () => {
    const s = get()
    if (!ALLOWED[s.state].includes("restarting")) return
    clear()
    set({ state: "restarting" })
    timer = setTimeout(() => {
      clear()
      set({ state: "booting" })
      timer = setTimeout(() => {
        clear()
        set({ state: "running" })
      }, 5600)
    }, 1900)
  },

  shutDown: () => {
    const s = get()
    if (!ALLOWED[s.state].includes("shuttingDown")) return
    playSfx("shutdown")
    clear()
    set({ state: "shuttingDown" })
    timer = setTimeout(() => {
      clear()
      set({ state: "off" })
    }, 2600)
  },
}))
