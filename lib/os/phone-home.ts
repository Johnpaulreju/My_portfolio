"use client"

import { ALL_APPS, APP_META, type AppMeta } from "./app-meta"
import { search } from "./search"
import type { AppId } from "./types"

/** The phone home screen shows a short, curated set. Everything else lives in the drawer. */
export const HOME_APPS: AppId[] = ["projects", "experience", "skills", "lab", "achievements", "resume", "clock", "settings"]
export const GAMES: AppId[] = ["minesweeper", "solitaire", "ridgeline"]
/** Android's Phone, Messages, Chrome and Camera slots. */
export const DOCK: AppId[] = ["about", "contact", "browser", "camera"]

export const ASK_CHIPS = ["What do you build?", "Are you open to freelance?", "What are you learning?"]

export const SEARCH_PLACEHOLDER = "Search apps or ask me anything"

/** Apps A-Z by the label people see under the icon. */
export function sortedApps(): AppMeta[] {
  return [...ALL_APPS].sort((a, b) => a.short.localeCompare(b.short))
}

/** Drawer filter: the shared search index first, then plain name matches it may rank out. */
export function filterApps(query: string): AppMeta[] {
  const q = query.trim().toLowerCase()
  if (!q) return sortedApps()
  const ranked = search(q, "apps", 40).results.flatMap((r) => (r.appId ? [r.appId] : []))
  const named = ALL_APPS.filter((a) => a.title.toLowerCase().includes(q) || a.short.toLowerCase().includes(q)).map((a) => a.id)
  return [...new Set([...named, ...ranked])].map((id) => APP_META[id])
}

/** Good enough to offer "Ask JP" instead of guessing an app. */
export function looksLikeQuestion(query: string): boolean {
  const q = query.trim()
  if (q.length < 4) return false
  return /\?$/.test(q) || /^(what|who|why|how|when|where|which|are|is|do|does|did|can|could|will|would|should|tell|show)\b/i.test(q) || q.split(/\s+/).length >= 4
}

/* ------------------------------------------------ launch origin (open zoom) */

type Rect = { x: number; y: number; w: number; h: number }
const origins = new Map<AppId, Rect>()
let pending: { appId: AppId; at: number } | null = null

/** Remember where an app was tapped so its window can zoom out of that spot. */
export function markLaunch(appId: AppId, el: Element | null) {
  if (!el) return
  const r = el.getBoundingClientRect()
  origins.set(appId, { x: r.left, y: r.top, w: r.width, h: r.height })
  pending = { appId, at: Date.now() }
}

/** The origin of a launch that just happened, used once. */
export function takeLaunch(appId: AppId): Rect | null {
  // A tap that didn't open anything (the app was already up) must not zoom a later, unrelated open.
  if (pending?.appId !== appId) return null
  const fresh = Date.now() - pending.at < 1000
  pending = null
  return fresh ? origins.get(appId) ?? null : null
}

/** Where to zoom back to on Home, if we know. */
export function launchOrigin(appId: AppId): Rect | null {
  return origins.get(appId) ?? null
}

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
}

/** A tiny buzz where the phone supports it. Silent everywhere else. */
export function haptic(ms = 8) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms)
  } catch {
    /* some browsers throw when vibration is blocked */
  }
}
