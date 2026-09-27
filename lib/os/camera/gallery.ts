import type { FilterId } from "./filters"

/** Photos live only in memory, as object URLs, for as long as Camera is open. */
export type Photo = {
  id: string
  url: string
  blob: Blob
  name: string
  takenAt: number
  width: number
  height: number
  filter: FilterId
}

/** Enough to play with, few enough that memory stays small on a phone. */
export const GALLERY_CAP = 24

/** Two shots in the same second get -2, -3... so downloads never overwrite each other. */
export function uniqueName(existing: readonly { name: string }[], base: string) {
  const taken = new Set(existing.map((p) => p.name))
  if (!taken.has(base)) return base
  const stem = base.replace(/\.jpg$/, "")
  for (let n = 2; ; n++) {
    const name = `${stem}-${n}.jpg`
    if (!taken.has(name)) return name
  }
}

/**
 * Newest first. Returns what fell off the end so the caller can revoke those
 * URLs - an unrevoked object URL keeps its whole JPEG in memory.
 */
export function addPhoto<T>(photos: readonly T[], photo: T, cap = GALLERY_CAP) {
  const next = [photo, ...photos]
  return { photos: next.slice(0, cap), dropped: next.slice(cap) }
}

export function removePhoto<T extends { id: string }>(photos: readonly T[], id: string) {
  const index = photos.findIndex((p) => p.id === id)
  if (index < 0) return { photos: photos.slice(), removed: null, index: -1 }
  return { photos: photos.filter((p) => p.id !== id), removed: photos[index], index }
}
