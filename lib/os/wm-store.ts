"use client"

import { create } from "zustand"
import type { AppId, Point, Size, SnapSide, Theme, WindowInstance } from "./types"
import { APP_META } from "./app-meta"

const MIN_W = 320
const MIN_H = 220

let seq = 0
const nextId = () => `w${++seq}`

/** Cascade each new window so they don't stack perfectly on top of each other. */
function cascade(index: number, size: Size, bounds: Size): Point {
  const step = 28
  const offset = (index % 6) * step
  const x = Math.max(8, Math.round((bounds.w - size.w) / 2) - 60 + offset)
  const y = Math.max(8, Math.round((bounds.h - size.h) / 2) - 40 + offset)
  return { x, y }
}

type WMState = {
  windows: WindowInstance[]
  focusedId: string | null
  topZ: number
  theme: Theme
  startOpen: boolean
  /** Tray flyouts. Mutually exclusive with each other and with startOpen. */
  qsOpen: boolean
  notifOpen: boolean
  /** Usable desktop area (viewport minus taskbar). */
  bounds: Size

  setBounds: (b: Size) => void
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setStartOpen: (v: boolean) => void
  setQsOpen: (v: boolean) => void
  setNotifOpen: (v: boolean) => void
  closeFlyouts: () => void

  open: (appId: AppId, payload?: Record<string, unknown>, title?: string) => string
  close: (id: string) => void
  focus: (id: string) => void
  minimize: (id: string) => void
  toggleMinimize: (id: string) => void
  toggleMaximize: (id: string) => void
  snap: (id: string, side: Exclude<SnapSide, null>) => void
  move: (id: string, pos: Point) => void
  resize: (id: string, pos: Point, size: Size) => void
  setTitle: (id: string, title: string) => void
  setPayload: (id: string, payload: Record<string, unknown>) => void
  closeAll: () => void
  minimizeAll: () => void
}

export const useWM = create<WMState>((set, get) => ({
  windows: [],
  focusedId: null,
  topZ: 10,
  theme: "dark",
  startOpen: false,
  qsOpen: false,
  notifOpen: false,
  bounds: { w: 1280, h: 720 },

  setBounds: (bounds) =>
    set((s) => ({
      bounds,
      windows: s.windows.map((w) => {
        // A maximized or snapped window is defined by the viewport, so it has to be
        // re-laid-out on resize - not just nudged, or it keeps a stale size while
        // still claiming to be maximized.
        if (w.maximized) return { ...w, pos: { x: 0, y: 0 }, size: { w: bounds.w, h: bounds.h } }
        if (w.snapped) {
          const half = Math.round(bounds.w / 2)
          return {
            ...w,
            pos: { x: w.snapped === "left" ? 0 : half, y: 0 },
            size: { w: half, h: bounds.h },
          }
        }
        // Free-floating windows just stay at least partially reachable.
        return {
          ...w,
          pos: {
            x: Math.min(w.pos.x, Math.max(0, bounds.w - 120)),
            y: Math.min(w.pos.y, Math.max(0, bounds.h - 48)),
          },
        }
      }),
    })),

  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
  // Opening any one shell surface closes the others - two open at once is the classic bug here.
  setStartOpen: (startOpen) => set({ startOpen, qsOpen: false, notifOpen: false }),
  setQsOpen: (qsOpen) => set({ qsOpen, startOpen: false, notifOpen: false }),
  setNotifOpen: (notifOpen) => set({ notifOpen, startOpen: false, qsOpen: false }),
  closeFlyouts: () => set({ startOpen: false, qsOpen: false, notifOpen: false }),

  open: (appId, payload, title) => {
    const meta = APP_META[appId]
    const state = get()

    // Single-instance apps re-focus instead of opening a duplicate.
    if (meta.singleton) {
      const existing = state.windows.find((w) => w.appId === appId)
      if (existing) {
        set((s) => ({
          windows: s.windows.map((w) =>
            w.id === existing.id ? { ...w, minimized: false, z: s.topZ + 1 } : w,
          ),
          focusedId: existing.id,
          topZ: s.topZ + 1,
          startOpen: false,
        }))
        return existing.id
      }
    }

    const bounds = state.bounds
    const size: Size = {
      w: Math.min(meta.defaultSize.w, Math.max(MIN_W, bounds.w - 40)),
      h: Math.min(meta.defaultSize.h, Math.max(MIN_H, bounds.h - 40)),
    }
    const id = nextId()
    const win: WindowInstance = {
      id,
      appId,
      title: title ?? meta.title,
      payload,
      pos: cascade(state.windows.length, size, bounds),
      size,
      restore: null,
      minimized: false,
      maximized: false,
      snapped: null,
      z: state.topZ + 1,
    }
    set((s) => ({
      windows: [...s.windows, win],
      focusedId: id,
      topZ: s.topZ + 1,
      startOpen: false,
      qsOpen: false,
      notifOpen: false,
    }))
    return id
  },

  close: (id) =>
    set((s) => {
      const windows = s.windows.filter((w) => w.id !== id)
      const focusedId =
        s.focusedId === id
          ? windows.filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]?.id ?? null
          : s.focusedId
      return { windows, focusedId }
    }),

  focus: (id) =>
    set((s) => {
      if (s.focusedId === id) {
        const w = s.windows.find((x) => x.id === id)
        if (w && !w.minimized) return s
      }
      return {
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, minimized: false, z: s.topZ + 1 } : w,
        ),
        focusedId: id,
        topZ: s.topZ + 1,
      }
    }),

  minimize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
      focusedId:
        s.focusedId === id
          ? s.windows.filter((w) => w.id !== id && !w.minimized).sort((a, b) => b.z - a.z)[0]?.id ??
            null
          : s.focusedId,
    })),

  toggleMinimize: (id) => {
    const w = get().windows.find((x) => x.id === id)
    if (!w) return
    // Clicking the taskbar button of the focused window minimizes it, Windows-style.
    if (!w.minimized && get().focusedId === id) get().minimize(id)
    else get().focus(id)
  },

  toggleMaximize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w
        if (w.maximized || w.snapped) {
          const r = w.restore ?? { pos: { x: 60, y: 60 }, size: { w: 900, h: 600 } }
          return { ...w, maximized: false, snapped: null, restore: null, ...r }
        }
        return {
          ...w,
          maximized: true,
          snapped: null,
          restore: { pos: w.pos, size: w.size },
          pos: { x: 0, y: 0 },
          size: { w: s.bounds.w, h: s.bounds.h },
        }
      }),
      focusedId: id,
    })),

  snap: (id, side) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w
        const half = Math.round(s.bounds.w / 2)
        return {
          ...w,
          maximized: false,
          snapped: side,
          restore: w.restore ?? { pos: w.pos, size: w.size },
          pos: { x: side === "left" ? 0 : half, y: 0 },
          size: { w: half, h: s.bounds.h },
        }
      }),
    })),

  move: (id, pos) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, pos } : w)),
    })),

  resize: (id, pos, size) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id
          ? {
              ...w,
              pos,
              size: { w: Math.max(MIN_W, size.w), h: Math.max(MIN_H, size.h) },
              maximized: false,
              snapped: null,
            }
          : w,
      ),
    })),

  setTitle: (id, title) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, title } : w)) })),

  setPayload: (id, payload) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, payload: { ...w.payload, ...payload } } : w,
      ),
    })),

  closeAll: () => set({ windows: [], focusedId: null }),
  minimizeAll: () =>
    set((s) => ({ windows: s.windows.map((w) => ({ ...w, minimized: true })), focusedId: null })),
}))

export { MIN_W, MIN_H }
