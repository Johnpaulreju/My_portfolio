"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Moon, Power, Sparkles, Timer, TimerOff, X } from "lucide-react"
import { useAppActive } from "@/lib/os/app-activity"
import { useSystem } from "@/lib/os/system-store"
import { inertProps } from "@/components/os/shell-dom"
import type { FilterId } from "@/lib/os/camera/filters"
import { addPhoto, removePhoto, uniqueName, type Photo } from "@/lib/os/camera/gallery"
import {
  cameraConstraints,
  cameraPermission,
  classifyError,
  photoName,
  shouldMirror,
  stopStream,
  supportProblem,
  type CameraErrorKind,
  type Facing,
} from "@/lib/os/camera/media"
import { createShutterSound } from "@/lib/os/camera/shutter-sound"
import { FilterPicker, GalleryThumb, Shutter, SwitchButton } from "./camera/controls"
import { Gallery } from "./camera/gallery"
import { ErrorScreen, StartScreen } from "./camera/screens"
import { FOCUS_ON_DARK, GLASS, claimFocus, prefersReducedMotion } from "./camera/ui"
import { Viewfinder, type ViewfinderHandle } from "./camera/viewfinder"

type Mode = { name: "off" } | { name: "camera" } | { name: "pattern" } | { name: "error"; kind: CameraErrorKind }

type Layout = { side: boolean; short: boolean }

const TIMERS = [0, 3, 10] as const
type TimerSeconds = (typeof TIMERS)[number]

/** A line of hello when a look is picked. The radio itself tells screen readers the name. */
const CAPTIONS: Record<FilterId, string> = {
  normal: "Normal. No bugs, just you.",
  mono: "Mono. Like a terminal, but prettier.",
  warm: "Warm. Golden hour, any hour.",
  ascii: "ASCII. You, rendered as text.",
  matrix: "Matrix. There is no spoon.",
  pixel: "Pixel. 8-bit you.",
}

const env = () => ({
  secure: window.isSecureContext,
  hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === "function",
  ua: navigator.userAgent,
})

export function CameraApp() {
  const active = useAppActive()
  const [mode, setMode] = useState<Mode>({ name: "off" })
  /** The browser's permission prompt is (probably) up; keep the start screen until it answers. */
  const [prompting, setPrompting] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [live, setLive] = useState(false)
  const [facing, setFacing] = useState<Facing>("user")
  /** Whether the camera says which way it faces (phones do, laptop webcams usually don't). */
  const [facingKnown, setFacingKnown] = useState(false)
  const [mirror, setMirror] = useState(true)
  const [cameras, setCameras] = useState(0)
  const [filter, setFilter] = useState<FilterId>("normal")
  const [caption, setCaption] = useState<FilterId | null>(null)
  const [timer, setTimer] = useState<TimerSeconds>(0)
  const [countdown, setCountdown] = useState(0)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [layout, setLayout] = useState<Layout>({ side: false, short: false })
  const [motion, setMotion] = useState(true)
  const [message, setMessage] = useState("")
  const [wake, setWake] = useState(0)

  const rootRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<ViewfinderHandle>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLButtonElement>(null)
  const shutterRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const photosRef = useRef<Photo[]>([])
  /** Bumped whenever the camera is let go, so a late getUserMedia answer knows it is stale. */
  const gen = useRef(0)
  const inflight = useRef(false)
  const chosenDevice = useRef<string | undefined>(undefined)
  const permission = useRef<PermissionState | "unknown">("unknown")
  const sound = useRef<ReturnType<typeof createShutterSound> | null>(null)
  const shooting = useRef(false)
  /** Say "Camera on" once per turn-on, not after every nap. */
  const greeted = useRef(false)

  const onCamera = mode.name === "camera"
  const source = mode.name === "pattern" ? "pattern" : "camera"
  const inUse = active && !galleryOpen
  const wantLive = inUse && onCamera

  const announce = useCallback((text: string) => {
    // Clearing first makes a repeated message ("Photo saved.") speak again.
    setMessage("")
    requestAnimationFrame(() => setMessage(text))
  }, [])

  const commitPhotos = (next: Photo[]) => {
    photosRef.current = next
    setPhotos(next)
  }

  /* --- camera on and off ------------------------------------------------ */

  /** Stops every track. Keeps a dimmed copy of the last frame so a paused window isn't a black hole. */
  const release = useCallback(() => {
    if (streamRef.current) viewRef.current?.freeze()
    gen.current++
    inflight.current = false
    stopStream(streamRef.current)
    streamRef.current = null
    setStream(null)
    setLive(false)
  }, [])

  const fail = useCallback(
    (kind: CameraErrorKind) => {
      release()
      setPrompting(false)
      setMode({ name: "error", kind })
    },
    [release],
  )

  const refreshCameras = useCallback(() => {
    navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((list) => setCameras(list.filter((d) => d.kind === "videoinput").length))
      .catch(() => {})
  }, [])

  const request = useCallback(
    async (want: Facing, deviceId?: string) => {
      const problem = supportProblem(env())
      if (problem) {
        fail(problem)
        return
      }
      // One camera at a time: some phones cannot open front and back together.
      if (streamRef.current) viewRef.current?.freeze()
      stopStream(streamRef.current)
      streamRef.current = null
      const mine = ++gen.current
      inflight.current = true
      try {
        const next = await navigator.mediaDevices.getUserMedia(cameraConstraints(want, deviceId))
        if (mine !== gen.current) {
          // Visitor left (or switched) while the browser was thinking. Let it go at once.
          stopStream(next)
          return
        }
        inflight.current = false
        const track = next.getVideoTracks()[0]
        const reported = track?.getSettings?.().facingMode
        setFacing(want)
        setFacingKnown(reported === "user" || reported === "environment")
        setMirror(shouldMirror(want, reported))
        track?.addEventListener("ended", () => {
          if (streamRef.current !== next) return
          // Revoking the permission in site settings also ends the track.
          fail(permission.current === "denied" ? "denied" : "stopped")
        })
        streamRef.current = next
        setLive(false)
        setStream(next)
        setPrompting(false)
        refreshCameras()
      } catch (error) {
        if (mine !== gen.current) return
        inflight.current = false
        if (deviceId) {
          // The chosen camera went away; fall back to any camera facing the same way.
          chosenDevice.current = undefined
          void request(want)
          return
        }
        fail(classifyError(error, navigator.userAgent))
      }
    },
    [fail, refreshCameras],
  )

  const requestRef = useRef(request)
  const facingRef = useRef(facing)
  useEffect(() => {
    requestRef.current = request
    facingRef.current = facing
  })

  // The heart of it: the camera runs only while Camera is on screen, focused and in use.
  useEffect(() => {
    if (!wantLive) {
      release()
      return
    }
    if (!streamRef.current && !inflight.current) void requestRef.current(facingRef.current, chosenDevice.current)
  }, [wantLive, wake, release])

  const turnOn = () => {
    greeted.current = false
    setPrompting(permission.current !== "granted")
    setMode({ name: "camera" })
    // Called straight from the click, so browsers that want a user gesture get one.
    void request(facing, chosenDevice.current)
  }

  const turnOff = () => {
    setCountdown(0)
    setPrompting(false)
    setMode({ name: "off" })
    announce("Camera off.")
  }

  const usePattern = () => {
    setPrompting(false)
    setMode({ name: "pattern" })
    announce("Test pattern on.")
  }

  const switchCamera = () => {
    if (facingKnown || cameras < 2) {
      const next: Facing = facing === "user" ? "environment" : "user"
      chosenDevice.current = undefined
      void request(next)
      return
    }
    // Laptop cameras don't say which way they face, so step through them instead.
    navigator.mediaDevices
      .enumerateDevices()
      .then((list) => {
        const inputs = list.filter((d) => d.kind === "videoinput" && d.deviceId)
        const current = streamRef.current?.getVideoTracks()[0]?.getSettings?.().deviceId
        const at = inputs.findIndex((d) => d.deviceId === current)
        const next = inputs[(at + 1) % inputs.length]
        chosenDevice.current = next?.deviceId
        void request(facing, next?.deviceId)
      })
      .catch(() => {})
  }

  /* --- permission, page lifecycle, unmount ------------------------------ */

  useEffect(() => {
    let status: PermissionStatus | null = null
    let dead = false
    const onChange = () => {
      if (!status) return
      permission.current = status.state
      // Allowed in site settings while the "blocked" card was up: just start.
      if (status.state === "granted") {
        setMode((m) => (m.name === "error" && m.kind === "denied" ? { name: "camera" } : m))
      }
    }
    cameraPermission().then((s) => {
      if (dead || !s) return
      status = s
      permission.current = s.state
      // Said yes before? Skip the start screen.
      if (s.state === "granted") setMode((m) => (m.name === "off" ? { name: "camera" } : m))
      s.addEventListener("change", onChange)
    })
    return () => {
      dead = true
      status?.removeEventListener("change", onChange)
    }
  }, [])

  useEffect(() => {
    const hide = () => release()
    // Coming back from the back/forward cache: the effect above won't re-run on its own.
    const show = (e: PageTransitionEvent) => {
      if (e.persisted) setWake((n) => n + 1)
    }
    window.addEventListener("pagehide", hide)
    window.addEventListener("pageshow", show)
    return () => {
      window.removeEventListener("pagehide", hide)
      window.removeEventListener("pageshow", show)
    }
  }, [release])

  useEffect(
    () => () => {
      release()
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.url))
      photosRef.current = []
      sound.current?.dispose()
      sound.current = null
    },
    [release],
  )

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)")
    if (!mq) return
    const sync = () => setMotion(!mq.matches)
    sync()
    mq.addEventListener?.("change", sync)
    return () => mq.removeEventListener?.("change", sync)
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      const { width: w, height: h } = root.getBoundingClientRect()
      if (!w || !h) return
      // A phone held sideways: controls move to the right, like a real camera.
      const side = w / h >= 1.45 && h < 460
      const short = h < 520
      setLayout((l) => (l.side === side && l.short === short ? l : { side, short }))
    })
    ro.observe(root)
    return () => ro.disconnect()
  }, [])

  /* --- filters and timer ------------------------------------------------ */

  const pickFilter = (id: FilterId) => {
    setFilter(id)
    setCaption(id)
  }
  useEffect(() => {
    if (!caption) return
    const id = window.setTimeout(() => setCaption(null), 1600)
    return () => clearTimeout(id)
  }, [caption])

  const cycleTimer = () => {
    const next = TIMERS[(TIMERS.indexOf(timer) + 1) % TIMERS.length]
    setTimer(next)
    announce(next ? `Self-timer ${next} seconds.` : "Self-timer off.")
  }

  /* --- taking a photo --------------------------------------------------- */

  const ready = inUse && (mode.name === "pattern" || (onCamera && live))

  const flash = () => {
    const el = flashRef.current
    if (!el?.animate) return
    // Reduced motion: a soft dim fade instead of a bright flash.
    if (prefersReducedMotion()) el.animate([{ opacity: 0 }, { opacity: 0.35 }, { opacity: 0 }], { duration: 300, easing: "linear" })
    else el.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 320, easing: "cubic-bezier(.2,.7,.3,1)" })
  }

  const pop = () => {
    const el = thumbRef.current
    if (!el?.animate) return
    if (prefersReducedMotion()) el.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 200 })
    else el.animate([{ transform: "scale(.6)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 320, easing: "ease-out" })
  }

  const shoot = async () => {
    const view = viewRef.current
    if (!view || shooting.current) return
    shooting.current = true
    flash()
    const { volume, muted } = useSystem.getState()
    ;(sound.current ??= createShutterSound()).play(volume, muted)
    try {
      const shot = await view.capture()
      if (!shot) {
        announce("That one got away. Try again.")
        return
      }
      const takenAt = Date.now()
      const photo: Photo = {
        id: `${takenAt}-${Math.random().toString(36).slice(2, 7)}`,
        url: URL.createObjectURL(shot.blob),
        blob: shot.blob,
        name: uniqueName(photosRef.current, photoName(new Date(takenAt))),
        takenAt,
        width: shot.width,
        height: shot.height,
        filter,
      }
      const { photos: next, dropped } = addPhoto(photosRef.current, photo)
      dropped.forEach((p) => URL.revokeObjectURL(p.url))
      commitPhotos(next)
      requestAnimationFrame(pop)
      announce(`Photo saved. ${next.length} photo${next.length === 1 ? "" : "s"}.`)
    } finally {
      shooting.current = false
    }
  }

  const shootRef = useRef(shoot)
  useEffect(() => {
    shootRef.current = shoot
  })

  const pressShutter = () => {
    if (countdown) {
      setCountdown(0)
      announce("Timer cancelled.")
      return
    }
    if (!ready) return
    if (timer) {
      setCountdown(timer)
      announce(`Taking a photo in ${timer} seconds.`)
      return
    }
    void shoot()
  }

  useEffect(() => {
    if (!countdown) return
    const id = window.setTimeout(() => {
      if (countdown > 1) setCountdown(countdown - 1)
      else {
        setCountdown(0)
        void shootRef.current()
      }
    }, 1000)
    return () => clearTimeout(id)
  }, [countdown])

  // No surprise photos: leaving, pausing or opening the gallery cancels a running timer.
  useEffect(() => {
    if (!ready) setCountdown(0)
  }, [ready])

  /* --- gallery ---------------------------------------------------------- */

  const openGallery = () => {
    openerRef.current = document.activeElement as HTMLElement | null
    setGalleryIndex(0)
    setGalleryOpen(true)
  }

  const closeGallery = () => {
    setGalleryOpen(false)
    requestAnimationFrame(() => {
      const back = openerRef.current?.isConnected ? openerRef.current : thumbRef.current
      back?.focus({ preventScroll: true })
    })
  }

  const deletePhoto = (photo: Photo) => {
    const { photos: next, removed, index } = removePhoto(photosRef.current, photo.id)
    if (!removed) return
    URL.revokeObjectURL(removed.url)
    commitPhotos(next)
    setGalleryIndex(Math.max(0, Math.min(index, next.length - 1)))
    announce(next.length ? "Photo deleted." : "Photo deleted. Gallery is empty.")
  }

  /* --- screens ---------------------------------------------------------- */

  const starting = mode.name === "off" || (onCamera && prompting && !stream)
  const viewing = !starting && mode.name !== "error"
  // The button that was pressed just unmounted; hand focus to the shutter.
  useEffect(() => {
    if (viewing) claimFocus(shutterRef.current)
  }, [viewing])

  let body
  if (starting) {
    body = <StartScreen asking={onCamera} photos={photos.length} onStart={turnOn} onPattern={usePattern} onGallery={openGallery} />
  } else if (mode.name === "error") {
    body = <ErrorScreen kind={mode.kind} photos={photos.length} onRetry={turnOn} onPattern={usePattern} onGallery={openGallery} />
  } else {
    const { side, short } = layout
    const counting = countdown > 0
    const switchLabel = facingKnown ? (facing === "user" ? "Switch to back camera" : "Switch to front camera") : "Switch camera"
    const canSwitch = onCamera && cameras > 1
    const timerLabel = timer ? `Self-timer: ${timer} seconds` : "Self-timer: off"

    const controls = [
      <GalleryThumb key="thumb" ref={thumbRef} url={photos[0]?.url ?? null} count={photos.length} onOpen={openGallery} />,
      <Shutter key="shutter" ref={shutterRef} onPress={pressShutter} disabled={!ready && !counting} counting={counting} size={side || short ? 64 : 72} />,
      canSwitch ? (
        <SwitchButton key="switch" label={switchLabel} onPress={switchCamera} disabled={!live} />
      ) : (
        <span key="switch" aria-hidden className="h-12 w-12" />
      ),
    ]

    body = (
      <div className={`flex h-full min-h-0 ${side ? "flex-row" : "flex-col"}`}>
        <Viewfinder
          ref={viewRef}
          source={source}
          stream={stream}
          mirror={mirror}
          filter={filter}
          running={inUse}
          motion={motion}
          frozen={onCamera && !live}
          onLive={() => {
            setLive(true)
            if (greeted.current) return
            greeted.current = true
            announce("Camera on. Smile!")
          }}
        >
          <div ref={flashRef} aria-hidden className="pointer-events-none absolute inset-0 z-20 bg-white opacity-0" />

          {onCamera && !live && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-[13px] font-medium text-white backdrop-blur-sm">
                {active ? <Loader2 size={16} className={motion ? "animate-spin" : ""} aria-hidden /> : <Moon size={16} aria-hidden />}
                {active ? "Waking up the camera…" : "Camera naps while you're away"}
              </span>
            </div>
          )}

          {counting && (
            <div aria-hidden className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
              <span className="text-[88px] font-bold tabular-nums leading-none text-white" style={{ textShadow: "0 2px 18px rgba(0,0,0,.6)" }}>
                {countdown}
              </span>
            </div>
          )}

          <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-2">
            <button
              type="button"
              onClick={turnOff}
              aria-label={onCamera ? "Turn off camera" : "Stop test pattern"}
              title={onCamera ? "Turn off camera" : "Stop test pattern"}
              className={`${GLASS} ${FOCUS_ON_DARK}`}
            >
              {onCamera ? <Power size={20} /> : <X size={20} />}
            </button>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1 pt-2.5" aria-hidden>
              {mode.name === "pattern" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-[12px] font-semibold text-white">
                  <Sparkles size={13} />
                  Test pattern
                </span>
              )}
              {caption && (
                <span className="max-w-full truncate rounded-full bg-black/55 px-3 py-1 text-[12.5px] font-medium text-white">{CAPTIONS[caption]}</span>
              )}
            </div>
            <button
              type="button"
              onClick={cycleTimer}
              aria-label={timerLabel}
              title={timerLabel}
              className={`${GLASS} ${FOCUS_ON_DARK} relative`}
            >
              {timer ? <Timer size={20} /> : <TimerOff size={20} />}
              {timer > 0 && (
                <span className="absolute -bottom-0.5 -right-0.5 rounded-full px-1 text-[10.5px] font-bold leading-4" style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}>
                  {timer}s
                </span>
              )}
            </button>
          </div>
        </Viewfinder>

        <div
          className={`flex shrink-0 ${side ? "h-full flex-row" : "flex-col"}`}
          style={{ background: "var(--os-chrome)", color: "var(--os-fg)", [side ? "borderLeft" : "borderTop"]: "1px solid var(--os-border)" }}
        >
          <FilterPicker value={filter} onChange={pickFilter} orientation={side ? "vertical" : "horizontal"} />
          {side ? (
            <div className="flex w-[88px] flex-col items-center justify-evenly py-2">
              {[controls[2], controls[1], controls[0]]}
            </div>
          ) : (
            <div className={`grid grid-cols-3 items-center px-6 ${short ? "pb-2" : "pb-4 pt-1"}`}>
              <div className="justify-self-start">{controls[0]}</div>
              <div className="justify-self-center">{controls[1]}</div>
              <div className="justify-self-end">{controls[2]}</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      data-camera-root
      className="relative h-full min-h-0 overflow-hidden"
      style={{ background: "var(--os-surface)", color: "var(--os-fg)" }}
    >
      <div className="h-full" {...inertProps(galleryOpen)}>
        {body}
      </div>
      {galleryOpen && (
        <Gallery
          photos={photos}
          index={Math.min(galleryIndex, Math.max(0, photos.length - 1))}
          compact={layout.side}
          onIndex={setGalleryIndex}
          onClose={closeGallery}
          onDelete={deletePhoto}
        />
      )}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {message}
      </p>
    </div>
  )
}
