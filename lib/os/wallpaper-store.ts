"use client"

import { create } from "zustand"

/**
 * The desktop background. "default" is the built-in bloom; anything else is a
 * picture the visitor added from Settings. Pictures live in this browser's
 * localStorage and nowhere else - nothing is uploaded.
 *
 * Two keys, so switching wallpaper rewrites a few bytes, not every picture.
 */
const PREFS_KEY = "jp-os-wallpaper-v1"
const IMAGES_KEY = "jp-os-wallpapers-v1"

export const DEFAULT_WALLPAPER = "default"
export const MAX_CUSTOM = 8

/**
 * Pictures are re-encoded before they're stored: localStorage holds ~5 MB for
 * the whole desktop (files included), and a phone photo alone can be bigger.
 * 2048px on the long edge is still sharp as a background.
 */
const MAX_EDGE = 2048
const QUALITY = 0.82
/** Refuse before decoding - a huge file can stall the tab. */
const MAX_FILE_BYTES = 25 * 1024 * 1024

export type CustomWallpaper = { id: string; name: string; src: string; addedAt: number }

export type AddResult = { ok: true } | { ok: false; message: string }

type WallpaperState = {
  hydrated: boolean
  /** DEFAULT_WALLPAPER or the id of a custom wallpaper. */
  current: string
  custom: CustomWallpaper[]

  hydrate: () => void
  select: (id: string) => void
  add: (file: File) => Promise<AddResult>
  remove: (id: string) => void
}

function isQuotaError(e: unknown) {
  return e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)
}

function savePrefs(current: string) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ current }))
  } catch {
    /* private mode - the choice just won't persist */
  }
}

/** Throws, unlike savePrefs: a picture that didn't save has to be reported, not silently lost. */
function saveImages(custom: CustomWallpaper[]) {
  localStorage.setItem(IMAGES_KEY, JSON.stringify(custom))
}

/** Only our own re-encoded pictures are ever accepted back out of storage. */
function isWallpaper(w: unknown): w is CustomWallpaper {
  if (!w || typeof w !== "object") return false
  const c = w as Partial<CustomWallpaper>
  return (
    typeof c.id === "string" &&
    typeof c.name === "string" &&
    typeof c.addedAt === "number" &&
    typeof c.src === "string" &&
    c.src.startsWith("data:image/jpeg;base64,")
  )
}

function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("decode"))
    img.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

async function shrink(file: File): Promise<string> {
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("canvas")
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", QUALITY)
}

const nameOf = (file: File) => file.name.replace(/\.[^.]+$/, "").trim().slice(0, 40) || "Picture"

export const useWallpaper = create<WallpaperState>((set, get) => ({
  hydrated: false,
  current: DEFAULT_WALLPAPER,
  custom: [],

  hydrate: () => {
    if (get().hydrated) return
    let custom: CustomWallpaper[] = []
    let current = DEFAULT_WALLPAPER
    try {
      const images: unknown = JSON.parse(localStorage.getItem(IMAGES_KEY) ?? "[]")
      if (Array.isArray(images)) custom = images.filter(isWallpaper).slice(0, MAX_CUSTOM)
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { current?: unknown }
      if (typeof prefs.current === "string" && custom.some((w) => w.id === prefs.current)) {
        current = prefs.current
      }
    } catch {
      /* corrupt storage falls through to the default wallpaper */
    }
    set({ custom, current, hydrated: true })
  },

  select: (id) => {
    if (id !== DEFAULT_WALLPAPER && !get().custom.some((w) => w.id === id)) return
    set({ current: id })
    savePrefs(id)
  },

  add: async (file) => {
    if (get().custom.length >= MAX_CUSTOM) {
      return { ok: false, message: `You can keep up to ${MAX_CUSTOM} pictures. Remove one first.` }
    }
    if (!file.type.startsWith("image/")) return { ok: false, message: "That file isn't a picture." }
    if (file.size > MAX_FILE_BYTES) return { ok: false, message: "That picture is over 25 MB. Try a smaller one." }

    let src: string
    try {
      src = await shrink(file)
    } catch {
      return { ok: false, message: "Couldn't read that picture. Try a JPG, PNG or WebP." }
    }

    const wallpaper: CustomWallpaper = {
      id: `wp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: nameOf(file),
      src,
      addedAt: Date.now(),
    }
    const custom = [...get().custom, wallpaper]
    try {
      saveImages(custom)
    } catch (e) {
      return {
        ok: false,
        message: isQuotaError(e)
          ? "Your browser's storage for this site is full. Remove a picture and try again."
          : "This browser won't let the site save pictures.",
      }
    }
    set({ custom, current: wallpaper.id })
    savePrefs(wallpaper.id)
    return { ok: true }
  },

  remove: (id) => {
    const custom = get().custom.filter((w) => w.id !== id)
    const current = get().current === id ? DEFAULT_WALLPAPER : get().current
    set({ custom, current })
    try {
      saveImages(custom)
    } catch {
      /* removing only ever shrinks storage; nothing useful to report */
    }
    savePrefs(current)
  },
}))
