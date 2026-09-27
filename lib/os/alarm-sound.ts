"use client"

/**
 * The alarm and timer sounds, made with WebAudio instead of an mp3 so they can
 * loop without gaps and swell gently like a phone alarm does.
 *
 * Browsers only allow sound after the visitor has touched the page. Power on
 * is that touch, so `primeAlarmSound` runs on the first gesture and the alarm
 * can sing later without one. If sound is still blocked, it fails quietly:
 * the alarm screen and vibration still work.
 */
export type AlarmTone = "alarm" | "timer"

type Note = { at: number; freq: number; len: number }

/** A bright rising chime for alarms, a double beep for the timer. Times in seconds. */
const PATTERNS: Record<AlarmTone, { period: number; notes: Note[] }> = {
  alarm: {
    period: 1.6,
    notes: [
      { at: 0, freq: 1046.5, len: 0.34 },
      { at: 0.16, freq: 1318.5, len: 0.34 },
      { at: 0.32, freq: 1568, len: 0.34 },
      { at: 0.48, freq: 2093, len: 0.5 },
    ],
  },
  timer: {
    period: 1.2,
    notes: [
      { at: 0, freq: 1760, len: 0.12 },
      { at: 0.18, freq: 1760, len: 0.12 },
      { at: 0.5, freq: 1760, len: 0.12 },
      { at: 0.68, freq: 1760, len: 0.12 },
    ],
  },
}

/** Alarms start soft and reach full volume after this many seconds. */
const SWELL_S = 12
/** Peak gain at 100% volume. Several notes overlap, so stay well under 1. */
const PEAK = 0.32

type Ctor = typeof AudioContext
let ctx: AudioContext | null = null
let volume = 0.65
let muted = false
let stopCurrent: (() => void) | null = null

function context(): AudioContext | null {
  if (ctx) return ctx
  if (typeof window === "undefined") return null
  const AC: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext
  if (!AC) return null
  try {
    ctx = new AC()
  } catch {
    return null
  }
  return ctx
}

const level = () => (muted ? 0 : PEAK * volume * volume)

/** Call from a real user gesture. Safe to call again. */
export function primeAlarmSound() {
  const c = context()
  if (c && c.state === "suspended") c.resume().catch(() => {})
}

let master: GainNode | null = null

/** Follows the Quick Settings volume and mute, even mid-ring. */
export function setAlarmVolume(v: number, isMuted: boolean) {
  volume = Math.min(1, Math.max(0, v / 100))
  muted = isMuted
  if (ctx && master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.05)
}

/** Starts looping the tone. Returns a stop function; starting again stops the old one. */
export function startAlarmSound(tone: AlarmTone): () => void {
  stopCurrent?.()
  const c = context()
  if (!c) return () => {}
  if (c.state === "suspended") c.resume().catch(() => {})

  const out = c.createGain()
  out.gain.value = 0
  out.connect(c.destination)
  master = out
  const swell = c.createGain()
  swell.connect(out)
  const t0 = c.currentTime
  swell.gain.setValueAtTime(tone === "alarm" ? 0.35 : 1, t0)
  if (tone === "alarm") swell.gain.linearRampToValueAtTime(1, t0 + SWELL_S)
  out.gain.setTargetAtTime(level(), t0, 0.02)

  const live = new Set<OscillatorNode>()
  const { period, notes } = PATTERNS[tone]
  // Schedule one pattern ahead, so a slow timer tick never leaves a gap.
  let next = t0 + 0.05
  const schedule = () => {
    while (next < c.currentTime + period * 2) {
      for (const n of notes) {
        const start = next + n.at
        const osc = c.createOscillator()
        const env = c.createGain()
        osc.type = tone === "alarm" ? "sine" : "square"
        osc.frequency.value = n.freq
        env.gain.setValueAtTime(0, start)
        env.gain.linearRampToValueAtTime(tone === "alarm" ? 0.6 : 0.25, start + 0.012)
        env.gain.exponentialRampToValueAtTime(0.0001, start + n.len)
        osc.connect(env).connect(swell)
        osc.start(start)
        osc.stop(start + n.len + 0.02)
        live.add(osc)
        osc.onended = () => {
          live.delete(osc)
          osc.disconnect()
          env.disconnect()
        }
      }
      next += period
    }
  }
  schedule()
  const tick = setInterval(schedule, (period * 1000) / 2)

  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    clearInterval(tick)
    const now = c.currentTime
    out.gain.cancelScheduledValues(now)
    out.gain.setTargetAtTime(0, now, 0.015)
    live.forEach((osc) => {
      try {
        osc.stop(now + 0.08)
      } catch {
        /* already stopped */
      }
    })
    setTimeout(() => {
      swell.disconnect()
      out.disconnect()
    }, 150)
    if (master === out) master = null
    if (stopCurrent === stop) stopCurrent = null
  }
  stopCurrent = stop
  return stop
}
