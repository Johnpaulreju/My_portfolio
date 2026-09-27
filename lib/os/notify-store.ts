"use client"

import { create } from "zustand"
import type { AppId } from "./types"
import { playSfx, type SfxName } from "./sfx"

/** Your 4s, not Windows' 5s. Safe only because the stack pauses on hover and
 *  every toast keeps a permanent copy in the Notification Center. */
export const TOAST_MS = 4000

export type Toast = {
  id: string
  appId: AppId
  /** The attribution line above the title, e.g. "Network". */
  source: string
  title: string
  body?: string
  at: number
  /** Absolute deadline. Ticked by ONE interval - never a per-toast setTimeout. */
  expiresAt: number
  /** Cue to play on arrival; null for a silent toast. */
  sound?: SfxName | null
  /** Remaining ms captured while the stack is paused. */
  frozen?: number
  leaving?: boolean
}

export type NewToast = Omit<Toast, "id" | "at" | "expiresAt">

let seq = 0

type NotifyState = {
  toasts: Toast[]
  center: Toast[]
  unread: number
  dnd: boolean
  paused: boolean

  push: (t: NewToast) => void
  dismiss: (id: string) => void
  tick: () => void
  pause: () => void
  resume: () => void
  setDnd: (v: boolean) => void
  clearCenter: () => void
  /** Pretend notifications for the desktop bell panel. Not saved, so a reload brings them back. */
  fun: FunNote[]
  funUnread: number
  clearFun: () => void
  /** Swipe one notification away; its popup goes with it. */
  remove: (id: string) => void
  markRead: () => void
}

export type FunNote = { id: string; appId: AppId; source: string; title: string; body: string; minutesAgo: number }

const FUN_POOL: Omit<FunNote, "id" | "minutesAgo">[] = [
  { appId: "terminal", source: "Terminal", title: "Bug caught!", body: "It was hiding under a semicolon. It says sorry." },
  { appId: "lab", source: "Lab", title: "Still cooking in the CPU", body: "Please do not open the oven. The code is shy." },
  { appId: "browser", source: "Nimbus", title: "Nimbus learned a new word", body: "The word is \"agent\". Nimbus will not stop saying it." },
  { appId: "clock", source: "Clock", title: "Coffee break reminder", body: "Johnpaul is now 60% code and 40% coffee." },
  { appId: "ridgeline", source: "Ridgeline", title: "New lap record", body: "You did not drive it. Johnpaul did. Can you beat it?" },
  { appId: "minesweeper", source: "Minesweeper", title: "Boom", body: "A mine says hello. From very, very close." },
  { appId: "settings", source: "Settings", title: "Dark mode is on", body: "Your eyes say thank you. So does the moon." },
  { appId: "contact", source: "Contact", title: "Freelance slot open", body: "Got a website or an AI idea? Say hi, Johnpaul does not bite." },
  { appId: "skills", source: "Skills", title: "Skill unlocked: React Native", body: "Now building apps that fit in your pocket." },
  { appId: "camera", source: "Camera", title: "Smile!", body: "Just kidding. The camera is off. Probably." },
  { appId: "browser", source: "Nimbus", title: "Tip", body: "Google \"Johnpaul Reju\". Yes, that is me." },
  { appId: "recyclebin", source: "Recycle Bin", title: "Old bugs taken out", body: "The bin is full of bugs. That is a good thing." },
  { appId: "projects", source: "Projects", title: "Something is loading…", body: "Big things are on the way. Stay tuned." },
]

/** A fresh random handful on every page load. */
function pickFun(count = 5): FunNote[] {
  const pool = [...FUN_POOL]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  let ago = 0
  return pool.slice(0, count).map((n, i) => ({ ...n, id: `fun${i}`, minutesAgo: (ago += 1 + Math.floor(Math.random() * 9)) }))
}

/** At most this many toasts on screen; the rest are already in the Center. */
const MAX_VISIBLE = 3

export const useNotify = create<NotifyState>((set, get) => ({
  toasts: [],
  center: [],
  unread: 0,
  dnd: false,
  paused: false,
  fun: pickFun(),
  funUnread: 5,

  push: (t) => {
    const now = Date.now()
    const toast: Toast = { ...t, id: `t${++seq}`, at: now, expiresAt: now + TOAST_MS }
    const cue = t.sound === undefined ? "notify" : t.sound
    if (cue && !get().dnd) playSfx(cue)
    set((s) => ({
      // Do Not Disturb suppresses the popup but never the record.
      toasts: s.dnd ? s.toasts : [...s.toasts, toast].slice(-MAX_VISIBLE),
      center: [toast, ...s.center].slice(0, 50),
      unread: s.unread + 1,
    }))
  },

  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // One 250ms tick drives every toast: no drift, no StrictMode double-fire, pausable.
  tick: () =>
    set((s) => {
      if (s.paused) return s
      const now = Date.now()
      const next = s.toasts
        .map((t) => (!t.leaving && now >= t.expiresAt ? { ...t, leaving: true } : t))
        // Give the exit animation 220ms before the node actually goes.
        .filter((t) => !(t.leaving && now >= t.expiresAt + 220))
      return next.length === s.toasts.length && next.every((t, i) => t === s.toasts[i]) ? s : { toasts: next }
    }),

  pause: () =>
    set((s) => {
      if (s.paused) return s
      const now = Date.now()
      return { paused: true, toasts: s.toasts.map((t) => ({ ...t, frozen: Math.max(0, t.expiresAt - now) })) }
    }),

  resume: () =>
    set((s) => {
      if (!s.paused) return s
      const now = Date.now()
      return {
        paused: false,
        toasts: s.toasts.map((t) => ({ ...t, expiresAt: now + (t.frozen ?? TOAST_MS), frozen: undefined })),
      }
    }),

  setDnd: (dnd) => set((s) => ({ dnd, toasts: dnd ? [] : s.toasts })),
  clearCenter: () => set({ center: [], unread: 0 }),
  remove: (id) =>
    set((s) => ({ center: s.center.filter((t) => t.id !== id), toasts: s.toasts.filter((t) => t.id !== id) })),
  markRead: () => set({ unread: 0, funUnread: 0 }),
  clearFun: () => set({ fun: [], funUnread: 0 }),
}))
