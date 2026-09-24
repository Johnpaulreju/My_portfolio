"use client"

import type { AppId } from "./types"

/**
 * Optional per-app icon override.
 *
 * Drop a file at `public/brand/<appId>.svg` (or .png / .webp) and it replaces the
 * built-in glyph everywhere - desktop, taskbar, Start menu, phone home screen -
 * with no code change. Nothing is bundled and nothing is hotlinked: the file is
 * probed once, cached, and silently ignored if absent.
 *
 * This exists so real brand marks can be added deliberately by the site owner,
 * rather than shipped in the repo by default.
 */
const EXTS = ["svg", "png", "webp"] as const

type Status = { url: string } | null
const cache = new Map<AppId, Status>()
const inflight = new Map<AppId, Promise<Status>>()
const listeners = new Set<() => void>()

function probe(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth > 0)
    img.onerror = () => resolve(false)
    img.src = url
  })
}

async function find(appId: AppId): Promise<Status> {
  for (const ext of EXTS) {
    const url = `/brand/${appId}.${ext}`
    // eslint-disable-next-line no-await-in-loop -- deliberately sequential: stop at the first hit
    if (await probe(url)) return { url }
  }
  return null
}

/** Synchronous read; kicks off a one-time lookup the first time an app is seen. */
export function brandIcon(appId: AppId): Status {
  if (typeof window === "undefined") return null
  if (cache.has(appId)) return cache.get(appId) ?? null
  if (!inflight.has(appId)) {
    const p = find(appId).then((res) => {
      cache.set(appId, res)
      inflight.delete(appId)
      if (res) listeners.forEach((fn) => fn())
      return res
    })
    inflight.set(appId, p)
  }
  return null
}

export function onBrandIconsChanged(fn: () => void): () => void {
  listeners.add(fn)
  // Returns void, not boolean - React requires a plain destructor.
  return () => {
    listeners.delete(fn)
  }
}
