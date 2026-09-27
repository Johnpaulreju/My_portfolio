"use client"

import { create } from "zustand"
import type { AppId, Point, Size, SnapSide, Theme, WindowInstance } from "./types"
import { APP_META } from "./app-meta"
import { isPhoneViewport } from "./viewport"

const MIN_W = 320
const MIN_H = 220

/** Fit the whole frame, including its controls, into the usable desktop. */
export function fitGeometry(geometry: { pos: Point; size: Size }, bounds: Size) {
  const size = { w: Math.min(geometry.size.w, bounds.w), h: Math.min(geometry.size.h, bounds.h) }
  return { size, pos: { x: Math.max(0, Math.min(geometry.pos.x, bounds.w - size.w)), y: Math.max(0, Math.min(geometry.pos.y, bounds.h - size.h)) } }
}

const THEME_KEY = "jp-os-theme-v1"

function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* private mode - the theme just won't persist */
  }
}

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

export type PhonePanel = "closed" | "compact" | "expanded" | "drawer" | "recents"

type WMState = {
  phonePanel: PhonePanel
  setPhonePanel: (panel: PhonePanel) => void
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
  /** Restores the theme the visitor picked last time. */
  hydrateTheme: () => void
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setStartOpen: (v: boolean) => void
  setQsOpen: (v: boolean) => void
  setNotifOpen: (v: boolean) => void
  closeFlyouts: () => void

  open: (appId: AppId, payload?: Record<string, unknown>, title?: string) => string
  setUnsavedWork: (id: string, dirty: boolean) => void
  close: (id: string) => boolean
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
  phonePanel: "closed",
  setPhonePanel: (phonePanel) => set({ phonePanel, startOpen: false, qsOpen: false, notifOpen: false }),
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
            size: { w: w.snapped === "left" ? half : bounds.w - half, h: bounds.h },
          }
        }
        const preferred = w.viewportRestore ?? { pos: w.pos, size: w.size }
        const fitted = fitGeometry(preferred, bounds)
        const constrained = fitted.size.w !== preferred.size.w || fitted.size.h !== preferred.size.h || fitted.pos.x !== preferred.pos.x || fitted.pos.y !== preferred.pos.y
        return { ...w, ...fitted, viewportRestore: constrained ? preferred : null }
      }),
    })),

  hydrateTheme: () => {
    try {
      const t = localStorage.getItem(THEME_KEY)
      if (t === "dark" || t === "light") set({ theme: t })
    } catch {
      /* fall through to the default */
    }
  },
  setTheme: (theme) => {
    set({ theme })
    saveTheme(theme)
  },
  toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
  // Opening any one shell surface closes the others - two open at once is the classic bug here.
  setStartOpen: (startOpen) => set({ startOpen: !isPhoneViewport() && startOpen, qsOpen: false, notifOpen: false, phonePanel: isPhoneViewport() && startOpen ? "drawer" : "closed" }),
  setQsOpen: (qsOpen) => set({ qsOpen: !isPhoneViewport() && qsOpen, startOpen: false, notifOpen: false, phonePanel: isPhoneViewport() && qsOpen ? "compact" : "closed" }),
  setNotifOpen: (notifOpen) => set({ notifOpen: !isPhoneViewport() && notifOpen, startOpen: false, qsOpen: false, phonePanel: isPhoneViewport() && notifOpen ? "compact" : "closed" }),
  closeFlyouts: () => set({ startOpen: false, qsOpen: false, notifOpen: false, phonePanel: "closed" }),

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
          qsOpen: false,
          notifOpen: false,
          phonePanel: "closed",
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
      ...fitGeometry({ pos: cascade(state.windows.length, size, bounds), size }, bounds),
      restore: null,
      minimized: false,
      maximized: false,
      snapped: null,
      z: state.topZ + 1,
    }
    set((s) => ({
      phonePanel: "closed",
      windows: [...s.windows, win],
      focusedId: id,
      topZ: s.topZ + 1,
      startOpen: false,
      qsOpen: false,
      notifOpen: false,
    }))
    return id
  },

  setUnsavedWork: (id, unsavedWork) => set((s) => ({
    windows: s.windows.map((w) => w.id === id && !!w.unsavedWork !== unsavedWork ? { ...w, unsavedWork } : w),
  })),

  close: (id) => {
    const win = get().windows.find((w) => w.id === id)
    if (!win) return false
    if (typeof window !== "undefined" && win.unsavedWork) {
      if (!window.confirm(`Close ${win.title}? Any unsaved work in this session will be lost. Choose Cancel to keep it.`)) return false
    }
    set((s) => {
      const windows = s.windows.filter((w) => w.id !== id)
      const focusedId = s.focusedId === id
        ? windows.filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]?.id ?? null
        : s.focusedId
      return { windows, focusedId }
    })
    return true
  },

  focus: (id) =>
    set((s) => {
      if (!s.windows.some((w) => w.id === id)) return s
      if (s.focusedId === id && s.phonePanel === "closed") {
        const w = s.windows.find((x) => x.id === id)
        if (w && !w.minimized) return s
      }
      return {
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, minimized: false, z: s.topZ + 1 } : w,
        ),
        phonePanel: "closed",
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
          return { ...w, maximized: false, snapped: null, restore: null, viewportRestore: r, ...fitGeometry(r, s.bounds) }
        }
        return {
          ...w,
          maximized: true,
          snapped: null,
          restore: w.viewportRestore ?? { pos: w.pos, size: w.size },
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
          restore: w.restore ?? w.viewportRestore ?? { pos: w.pos, size: w.size },
          pos: { x: side === "left" ? 0 : half, y: 0 },
          size: { w: side === "left" ? half : s.bounds.w - half, h: s.bounds.h },
        }
      }),
    })),

  move: (id, pos) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, pos, viewportRestore: null } : w)),
    })),

  resize: (id, pos, size) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id
          ? {
              ...w,
              ...fitGeometry({ pos, size: { w: Math.max(MIN_W, size.w), h: Math.max(MIN_H, size.h) } }, s.bounds),
              viewportRestore: null,
              maximized: false,
              snapped: null,
              restore: null,
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

  closeAll: () => { for (const win of [...get().windows]) { if (!get().close(win.id)) break } },
  minimizeAll: () =>
    set((s) => ({ windows: s.windows.map((w) => ({ ...w, minimized: true })), focusedId: null, phonePanel: "closed" })),
}))

export { MIN_W, MIN_H }
