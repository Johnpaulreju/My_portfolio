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
  markRead: () => void
}

/** At most this many toasts on screen; the rest are already in the Center. */
const MAX_VISIBLE = 3

export const useNotify = create<NotifyState>((set, get) => ({
  toasts: [],
  center: [],
  unread: 0,
  dnd: false,
  paused: false,

  push: (t) => {
    const now = Date.now()
    const toast: Toast = { ...t, id: `t${++seq}`, at: now, expiresAt: now + TOAST_MS }
    const cue = t.sound === undefined ? "notify" : t.sound
    if (cue) playSfx(cue)
    set((s) => ({
      // Do Not Disturb suppresses the popup but never the record.
      toasts: s.dnd ? s.toasts : [...s.toasts, toast].slice(-MAX_VISIBLE),
      center: [toast, ...s.center].slice(0, 50),
      unread: s.unread + 1,
    }))
  },

  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) })),

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
  markRead: () => set({ unread: 0 }),
}))
