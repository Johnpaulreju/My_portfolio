/**
 * The six looks. Normal, Mono and Warm are plain CSS filters on the live
 * <video> (cheap, GPU, full frame rate). The same steps are replayed per pixel
 * when a photo is taken, because Safari has no `ctx.filter` - so the photo
 * always matches the viewfinder.
 *
 * ASCII, Matrix and Pixel are drawn on a canvas from a tiny sampled grid
 * (a few thousand pixels, not a million), which keeps them fast on phones.
 */

export type FilterId = "normal" | "mono" | "warm" | "ascii" | "matrix" | "pixel"
export type CanvasFilterId = "ascii" | "matrix" | "pixel"

export type ColorOp = { op: "grayscale" | "sepia" | "saturate" | "brightness" | "contrast"; amount: number }

export type CameraFilter =
  | { id: Exclude<FilterId, CanvasFilterId>; label: string; kind: "css"; ops: ColorOp[] }
  | { id: CanvasFilterId; label: string; kind: "canvas" }

export const FILTERS: CameraFilter[] = [
  { id: "normal", label: "Normal", kind: "css", ops: [] },
  { id: "mono", label: "Mono", kind: "css", ops: [{ op: "grayscale", amount: 1 }, { op: "contrast", amount: 1.1 }] },
  {
    id: "warm",
    label: "Warm",
    kind: "css",
    ops: [{ op: "sepia", amount: 0.28 }, { op: "saturate", amount: 1.3 }, { op: "brightness", amount: 1.04 }],
  },
  { id: "ascii", label: "ASCII", kind: "canvas" },
  { id: "matrix", label: "Matrix", kind: "canvas" },
  { id: "pixel", label: "Pixel", kind: "canvas" },
]

export function filterById(id: FilterId): CameraFilter {
  return FILTERS.find((f) => f.id === id) ?? FILTERS[0]
}

export function cssFilter(ops: ColorOp[]) {
  return ops.length ? ops.map((o) => `${o.op}(${o.amount})`).join(" ") : "none"
}

/* ------------------------------------------------------------------ *
 * Colour maths - the matrices from the Filter Effects spec, so the JS
 * replay lands on the same pixels the browser shows.
 * ------------------------------------------------------------------ */

type Affine = [number, number, number, number, number, number, number, number, number, number, number, number]

function matrixFor({ op, amount }: ColorOp): Affine {
  const a = Math.min(1, Math.max(0, amount))
  const i = 1 - a
  switch (op) {
    case "grayscale":
      return [
        0.2126 + 0.7874 * i, 0.7152 - 0.7152 * i, 0.0722 - 0.0722 * i, 0,
        0.2126 - 0.2126 * i, 0.7152 + 0.2848 * i, 0.0722 - 0.0722 * i, 0,
        0.2126 - 0.2126 * i, 0.7152 - 0.7152 * i, 0.0722 + 0.9278 * i, 0,
      ]
    case "sepia":
      return [
        0.393 + 0.607 * i, 0.769 - 0.769 * i, 0.189 - 0.189 * i, 0,
        0.349 - 0.349 * i, 0.686 + 0.314 * i, 0.168 - 0.168 * i, 0,
        0.272 - 0.272 * i, 0.534 - 0.534 * i, 0.131 + 0.869 * i, 0,
      ]
    case "saturate": {
      const s = Math.max(0, amount)
      return [
        0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0,
        0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0,
        0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0,
      ]
    }
    case "brightness": {
      const b = Math.max(0, amount)
      return [b, 0, 0, 0, 0, b, 0, 0, 0, 0, b, 0]
    }
    case "contrast": {
      const c = Math.max(0, amount)
      const o = 127.5 * (1 - c)
      return [c, 0, 0, o, 0, c, 0, o, 0, 0, c, o]
    }
  }
}

/** RGBA bytes in place; each step clamps, exactly like chained CSS filter functions. */
export function applyColorOps(data: Uint8ClampedArray, ops: ColorOp[]) {
  for (const op of ops) {
    const m = matrixFor(op)
    for (let p = 0; p < data.length; p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2]
      // Uint8ClampedArray rounds and clamps on write.
      data[p] = m[0] * r + m[1] * g + m[2] * b + m[3]
      data[p + 1] = m[4] * r + m[5] * g + m[6] * b + m[7]
      data[p + 2] = m[8] * r + m[9] * g + m[10] * b + m[11]
    }
  }
}

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

export type Crop = { sx: number; sy: number; sw: number; sh: number }

/** The part of the source that `object-fit: cover` shows in a view of this shape. */
export function coverCrop(srcW: number, srcH: number, viewW: number, viewH: number): Crop {
  if (srcW <= 0 || srcH <= 0 || viewW <= 0 || viewH <= 0) return { sx: 0, sy: 0, sw: Math.max(1, srcW), sh: Math.max(1, srcH) }
  const src = srcW / srcH
  const view = viewW / viewH
  if (src > view) {
    const sw = srcH * view
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH }
  }
  const sh = srcW / view
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh }
}

/** Monospace glyphs are about 0.6em wide; a cell is one glyph advance by one line. */
export const GLYPH_ASPECT = 0.6

/**
 * The sampled grid for a view, in cells. It depends only on the view's CSS
 * size, so the live canvas and a full-size photo get the very same grid.
 */
export function gridFor(filter: CanvasFilterId, viewW: number, viewH: number) {
  const w = Math.max(1, viewW), h = Math.max(1, viewH)
  const target = filter === "pixel" ? 8 : 7
  const cols = Math.round(Math.min(filter === "pixel" ? 128 : 160, Math.max(24, w / target)))
  const cellW = w / cols
  const cellH = filter === "pixel" ? cellW : cellW / GLYPH_ASPECT
  const rows = Math.max(8, Math.round(h / cellH))
  return { cols, rows }
}

/* ------------------------------------------------------------------ *
 * Renderers
 * ------------------------------------------------------------------ */

export const MONO_FONT = 'Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace'

/** Webcams are often flat and grey. Stretch each frame, eased so it never flickers. */
export type Levels = { lo: number; hi: number }

export function newLevels(): Levels {
  return { lo: 0, hi: 255 }
}

function luminance(px: Uint8ClampedArray, cells: number, out: Float32Array, levels: Levels, adapt: boolean) {
  let lo = 255, hi = 0
  for (let i = 0; i < cells; i++) {
    const p = i * 4
    const l = 0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2]
    out[i] = l
    if (l < lo) lo = l
    if (l > hi) hi = l
  }
  if (adapt) {
    levels.lo += (lo - levels.lo) * 0.2
    levels.hi += (hi - levels.hi) * 0.2
  }
  const span = Math.max(48, levels.hi - levels.lo)
  for (let i = 0; i < cells; i++) out[i] = Math.min(1, Math.max(0, (out[i] - levels.lo) / span))
}

const ASCII_RAMP = " .:-=+*#%@"

/** Measures the monospace advance once per font size so each row can be one fillText call. */
function fitFont(ctx: CanvasRenderingContext2D, cellW: number, cellH: number) {
  ctx.font = `100px ${MONO_FONT}`
  const advance = ctx.measureText("M").width / 100 || GLYPH_ASPECT
  const size = Math.min(cellW / advance, cellH * 1.05)
  ctx.font = `${size.toFixed(2)}px ${MONO_FONT}`
  ctx.textBaseline = "middle"
  ctx.textAlign = "left"
  return size
}

export type FrameInput = {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  px: Uint8ClampedArray
  cols: number
  rows: number
  levels: Levels
  /** Seconds; frozen when reduced motion is on. */
  time: number
  motion: boolean
  /** False when drawing a photo, so the stretch uses exactly what is on screen. */
  adapt: boolean
}

const scratch = { lum: new Float32Array(0) }
function lumBuffer(n: number) {
  if (scratch.lum.length < n) scratch.lum = new Float32Array(n)
  return scratch.lum
}

export function drawAscii({ ctx, width, height, px, cols, rows, levels, adapt }: FrameInput) {
  const cells = cols * rows
  const lum = lumBuffer(cells)
  luminance(px, cells, lum, levels, adapt)
  const cellW = width / cols
  const cellH = height / rows
  ctx.fillStyle = "#07090d"
  ctx.fillRect(0, 0, width, height)
  fitFont(ctx, cellW, cellH)
  ctx.fillStyle = "#e7edf5"
  const last = ASCII_RAMP.length - 1
  for (let r = 0; r < rows; r++) {
    let line = ""
    for (let c = 0; c < cols; c++) line += ASCII_RAMP[Math.round(lum[r * cols + c] * last)]
    ctx.fillText(line, 0, (r + 0.5) * cellH, width + cellW)
  }
}

const CODE_GLYPHS = "01{}[]<>()=+*/;:$#&|01"
const MATRIX_INK = ["#0c4a1c", "#138a36", "#22c55e", "#86efac", "#ecfff2"]

function hash(a: number, b: number, c: number) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

export function drawMatrix({ ctx, width, height, px, cols, rows, levels, time, motion, adapt }: FrameInput) {
  const cells = cols * rows
  const lum = lumBuffer(cells)
  luminance(px, cells, lum, levels, adapt)
  const cellW = width / cols
  const cellH = height / rows
  ctx.fillStyle = "#010803"
  ctx.fillRect(0, 0, width, height)
  fitFont(ctx, cellW, cellH)

  const trail = Math.max(6, Math.round(rows * 0.45))
  const lines: string[][] = MATRIX_INK.map(() => [])
  for (let r = 0; r < rows; r++) {
    const row = MATRIX_INK.map(() => "")
    for (let c = 0; c < cols; c++) {
      let v = lum[r * cols + c] * 0.9
      let head = false
      if (motion) {
        // Each column rains at its own speed from its own start.
        const speed = 5 + (hash(c, 7, 1) % 9)
        const span = rows + trail
        const pos = (time * speed + (hash(c, 3, 9) % span)) % span
        const d = pos - r
        if (d >= 0 && d < trail) v += (1 - d / trail) * 0.55
        head = d >= 0 && d < 1
      }
      const level = head ? 4 : v < 0.12 ? -1 : Math.min(3, Math.floor(v * 4))
      const tick = motion ? Math.floor(time * 3 + (hash(c, r, 5) % 7)) : 0
      const glyph = CODE_GLYPHS[hash(c, r, tick) % CODE_GLYPHS.length]
      for (let k = 0; k < MATRIX_INK.length; k++) row[k] += k === level ? glyph : " "
    }
    for (let k = 0; k < MATRIX_INK.length; k++) lines[k].push(row[k])
  }
  for (let k = 0; k < MATRIX_INK.length; k++) {
    ctx.fillStyle = MATRIX_INK[k]
    for (let r = 0; r < rows; r++) {
      const line = lines[k][r]
      if (line.trim()) ctx.fillText(line, 0, (r + 0.5) * cellH, width + cellW)
    }
  }
}

/** 4x4 Bayer thresholds, centred on zero. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5)

/** Four shades per channel with ordered dithering: 64 colours, very 8-bit. */
export function ditherPixels(px: Uint8ClampedArray, cols: number, rows: number) {
  const steps = 3
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = (r * cols + c) * 4
      const t = BAYER[(r & 3) * 4 + (c & 3)] * 0.9
      for (let k = 0; k < 3; k++) {
        const v = px[p + k] / 255
        px[p + k] = (Math.min(steps, Math.max(0, Math.round(v * steps + t))) / steps) * 255
      }
      px[p + 3] = 255
    }
  }
}

/**
 * `tiny` must already hold the dithered cols x rows image. Blocks are scaled
 * up with smoothing off, so every block keeps its hard 8-bit edge.
 */
export function drawPixel(ctx: CanvasRenderingContext2D, tiny: HTMLCanvasElement, width: number, height: number) {
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, 0, 0, width, height)
  ctx.imageSmoothingEnabled = true
}
