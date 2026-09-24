"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as RKeyboardEvent,
  type ReactNode,
} from "react"
import {
  FileBadge,
  Gauge,
  Info,
  Keyboard,
  Mail,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import type { WindowInstance } from "@/lib/os/types"
import { useWM } from "@/lib/os/wm-store"
import { useSystem } from "@/lib/os/system-store"
import { usePower } from "@/lib/os/power-store"
import { useNotify } from "@/lib/os/notify-store"

/**
 * RIDGELINE — an original behind-the-bike combat racer.
 *
 * Inspired by the 16-bit combat racers of the early nineties; no assets, names,
 * sprites or audio from any of them. Every pixel here is drawn procedurally by
 * Canvas 2D at run time and every sound is synthesised by WebAudio, so the app
 * ships zero binary payload.
 *
 * The pseudo-3D road is the classic segment projection popularised by Jake
 * Gordon's "How to build a racing game" articles (codeincomplete.com) — the
 * constants below are his, and they are good ones. The combat layer, the feel
 * budget, the AI and the rendering are this file's own.
 *
 * Everything that moves lives in one canvas: the shake, the sparks and the
 * flashes are transformed inside the 2D context, so no amount of juice can ever
 * escape the window and paint over the OS.
 */

/* ------------------------------------------------------------------ *
 * Road constants
 *
 * maxSpeed = segmentLength / STEP is not a taste call: it guarantees the bike
 * crosses at most one segment per tick, which is the precondition that makes
 * per-segment collision sound. Raise one and you must raise the other.
 * ------------------------------------------------------------------ */

const STEP = 1 / 60
const SEG_LEN = 200
const RUMBLE_LEN = 3
const LANES = 3
const ROAD_W = 2000
const CAM_HEIGHT = 1000
const DRAW_DIST = 300
const FOG_DENSITY = 5
const CENTRIFUGAL = 0.3

const MAX_SPEED = SEG_LEN / STEP // 12000 units/s
const ACCEL = MAX_SPEED / 5
const BRAKING = -MAX_SPEED
const DECEL = -MAX_SPEED / 5
const OFF_ROAD_DECEL = -MAX_SPEED / 2
const OFF_ROAD_LIMIT = MAX_SPEED / 4
/** Coyote time: clipping a rumble strip mid-overtake must not be punished. */
const OFF_ROAD_GRACE = 0.11

const FOV_BASE = 96
const FOV_RUSH = 26
const CAM_LEAD = 0.22

const LOGICAL_H = 480
const TOTAL_SEGMENTS = 3600
const TRACK_LEN = TOTAL_SEGMENTS * SEG_LEN

/** Phase boundaries, in segment index. */
const P_TRAFFIC = 420
const P_RIVALS = 1250
const P_HEAVY = 2080
const P_FINAL = 3100
const FINISH_SEG = 3560
/** Fixed, so the recorded time never depends on the live field of view. */
const FINISH_DIST = FINISH_SEG * SEG_LEN - CAM_HEIGHT

/** Display speed is cosmetic: 220 km/h at the rev limiter reads right. */
const KPH = 220

const TAU = Math.PI * 2

/* Combat */
const HP_MAX = 100
const ALONGSIDE_Z = SEG_LEN * 1.5
const ALONGSIDE_X = 0.34
const WINDUP = 0.09
const STRIKE = 0.06
const RECOVERY = 0.18
const BUFFER_MS = 140

/* Hitbox widths, in road-offset units (1 = the road's half width). */
const W_PLAYER = 0.22
const W_RIVAL = 0.22
const W_CAR = 0.34
const W_VAN = 0.46
/* Drawn widths are narrower than hitboxes — generous to the player. */
const DRAW_BIKE = 0.15
const DRAW_CAR = 0.3
const DRAW_VAN = 0.4

const PARTICLE_CAP = 220
const BEST_KEY = "jp-os-ridgeline-best-v1"

/* ------------------------------------------------------------------ *
 * Maths
 * ------------------------------------------------------------------ */

/** mulberry32 — reproducible traffic, so every visitor races the same track. */
function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const lerp = (a: number, b: number, p: number) => a + (b - a) * p
const easeIn = (a: number, b: number, p: number) => a + (b - a) * p * p
const easeInOut = (a: number, b: number, p: number) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5)

function increase(start: number, inc: number, max: number) {
  let r = start + inc
  while (r >= max) r -= max
  while (r < 0) r += max
  return r
}

const percentRemaining = (n: number, total: number) => (n % total) / total

/**
 * `pct` shrinks both hitboxes toward their centres. It is the fairness dial and
 * the single most important knob in the game: 0.8 for traffic, 0.9 for rivals.
 */
function overlap(x1: number, w1: number, x2: number, w2: number, pct: number) {
  const half = pct / 2
  return !(x1 + w1 * half < x2 - w2 * half || x1 - w1 * half > x2 + w2 * half)
}

/** Shortest signed distance between two points on a looping track. */
function wrapDelta(a: number, b: number) {
  let d = a - b
  if (d > TRACK_LEN / 2) d -= TRACK_LEN
  if (d < -TRACK_LEN / 2) d += TRACK_LEN
  return d
}

function fmtTime(sec: number) {
  const s = Math.max(0, sec)
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  return `${String(m).padStart(2, "0")}:${rest < 10 ? "0" : ""}${rest.toFixed(2)}`
}

/* ------------------------------------------------------------------ *
 * Colour
 * ------------------------------------------------------------------ */

type RGB = [number, number, number]

function hexToRgb(h: string): RGB {
  const s = h.trim().replace("#", "")
  if (/^[0-9a-f]{3}$/i.test(s)) {
    return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16)]
  }
  if (/^[0-9a-f]{6}/i.test(s)) {
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
  }
  return [76, 194, 255]
}

const css = (c: RGB, a = 1) =>
  a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

const mixRgb = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

type Palette = {
  letterbox: string
  skyTop: string
  skyBot: string
  sun: string
  ridgeFar: string
  ridgeNear: string
  fog: string
  grassL: string
  grassD: string
  roadL: string
  roadD: string
  rumbleL: string
  rumbleD: string
  lane: string
  prop: string
  propTip: string
  hud: string
  hudDim: string
  hudPanel: string
  accent: string
  accentSoft: string
  danger: string
  dirt: string
  spark: string
}

/**
 * The game keeps its own palette — a canvas racer that used Fluent surface
 * greys would look like a spreadsheet — but it is tinted from the live OS
 * accent so it never fights the desktop it is running on.
 */
function buildPalette(accentHex: string, dark: boolean): Palette {
  const acc = hexToRgb(accentHex)
  const white: RGB = [255, 255, 255]
  const black: RGB = [0, 0, 0]

  if (dark) {
    const horizon = mixRgb([88, 62, 96], acc, 0.28)
    return {
      letterbox: "#07080d",
      skyTop: css(mixRgb([13, 18, 36], acc, 0.06)),
      skyBot: css(horizon),
      sun: css(mixRgb([255, 186, 120], acc, 0.35), 0.9),
      ridgeFar: css(mixRgb([44, 38, 68], acc, 0.14)),
      ridgeNear: css(mixRgb([25, 22, 44], acc, 0.08)),
      fog: css(horizon),
      grassL: css(mixRgb([30, 56, 46], acc, 0.05)),
      grassD: css(mixRgb([24, 46, 38], acc, 0.05)),
      roadL: "#3b3b46",
      roadD: "#34343e",
      rumbleL: css(acc),
      rumbleD: "#d6dae2",
      lane: "#cfd4de",
      prop: css(mixRgb([36, 32, 56], acc, 0.1)),
      propTip: css(acc),
      hud: "#f2f4f8",
      hudDim: "rgba(242,244,248,.55)",
      hudPanel: "rgba(8,10,18,.55)",
      accent: css(acc),
      accentSoft: css(acc, 0.24),
      danger: "#ff5a4d",
      dirt: css(mixRgb([120, 96, 70], black, 0.1)),
      spark: css(mixRgb(acc, white, 0.55)),
    }
  }

  const horizon = mixRgb([200, 226, 242], acc, 0.14)
  return {
    letterbox: "#dfe6ee",
    skyTop: css(mixRgb([110, 176, 226], acc, 0.14)),
    skyBot: css(horizon),
    sun: "rgba(255,246,214,.95)",
    ridgeFar: css(mixRgb([160, 182, 202], acc, 0.14)),
    ridgeNear: css(mixRgb([126, 152, 176], acc, 0.1)),
    fog: css(horizon),
    grassL: css(mixRgb([100, 150, 82], acc, 0.04)),
    grassD: css(mixRgb([90, 136, 74], acc, 0.04)),
    roadL: "#8d8d97",
    roadD: "#85858f",
    rumbleL: css(acc),
    rumbleD: "#ffffff",
    lane: "#ffffff",
    prop: css(mixRgb([94, 108, 122], acc, 0.1)),
    propTip: css(acc),
    hud: "#12161d",
    hudDim: "rgba(18,22,29,.6)",
    hudPanel: "rgba(255,255,255,.62)",
    accent: css(acc),
    accentSoft: css(acc, 0.24),
    danger: "#c42b1c",
    dirt: "#9c7d56",
    spark: css(mixRgb(acc, [40, 30, 10], 0.25)),
  }
}

/* ------------------------------------------------------------------ *
 * Track
 * ------------------------------------------------------------------ */

type Pt = {
  world: { x: number; y: number; z: number }
  camera: { x: number; y: number; z: number }
  screen: { x: number; y: number; w: number; scale: number }
}

type Car = {
  offset: number
  z: number
  speed: number
  w: number
  drawW: number
  van: boolean
  hue: string
  z0: number
  offset0: number
}

type RivalState = "CRUISE" | "BLOCK" | "SWING" | "RECOVER"

type Rival = {
  name: string
  z: number
  offset: number
  lane: number
  speed: number
  base: number
  hp: number
  state: RivalState
  /** Seconds left in the current state. */
  t: number
  /** Per-rival reaction latency, 180-320ms, so they read as separate drivers. */
  react: number
  /** Countdown before the AI is allowed to react to being alongside. */
  wait: number
  hits: number[]
  down: boolean
  tumble: number
  angVel: number
  fall: number
  lean: number
  swung: boolean
  body: string
  trim: string
  jacket: string
}

type Prop = { offset: number; kind: 0 | 1 }

type Seg = {
  index: number
  p1: Pt
  p2: Pt
  curve: number
  dark: boolean
  looped: boolean
  fog: number
  clip: number
  cars: Car[]
  riders: Rival[]
  prop: Prop | null
  finish: boolean
}

const makePt = (z: number, y: number): Pt => ({
  world: { x: 0, y, z },
  camera: { x: 0, y: 0, z: 0 },
  screen: { x: 0, y: 0, w: 0, scale: 0 },
})

function buildTrack(): Seg[] {
  const segs: Seg[] = []
  const lastY = () => (segs.length === 0 ? 0 : segs[segs.length - 1].p2.world.y)

  const addSegment = (curve: number, y: number) => {
    const n = segs.length
    segs.push({
      index: n,
      p1: makePt(n * SEG_LEN, lastY()),
      p2: makePt((n + 1) * SEG_LEN, y),
      curve,
      dark: Math.floor(n / RUMBLE_LEN) % 2 === 1,
      looped: false,
      fog: 0,
      clip: 0,
      cars: [],
      riders: [],
      prop: null,
      finish: false,
    })
  }

  /**
   * Ease the entry and exit of every curve. A curve that snaps on at full value
   * does not read as a corner, it reads as a bug.
   */
  const addRoad = (enter: number, hold: number, leave: number, curve: number, y: number) => {
    const startY = lastY()
    const endY = startY + y * SEG_LEN
    const total = enter + hold + leave
    for (let n = 0; n < enter; n++) addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total))
    for (let n = 0; n < hold; n++) addSegment(curve, easeInOut(startY, endY, (enter + n) / total))
    for (let n = 0; n < leave; n++)
      addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total))
  }

  // 1 — an empty, flat straight. Nothing to do but find the throttle.
  addRoad(0, 380, 40, 0, 0)
  // 2 — first easy curves.
  addRoad(60, 100, 60, 2.2, 0)
  addRoad(60, 120, 60, -2.6, 0)
  addRoad(40, 100, 40, 0, 0)
  addRoad(50, 90, 50, 3.0, 0)
  // 3 — rivals join; the road starts to move under you.
  addRoad(50, 110, 50, -3.4, 0)
  addRoad(40, 120, 40, 0, 12)
  addRoad(60, 120, 60, 3.6, -12)
  addRoad(40, 100, 40, 0, 0)
  // 4 — hills and heavy traffic.
  addRoad(50, 110, 50, -4.2, 22)
  addRoad(50, 100, 50, 4.4, -22)
  addRoad(40, 120, 40, 0, 30)
  addRoad(60, 110, 60, -5.0, -30)
  addRoad(40, 90, 40, 2.8, 0)
  // 5 — the run home.
  addRoad(60, 100, 60, -3.0, 14)
  addRoad(40, 120, 40, 0, -14)
  while (segs.length < TOTAL_SEGMENTS) addSegment(0, lastY())

  for (let i = FINISH_SEG; i < FINISH_SEG + 5; i++) segs[i].finish = true

  // Roadside furniture. Cheap, and it is most of the sensation of speed.
  const rand = mulberry32(0x7a1c3e)
  for (let n = 30; n < TOTAL_SEGMENTS; n += 9) {
    const side = n % 18 === 30 % 18 ? -1 : 1
    segs[n].prop = { offset: side * (1.22 + rand() * 0.5), kind: rand() > 0.72 ? 1 : 0 }
  }

  return segs
}

const CAR_HUES = ["#c9603f", "#3f6fc9", "#c9a83f", "#4aa06a", "#8a5fc9", "#b8b8c2"]

function buildTraffic(segs: Seg[]): Car[] {
  const rand = mulberry32(0x2f6e2b1)
  const cars: Car[] = []
  const place = (n: number) => {
    const van = rand() > 0.78
    const offset = (rand() * 2 - 1) * 0.72
    const z = n * SEG_LEN + rand() * SEG_LEN
    const speed = MAX_SPEED / 4 + rand() * (MAX_SPEED / (van ? 5 : 3))
    cars.push({
      offset,
      z,
      speed,
      w: van ? W_VAN : W_CAR,
      drawW: van ? DRAW_VAN : DRAW_CAR,
      van,
      hue: CAR_HUES[Math.floor(rand() * CAR_HUES.length) % CAR_HUES.length],
      z0: z,
      offset0: offset,
    })
  }
  for (let n = P_TRAFFIC; n < P_RIVALS; n += 50) place(n)
  for (let n = P_RIVALS; n < P_HEAVY; n += 34) place(n)
  for (let n = P_HEAVY; n < FINISH_SEG - 60; n += 22) place(n)
  return cars
}

/* ------------------------------------------------------------------ *
 * Particles — one preallocated ring buffer, zero per-frame allocation
 * ------------------------------------------------------------------ */

const P_STRIDE = 8 // x, y, vx, vy, life, maxLife, size, kind (0 dirt / 1 spark)

class Particles {
  private d = new Float32Array(PARTICLE_CAP * P_STRIDE)
  private head = 0

  clear() {
    this.d.fill(0)
    this.head = 0
  }

  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, kind: number) {
    const i = this.head * P_STRIDE
    this.head = (this.head + 1) % PARTICLE_CAP
    const d = this.d
    d[i] = x
    d[i + 1] = y
    d[i + 2] = vx
    d[i + 3] = vy
    d[i + 4] = life
    d[i + 5] = life
    d[i + 6] = size
    d[i + 7] = kind
  }

  step(dt: number) {
    const d = this.d
    for (let i = 0; i < d.length; i += P_STRIDE) {
      if (d[i + 4] <= 0) continue
      d[i + 4] -= dt
      if (d[i + 4] <= 0) continue
      d[i] += d[i + 2] * dt
      d[i + 1] += d[i + 3] * dt
      d[i + 3] += (d[i + 7] === 0 ? 900 : 620) * dt
      d[i + 2] -= d[i + 2] * Math.min(1, 1.7 * dt)
    }
  }

  /** Two passes so `lighter` is set and restored once, not once per particle. */
  draw(ctx: CanvasRenderingContext2D, dirt: string, spark: string) {
    const d = this.d
    ctx.fillStyle = dirt
    for (let i = 0; i < d.length; i += P_STRIDE) {
      if (d[i + 4] <= 0 || d[i + 7] !== 0) continue
      const a = d[i + 4] / d[i + 5]
      ctx.globalAlpha = a * 0.75
      const s = d[i + 6] * (0.4 + a * 0.6)
      ctx.fillRect(d[i] - s / 2, d[i + 1] - s / 2, s, s)
    }
    ctx.globalAlpha = 1

    let anySpark = false
    for (let i = 0; i < d.length; i += P_STRIDE) {
      if (d[i + 4] > 0 && d[i + 7] === 1) {
        anySpark = true
        break
      }
    }
    if (!anySpark) return

    ctx.globalCompositeOperation = "lighter"
    ctx.strokeStyle = spark
    ctx.lineCap = "round"
    for (let i = 0; i < d.length; i += P_STRIDE) {
      if (d[i + 4] <= 0 || d[i + 7] !== 1) continue
      const a = d[i + 4] / d[i + 5]
      ctx.globalAlpha = a
      ctx.lineWidth = d[i + 6] * a
      ctx.beginPath()
      ctx.moveTo(d[i], d[i + 1])
      ctx.lineTo(d[i] - d[i + 2] * 0.018, d[i + 1] - d[i + 3] * 0.018)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = "source-over"
  }
}

/* ------------------------------------------------------------------ *
 * Audio — synthesised, no files, no licensing, no loop-point click
 *
 * This deliberately does not use lib/os/sfx.ts: that caches exactly one
 * HTMLAudioElement per name and rewinds it, so two impacts inside one sound's
 * length cut each other off. It sits beside it and shares the Quick Settings
 * volume and mute values, so the OS slider still governs it.
 * ------------------------------------------------------------------ */

type Ctor = typeof AudioContext

class RaceAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private engGain: GainNode | null = null
  private lp: BiquadFilterNode | null = null
  private o1: OscillatorNode | null = null
  private o2: OscillatorNode | null = null
  private windGain: GainNode | null = null
  private windSrc: AudioBufferSourceNode | null = null
  private noise: AudioBuffer | null = null
  private lastImpact = 0
  private vol = 0.65
  private muted = false
  private enabled = true
  private dead = false

  private ensure(): AudioContext | null {
    if (this.dead || typeof window === "undefined") return null
    if (this.ctx) return this.ctx
    const C: Ctor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext
    if (!C) {
      this.dead = true
      return null
    }
    try {
      const ctx = new C()
      const master = ctx.createGain()
      master.gain.value = 0
      master.connect(ctx.destination)

      // Two saws, one detuned seven cents, through a lowpass. The detune is what
      // stops it reading as a test tone.
      const lp = ctx.createBiquadFilter()
      lp.type = "lowpass"
      lp.frequency.value = 900
      lp.Q.value = 3
      const engGain = ctx.createGain()
      engGain.gain.value = 0
      lp.connect(engGain)
      engGain.connect(master)

      const o1 = ctx.createOscillator()
      o1.type = "sawtooth"
      o1.frequency.value = 70
      const o2 = ctx.createOscillator()
      o2.type = "sawtooth"
      o2.frequency.value = 70
      o2.detune.value = 7
      o1.connect(lp)
      o2.connect(lp)
      o1.start()
      o2.start()

      // Two seconds of white noise, band-passed, looped for wind.
      const len = Math.floor(ctx.sampleRate * 2)
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const ch = buf.getChannelData(0)
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1
      const bp = ctx.createBiquadFilter()
      bp.type = "bandpass"
      bp.frequency.value = 800
      bp.Q.value = 0.8
      const windGain = ctx.createGain()
      windGain.gain.value = 0
      const windSrc = ctx.createBufferSource()
      windSrc.buffer = buf
      windSrc.loop = true
      windSrc.connect(bp)
      bp.connect(windGain)
      windGain.connect(master)
      windSrc.start()

      this.ctx = ctx
      this.master = master
      this.lp = lp
      this.engGain = engGain
      this.o1 = o1
      this.o2 = o2
      this.windGain = windGain
      this.windSrc = windSrc
      this.noise = buf
      this.applyMaster()
      return ctx
    } catch {
      this.dead = true
      return null
    }
  }

  private applyMaster() {
    if (!this.ctx || !this.master) return
    const target = this.enabled && !this.muted ? this.vol * 0.5 : 0
    try {
      this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05)
    } catch {
      /* ignore */
    }
  }

  setVolume(v: number, muted: boolean) {
    this.vol = clamp(v / 100, 0, 1)
    this.muted = muted
    this.applyMaster()
  }

  setEnabled(on: boolean) {
    this.enabled = on
    // Never build the context here: before a user gesture it would only be
    // created suspended, and the browser would rightly complain. wake() owns it.
    this.applyMaster()
  }

  /** Called from a user gesture, so the context is allowed to start. */
  wake() {
    const ctx = this.ensure()
    if (!ctx) return
    if (ctx.state === "suspended") void ctx.resume().catch(() => {})
    this.applyMaster()
  }

  idle() {
    if (!this.ctx) return
    try {
      this.engGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05)
      this.windGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05)
      void this.ctx.suspend().catch(() => {})
    } catch {
      /* ignore */
    }
  }

  /**
   * Five fake gears. `(speedPercent * 5) % 1` is the entire trick, and it is the
   * difference between a motorbike and a siren.
   */
  engine(sp: number, throttle: boolean, offRoad: boolean) {
    const ctx = this.ctx
    if (!ctx || !this.enabled || ctx.state !== "running") return
    const t = ctx.currentTime
    const gearFrac = (sp * 5) % 1
    const hz = 70 + 240 * gearFrac
    try {
      this.o1?.frequency.setTargetAtTime(hz, t, 0.04)
      this.o2?.frequency.setTargetAtTime(hz * 1.004, t, 0.04)
      this.lp?.frequency.setTargetAtTime(500 + 2400 * sp + (offRoad ? 0 : 200), t, 0.06)
      this.engGain?.gain.setTargetAtTime(0.1 + (throttle ? 0.14 : 0.05) * (0.4 + sp), t, 0.04)
      this.windGain?.gain.setTargetAtTime(Math.max(0, sp - 0.55) * 0.35, t, 0.08)
    } catch {
      /* ignore */
    }
  }

  /** A 40ms noise burst with a 2000 -> 200Hz sweep. Never retriggers inside 60ms. */
  impact(strength: number) {
    const ctx = this.ctx
    if (!ctx || !this.enabled || !this.noise || !this.master || ctx.state !== "running") return
    const now = ctx.currentTime
    if (now - this.lastImpact < 0.06) return
    this.lastImpact = now
    try {
      const src = ctx.createBufferSource()
      src.buffer = this.noise
      src.loop = false
      // Random detune and level per shot: two identical impacts never sound alike.
      src.detune.value = (Math.random() * 2 - 1) * 80
      src.playbackRate.value = 1
      const start = Math.random() * 1.5

      const f = ctx.createBiquadFilter()
      f.type = "lowpass"
      f.Q.value = 1
      f.frequency.setValueAtTime(2000, now)
      f.frequency.exponentialRampToValueAtTime(200, now + 0.09)

      const g = ctx.createGain()
      const peak = clamp(0.7 * strength * (0.85 + Math.random() * 0.3), 0.02, 1)
      g.gain.setValueAtTime(0.0001, now)
      g.gain.exponentialRampToValueAtTime(peak, now + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09)

      src.connect(f)
      f.connect(g)
      g.connect(this.master)
      src.start(now, start, 0.05)
      src.stop(now + 0.12)
      src.onended = () => {
        try {
          src.disconnect()
          f.disconnect()
          g.disconnect()
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  dispose() {
    this.dead = true
    const nodes = [this.o1, this.o2, this.lp, this.engGain, this.windSrc, this.windGain, this.master]
    for (const n of nodes) {
      try {
        n?.disconnect()
      } catch {
        /* ignore */
      }
    }
    try {
      this.o1?.stop()
      this.o2?.stop()
      this.windSrc?.stop()
    } catch {
      /* ignore */
    }
    try {
      void this.ctx?.close().catch(() => {})
    } catch {
      /* ignore */
    }
    this.ctx = null
    this.master = null
    this.engGain = null
    this.lp = null
    this.o1 = null
    this.o2 = null
    this.windGain = null
    this.windSrc = null
    this.noise = null
  }
}

/* ------------------------------------------------------------------ *
 * Drawing primitives
 * ------------------------------------------------------------------ */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

function quad(
  ctx: CanvasRenderingContext2D,
  color: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.lineTo(x4, y4)
  ctx.closePath()
  ctx.fill()
}

const rumbleWidth = (w: number) => w / Math.max(6, 2 * LANES)
const laneWidth = (w: number) => w / Math.max(32, 8 * LANES)

/**
 * A rider, drawn in a 100-unit space with the origin at the tyre contact patch.
 * Eight filled paths and a lean transform beats five rivals times eight steering
 * frames times three damage states, and it stays crisp at every scale.
 */
function drawRider(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  wpx: number,
  lean: number,
  body: string,
  trim: string,
  jacket: string,
  punch: number,
  punchSide: number,
  tumble: number,
) {
  if (wpx < 2.5) return
  const s = wpx / 100
  ctx.save()
  ctx.translate(cx, baseY)
  if (tumble !== 0) ctx.rotate(tumble)
  ctx.scale(s, s)
  ctx.rotate(clamp(lean, -1, 1) * 0.2)

  // 1 — contact shadow
  ctx.globalAlpha = 0.3
  ctx.fillStyle = "#000"
  ctx.beginPath()
  ctx.ellipse(0, 1, 48, 10, 0, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1

  // 2 — rear tyre
  ctx.fillStyle = "#14151a"
  roundRect(ctx, -14, -56, 28, 58, 12)
  ctx.fill()

  // 3 — swingarm and pipe
  ctx.fillStyle = trim
  roundRect(ctx, 13, -38, 27, 9, 4)
  ctx.fill()
  roundRect(ctx, -40, -38, 27, 9, 4)
  ctx.fill()

  // 4 — tail bodywork
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(-27, -50)
  ctx.lineTo(27, -50)
  ctx.lineTo(19, -90)
  ctx.lineTo(-19, -90)
  ctx.closePath()
  ctx.fill()

  // 5 — brake light
  ctx.fillStyle = trim
  roundRect(ctx, -11, -62, 22, 7, 3)
  ctx.fill()

  // 6 — torso
  ctx.fillStyle = jacket
  ctx.beginPath()
  ctx.moveTo(-24, -84)
  ctx.lineTo(24, -84)
  ctx.lineTo(17, -132)
  ctx.lineTo(-17, -132)
  ctx.closePath()
  ctx.fill()

  // 7 — arms; the striking one reaches out through the three attack phases
  ctx.fillStyle = jacket
  const reach = clamp(punch, -0.4, 1) * 54
  for (const side of [-1, 1] as const) {
    const out = side === punchSide ? Math.max(-9, reach) : 0
    ctx.save()
    ctx.translate(side * 20, -122)
    ctx.rotate(side * (0.25 + (out / 54) * 0.75))
    roundRect(ctx, -6, -6, 13 + out, 13, 6)
    ctx.fill()
    if (out > 6) {
      ctx.fillStyle = trim
      ctx.beginPath()
      ctx.arc(7 + out, 0, 8, 0, TAU)
      ctx.fill()
      ctx.fillStyle = jacket
    }
    ctx.restore()
  }

  // 8 — helmet and visor
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.arc(0, -144, 18, 0, TAU)
  ctx.fill()
  ctx.fillStyle = "rgba(16,20,30,.88)"
  roundRect(ctx, -16, -151, 32, 10, 4)
  ctx.fill()

  ctx.restore()
}

function drawVehicle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  wpx: number,
  hue: string,
  van: boolean,
) {
  if (wpx < 3) return
  const s = wpx / 100
  ctx.save()
  ctx.translate(cx, baseY)
  ctx.scale(s, s)

  ctx.globalAlpha = 0.32
  ctx.fillStyle = "#000"
  ctx.beginPath()
  ctx.ellipse(0, 1, 52, 9, 0, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1

  const bodyH = van ? 108 : 74
  ctx.fillStyle = "#15161b"
  roundRect(ctx, -48, -18, 22, 20, 5)
  ctx.fill()
  roundRect(ctx, 26, -18, 22, 20, 5)
  ctx.fill()

  ctx.fillStyle = hue
  roundRect(ctx, -46, -bodyH, 92, bodyH - 2, 9)
  ctx.fill()

  ctx.fillStyle = "rgba(18,22,32,.78)"
  roundRect(ctx, -36, -bodyH + 8, 72, van ? 46 : 28, 6)
  ctx.fill()

  ctx.fillStyle = "#ff5a4d"
  roundRect(ctx, -42, -28, 18, 9, 4)
  ctx.fill()
  roundRect(ctx, 24, -28, 18, 9, 4)
  ctx.fill()

  ctx.restore()
}

/* ------------------------------------------------------------------ *
 * Engine
 * ------------------------------------------------------------------ */

type Result = {
  time: number
  downed: number
  topKph: number
  best: number | null
  isBest: boolean
}

type EngineOpts = {
  onFinish: (r: Result) => void
  onStatus: (s: string) => void
}

const RIVAL_POOL: { name: string; body: string; trim: string; jacket: string }[] = [
  { name: "LANGCHAIN", body: "#2f9e6a", trim: "#d8f3e4", jacket: "#1d6b48" },
  { name: "FASTAPI", body: "#2f7fd0", trim: "#dce9f8", jacket: "#1d5590" },
  { name: "NEXT.JS", body: "#c9573f", trim: "#f8dcd4", jacket: "#8d3527" },
]

function createEngine(canvas: HTMLCanvasElement, wrap: HTMLElement, opts: EngineOpts) {
  const ctx2d = canvas.getContext("2d", { alpha: false })
  if (!ctx2d) return null
  const ctx = ctx2d

  const segments = buildTrack()
  const traffic = buildTraffic(segments)
  const particles = new Particles()
  const audio = new RaceAudio()

  /* --- view ----------------------------------------------------- */
  const view = { cssW: 640, cssH: 360, LW: 800, LH: LOGICAL_H, s: 1, ox: 0, oy: 0, dpr: 1 }
  let dprCap = 2
  let sky: CanvasGradient | null = null
  let palette = buildPalette("#4cc2ff", true)

  /* --- run state ------------------------------------------------- */
  let running = false
  let raf = 0
  let last = 0
  let acc = 0
  let freeze = 0
  let frame = 0

  let position = 0
  let traveled = 0
  let speed = 0
  let playerX = 0
  let playerY = 0
  let steer = 0
  let camLead = 0
  let fov = FOV_BASE
  let cameraDepth = 1 / Math.tan(((FOV_BASE / 2) * Math.PI) / 180)
  let playerZ = CAM_HEIGHT * cameraDepth
  let offRoadTimer = 0
  let bgOffset = 0
  let bounce = 0

  let hp = HP_MAX
  let invuln = 0
  let downedRivals = 0
  let topSpeed = 0
  let elapsed = 0
  let finished = true
  let flash = 0
  let flashDanger = false

  let trauma = 0
  let shakeX = 0
  let shakeY = 0
  let shakeR = 0
  let motion = 1 // 0 under prefers-reduced-motion

  let atkPhase: "idle" | "windup" | "strike" | "recovery" = "idle"
  let atkT = 0
  let atkSide = 1
  let buffered: { side: number; at: number } | null = null

  let rivals: Rival[] = []
  let rivalsSpawned = 0
  let meleeHintShown = false
  let hintText = ""
  let hintT = 0

  const held = new Set<string>()
  const speedLines = new Float32Array(22 * 4)
  let speedLineCount = 0

  /* --- perf watchdog --------------------------------------------- */
  let frameAvg = 16
  let slowFrames = 0

  /* ------------------------------------------------------------ *
   * Layout
   * ------------------------------------------------------------ */

  function layout() {
    const cssW = Math.max(160, wrap.clientWidth)
    const cssH = Math.max(120, wrap.clientHeight)
    const dpr = Math.min(dprCap, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1)
    // Logical height is fixed, so resizing the window reframes the shot — it
    // never changes how hard the race is.
    const LW = Math.round(clamp((LOGICAL_H * cssW) / cssH, 640, 1000))
    const s = Math.min(cssW / LW, cssH / LOGICAL_H)
    const ox = (cssW - LW * s) / 2
    const oy = (cssH - LOGICAL_H * s) / 2

    view.cssW = cssW
    view.cssH = cssH
    view.LW = LW
    view.LH = LOGICAL_H
    view.s = s
    view.ox = ox
    view.oy = oy
    view.dpr = dpr

    const pw = Math.round(cssW * dpr)
    const ph = Math.round(cssH * dpr)
    if (canvas.width !== pw) canvas.width = pw
    if (canvas.height !== ph) canvas.height = ph
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    // One transform per resize, never per frame.
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy)
    buildSky()
    if (!running) render()
  }

  function buildSky() {
    try {
      const g = ctx.createLinearGradient(0, -40, 0, view.LH * 0.56)
      g.addColorStop(0, palette.skyTop)
      g.addColorStop(1, palette.skyBot)
      sky = g
    } catch {
      sky = null
    }
  }

  function setTheme(accentHex: string, dark: boolean) {
    palette = buildPalette(accentHex, dark)
    buildSky()
    if (!running) render()
  }

  function setMotion(reduced: boolean) {
    motion = reduced ? 0 : 1
  }

  /* ------------------------------------------------------------ *
   * Lifecycle
   * ------------------------------------------------------------ */

  function reset() {
    position = 0
    traveled = 0
    speed = 0
    playerX = 0
    playerY = 0
    steer = 0
    camLead = 0
    fov = FOV_BASE
    recomputeCamera()
    offRoadTimer = 0
    bgOffset = 0
    bounce = 0
    hp = HP_MAX
    invuln = 0
    downedRivals = 0
    topSpeed = 0
    elapsed = 0
    flash = 0
    trauma = 0
    shakeX = shakeY = shakeR = 0
    freeze = 0
    acc = 0
    atkPhase = "idle"
    atkT = 0
    buffered = null
    rivals = []
    rivalsSpawned = 0
    meleeHintShown = false
    particles.clear()
    held.clear()

    for (const seg of segments) {
      if (seg.cars.length) seg.cars.length = 0
      if (seg.riders.length) seg.riders.length = 0
    }
    for (const car of traffic) {
      car.z = car.z0
      car.offset = car.offset0
      findSegment(car.z).cars.push(car)
    }
    setHint("HOLD  W  /  ↑   TO  ACCELERATE", 4.5)
  }

  function start() {
    reset()
    finished = false
    audio.wake()
    setRunning(true)
  }

  function setRunning(on: boolean) {
    if (on === running) return
    running = on
    if (on) {
      // dt of the first frame after a resume must be ~0, or the bike teleports.
      last = typeof performance !== "undefined" ? performance.now() : Date.now()
      acc = 0
      audio.wake()
      raf = requestAnimationFrame(loop)
    } else {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      audio.idle()
    }
  }

  function dispose() {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    running = false
    audio.dispose()
  }

  /* ------------------------------------------------------------ *
   * Input
   * ------------------------------------------------------------ */

  const ATTACK_KEYS: Record<string, number> = { j: -1, l: 1 }

  function keyDown(key: string): boolean {
    const k = key.length === 1 ? key.toLowerCase() : key
    if (k === "j" || k === "l") {
      const side = ATTACK_KEYS[k]
      const now = typeof performance !== "undefined" ? performance.now() : Date.now()
      if (atkPhase === "idle" && freeze <= 0) startAttack(side)
      else buffered = { side, at: now }
      held.add(k)
      return true
    }
    if (
      k === "w" || k === "a" || k === "s" || k === "d" || k === "k" ||
      k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight" || k === " "
    ) {
      held.add(k)
      return true
    }
    return false
  }

  function keyUp(key: string): boolean {
    const k = key.length === 1 ? key.toLowerCase() : key
    if (held.has(k)) {
      held.delete(k)
      return true
    }
    return false
  }

  function releaseAll() {
    held.clear()
  }

  const up = () => held.has("w") || held.has("ArrowUp")
  const down = () => held.has("s") || held.has("ArrowDown") || held.has(" ") || held.has("k")
  const left = () => held.has("a") || held.has("ArrowLeft")
  const right = () => held.has("d") || held.has("ArrowRight")

  /* ------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------ */

  const findSegment = (z: number) => segments[Math.floor(z / SEG_LEN) % segments.length]

  function recomputeCamera() {
    // cameraDepth and playerZ must move together or the bike drifts in frame.
    cameraDepth = 1 / Math.tan(((fov / 2) * Math.PI) / 180)
    playerZ = CAM_HEIGHT * cameraDepth
  }

  function project(p: Pt, camX: number, camY: number, camZ: number, W: number, H: number) {
    p.camera.x = (p.world.x || 0) - camX
    p.camera.y = (p.world.y || 0) - camY
    p.camera.z = (p.world.z || 0) - camZ
    p.screen.scale = cameraDepth / p.camera.z
    p.screen.x = Math.round(W / 2 + (p.screen.scale * p.camera.x * W) / 2)
    p.screen.y = Math.round(H / 2 - (p.screen.scale * p.camera.y * H) / 2)
    p.screen.w = Math.round((p.screen.scale * ROAD_W * W) / 2)
  }

  function addTrauma(v: number) {
    trauma = clamp(trauma + v * motion, 0, 1)
  }

  function setHint(text: string, seconds: number) {
    hintText = text
    hintT = seconds
  }

  function sparks(n: number, x: number, y: number, spread: number) {
    const count = Math.round(n * motion)
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU
      const v = 400 + Math.random() * 500
      particles.spawn(
        x + (Math.random() - 0.5) * spread,
        y + (Math.random() - 0.5) * spread,
        Math.cos(a) * v,
        Math.sin(a) * v - 120,
        0.15 + Math.random() * 0.15,
        1.6 + Math.random() * 1.8,
        1,
      )
    }
  }

  /* ------------------------------------------------------------ *
   * Combat
   * ------------------------------------------------------------ */

  function startAttack(side: number) {
    atkPhase = "windup"
    atkT = WINDUP
    atkSide = side
    buffered = null
  }

  function alongside(r: Rival) {
    if (r.down) return false
    const dz = wrapDelta(r.z, increase(position, playerZ, TRACK_LEN))
    return Math.abs(dz) < ALONGSIDE_Z && Math.abs(r.offset - playerX) < ALONGSIDE_X
  }

  function resolvePlayerStrike() {
    let target: Rival | null = null
    let bestGap = Infinity
    for (const r of rivals) {
      if (!alongside(r)) continue
      const rel = r.offset - playerX
      if (Math.sign(rel) !== Math.sign(atkSide) && Math.abs(rel) > 0.03) continue
      const gap = Math.abs(rel)
      if (gap < bestGap) {
        bestGap = gap
        target = r
      }
    }
    if (!target) return

    const blocked = target.state === "BLOCK"
    const dmg = blocked ? 6 : 18
    target.hp -= dmg
    target.hits.push(elapsed)

    const px = view.LW / 2 - camLead * view.LW
    const hx = px + atkSide * view.LW * 0.1
    const hy = view.LH * 0.7

    if (blocked) {
      hp = Math.max(0, hp - 4) // a good block reflects
      addTrauma(0.2)
      freeze = Math.max(freeze, 0.05)
      sparks(8, hx, hy, 16)
      audio.impact(0.5)
    } else {
      addTrauma(0.35)
      freeze = Math.max(freeze, 0.07)
      sparks(14, hx, hy, 18)
      audio.impact(0.9)
    }
    flash = 0.35
    flashDanger = false

    if (target.hp <= 0 && !target.down) {
      target.down = true
      target.angVel = (Math.random() > 0.5 ? 1 : -1) * (2.6 + Math.random())
      target.fall = 1.2
      downedRivals++
      freeze = Math.max(freeze, 0.14)
      addTrauma(0.6)
      sparks(40, hx, hy, 40)
      audio.impact(1)
      setHint(`${target.name}  DOWN`, 1.8)
    }
  }

  function playerWipeout() {
    hp = HP_MAX
    invuln = 1.5
    speed = MAX_SPEED * 0.35
    freeze = Math.max(freeze, 0.22)
    addTrauma(0.8)
    flash = 0.85
    flashDanger = true
    sparks(40, view.LW / 2 - camLead * view.LW, view.LH * 0.78, 46)
    audio.impact(1)
    setHint("DOWN  —  BACK  ON  THE  BIKE", 1.6)
  }

  function hurtPlayer(dmg: number) {
    if (invuln > 0) return
    hp -= dmg
    flash = 0.6
    flashDanger = true
    if (hp <= 0) playerWipeout()
  }

  /* ------------------------------------------------------------ *
   * Rivals
   * ------------------------------------------------------------ */

  function spawnRival(i: number) {
    const spec = RIVAL_POOL[i % RIVAL_POOL.length]
    const lane = i % 2 === 0 ? -0.34 : 0.34
    const r: Rival = {
      name: spec.name,
      z: increase(position, playerZ + SEG_LEN * (7 + i * 5), TRACK_LEN),
      offset: lane,
      lane,
      speed: Math.max(MAX_SPEED * 0.45, speed * 0.96),
      base: MAX_SPEED * 0.52,
      hp: HP_MAX,
      state: "CRUISE",
      t: 0,
      // 180-320ms, drawn once, so the pack reads as three drivers and not one
      // algorithm running three times.
      react: 0.18 + Math.random() * 0.14,
      wait: 0,
      hits: [],
      down: false,
      tumble: 0,
      angVel: 0,
      fall: 0,
      lean: 0,
      swung: false,
      body: spec.body,
      trim: spec.trim,
      jacket: spec.jacket,
    }
    rivals.push(r)
    // Bucket it immediately: `rebucket` only moves a rider between segments, so
    // one that is never inserted is never drawn.
    findSegment(r.z).riders.push(r)
    rivalsSpawned++
  }

  function updateRival(r: Rival, dt: number, finalPhase: boolean) {
    const oldSeg = findSegment(r.z)

    if (r.down) {
      r.fall -= dt
      r.tumble += r.angVel * dt
      r.speed = Math.max(0, r.speed - MAX_SPEED * 0.8 * dt)
      r.z = increase(r.z, dt * r.speed, TRACK_LEN)
      rebucket(r, oldSeg)
      return
    }

    // Rubber band. It keeps the pack on screen and can never outrun a good
    // rider, which is the version that does not feel cheap.
    const lo = r.base * 0.6
    const hi = Math.max(lo, speed * 1.04)
    let target = Math.min(hi, Math.max(lo, speed * 0.94))
    const behind = wrapDelta(increase(position, playerZ, TRACK_LEN), r.z)
    if (behind > 2 * Math.max(speed, MAX_SPEED * 0.3)) target *= 1.08
    if (finalPhase) target *= 1.06
    r.speed += (target - r.speed) * (1 - Math.exp(-2.5 * dt))

    // Lateral line.
    const near = alongside(r)
    let want = r.lane
    if (r.state === "BLOCK" || (near && r.state !== "RECOVER")) want = playerX
    // Cheap traffic dodge: look a few segments ahead for anything in the way.
    for (let i = 1; i < 10; i++) {
      const s = segments[(oldSeg.index + i) % segments.length]
      let hit = false
      for (let c = 0; c < s.cars.length; c++) {
        if (overlap(r.offset, W_RIVAL, s.cars[c].offset, s.cars[c].w, 1.25)) {
          want = r.offset + (s.cars[c].offset > r.offset ? -0.45 : 0.45)
          hit = true
          break
        }
      }
      if (hit) break
    }
    const lateral = (r.state === "BLOCK" ? 1.9 : 1.1) * dt
    r.offset += clamp(want - r.offset, -lateral, lateral)
    r.offset = clamp(r.offset, -0.92, 0.92)
    r.lean = clamp((want - r.offset) * 5, -1, 1)

    // Four-state AI.
    r.t -= dt
    if (r.state === "CRUISE") {
      if (near) {
        r.wait -= dt
        if (r.wait <= 0) {
          r.hits = r.hits.filter((h) => elapsed - h < 2)
          // Hit twice inside two seconds and it starts blocking. That is what
          // stops mashing from winning.
          const blockP = r.hits.length >= 2 ? 0.6 : 0.25
          if (Math.random() < blockP) {
            r.state = "BLOCK"
            r.t = 0.6
          } else {
            r.state = "SWING"
            r.t = 0.16
            r.swung = false
          }
        }
      } else {
        r.wait = r.react
      }
    } else if (r.state === "SWING") {
      if (!r.swung && r.t <= 0.08) {
        r.swung = true
        if (alongside(r)) {
          hurtPlayer(14)
          addTrauma(0.55)
          freeze = Math.max(freeze, 0.12)
          sparks(12, view.LW / 2 - camLead * view.LW + (r.offset > playerX ? 60 : -60), view.LH * 0.72, 18)
          audio.impact(0.85)
        }
      }
      if (r.t <= 0) {
        r.state = "RECOVER"
        r.t = 0.45 + Math.random() * 0.3
      }
    } else if (r.state === "BLOCK") {
      if (r.t <= 0) {
        r.state = "RECOVER"
        r.t = 0.3
      }
    } else if (r.t <= 0) {
      r.state = "CRUISE"
      r.wait = r.react
    }

    r.z = increase(r.z, dt * r.speed, TRACK_LEN)
    rebucket(r, oldSeg)
  }

  function rebucket(r: Rival, oldSeg: Seg) {
    const next = findSegment(r.z)
    if (next === oldSeg) return
    const i = oldSeg.riders.indexOf(r)
    if (i >= 0) oldSeg.riders.splice(i, 1)
    next.riders.push(r)
  }

  /* ------------------------------------------------------------ *
   * Traffic
   * ------------------------------------------------------------ */

  function updateTraffic(dt: number, playerSeg: Seg) {
    for (let n = 0; n < traffic.length; n++) {
      const car = traffic[n]
      const oldSeg = findSegment(car.z)
      car.offset += carAvoid(car, oldSeg, playerSeg, dt)
      car.offset = clamp(car.offset, -0.86, 0.86)
      car.z = increase(car.z, dt * car.speed, TRACK_LEN)
      const next = findSegment(car.z)
      if (next !== oldSeg) {
        const i = oldSeg.cars.indexOf(car)
        if (i >= 0) oldSeg.cars.splice(i, 1)
        next.cars.push(car)
      }
    }
  }

  function carAvoid(car: Car, seg: Seg, playerSeg: Seg, dt: number) {
    let dir = 0
    for (let i = 1; i < 12; i++) {
      const s = segments[(seg.index + i) % segments.length]
      if (s === playerSeg && speed > car.speed && overlap(playerX, W_PLAYER, car.offset, car.w, 1.2)) {
        dir = playerX > car.offset ? -1 : 1
        break
      }
      for (let j = 0; j < s.cars.length; j++) {
        const other = s.cars[j]
        if (car.speed > other.speed && overlap(car.offset, car.w, other.offset, other.w, 1.2)) {
          dir = other.offset > car.offset ? -1 : 1
          break
        }
      }
      if (dir) break
    }
    if (dir === 0) {
      // Drift gently back toward the lane it started in.
      return clamp(car.offset0 - car.offset, -0.25 * dt, 0.25 * dt)
    }
    return dir * dt * 2 * (car.speed / MAX_SPEED)
  }

  /* ------------------------------------------------------------ *
   * Simulation — one fixed 1/60 tick
   * ------------------------------------------------------------ */

  function update(dt: number) {
    elapsed += dt
    const sp = speed / MAX_SPEED
    if (speed > topSpeed) topSpeed = speed

    const playerSeg = findSegment(increase(position, playerZ, TRACK_LEN))
    const segIdx = playerSeg.index
    const finalPhase = segIdx >= P_FINAL

    // Rival spawning by track phase.
    if (rivalsSpawned < 2 && segIdx >= P_RIVALS) {
      while (rivalsSpawned < 2) spawnRival(rivalsSpawned)
      setHint("RIVALS  ON  YOUR  WHEEL", 2.5)
    }
    if (rivalsSpawned < 3 && segIdx >= P_HEAVY) {
      spawnRival(rivalsSpawned)
      setHint("TRAFFIC  —  PICK  YOUR  LINE", 2.5)
    }
    if (finalPhase && hintT <= 0 && segIdx < P_FINAL + 30) setHint("FINAL  RUN", 2.4)

    // Steering authority scales with speed; a parked bike does not turn.
    const dx = dt * 2 * sp
    const steerInput = (right() ? 1 : 0) - (left() ? 1 : 0)
    // Physics uses the discrete input; `steer` is the smoothed lean the rider
    // is drawn with, so the bike rolls into a turn instead of snapping to it.
    steer += (steerInput - steer) * (1 - Math.exp(-11 * dt))

    position = increase(position, dt * speed, TRACK_LEN)
    traveled += dt * speed

    playerX += steerInput * dx
    // The corner pushes you out. This is the whole reason a corner is a corner.
    playerX -= dx * sp * playerSeg.curve * CENTRIFUGAL

    if (up()) speed += ACCEL * dt
    else if (down()) speed += BRAKING * dt
    else speed += DECEL * dt

    const off = Math.abs(playerX) > 1
    if (off) offRoadTimer += dt
    else offRoadTimer = 0

    if (off && speed > OFF_ROAD_LIMIT && offRoadTimer > OFF_ROAD_GRACE) {
      speed += OFF_ROAD_DECEL * dt
      if (motion > 0) trauma = Math.max(trauma, 0.15)
      // Dirt, thrown from under the tyre.
      const px = view.LW / 2 - camLead * view.LW
      for (let i = 0; i < 3; i++) {
        if (motion === 0) break
        particles.spawn(
          px + (Math.random() - 0.5) * 40,
          view.LH * 0.93,
          (Math.random() - 0.5) * 200 - steerInput * 120,
          -80 - Math.random() * 160,
          0.35 + Math.random() * 0.25,
          2 + Math.random() * 2.5,
          0,
        )
      }
    }

    playerX = clamp(playerX, -2, 2)
    speed = clamp(speed, 0, MAX_SPEED)

    // Traffic.
    updateTraffic(dt, playerSeg)
    if (invuln <= 0) {
      for (let i = 0; i < playerSeg.cars.length; i++) {
        const car = playerSeg.cars[i]
        if (speed <= car.speed) continue
        if (!overlap(playerX, W_PLAYER, car.offset, car.w, 0.8)) continue
        speed = MAX_SPEED / 5
        const before = position
        position = increase(playerSeg.p1.world.z, -playerZ, TRACK_LEN)
        // Keep `traveled` honest: the snap-back costs exactly what it removed.
        traveled = Math.max(0, traveled - wrapDelta(before, position))
        freeze = Math.max(freeze, 0.2)
        addTrauma(0.6)
        flash = 0.5
        flashDanger = true
        sparks(14, view.LW / 2 - camLead * view.LW, view.LH * 0.8, 40)
        audio.impact(0.95)
        hurtPlayer(10)
        break
      }
    }

    // Rivals.
    for (let i = 0; i < rivals.length; i++) updateRival(rivals[i], dt, finalPhase)
    if (!meleeHintShown) {
      for (const r of rivals) {
        if (alongside(r)) {
          meleeHintShown = true
          setHint("J  /  L   TO  STRIKE  LEFT  /  RIGHT", 4)
          break
        }
      }
    }
    // Retire the fallen once they are well behind.
    for (let i = rivals.length - 1; i >= 0; i--) {
      const r = rivals[i]
      if (r.down && r.fall <= -1.2) {
        const seg = findSegment(r.z)
        const j = seg.riders.indexOf(r)
        if (j >= 0) seg.riders.splice(j, 1)
        rivals.splice(i, 1)
      }
    }

    // Attack state machine.
    if (atkPhase !== "idle") {
      atkT -= dt
      if (atkT <= 0) {
        if (atkPhase === "windup") {
          atkPhase = "strike"
          atkT = STRIKE
          resolvePlayerStrike()
        } else if (atkPhase === "strike") {
          atkPhase = "recovery"
          atkT = RECOVERY
        } else {
          atkPhase = "idle"
          atkT = 0
          const now = typeof performance !== "undefined" ? performance.now() : Date.now()
          if (buffered && now - buffered.at <= BUFFER_MS) startAttack(buffered.side)
          else buffered = null
        }
      }
    }

    if (invuln > 0) invuln -= dt

    // Presentation, still on the fixed clock so it cannot drift with framerate.
    const targetFov = FOV_BASE + FOV_RUSH * sp
    fov += (targetFov - fov) * (1 - Math.exp(-4 * dt))
    recomputeCamera()
    const targetLead = CAM_LEAD * steerInput * sp
    camLead += (targetLead - camLead) * (1 - Math.exp(-8 * dt))

    bgOffset += playerSeg.curve * sp * dt * 12
    const grade = playerSeg.p2.world.y - playerSeg.p1.world.y
    bounce = clamp(lerp(bounce, 0, 1 - Math.exp(-9 * dt)) + grade * sp * 0.0016, -7, 7)

    trauma = Math.max(0, trauma - 1.6 * dt)
    flash = Math.max(0, flash - dt * 3.2)
    if (hintT > 0) hintT -= dt

    particles.step(dt)

    if (traveled >= FINISH_DIST) finish()
  }

  function finish() {
    if (finished) return
    finished = true
    setRunning(false)
    let best: number | null = null
    try {
      const raw = localStorage.getItem(BEST_KEY)
      if (raw) {
        const n = Number(raw)
        if (Number.isFinite(n) && n > 0) best = n
      }
    } catch {
      /* private mode: no personal best, no crash */
    }
    const isBest = best === null || elapsed < best
    if (isBest) {
      try {
        localStorage.setItem(BEST_KEY, String(elapsed))
      } catch {
        /* ignore */
      }
    }
    opts.onFinish({
      time: elapsed,
      downed: downedRivals,
      topKph: Math.round((topSpeed / MAX_SPEED) * KPH),
      best,
      isBest,
    })
  }

  /* ------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------ */

  function render() {
    const { LW, LH, s, ox, oy, cssW, cssH } = view
    const sp = speed / MAX_SPEED

    // Clear the whole physical surface, letterbox bars included.
    ctx.fillStyle = palette.letterbox
    ctx.fillRect(-ox / s - 2, -oy / s - 2, cssW / s + 4, cssH / s + 4)

    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, LW, LH)
    ctx.clip()

    // Shake lives inside the clip, so it can never paint over the OS. A small
    // zoom rides with it so the rotation never exposes a bare edge.
    if (trauma > 0.002 && motion > 0) {
      const z = 1 + 0.09 * trauma
      ctx.translate(LW / 2, LH / 2)
      ctx.rotate(shakeR)
      ctx.scale(z, z)
      ctx.translate(-LW / 2 + shakeX, -LH / 2 + shakeY)
    }

    drawSky(LW, LH)
    drawRoad(LW, LH)
    drawPlayer(LW, LH, sp)
    particles.draw(ctx, palette.dirt, palette.spark)
    if (sp > 0.55 && motion > 0) drawSpeedLines(LW, LH, sp)
    if (flash > 0.01) {
      ctx.fillStyle = flashDanger ? palette.danger : palette.accent
      ctx.globalAlpha = flash * 0.32
      ctx.fillRect(-40, -40, LW + 80, LH + 80)
      ctx.globalAlpha = 1
    }
    ctx.restore()

    // HUD sits outside the shake: a speedo that shakes is a speedo you cannot read.
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, LW, LH)
    ctx.clip()
    drawHud(LW, LH, sp)
    ctx.restore()
  }

  function drawSky(LW: number, LH: number) {
    // Fill the whole frame: the gradient clamps to the horizon colour below its
    // last stop, so any band the road does not reach still reads as distance.
    ctx.fillStyle = sky ?? palette.skyTop
    ctx.fillRect(-40, -40, LW + 80, LH + 80)

    // Sun, parked just above the horizon and swaying with the corners.
    const sunX = LW * 0.72 + Math.sin(bgOffset * 0.0015) * LW * 0.18
    ctx.fillStyle = palette.sun
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.arc(sunX, LH * 0.36, LH * 0.09, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = 1

    // Two parallax ridges. Seeded sine sums, so they are deterministic and free.
    const horizon = LH * 0.5 + bounce * 0.4
    drawRidge(LW, horizon, palette.ridgeFar, bgOffset * 0.45, 0.085, 0.017, 1.7)
    drawRidge(LW, horizon, palette.ridgeNear, bgOffset * 0.9, 0.055, 0.031, 2.9)
  }

  function drawRidge(
    LW: number,
    horizon: number,
    color: string,
    off: number,
    amp: number,
    freq: number,
    phase: number,
  ) {
    const LH = view.LH
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(-40, horizon + 4)
    for (let x = -40; x <= LW + 40; x += 10) {
      const t = (x + off) * freq
      const y =
        horizon -
        LH * amp * (0.55 + 0.45 * Math.sin(t + phase)) * (0.7 + 0.3 * Math.sin(t * 0.37 + phase * 2))
      ctx.lineTo(x, y)
    }
    ctx.lineTo(LW + 40, horizon + 4)
    ctx.closePath()
    ctx.fill()
  }

  function drawRoad(LW: number, LH: number) {
    const baseSeg = findSegment(position)
    const basePercent = percentRemaining(position, SEG_LEN)
    const playerSeg = findSegment(increase(position, playerZ, TRACK_LEN))
    const playerPercent = percentRemaining(increase(position, playerZ, TRACK_LEN), SEG_LEN)
    playerY = lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPercent)

    let maxy = LH
    let x = 0
    let dx = -(baseSeg.curve * basePercent)
    const camX = (playerX + camLead) * ROAD_W
    const camY = playerY + CAM_HEIGHT

    // Pass one: the road itself. The single `maxy` comparison at the bottom is
    // the entire hill-occlusion system — it is what makes a crest hide the road
    // on the far side of it.
    for (let n = 0; n < DRAW_DIST; n++) {
      const seg = segments[(baseSeg.index + n) % segments.length]
      seg.looped = seg.index < baseSeg.index
      seg.fog = 1 / Math.pow(Math.E, ((n / DRAW_DIST) * (n / DRAW_DIST)) * FOG_DENSITY)
      seg.clip = maxy

      const camZ = position - (seg.looped ? TRACK_LEN : 0)
      project(seg.p1, camX - x, camY, camZ, LW, LH)
      project(seg.p2, camX - x - dx, camY, camZ, LW, LH)

      x += dx
      dx += seg.curve

      if (
        seg.p1.camera.z <= cameraDepth ||
        seg.p2.screen.y >= seg.p1.screen.y ||
        seg.p2.screen.y >= maxy
      ) {
        continue
      }
      renderSegment(seg, LW)
      maxy = seg.p2.screen.y
    }

    // Pass two: everything standing on the road, back to front, each clipped by
    // the hill that was in front of it.
    for (let n = DRAW_DIST - 1; n > 0; n--) {
      const seg = segments[(baseSeg.index + n) % segments.length]
      const p = seg.p1
      if (p.screen.w <= 0 || p.camera.z <= cameraDepth) continue

      if (seg.prop) drawProp(seg, p, LW)
      for (let i = 0; i < seg.cars.length; i++) drawSpriteClipped(seg, p, seg.cars[i], null)
      for (let i = 0; i < seg.riders.length; i++) drawSpriteClipped(seg, p, null, seg.riders[i])
    }
  }

  function renderSegment(seg: Seg, LW: number) {
    const p1 = seg.p1.screen
    const p2 = seg.p2.screen
    const r1 = rumbleWidth(p1.w)
    const r2 = rumbleWidth(p2.w)
    const grass = seg.dark ? palette.grassD : palette.grassL
    const road = seg.dark ? palette.roadD : palette.roadL
    const rumble = seg.dark ? palette.rumbleD : palette.rumbleL

    // 1 — grass
    ctx.fillStyle = grass
    ctx.fillRect(-40, p2.y, LW + 80, p1.y - p2.y)
    // 2, 3 — rumble strips
    quad(ctx, rumble, p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y)
    quad(ctx, rumble, p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y)
    // 4 — tarmac
    quad(ctx, road, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y)

    // 5 — lane markers, on the light segments only, so they dash automatically
    if (!seg.dark) {
      const l1 = laneWidth(p1.w)
      const l2 = laneWidth(p2.w)
      const lw1 = (p1.w * 2) / LANES
      const lw2 = (p2.w * 2) / LANES
      let lx1 = p1.x - p1.w + lw1
      let lx2 = p2.x - p2.w + lw2
      for (let lane = 1; lane < LANES; lane++) {
        quad(ctx, palette.lane, lx1 - l1 / 2, p1.y, lx1 + l1 / 2, p1.y, lx2 + l2 / 2, p2.y, lx2 - l2 / 2, p2.y)
        lx1 += lw1
        lx2 += lw2
      }
    }

    if (seg.finish) {
      const cells = 10
      for (let c = 0; c < cells; c++) {
        if ((c + seg.index) % 2 === 0) continue
        const a1 = -1 + (2 * c) / cells
        const b1 = -1 + (2 * (c + 1)) / cells
        quad(
          ctx,
          "#f5f7fa",
          p1.x + p1.w * a1,
          p1.y,
          p1.x + p1.w * b1,
          p1.y,
          p2.x + p2.w * b1,
          p2.y,
          p2.x + p2.w * a1,
          p2.y,
        )
      }
    }

    // 6 — fog. A flat alpha wash that hides the draw-distance boundary entirely.
    if (seg.fog < 1) {
      ctx.globalAlpha = 1 - seg.fog
      ctx.fillStyle = palette.fog
      ctx.fillRect(-40, p1.y, LW + 80, p2.y - p1.y)
      ctx.globalAlpha = 1
    }
  }

  function drawProp(seg: Seg, p: Pt, LW: number) {
    const prop = seg.prop
    if (!prop) return
    const h = p.screen.w * 0.14
    if (h < 1.2) return
    const px = p.screen.x + p.screen.w * prop.offset
    if (px < -80 || px > LW + 80) return
    const y = p.screen.y
    ctx.save()
    ctx.beginPath()
    ctx.rect(-60, -60, LW + 120, seg.clip + 60)
    ctx.clip()
    if (prop.kind === 0) {
      ctx.fillStyle = palette.prop
      ctx.fillRect(px - h * 0.09, y - h, h * 0.18, h)
      ctx.fillStyle = palette.propTip
      ctx.fillRect(px - h * 0.16, y - h, h * 0.32, h * 0.22)
    } else {
      ctx.fillStyle = palette.prop
      ctx.beginPath()
      ctx.moveTo(px, y - h * 1.5)
      ctx.lineTo(px + h * 0.5, y)
      ctx.lineTo(px - h * 0.5, y)
      ctx.closePath()
      ctx.fill()
    }
    if (seg.fog < 1) {
      ctx.globalAlpha = 1 - seg.fog
      ctx.fillStyle = palette.fog
      ctx.fillRect(px - h, y - h * 1.8, h * 2, h * 2)
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }

  function drawSpriteClipped(seg: Seg, p: Pt, car: Car | null, rider: Rival | null) {
    const scaleW = p.screen.w
    if (scaleW <= 0) return
    const offset = car ? car.offset : rider ? rider.offset : 0
    const px = p.screen.x + scaleW * offset
    const drawW = (car ? car.drawW : DRAW_BIKE) * scaleW
    if (drawW < 2 || px < -200 || px > view.LW + 200) return

    ctx.save()
    ctx.beginPath()
    ctx.rect(-80, -80, view.LW + 160, seg.clip + 80)
    ctx.clip()
    if (car) {
      drawVehicle(ctx, px, p.screen.y, drawW, car.hue, car.van)
    } else if (rider) {
      const guard =
        rider.state === "BLOCK" ? 0.45 : rider.state === "SWING" ? clamp(1 - rider.t / 0.16, 0, 1) : 0
      const side = rider.offset > playerX ? -1 : 1
      drawRider(
        ctx,
        px + (rider.down ? rider.tumble * 14 : 0),
        p.screen.y,
        drawW,
        rider.down ? 0 : rider.lean,
        rider.body,
        rider.trim,
        rider.jacket,
        rider.down ? 0 : guard,
        side,
        rider.down ? rider.tumble : 0,
      )
      if (!rider.down && drawW > 26) drawRivalTag(rider, px, p.screen.y - drawW * 1.9, drawW)
    }
    if (seg.fog < 1) {
      ctx.globalAlpha = 1 - seg.fog
      ctx.fillStyle = palette.fog
      ctx.fillRect(px - drawW, p.screen.y - drawW * 2.2, drawW * 2, drawW * 2.4)
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }

  function drawRivalTag(r: Rival, x: number, y: number, w: number) {
    const bw = Math.min(90, Math.max(46, w * 0.75))
    ctx.fillStyle = palette.hudPanel
    roundRect(ctx, x - bw / 2, y - 18, bw, 16, 4)
    ctx.fill()
    ctx.fillStyle = r.hp > 35 ? palette.accent : palette.danger
    roundRect(ctx, x - bw / 2 + 2, y - 16, (bw - 4) * clamp(r.hp / HP_MAX, 0, 1), 5, 2)
    ctx.fill()
    ctx.font = "600 8px ui-monospace, SFMono-Regular, Menlo, monospace"
    ctx.textAlign = "center"
    ctx.fillStyle = palette.hud
    ctx.fillText(r.name, x, y - 5)
    ctx.textAlign = "left"
  }

  function drawPlayer(LW: number, LH: number, sp: number) {
    const zAhead = increase(position, playerZ, TRACK_LEN)
    const seg = findSegment(zAhead)
    const pct = percentRemaining(zAhead, SEG_LEN)
    const camY = lerp(seg.p1.camera.y, seg.p2.camera.y, pct)
    const scale = cameraDepth / playerZ
    const baseY = LH / 2 - ((scale * camY * LH) / 2) - 6 + bounce
    // The bike is compensated back by exactly the camera lead, so it always sits
    // where it really is on the road even while the world swings.
    const px = LW / 2 - camLead * LW
    const w = DRAW_BIKE * LW

    let punch = 0
    if (atkPhase === "windup") punch = -0.35 * (1 - atkT / WINDUP)
    else if (atkPhase === "strike") punch = 1
    else if (atkPhase === "recovery") punch = clamp(atkT / RECOVERY, 0, 1)

    const flicker = invuln > 0 && Math.floor(invuln * 14) % 2 === 0
    if (flicker) ctx.globalAlpha = 0.45
    drawRider(
      ctx,
      px,
      baseY,
      w,
      steer * (0.35 + 0.65 * sp),
      palette.accent,
      "#f4f6fa",
      "#23262e",
      punch,
      atkSide,
      0,
    )
    ctx.globalAlpha = 1
  }

  function drawSpeedLines(LW: number, LH: number, sp: number) {
    if (frame % 4 === 0) {
      speedLineCount = 14 + Math.floor(Math.random() * 9)
      const cx = LW / 2 - camLead * LW * 0.5
      const cy = LH * 0.5
      for (let i = 0; i < speedLineCount; i++) {
        const a = Math.random() * TAU
        const r0 = 60 + Math.random() * 80
        const r1 = 300 + Math.random() * 300
        speedLines[i * 4] = cx + Math.cos(a) * r0
        speedLines[i * 4 + 1] = cy + Math.sin(a) * r0 * 0.6
        speedLines[i * 4 + 2] = cx + Math.cos(a) * r1
        speedLines[i * 4 + 3] = cy + Math.sin(a) * r1 * 0.6
      }
    }
    ctx.strokeStyle = palette.hud
    ctx.globalAlpha = 0.06 + (0.16 * (sp - 0.55)) / 0.45
    ctx.lineWidth = 1.4
    ctx.beginPath()
    for (let i = 0; i < speedLineCount; i++) {
      ctx.moveTo(speedLines[i * 4], speedLines[i * 4 + 1])
      ctx.lineTo(speedLines[i * 4 + 2], speedLines[i * 4 + 3])
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  function drawHud(LW: number, LH: number, sp: number) {
    const mono = "ui-monospace, SFMono-Regular, Menlo, monospace"
    ctx.textBaseline = "alphabetic"

    // Timer.
    ctx.fillStyle = palette.hudPanel
    roundRect(ctx, 14, 14, 128, 34, 8)
    ctx.fill()
    ctx.fillStyle = palette.hudDim
    ctx.font = `600 8px ${mono}`
    ctx.fillText("TIME", 24, 27)
    ctx.fillStyle = palette.hud
    ctx.font = `700 17px ${mono}`
    ctx.fillText(fmtTime(elapsed), 24, 43)

    // Progress along the ridge.
    const barW = Math.min(300, LW - 320)
    if (barW > 90) {
      const bx = (LW - barW) / 2
      ctx.fillStyle = palette.hudPanel
      roundRect(ctx, bx - 8, 18, barW + 16, 22, 11)
      ctx.fill()
      ctx.fillStyle = palette.hudDim
      roundRect(ctx, bx, 27, barW, 4, 2)
      ctx.fill()
      const prog = clamp(traveled / FINISH_DIST, 0, 1)
      ctx.fillStyle = palette.accent
      roundRect(ctx, bx, 27, barW * prog, 4, 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(bx + barW * prog, 29, 4.5, 0, TAU)
      ctx.fill()
    }

    // Rider health.
    ctx.fillStyle = palette.hudPanel
    roundRect(ctx, 14, LH - 52, 178, 38, 8)
    ctx.fill()
    ctx.fillStyle = palette.hudDim
    ctx.font = `600 8px ${mono}`
    ctx.fillText("RIDER", 24, LH - 36)
    const hw = 158
    ctx.fillStyle = palette.hudDim
    roundRect(ctx, 24, LH - 31, hw, 8, 4)
    ctx.fill()
    ctx.fillStyle = hp > 35 ? palette.accent : palette.danger
    roundRect(ctx, 24, LH - 31, hw * clamp(hp / HP_MAX, 0, 1), 8, 4)
    ctx.fill()
    if (invuln > 0) {
      ctx.fillStyle = palette.hud
      ctx.font = `600 8px ${mono}`
      ctx.textAlign = "right"
      ctx.fillText("SHIELD", 182, LH - 36)
      ctx.textAlign = "left"
    }

    // Tachometer.
    const cx = LW - 66
    const cy = LH - 60
    ctx.lineCap = "round"
    ctx.strokeStyle = palette.hudDim
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(cx, cy, 34, Math.PI * 0.78, Math.PI * 2.22)
    ctx.stroke()
    ctx.strokeStyle = sp > 0.88 ? palette.danger : palette.accent
    ctx.beginPath()
    ctx.arc(cx, cy, 34, Math.PI * 0.78, Math.PI * 0.78 + Math.PI * 1.44 * sp)
    ctx.stroke()
    ctx.fillStyle = palette.hud
    ctx.font = `700 21px ${mono}`
    ctx.textAlign = "center"
    ctx.fillText(String(Math.round(sp * KPH)), cx, cy + 5)
    ctx.fillStyle = palette.hudDim
    ctx.font = `600 8px ${mono}`
    ctx.fillText("KM/H", cx, cy + 18)

    // Rivals still riding.
    let ry = 16
    for (const r of rivals) {
      if (r.down) continue
      ctx.fillStyle = palette.hudPanel
      roundRect(ctx, LW - 130, ry, 116, 22, 6)
      ctx.fill()
      ctx.fillStyle = palette.hud
      ctx.font = `600 9px ${mono}`
      ctx.textAlign = "left"
      ctx.fillText(r.name, LW - 122, ry + 10)
      ctx.fillStyle = palette.hudDim
      roundRect(ctx, LW - 122, ry + 14, 100, 4, 2)
      ctx.fill()
      ctx.fillStyle = r.state === "BLOCK" ? palette.hud : palette.accent
      roundRect(ctx, LW - 122, ry + 14, 100 * clamp(r.hp / HP_MAX, 0, 1), 4, 2)
      ctx.fill()
      ry += 26
    }
    ctx.textAlign = "center"

    if (hintT > 0 && hintText) {
      const a = clamp(hintT, 0, 1) * clamp(hintT / 0.6, 0, 1)
      ctx.globalAlpha = Math.min(1, a + 0.15)
      ctx.fillStyle = palette.hudPanel
      const tw = Math.min(LW - 60, hintText.length * 7.4 + 36)
      roundRect(ctx, (LW - tw) / 2, LH * 0.6, tw, 30, 15)
      ctx.fill()
      ctx.fillStyle = palette.hud
      ctx.font = `700 12px ${mono}`
      ctx.fillText(hintText, LW / 2, LH * 0.6 + 20)
      ctx.globalAlpha = 1
    }
    ctx.textAlign = "left"
  }

  /* ------------------------------------------------------------ *
   * The loop
   * ------------------------------------------------------------ */

  let statusAt = 0

  function loop(now: number) {
    if (!running) return
    raf = requestAnimationFrame(loop)
    frame++

    // Clamped at 0.25s, not the 1s the reference uses: one second permits sixty
    // catch-up ticks in a single frame after a tab stall.
    const dt = Math.min(0.25, (now - last) / 1000)
    last = now

    frameAvg = frameAvg * 0.92 + dt * 1000 * 0.08
    if (frameAvg > 20) {
      slowFrames++
      if (slowFrames > 45 && dprCap > 1) {
        dprCap = 1
        slowFrames = 0
        layout()
      }
    } else {
      slowFrames = 0
    }

    if (freeze > 0) {
      // Hit-pause: the frame is frozen, not dead — particles keep creeping.
      freeze -= dt
      particles.step(dt * 0.15)
      trauma = Math.max(0, trauma - 0.4 * dt)
    } else {
      acc += dt
      while (acc >= STEP) {
        acc -= STEP
        if (finished) break
        update(STEP)
      }
      if (finished) acc = 0
    }

    // Resample the shake every other frame: at 60Hz, per-frame randomness
    // strobes rather than shakes.
    if (frame % 2 === 0 && motion > 0) {
      const t2 = trauma * trauma
      const maxOffset = view.LW / 120
      shakeX = (Math.random() * 2 - 1) * maxOffset * t2
      shakeY = (Math.random() * 2 - 1) * maxOffset * t2
      shakeR = (Math.random() * 2 - 1) * (1.2 * Math.PI) / 180 * t2
    }

    if (frame % 3 === 0) audio.engine(speed / MAX_SPEED, up(), Math.abs(playerX) > 1)

    render()

    if (now - statusAt > 1400) {
      statusAt = now
      opts.onStatus(statusText())
    }
  }

  function statusText() {
    const alive = rivals.filter((r) => !r.down).length
    const prog = Math.round(clamp(traveled / FINISH_DIST, 0, 1) * 100)
    return `${Math.round((speed / MAX_SPEED) * KPH)} kilometres per hour. Rider health ${Math.round(
      clamp(hp, 0, HP_MAX),
    )} percent. ${alive} rival${alive === 1 ? "" : "s"} still riding. ${prog} percent of the ridge complete. Elapsed ${fmtTime(
      elapsed,
    )}.`
  }

  /* --- init ----------------------------------------------------- */
  reset()
  layout()

  return {
    layout,
    setTheme,
    setMotion,
    start,
    setRunning,
    dispose,
    keyDown,
    keyUp,
    releaseAll,
    audio,
    statusText,
  }
}

type Engine = NonNullable<ReturnType<typeof createEngine>>

/* ------------------------------------------------------------------ *
 * App
 * ------------------------------------------------------------------ */

type Screen = "title" | "racing" | "results"

export function RidgelineApp({ win }: { win?: WindowInstance } = {}) {
  const theme = useWM((s) => s.theme)
  const openApp = useWM((s) => s.open)
  const powerState = usePower((s) => s.state)
  const volume = useSystem((s) => s.volume)
  const sysMuted = useSystem((s) => s.muted)
  const push = useNotify((s) => s.push)

  const rootRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engRef = useRef<Engine | null>(null)

  const [screen, setScreen] = useState<Screen>("title")
  const [manualPause, setManualPause] = useState(false)
  const [pauseOnBlur, setPauseOnBlur] = useState(true)
  const [soundOn, setSoundOn] = useState(true)
  const [result, setResult] = useState<Result | null>(null)
  const [showHow, setShowHow] = useState(false)
  const [status, setStatus] = useState("Ridgeline is waiting at the start line.")
  const [docHidden, setDocHidden] = useState(false)
  const [windowFocused, setWindowFocused] = useState(true)
  const [coarseOnly, setCoarseOnly] = useState(false)
  const [keyboardSeen, setKeyboardSeen] = useState(false)

  const finishRef = useRef<(r: Result) => void>(() => {})
  const statusRef = useRef<(s: string) => void>(() => {})

  finishRef.current = (r) => {
    setResult(r)
    setScreen("results")
    setStatus(
      `Race finished in ${fmtTime(r.time)}. ${r.downed} rival${r.downed === 1 ? "" : "s"} down. Top speed ${
        r.topKph
      } kilometres per hour.`,
    )
    if (r.isBest) {
      push({
        appId: "ridgeline",
        source: "Ridgeline",
        title: "New personal best",
        body: `${fmtTime(r.time)} on the ridge.`,
      })
    }
  }
  statusRef.current = (s) => setStatus(s)

  /* --- engine ---------------------------------------------------- */
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const eng = createEngine(canvas, wrap, {
      onFinish: (r) => finishRef.current(r),
      onStatus: (s) => statusRef.current(s),
    })
    engRef.current = eng
    if (!eng) return

    const ro =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => eng.layout())
    ro?.observe(wrap)
    const onWinResize = () => eng.layout()
    window.addEventListener("resize", onWinResize)

    return () => {
      ro?.disconnect()
      window.removeEventListener("resize", onWinResize)
      eng.dispose()
      engRef.current = null
    }
  }, [])

  /* --- theme ----------------------------------------------------- */
  useEffect(() => {
    const eng = engRef.current
    const el = wrapRef.current
    if (!eng || !el) return
    // Read the OS palette once per theme change, never per frame.
    const accent = getComputedStyle(el).getPropertyValue("--os-accent").trim() || "#4cc2ff"
    eng.setTheme(accent, theme === "dark")
  }, [theme])

  /* --- reduced motion -------------------------------------------- */
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)")
    if (!mq) return
    const apply = () => engRef.current?.setMotion(mq.matches)
    apply()
    mq.addEventListener?.("change", apply)
    return () => mq.removeEventListener?.("change", apply)
  }, [])

  /* --- pointer capability ---------------------------------------- */
  useEffect(() => {
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false
    const hover = window.matchMedia?.("(any-hover: hover)")?.matches ?? true
    setCoarseOnly(coarse && !hover)
  }, [])

  /* --- audio ----------------------------------------------------- */
  useEffect(() => {
    engRef.current?.audio.setVolume(volume, sysMuted)
  }, [volume, sysMuted])

  useEffect(() => {
    engRef.current?.audio.setEnabled(soundOn && !sysMuted)
  }, [soundOn, sysMuted])

  /* --- page visibility and window focus --------------------------- */
  useEffect(() => {
    const onVis = () => setDocHidden(document.visibilityState === "hidden")
    const onBlur = () => setWindowFocused(false)
    const onFocus = () => setWindowFocused(true)
    onVis()
    document.addEventListener("visibilitychange", onVis)
    window.addEventListener("blur", onBlur)
    window.addEventListener("focus", onFocus)
    return () => {
      document.removeEventListener("visibilitychange", onVis)
      window.removeEventListener("blur", onBlur)
      window.removeEventListener("focus", onFocus)
    }
  }, [])

  /**
   * Every reason the simulation must stop. Running a game loop in a hidden tab
   * is what earns a web desktop its fan-noise reputation.
   */
  const autoPaused =
    docHidden ||
    powerState !== "running" ||
    !!win?.minimized ||
    (pauseOnBlur && !windowFocused) ||
    showHow
  const paused = manualPause || autoPaused
  const shouldRun = screen === "racing" && !paused

  useEffect(() => {
    engRef.current?.setRunning(shouldRun)
  }, [shouldRun])

  useEffect(() => {
    if (screen === "racing" && !paused) rootRef.current?.focus()
  }, [screen, paused])

  const startRace = useCallback(() => {
    const eng = engRef.current
    if (!eng) return
    setResult(null)
    setManualPause(false)
    // Choosing to race past the keyboard notice counts as having one.
    setKeyboardSeen(true)
    setScreen("racing")
    eng.start()
    rootRef.current?.focus()
  }, [])

  /* --- keyboard --------------------------------------------------- */
  const onKeyDown = useCallback(
    (e: RKeyboardEvent<HTMLDivElement>) => {
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || t?.isContentEditable) return
      if (!keyboardSeen) setKeyboardSeen(true)
      if (e.ctrlKey || e.metaKey || e.altKey) return

      if (e.key === "p" || e.key === "P") {
        e.preventDefault()
        if (screen === "racing") setManualPause((v) => !v)
        return
      }
      if (e.key === "Enter" && screen !== "racing") {
        e.preventDefault()
        startRace()
        return
      }
      if (screen !== "racing" || paused) return
      // preventDefault only for keys the game actually consumes.
      if (engRef.current?.keyDown(e.key)) e.preventDefault()
    },
    [screen, paused, startRace, keyboardSeen],
  )

  const onKeyUp = useCallback((e: RKeyboardEvent<HTMLDivElement>) => {
    if (engRef.current?.keyUp(e.key)) e.preventDefault()
  }, [])

  const needsKeyboard = coarseOnly && !keyboardSeen

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => engRef.current?.releaseAll()}
      aria-label="Ridgeline game surface. W or up arrow to accelerate, A and D to steer, S or space to brake, J and L to strike, P to pause."
      className="os-no-select flex h-full min-h-0 flex-col outline-none"
      style={{ background: "var(--os-surface)" }}
    >
      {/* Chrome */}
      <div
        className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2"
        style={{ borderColor: "var(--os-border)", background: "var(--os-card)" }}
      >
        <span
          className="mr-1 flex items-center gap-1.5 text-[12.5px] font-semibold tracking-wide"
          style={{ color: "var(--os-fg)" }}
        >
          <Gauge size={14} style={{ color: "var(--os-accent)" }} />
          Ridgeline
        </span>

        <ToolButton
          icon={paused || screen !== "racing" ? <Play size={13} /> : <Pause size={13} />}
          label={screen !== "racing" ? "Race" : manualPause ? "Resume" : "Pause"}
          onClick={() => {
            if (screen !== "racing") startRace()
            else setManualPause((v) => !v)
          }}
          disabled={screen !== "racing" && needsKeyboard}
        />
        <ToolButton icon={<RotateCcw size={13} />} label="Restart" onClick={startRace} disabled={needsKeyboard} />
        <ToolButton
          icon={soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
          label={soundOn ? "Sound on" : "Muted"}
          onClick={() => setSoundOn((v) => !v)}
        />
        <ToolButton icon={<Info size={13} />} label="How it works" onClick={() => setShowHow(true)} />

        <label
          className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11.5px]"
          style={{ color: "var(--os-muted)" }}
        >
          <input
            type="checkbox"
            checked={pauseOnBlur}
            onChange={(e) => setPauseOnBlur(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--os-accent)]"
          />
          Pause when unfocused
        </label>
      </div>

      {/* Track */}
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Ridgeline — a behind-the-bike combat race down a mountain road"
          className="absolute inset-0 block"
          style={{ touchAction: "none" }}
        />

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {status}
        </p>

        {screen === "title" && (
          <Overlay>
            <TitleCard needsKeyboard={needsKeyboard} onStart={startRace} onHow={() => setShowHow(true)} />
          </Overlay>
        )}

        {screen === "racing" && paused && (
          <Overlay>
            <div className="w-full max-w-[380px] text-center">
              <p className="text-[26px] font-semibold tracking-tight" style={{ color: "var(--os-fg)" }}>
                Paused
              </p>
              <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--os-muted)" }}>
                {autoPaused
                  ? "The bike stops when this window is not in front. Nothing runs in the background."
                  : "Press P or click Resume to get going again."}
              </p>
              {!autoPaused && (
                <div className="mt-4 flex justify-center gap-2">
                  <GameButton onClick={() => setManualPause(false)} primary>
                    Resume
                  </GameButton>
                  <GameButton onClick={startRace}>Restart</GameButton>
                </div>
              )}
            </div>
          </Overlay>
        )}

        {screen === "results" && result && (
          <Overlay>
            <ResultsCard
              result={result}
              onRetry={startRace}
              onHow={() => setShowHow(true)}
              onContact={() => openApp("contact")}
              onResume={() => openApp("resume")}
            />
          </Overlay>
        )}

        {showHow && <HowItWorks onClose={() => setShowHow(false)} />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Overlay chrome
 * ------------------------------------------------------------------ */

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div
      className="absolute inset-0 grid place-items-center px-6"
      style={{ background: "var(--os-scrim)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-[460px] rounded-xl p-6 shadow-2xl"
        style={{ background: "var(--os-menu)", border: "1px solid var(--os-border)" }}
      >
        {children}
      </div>
    </div>
  )
}

function GameButton({
  children,
  onClick,
  primary,
  icon,
}: {
  children: ReactNode
  onClick: () => void
  primary?: boolean
  icon?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-4 py-[7px] text-[12.5px] font-medium transition-all active:scale-[.98]"
      style={{
        background: primary ? "var(--os-accent)" : "var(--os-card)",
        color: primary ? "var(--os-on-accent)" : "var(--os-fg)",
        border: `1px solid ${primary ? "transparent" : "var(--os-border)"}`,
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function ToolButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-[6px] text-[12px] transition-colors enabled:hover:bg-[var(--os-hover)] disabled:opacity-40"
      style={{ color: "var(--os-fg)", border: "1px solid var(--os-border)", background: "var(--os-card)" }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="inline-grid min-w-[22px] place-items-center rounded px-1.5 py-[2px] text-[10.5px] font-semibold"
      style={{ background: "var(--os-input)", border: "1px solid var(--os-border)", color: "var(--os-fg)" }}
    >
      {children}
    </kbd>
  )
}

function TitleCard({
  needsKeyboard,
  onStart,
  onHow,
}: {
  needsKeyboard: boolean
  onStart: () => void
  onHow: () => void
}) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--os-accent)" }}>
        Original combat racer
      </p>
      <h2 className="mt-1 text-[30px] font-semibold leading-none tracking-tight" style={{ color: "var(--os-fg)" }}>
        Ridgeline
      </h2>
      <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
        One descent, about seventy seconds, three rivals who hit back. Pseudo-3D road, fixed 60&nbsp;Hz simulation,
        procedural riders, synthesised engine &mdash; no images, no audio files, no game engine.
      </p>

      {needsKeyboard ? (
        <div
          className="mt-4 rounded-lg p-3.5"
          style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
        >
          <p className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: "var(--os-fg)" }}>
            <Keyboard size={14} style={{ color: "var(--os-accent)" }} />
            Keyboard required
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
            Ridgeline steers, brakes and throws punches on eight keys. Rather than ship a touch scheme that plays
            badly, this build asks for a keyboard. Open it on a laptop and it is ready to go.
          </p>
          <div className="mt-3">
            <GameButton onClick={onStart}>I have a keyboard &mdash; start anyway</GameButton>
          </div>
        </div>
      ) : (
        <div
          className="mt-4 grid gap-2 rounded-lg p-3.5 text-[12px]"
          style={{ background: "var(--os-card)", border: "1px solid var(--os-border)", color: "var(--os-muted)" }}
        >
          <ControlRow keys={["W", "↑"]} what="Throttle" />
          <ControlRow keys={["A", "D", "←", "→"]} what="Steer" />
          <ControlRow keys={["S", "K", "Space"]} what="Brake" />
          <ControlRow keys={["J", "L"]} what="Strike left / right" />
          <ControlRow keys={["P"]} what="Pause" />
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {!needsKeyboard && (
          <GameButton onClick={onStart} primary icon={<Play size={13} />}>
            Drop in
          </GameButton>
        )}
        <GameButton onClick={onHow} icon={<Info size={13} />}>
          How it works
        </GameButton>
      </div>
    </div>
  )
}

function ControlRow({ keys, what }: { keys: string[]; what: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-[142px] shrink-0 flex-wrap gap-1">
        {keys.map((k) => (
          <Key key={k}>{k}</Key>
        ))}
      </span>
      <span>{what}</span>
    </div>
  )
}

function ResultsCard({
  result,
  onRetry,
  onHow,
  onContact,
  onResume,
}: {
  result: Result
  onRetry: () => void
  onHow: () => void
  onContact: () => void
  onResume: () => void
}) {
  const PAR = 68
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--os-accent)" }}>
        Ridge cleared
      </p>
      <h2
        className="mt-1 font-mono text-[40px] font-bold leading-none tracking-tight tabular-nums"
        style={{ color: "var(--os-fg)" }}
      >
        {fmtTime(result.time)}
      </h2>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Rivals down" value={String(result.downed)} />
        <Stat label="Top speed" value={`${result.topKph} km/h`} />
        <Stat label="Par" value={fmtTime(PAR)} />
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[12px]" style={{ color: "var(--os-muted)" }}>
        <Trophy size={13} style={{ color: "var(--os-accent)" }} />
        {result.isBest
          ? result.best === null
            ? "First run on this machine — that is the time to beat."
            : `New best, ${fmtTime(result.best - result.time)} up on your last one.`
          : `Your best so far: ${fmtTime(result.best ?? result.time)}.`}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <GameButton onClick={onRetry} primary icon={<RotateCcw size={13} />}>
          Run it again
        </GameButton>
        <GameButton onClick={onHow} icon={<Info size={13} />}>
          How it works
        </GameButton>
        <GameButton onClick={onContact} icon={<Mail size={13} />}>
          Contact
        </GameButton>
        <GameButton onClick={onResume} icon={<FileBadge size={13} />}>
          Resume
        </GameButton>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--os-muted)" }}>
        {label}
      </p>
      <p className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums" style={{ color: "var(--os-fg)" }}>
        {value}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * The write-up
 * ------------------------------------------------------------------ */

function HowItWorks({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col" style={{ background: "var(--os-window)" }}>
      <div
        className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5"
        style={{ borderColor: "var(--os-border)" }}
      >
        <Info size={14} style={{ color: "var(--os-accent)" }} />
        <p className="text-[12.5px] font-semibold" style={{ color: "var(--os-fg)" }}>
          Ridgeline — how it is built
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto grid h-7 w-7 place-items-center rounded-md hover:bg-[var(--os-hover)]"
          style={{ color: "var(--os-fg)" }}
        >
          <X size={14} />
        </button>
      </div>

      <div className="os-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-[68ch] space-y-4 text-[13px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
          <H>There is no 3D here</H>
          <p>
            The road is perfectly straight in world space. Every segment is a quad with a near edge and a far edge,
            and the only thing that curves is the camera: while walking the draw list outward I accumulate{" "}
            <Code>x += dx; dx += seg.curve</Code> and subtract that running <Code>x</Code> from the camera position
            used to project each edge. Bend the camera and the road appears to bend. It costs two additions per
            segment and it is exact &mdash; the player&rsquo;s lateral position, the traffic offsets and the collision
            test all keep working in the flat coordinate system underneath.
          </p>
          <p>
            Projection is four lines. <Code>cameraDepth = 1 / tan((fov / 2) · π / 180)</Code> is the distance from the
            eye to a projection plane one unit tall, which is what makes field of view a real parameter rather than a
            fudge factor. A point at camera-space depth <Code>z</Code> gets <Code>scale = cameraDepth / z</Code>, and
            everything else &mdash; screen x, screen y, the projected road width, how large a rider is drawn &mdash;
            falls out of that one number. Because <Code>playerZ = cameraHeight · cameraDepth</Code>, the bike&rsquo;s
            own scale is <Code>1 / cameraHeight</Code> whatever the field of view is, so widening the lens at speed
            rushes the world past without resizing the bike.
          </p>

          <H>Hills, in one comparison</H>
          <p>
            Segments carry a world <Code>y</Code>. Drawing near to far, I keep the smallest screen y reached so far in{" "}
            <Code>maxy</Code> and skip any segment whose far edge lands at or below it. That single test is the whole
            occlusion system: a crest hides the road on the far side of it, and the recorded <Code>maxy</Code> doubles
            as the clip line for the sprite pass, so a rival behind the crest is correctly cut off at the ridge
            instead of floating above it.
          </p>

          <H>Why the clock is fixed</H>
          <p>
            The simulation only ever advances in 1/60&nbsp;s ticks; rendering runs on requestAnimationFrame and
            consumes whatever is left in the accumulator. <Code>maxSpeed = segmentLength / STEP</Code> is not a taste
            call &mdash; it guarantees the bike crosses at most one segment per tick, which is the precondition that
            makes per-segment collision sound. Drive the physics off the raw frame delta instead and a garbage
            collection pause hands you a 400&nbsp;ms frame, the bike advances 4,800 units in one step, and it passes
            clean through three cars. The accumulator is clamped at 0.25&nbsp;s rather than a full second, because a
            second of backlog means sixty catch-up ticks crammed into one frame after a tab stall, and{" "}
            <Code>last</Code> is reset on every resume so the first frame after a pause has a delta of roughly zero.
          </p>

          <H>The feel budget</H>
          <p>
            Screen shake is a trauma model: a scalar in [0,1] that decays at 1.6 per second, with offset scaling as{" "}
            <Code>trauma²</Code> so small knocks stay small. A rumble strip spends 0.15, a traffic scrape 0.25,
            landing a punch 0.35, taking one 0.55, a wipeout 0.8. Nothing spends 1.0. The offset is resampled every
            other frame, because at 60&nbsp;Hz per-frame randomness strobes instead of shaking, and it is capped near
            eight pixels &mdash; past roughly ten it stops reading as impact and starts hiding the road at the exact
            moment the rider needs to see it.
          </p>
          <p>
            Hit pause is 70&nbsp;ms for a clean punch, 140 for a rival going down, 220 for your own wipeout, never
            more: past a quarter of a second it reads as a stall, not a hit. During a freeze the update loop is
            skipped but the frame keeps rendering and particles keep creeping at 0.15&times; speed, so the moment is
            frozen without being dead. Off-road deceleration waits 110&nbsp;ms before it engages, which is the
            racer&rsquo;s coyote time: clipping a rumble strip mid-overtake should not be punished. Collision runs
            through one <Code>overlap</Code> helper with a percentage that shrinks both boxes toward their centres
            &mdash; 0.8 for traffic, 0.9 for rivals &mdash; and that single number is the most important knob in the
            game.
          </p>
          <p>
            The three rivals share one four-state machine (cruise, block, swing, recover) but each draws a reaction
            latency between 180 and 320&nbsp;ms at spawn, so the pack reads as three drivers rather than one
            algorithm running three times. A rival hit twice inside two seconds raises its block probability to 0.6,
            which is what stops mashing from winning, and the rubber band is clamped so the AI can never outrun a
            rider who is driving well.
          </p>

          <H>Nothing on the wire</H>
          <p>
            No sprite sheets: riders are eight filled paths with a lean transform, which stays crisp at every scale
            and does not need five rivals &times; eight steering frames &times; three damage states. No audio files
            either: the engine is two sawtooth oscillators, one detuned seven cents, through a lowpass, with five
            fake gears from <Code>(speedPercent · 5) % 1</Code> &mdash; that one line is the difference between a
            motorbike and a siren. Impacts are 40&nbsp;ms noise bursts with a 2&nbsp;kHz&nbsp;&rarr;&nbsp;200&nbsp;Hz
            filter sweep, detuned per shot so no two sound alike. It all rides the desktop&rsquo;s own volume slider.
          </p>
          <p>
            The loop stops on window blur, on tab hide, when the OS is not running and when the window is minimised,
            and the pause-on-blur behaviour is a toggle rather than a rule, because coming back to a crashed bike is
            worse than the alternative. Shake, particles and flashes are all transformed inside the canvas clip, so
            no amount of juice can escape and paint over the taskbar.
          </p>

          <H>Credit where it is due</H>
          <p>
            The road maths &mdash; the segment projection, the curve accumulation, the <Code>maxy</Code> occlusion
            trick and most of these constants &mdash; comes from Jake Gordon&rsquo;s{" "}
            <em>How to build a racing game</em> series at codeincomplete.com, which is the clearest write-up of the
            technique anywhere. The combat layer, the AI, the feel budget, the synthesised audio and every line drawn
            on screen here are original. Ridgeline is inspired by the 16-bit combat racers of the early nineties; it
            borrows none of their names, art, music or characters.
          </p>
        </div>
      </div>
    </div>
  )
}

function H({ children }: { children: ReactNode }) {
  return (
    <h3 className="pt-1 text-[14px] font-semibold tracking-tight" style={{ color: "var(--os-fg)" }}>
      {children}
    </h3>
  )
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code
      className="rounded px-1 py-[1px] font-mono text-[11.5px]"
      style={{ background: "var(--os-input)", color: "var(--os-fg)" }}
    >
      {children}
    </code>
  )
}
