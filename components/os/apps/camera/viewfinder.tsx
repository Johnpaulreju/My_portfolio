"use client"

import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react"
import {
  coverCrop,
  cssFilter,
  applyColorOps,
  ditherPixels,
  drawAscii,
  drawMatrix,
  drawPixel,
  filterById,
  gridFor,
  newLevels,
  type CanvasFilterId,
  type Crop,
  type FilterId,
  type Levels,
} from "@/lib/os/camera/filters"
import { PATTERN_H, PATTERN_W, drawTestPattern } from "@/lib/os/camera/test-pattern"

export type Shot = { blob: Blob; width: number; height: number }

export type ViewfinderHandle = {
  /** Draws exactly what is on screen - crop, mirroring and filter - into a JPEG. */
  capture: () => Promise<Shot | null>
  /** Keeps a dimmed copy of the last frame on screen while the camera is off. */
  freeze: () => void
}

type Props = {
  source: "camera" | "pattern"
  stream: MediaStream | null
  mirror: boolean
  filter: FilterId
  /** Loops run only while the app is in use. */
  running: boolean
  motion: boolean
  /** The camera is wanted but off right now (app not in use, or waking up). */
  frozen: boolean
  onLive?: () => void
  ref?: Ref<ViewfinderHandle>
  children?: ReactNode
}

/** Canvas filters render below device resolution; they are chunky by design. */
const MAX_DPR = 1.5
const FRAME_MS = 1000 / 30

type Pipeline = {
  mid: HTMLCanvasElement
  tiny: HTMLCanvasElement
  tinyCtx: CanvasRenderingContext2D
  levels: Levels
}

function makePipeline(): Pipeline | null {
  const mid = document.createElement("canvas")
  const tiny = document.createElement("canvas")
  const tinyCtx = tiny.getContext("2d", { willReadFrequently: true })
  if (!tinyCtx) return null
  return { mid, tiny, tinyCtx, levels: newLevels() }
}

function sizeCanvas(canvas: HTMLCanvasElement, w: number, h: number) {
  // Assigning width clears and reallocates, so only do it on a real change.
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
}

/**
 * Samples the visible crop into a cols x rows grid. The mid step lets the GPU
 * do the big downscale, so only a small image is ever read back to the CPU.
 */
function sampleGrid(p: Pipeline, el: CanvasImageSource, crop: Crop, cols: number, rows: number, mirror: boolean) {
  const midW = Math.min(Math.round(crop.sw), cols * 4)
  const midH = Math.min(Math.round(crop.sh), rows * 4)
  sizeCanvas(p.mid, Math.max(1, midW), Math.max(1, midH))
  const mctx = p.mid.getContext("2d")
  if (!mctx) return null
  mctx.drawImage(el, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, p.mid.width, p.mid.height)
  sizeCanvas(p.tiny, cols, rows)
  const t = p.tinyCtx
  t.save()
  if (mirror) {
    t.translate(cols, 0)
    t.scale(-1, 1)
  }
  t.drawImage(p.mid, 0, 0, p.mid.width, p.mid.height, 0, 0, cols, rows)
  t.restore()
  return t.getImageData(0, 0, cols, rows)
}

function renderCanvasFilter(
  p: Pipeline,
  id: CanvasFilterId,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  el: CanvasImageSource,
  crop: Crop,
  view: { w: number; h: number },
  mirror: boolean,
  time: number,
  motion: boolean,
  adapt: boolean,
) {
  const { cols, rows } = gridFor(id, view.w, view.h)
  const image = sampleGrid(p, el, crop, cols, rows, mirror)
  if (!image) return
  if (id === "pixel") {
    ditherPixels(image.data, cols, rows)
    p.tinyCtx.putImageData(image, 0, 0)
    drawPixel(ctx, p.tiny, width, height)
    return
  }
  const input = { ctx, width, height, px: image.data, cols, rows, levels: p.levels, time, motion, adapt }
  if (id === "ascii") drawAscii(input)
  else drawMatrix(input)
}

export function Viewfinder({ source, stream, mirror, filter, running, motion, frozen, onLive, ref, children }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const patternRef = useRef<HTMLCanvasElement>(null)
  const filterRef = useRef<HTMLCanvasElement>(null)
  const freezeRef = useRef<HTMLCanvasElement>(null)
  const pipeline = useRef<Pipeline | null>(null)
  const view = useRef({ w: 1, h: 1 })
  const clock = useRef({ start: 0, time: 0 })
  const onLiveRef = useRef(onLive)
  onLiveRef.current = onLive
  const [hasFrame, setHasFrame] = useState(false)
  const [freezeFilter, setFreezeFilter] = useState("none")

  const spec = filterById(filter)
  const css = spec.kind === "css" ? cssFilter(spec.ops) : "none"

  const pipe = () => (pipeline.current ??= makePipeline())

  const sourceEl = (): { el: CanvasImageSource; w: number; h: number } | null => {
    if (source === "pattern") {
      const c = patternRef.current
      return c ? { el: c, w: c.width, h: c.height } : null
    }
    const v = videoRef.current
    if (!v || v.readyState < 2 || !v.videoWidth) return null
    return { el: v, w: v.videoWidth, h: v.videoHeight }
  }

  /* --- size ---------------------------------------------------------- */
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const measure = () => {
      const r = wrap.getBoundingClientRect()
      view.current = { w: Math.max(1, r.width), h: Math.max(1, r.height) }
    }
    measure()
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    ro?.observe(wrap)
    return () => ro?.disconnect()
  }, [])

  /* --- stream -------------------------------------------------------- */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    setHasFrame(false)
    if (!stream) {
      video.srcObject = null
      return
    }
    video.muted = true
    video.srcObject = stream
    const ready = () => {
      setHasFrame(true)
      onLiveRef.current?.()
    }
    video.addEventListener("loadeddata", ready, { once: true })
    video.play().catch(() => {
      /* the shell may pause media for an app that is not in use; the next resume plays it */
    })
    return () => video.removeEventListener("loadeddata", ready)
  }, [stream])

  /* --- the pattern clock and the canvas filters ---------------------- */
  useEffect(() => {
    const needsPattern = source === "pattern"
    const canvasFilter = spec.kind === "canvas" ? spec.id : null
    if (!running || (!needsPattern && !canvasFilter)) return
    if (!clock.current.start) clock.current.start = performance.now()
    const patternCtx = needsPattern ? patternRef.current?.getContext("2d") ?? null : null
    const out = canvasFilter ? filterRef.current : null
    const outCtx = out?.getContext("2d") ?? null
    // A test pattern with reduced motion is a still picture; one redraw a second keeps the timecode honest.
    const gap = needsPattern && !motion ? 1000 : FRAME_MS
    let raf = 0
    let last = -Infinity
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - last < gap - 2) return
      last = now
      const time = (now - clock.current.start) / 1000
      clock.current.time = time
      if (patternCtx) drawTestPattern(patternCtx, PATTERN_W, PATTERN_H, time, motion)
      if (!canvasFilter || !out || !outCtx) return
      const src = sourceEl()
      const p = pipe()
      if (!src || !p) return
      const { w, h } = view.current
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      sizeCanvas(out, Math.max(1, Math.round(w * dpr)), Math.max(1, Math.round(h * dpr)))
      const crop = coverCrop(src.w, src.h, w, h)
      renderCanvasFilter(p, canvasFilter, outCtx, out.width, out.height, src.el, crop, view.current, mirror && source === "camera", time, motion, true)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sourceEl and pipe only read refs
  }, [running, source, spec.id, spec.kind, mirror, motion])

  /* --- capture and freeze -------------------------------------------- */
  useImperativeHandle(ref, () => ({
    freeze() {
      const canvas = freezeRef.current
      const src = sourceEl()
      if (!canvas || !src) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      const { w, h } = view.current
      const scale = Math.min(1, 480 / Math.max(w, h))
      sizeCanvas(canvas, Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)))
      if (spec.kind === "canvas" && filterRef.current) {
        ctx.drawImage(filterRef.current, 0, 0, canvas.width, canvas.height)
        setFreezeFilter("none")
      } else {
        const crop = coverCrop(src.w, src.h, w, h)
        ctx.save()
        if (mirror && source === "camera") {
          ctx.translate(canvas.width, 0)
          ctx.scale(-1, 1)
        }
        ctx.drawImage(src.el, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height)
        ctx.restore()
        setFreezeFilter(css)
      }
    },

    async capture() {
      const src = sourceEl()
      const p = pipe()
      if (!src || !p) return null
      const { w, h } = view.current
      let crop = coverCrop(src.w, src.h, w, h)
      const long = Math.max(crop.sw, crop.sh)
      // Canvas looks and the pattern are drawn, not sampled, so they can be drawn big and sharp.
      const drawn = spec.kind === "canvas" || source === "pattern"
      const scale = (drawn ? Math.min(1920, Math.max(1280, long)) : Math.min(1920, long)) / long
      let el: CanvasImageSource = src.el
      if (source === "pattern" && spec.kind === "css") {
        const big = document.createElement("canvas")
        big.width = Math.round(PATTERN_W * scale)
        big.height = Math.round(PATTERN_H * scale)
        const bctx = big.getContext("2d")
        if (!bctx) return null
        drawTestPattern(bctx, big.width, big.height, clock.current.time, motion)
        el = big
        crop = coverCrop(big.width, big.height, w, h)
      }
      const out = document.createElement("canvas")
      out.width = Math.max(1, Math.round(source === "pattern" && spec.kind === "css" ? crop.sw : crop.sw * scale))
      out.height = Math.max(1, Math.round(source === "pattern" && spec.kind === "css" ? crop.sh : crop.sh * scale))
      const ctx = out.getContext("2d", { willReadFrequently: spec.kind === "css" && spec.ops.length > 0 })
      if (!ctx) return null
      const flip = mirror && source === "camera"

      if (spec.kind === "canvas") {
        renderCanvasFilter(p, spec.id, ctx, out.width, out.height, el, crop, view.current, flip, clock.current.time, motion, false)
      } else {
        ctx.save()
        if (flip) {
          ctx.translate(out.width, 0)
          ctx.scale(-1, 1)
        }
        ctx.drawImage(el, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, out.width, out.height)
        ctx.restore()
        if (spec.ops.length) {
          const image = ctx.getImageData(0, 0, out.width, out.height)
          applyColorOps(image.data, spec.ops)
          ctx.putImageData(image, 0, 0)
        }
      }
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/jpeg", 0.92))
      return blob ? { blob, width: out.width, height: out.height } : null
    },
  }))

  const showCanvas = spec.kind === "canvas"
  const sourceStyle = {
    filter: css === "none" ? undefined : css,
    transform: mirror && source === "camera" ? "scaleX(-1)" : undefined,
    // Hidden sources keep running so the canvas filters can keep sampling them.
    opacity: showCanvas ? 0 : 1,
  }
  const showFreeze = frozen && source === "camera"

  return (
    <div ref={wrapRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-black" data-camera-viewfinder>
      {source === "camera" ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ ...sourceStyle, visibility: hasFrame ? "visible" : "hidden" }}
          playsInline
          muted
          autoPlay
          disablePictureInPicture
          aria-hidden
        />
      ) : (
        <canvas
          ref={patternRef}
          width={PATTERN_W}
          height={PATTERN_H}
          className="absolute inset-0 h-full w-full object-cover"
          style={sourceStyle}
          aria-hidden
        />
      )}
      <canvas
        ref={filterRef}
        className="absolute inset-0 h-full w-full"
        style={{ visibility: showCanvas ? "visible" : "hidden" }}
        aria-hidden
      />
      <canvas
        ref={freezeRef}
        className="absolute inset-0 h-full w-full"
        style={{
          visibility: showFreeze ? "visible" : "hidden",
          filter: `${freezeFilter === "none" ? "" : freezeFilter} blur(10px) brightness(.55)`,
          transform: "scale(1.06)",
        }}
        aria-hidden
      />
      {children}
    </div>
  )
}
