"use client"

/**
 * System sounds.
 *
 * Browsers block audible playback until the page has had a user gesture, so
 * every call is best-effort: a rejected play() is swallowed, never retried in a
 * loop, and never surfaced as an error. Volume tracks the Quick Settings slider.
 */
export type SfxName =
  | "boot"
  | "notify"
  | "device-connect"
  | "device-disconnect"
  | "error"
  | "shutdown"
  | "unlock"
  | "recycle"

const SRC: Record<SfxName, string> = {
  // The visitor-supplied loading sound, kept under its own name.
  boot: "/sfx/loadingSound.mp3",
  notify: "/sfx/notify.mp3",
  "device-connect": "/sfx/device-connect.mp3",
  "device-disconnect": "/sfx/device-disconnect.mp3",
  error: "/sfx/error.mp3",
  shutdown: "/sfx/shutdown.mp3",
  unlock: "/sfx/unlock.mp3",
  recycle: "/sfx/recycle.mp3",
}

let unlocked = false
let volume = 0.65
let muted = false
/** Names that 404'd or failed to decode - never retried. */
const dead = new Set<SfxName>()
const cache = new Map<SfxName, HTMLAudioElement>()

function element(name: SfxName): HTMLAudioElement | null {
  if (dead.has(name) || typeof Audio === "undefined") return null
  let el = cache.get(name)
  if (!el) {
    el = new Audio(SRC[name])
    el.preload = "auto"
    el.addEventListener("error", () => dead.add(name), { once: true })
    cache.set(name, el)
  }
  return el
}

export function setSfxVolume(v: number, isMuted: boolean) {
  volume = Math.min(1, Math.max(0, v / 100))
  muted = isMuted
  cache.forEach((el) => {
    el.volume = volume
    el.muted = muted
  })
}

/** Call from a real user gesture. Safe to call repeatedly. */
export function unlockAudio() {
  if (unlocked) return
  unlocked = true
  // Warm the decoder without making noise, so the first real cue is instant.
  const probe = element("notify")
  if (!probe) return
  const wasMuted = probe.muted
  probe.muted = true
  probe
    .play()
    .then(() => {
      probe.pause()
      probe.currentTime = 0
      probe.muted = wasMuted || muted
    })
    .catch(() => {
      probe.muted = wasMuted || muted
    })
}

export function playSfx(name: SfxName) {
  if (!unlocked || muted || volume === 0) return
  const el = element(name)
  if (!el) return
  try {
    el.currentTime = 0
    el.volume = volume
    // Rejects when the gesture has expired or the file is missing. Both are fine.
    el.play().catch(() => {})
  } catch {
    /* ignore */
  }
}

export function isAudioUnlocked() {
  return unlocked
}
