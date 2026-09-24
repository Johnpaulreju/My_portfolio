"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as RKeyboardEvent,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from "react"
import {
  AlertTriangle,
  Camera,
  Captions,
  Check,
  ChevronRight,
  FastForward,
  FileVideo2,
  Film,
  FolderOpen,
  Info,
  Loader2,
  Maximize2,
  Pause,
  Pin,
  Play,
  Repeat,
  Rewind,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { useFS } from "@/lib/os/fs-store"
import { useSystem } from "@/lib/os/system-store"
import { useWM } from "@/lib/os/wm-store"
import { Slider } from "@/components/os/ui/slider"
import type { WindowInstance } from "@/lib/os/types"

/**
 * Prism Player — a desktop media player in the spirit of VLC, with none of its
 * marks. Original name, original glyph (a split light-prism chevron), original
 * chrome. No cone, nowhere, in any colour.
 */

const FALLBACK_SRC = "/media/intro.mp4"

/** Sidecar assets, keyed by media path. Anything not listed simply has none. */
const POSTERS: Record<string, string> = { "/media/intro.mp4": "/media/intro-poster.jpg" }
const SUBTITLES: Record<string, string> = { "/media/intro.mp4": "/media/intro.en.vtt" }

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

type Item = { id: string; name: string; src: string }
type Status = "idle" | "loading" | "ready" | "error"
type MenuName = "media" | "playback" | "audio" | "video" | "tools" | null

function fmt(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m)
  return h > 0 ? `${h}:${mm}:${String(sec).padStart(2, "0")}` : `${mm}:${String(sec).padStart(2, "0")}`
}

/**
 * How far the buffer reaches *from the current position*.
 *
 * Two traps here: `buffered.end(0)` throws an IndexSizeError when length is 0
 * (nothing downloaded yet), and after a forward seek the ranges are disjoint —
 * range 0 is the old head, far behind the playhead. So: never touch index 0
 * blindly, find the range that actually contains the playhead, and if none does
 * (we just seeked into a hole) report the playhead itself: nothing ahead yet.
 */
function bufferedAhead(v: HTMLVideoElement, t: number): number {
  try {
    const b = v.buffered
    if (!b || b.length === 0) return 0
    for (let i = 0; i < b.length; i++) {
      // A little slack: the playhead sits a hair outside its own range mid-seek.
      if (t >= b.start(i) - 0.5 && t <= b.end(i) + 0.5) return b.end(i)
    }
    return t
  } catch {
    // Some engines throw on `buffered` while the element is between sources.
    return 0
  }
}

export function PlayerApp({ win }: { win: WindowInstance }) {
  const nodes = useFS((s) => s.nodes)
  const setTitle = useWM((s) => s.setTitle)
  const setPayload = useWM((s) => s.setPayload)
  const toggleMaximize = useWM((s) => s.toggleMaximize)
  const sysVolume = useSystem((s) => s.volume)
  const sysMuted = useSystem((s) => s.muted)

  /** Every video the filesystem knows about becomes the playlist. */
  const playlist = useMemo<Item[]>(() => {
    const vids = nodes
      .filter((n) => n.kind === "video" && !n.deletedAt)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((n) => ({ id: n.id, name: n.name, src: n.src ?? "" }))
    return vids.length > 0 ? vids : [{ id: "fallback", name: "Meet Johnpaul.mp4", src: FALLBACK_SRC }]
  }, [nodes])

  const payloadId = win.payload?.fileId as string | undefined

  const [index, setIndex] = useState(() => {
    const i = playlist.findIndex((p) => p.id === payloadId)
    return i >= 0 ? i : 0
  })
  const item = playlist[Math.min(index, playlist.length - 1)] ?? playlist[0]

  const [status, setStatus] = useState<Status>(item.src ? "loading" : "idle")
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showRemaining, setShowRemaining] = useState(false)
  const [resolution, setResolution] = useState<{ w: number; h: number } | null>(null)
  const [rate, setRate] = useState(1)
  const [loop, setLoop] = useState(false)
  const [vol, setVol] = useState(() => Math.round(sysVolume))
  const [muted, setMuted] = useState(() => sysMuted)
  const [subsOn, setSubsOn] = useState(false)
  const [menu, setMenu] = useState<MenuName>(null)
  const [picker, setPicker] = useState(false)
  const [info, setInfo] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const playedRef = useRef<HTMLSpanElement>(null)
  const bufferRef = useRef<HTMLSpanElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)

  const rafRef = useRef<number | null>(null)
  const lastSec = useRef(-1)
  const scrubbing = useRef(false)
  const resumeAfterScrub = useRef(false)
  /** Set when a track change should roll straight on, e.g. Next while playing. */
  const autoplayNext = useRef(false)

  const subtitleSrc = item.src ? SUBTITLES[item.src] : undefined
  const poster = item.src ? POSTERS[item.src] : undefined
  const single = playlist.length <= 1

  /* ----------------------------------------------------------------- painting
     The played fill is written straight to the DOM from rAF — React never sees
     a frame of it. Only the two clock labels are state, and only once a second. */

  const paint = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0
    const t = v.currentTime
    const r = dur > 0 ? Math.min(1, Math.max(0, t / dur)) : 0
    const br = dur > 0 ? Math.min(1, Math.max(0, bufferedAhead(v, t) / dur)) : 0

    if (playedRef.current) playedRef.current.style.transform = `scaleX(${r})`
    if (bufferRef.current) bufferRef.current.style.transform = `scaleX(${br})`
    if (thumbRef.current) thumbRef.current.style.left = `${r * 100}%`

    const sec = Math.floor(t)
    if (sec !== lastSec.current) {
      lastSec.current = sec
      setElapsed(sec)
    }
  }, [])

  // rAF runs only while frames are actually moving.
  useEffect(() => {
    if (!playing) return
    const tick = () => {
      if (!scrubbing.current) paint()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [playing, paint])

  /* ------------------------------------------------------------------ sources */

  // Follow the window payload when the shell points this window at another file.
  useEffect(() => {
    if (!payloadId) return
    const i = playlist.findIndex((p) => p.id === payloadId)
    if (i >= 0) setIndex((cur) => (cur === i ? cur : i))
  }, [payloadId, playlist])

  useEffect(() => {
    setTitle(win.id, `${item.name} — Prism Player`)
  }, [item.name, setTitle, win.id])

  // A new source resets every derived reading, then loads.
  useEffect(() => {
    const v = videoRef.current
    lastSec.current = -1
    setElapsed(0)
    setDuration(0)
    setResolution(null)
    setStatus(item.src ? "loading" : "idle")
    if (playedRef.current) playedRef.current.style.transform = "scaleX(0)"
    if (bufferRef.current) bufferRef.current.style.transform = "scaleX(0)"
    if (thumbRef.current) thumbRef.current.style.left = "0%"
    if (!v || !item.src) return
    v.load()
    if (autoplayNext.current) {
      autoplayNext.current = false
      v.play().catch(() => {})
    }
  }, [item.id, item.src])

  // The player owns the keyboard the moment its window opens.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
  }, [])

  // Volume uses a perceptual curve: the slider's midpoint should *sound* halfway.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.volume = Math.min(1, Math.max(0, vol / 100)) ** 2
    v.muted = muted
  }, [vol, muted, item.id, item.src])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    // defaultPlaybackRate too, or load() snaps the rate back to 1.
    v.defaultPlaybackRate = rate
    v.playbackRate = rate
  }, [rate, item.id, item.src])

  useEffect(() => {
    const v = videoRef.current
    if (v) v.loop = loop
  }, [loop, item.id, item.src])

  // Text tracks only exist after metadata, so re-assert on every load.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const apply = () => {
      for (let i = 0; i < v.textTracks.length; i++) {
        v.textTracks[i].mode = subsOn ? "showing" : "hidden"
      }
    }
    apply()
    v.addEventListener("loadedmetadata", apply)
    return () => v.removeEventListener("loadedmetadata", apply)
  }, [subsOn, item.id, item.src])

  /* ----------------------------------------------------------------- commands */

  const focusSelf = useCallback(() => rootRef.current?.focus(), [])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v || !item.src) return
    if (v.paused || v.ended) v.play().catch(() => setStatus("error"))
    else v.pause()
  }, [item.src])

  const stop = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    try {
      v.currentTime = 0
    } catch {
      /* not seekable yet */
    }
    lastSec.current = -1
    setElapsed(0)
    paint()
  }, [paint])

  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRef.current
      if (!v || !Number.isFinite(v.duration)) return
      v.currentTime = Math.min(v.duration, Math.max(0, v.currentTime + delta))
      paint()
    },
    [paint],
  )

  const go = useCallback(
    (step: 1 | -1) => {
      if (single) return
      const v = videoRef.current
      autoplayNext.current = !!v && !v.paused && !v.ended
      setIndex((cur) => {
        const next = (cur + step + playlist.length) % playlist.length
        const target = playlist[next]
        if (target) setPayload(win.id, { fileId: target.id })
        return next
      })
    },
    [playlist, setPayload, single, win.id],
  )

  const stepRate = useCallback((dir: 1 | -1) => {
    setRate((cur) => {
      const i = RATES.indexOf(cur)
      const at = i >= 0 ? i : RATES.indexOf(1)
      return RATES[Math.min(RATES.length - 1, Math.max(0, at + dir))]
    })
  }, [])

  const nudgeVolume = useCallback((delta: number) => {
    setMuted(false)
    setVol((cur) => Math.min(100, Math.max(0, cur + delta)))
  }, [])

  const openItem = useCallback(
    (id: string) => {
      const i = playlist.findIndex((p) => p.id === id)
      if (i < 0) return
      const v = videoRef.current
      autoplayNext.current = !!v && !v.paused && !v.ended
      setIndex(i)
      setPayload(win.id, { fileId: id })
      setPicker(false)
      focusSelf()
    },
    [focusSelf, playlist, setPayload, win.id],
  )

  /* ------------------------------------------------------------------ scrubbing */

  const ratioFromX = (clientX: number) => {
    const el = trackRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)))
  }

  const scrubTo = (ratio: number) => {
    const v = videoRef.current
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return
    v.currentTime = ratio * v.duration
    paint()
  }

  const onTrackDown = (e: RPointerEvent<HTMLDivElement>) => {
    const v = videoRef.current
    if (e.button !== 0 || !v || !Number.isFinite(v.duration) || v.duration <= 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    scrubbing.current = true
    // Pausing while dragging keeps the decode quiet; we put it back afterwards.
    resumeAfterScrub.current = !v.paused && !v.ended
    if (resumeAfterScrub.current) v.pause()
    scrubTo(ratioFromX(e.clientX))
  }

  const onTrackMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return
    scrubTo(ratioFromX(e.clientX))
  }

  const endScrub = (e: RPointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return
    scrubbing.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (resumeAfterScrub.current) {
      resumeAfterScrub.current = false
      videoRef.current?.play().catch(() => {})
    }
  }

  const onTrackKey = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (!videoRef.current) return
    if (e.key === "ArrowRight") seekBy(e.shiftKey ? 3 : 10)
    else if (e.key === "ArrowLeft") seekBy(e.shiftKey ? -3 : -10)
    else if (e.key === "Home") scrubTo(0)
    else if (e.key === "End") scrubTo(0.999)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  /* ------------------------------------------------------------------ keyboard */

  const onKeyDown = (e: RKeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement | null
    // Never steal keys from a field, or from a slider that handles its own arrows.
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
    const k = e.key
    // A slider owns its own arrows - but Space, M, S and F still belong to the
    // player even while the seek bar or the volume slider has focus.
    const arrowish =
      k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown" ||
      k === "Home" || k === "End" || k === "PageUp" || k === "PageDown"
    if (arrowish && t && t.closest('[role="slider"]')) return
    // A focused button already answers Space/Enter itself; handling it here too
    // would toggle playback twice and cancel itself out.
    if (t && t.closest("button") && (k === " " || k === "Spacebar" || k === "Enter")) return
    if (k === "Escape") {
      if (menu || picker || info) {
        e.preventDefault()
        setMenu(null)
        setPicker(false)
        setInfo(false)
      }
      return
    }
    if (k === " " || k === "Spacebar") togglePlay()
    else if (k === "s" || k === "S") stop()
    else if (k === "m" || k === "M") setMuted((m) => !m)
    // The window manager owns "fullscreen" here — the real Fullscreen API would
    // escape the window layer entirely and paint over the taskbar.
    else if (k === "f" || k === "F") toggleMaximize(win.id)
    else if (k === "ArrowRight") seekBy(e.shiftKey ? 3 : 10)
    else if (k === "ArrowLeft") seekBy(e.shiftKey ? -3 : -10)
    else if (k === "ArrowUp") nudgeVolume(5)
    else if (k === "ArrowDown") nudgeVolume(-5)
    else return
    e.preventDefault()
  }

  /* -------------------------------------------------------------------- render */

  const remaining = Math.max(0, duration - elapsed)
  const VolumeIcon = muted || vol === 0 ? VolumeX : vol < 50 ? Volume1 : Volume2
  const closeMenus = () => {
    setMenu(null)
  }

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={closeMenus}
      className="flex h-full min-h-0 flex-col outline-none"
      style={{ background: "var(--os-window)", color: "var(--os-fg)" }}
      aria-label="Prism Player"
    >
      {/* ------------------------------------------------------------ menu bar */}
      <div
        className="flex shrink-0 items-center gap-0.5 border-b px-1.5 py-1 text-[12px] os-no-select"
        style={{ borderColor: "var(--os-border)", background: "var(--os-chrome)" }}
        role="menubar"
      >
        <span className="mr-1.5 flex items-center gap-1.5 pl-1 pr-1 text-[11.5px] font-semibold tracking-wide">
          <PrismMark />
          <span style={{ color: "var(--os-muted)" }}>Prism</span>
        </span>

        <MenuButton name="media" label="Media" menu={menu} setMenu={setMenu}>
          <MenuRow
            label="Open file…"
            icon={<FolderOpen size={13} />}
            shortcut="Ctrl+O"
            onSelect={() => setPicker(true)}
          />
          <MenuRow
            label="Reload media"
            onSelect={() => {
              const v = videoRef.current
              if (!v) return
              setStatus("loading")
              v.load()
            }}
          />
          <MenuSep />
          <MenuRow
            label={`Playlist (${playlist.length} item${playlist.length === 1 ? "" : "s"})`}
            icon={<Film size={13} />}
            onSelect={() => setPicker(true)}
          />
        </MenuButton>

        <MenuButton name="playback" label="Playback" menu={menu} setMenu={setMenu}>
          <MenuRow
            label={playing ? "Pause" : "Play"}
            icon={playing ? <Pause size={13} /> : <Play size={13} />}
            shortcut="Space"
            disabled={!item.src}
            onSelect={togglePlay}
          />
          <MenuRow label="Stop" icon={<Square size={13} />} shortcut="S" disabled={!item.src} onSelect={stop} />
          <MenuSep />
          <MenuRow label="Previous" icon={<SkipBack size={13} />} disabled={single} onSelect={() => go(-1)} />
          <MenuRow label="Next" icon={<SkipForward size={13} />} disabled={single} onSelect={() => go(1)} />
          <MenuSep />
          <SubMenu label="Speed" icon={<FastForward size={13} />}>
            {RATES.map((r) => (
              <MenuRow
                key={r}
                label={r === 1 ? "Normal (1.00x)" : `${r.toFixed(2)}x`}
                checked={rate === r}
                onSelect={() => setRate(r)}
              />
            ))}
          </SubMenu>
          <MenuRow label="Loop" icon={<Repeat size={13} />} checked={loop} onSelect={() => setLoop((l) => !l)} />
          <MenuRow label="Random" icon={<Shuffle size={13} />} disabled />
        </MenuButton>

        <MenuButton name="audio" label="Audio" menu={menu} setMenu={setMenu}>
          <MenuRow label="Mute" icon={<VolumeX size={13} />} shortcut="M" checked={muted} onSelect={() => setMuted((m) => !m)} />
          <MenuRow label="Volume up" shortcut="Up" onSelect={() => nudgeVolume(5)} />
          <MenuRow label="Volume down" shortcut="Down" onSelect={() => nudgeVolume(-5)} />
          <MenuSep />
          <MenuRow label="Audio track: Track 1" disabled />
          <MenuRow label="Audio device: System default" disabled />
        </MenuButton>

        <MenuButton name="video" label="Video" menu={menu} setMenu={setMenu}>
          <MenuRow
            label="Fill window"
            icon={<Maximize2 size={13} />}
            shortcut="F"
            onSelect={() => toggleMaximize(win.id)}
          />
          <MenuRow
            label="Subtitles"
            icon={<Captions size={13} />}
            checked={subsOn}
            disabled={!subtitleSrc}
            onSelect={() => setSubsOn((s) => !s)}
          />
          <MenuSep />
          <MenuRow label="Always on top" icon={<Pin size={13} />} disabled />
          <MenuRow label="Take snapshot" icon={<Camera size={13} />} disabled />
        </MenuButton>

        <MenuButton name="tools" label="Tools" menu={menu} setMenu={setMenu}>
          <MenuRow label="Media information" icon={<Info size={13} />} checked={info} onSelect={() => setInfo((i) => !i)} />
          <MenuRow label="Effects and filters" disabled />
          <MenuRow label="Preferences" disabled />
        </MenuButton>
      </div>

      {/* --------------------------------------------------------- video stage */}
      <div
        className="relative min-h-0 flex-1"
        style={{ background: "var(--os-player-surface)" }}
        onPointerDown={focusSelf}
      >
        {item.src ? (
          <video
            ref={videoRef}
            src={item.src}
            poster={poster}
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full"
            style={{ objectFit: "contain", background: "var(--os-player-surface)" }}
            onClick={togglePlay}
            onDoubleClick={() => toggleMaximize(win.id)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onWaiting={() => setStatus("loading")}
            onCanPlay={() => setStatus("ready")}
            onPlaying={() => setStatus("ready")}
            onError={() => setStatus("error")}
            onDurationChange={(e) => {
              const d = e.currentTarget.duration
              setDuration(Number.isFinite(d) ? d : 0)
            }}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget
              setDuration(Number.isFinite(v.duration) ? v.duration : 0)
              if (v.videoWidth) setResolution({ w: v.videoWidth, h: v.videoHeight })
              setStatus("ready")
              paint()
            }}
            // Low-rate correctness backstop only — rAF does the real work.
            onTimeUpdate={paint}
            onSeeked={paint}
            onProgress={paint}
          >
            {subtitleSrc && (
              <track kind="subtitles" src={subtitleSrc} srcLang="en" label="English" default={false} />
            )}
          </video>
        ) : (
          <Overlay>
            <FileVideo2 size={28} style={{ color: "var(--os-muted)" }} />
            <p className="text-[13px] font-medium">No media loaded</p>
            <p className="text-[12px]" style={{ color: "var(--os-muted)" }}>
              This item has no playable source attached.
            </p>
            <button
              type="button"
              onClick={() => setPicker(true)}
              className="mt-1 rounded-md px-3 py-[6px] text-[12.5px] font-medium"
              style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
            >
              Open file…
            </button>
          </Overlay>
        )}

        {status === "error" && item.src && (
          <Overlay>
            <AlertTriangle size={26} style={{ color: "var(--os-danger)" }} />
            <p className="text-[13px] font-medium">Can&rsquo;t decode this file</p>
            <p className="max-w-[320px] text-center text-[12px]" style={{ color: "var(--os-muted)" }}>
              {item.name} is missing, or its codec isn&rsquo;t one this browser can play.
            </p>
            <button
              type="button"
              onClick={() => {
                setStatus("loading")
                videoRef.current?.load()
              }}
              className="mt-1 rounded-md px-3 py-[6px] text-[12.5px] font-medium"
              style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
            >
              Try again
            </button>
          </Overlay>
        )}

        {status === "loading" && item.src && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px]"
              style={{ background: "var(--os-scrim)", color: "#ffffff" }}
            >
              <Loader2 size={14} className="animate-spin" />
              Buffering…
            </span>
          </div>
        )}

        {/* A quiet play badge while paused, so a still frame reads as pausable. */}
        {!playing && status === "ready" && item.src && (
          <button
            type="button"
            aria-label="Play"
            onClick={togglePlay}
            className="absolute inset-0 grid place-items-center"
          >
            <span
              className="grid h-14 w-14 place-items-center rounded-full backdrop-blur-sm transition-transform hover:scale-105"
              style={{ background: "var(--os-scrim)", border: "1px solid rgba(255,255,255,0.28)" }}
            >
              <Play size={22} fill="#ffffff" color="#ffffff" />
            </span>
          </button>
        )}

        {info && (
          <div
            className="absolute right-3 top-3 w-[248px] rounded-lg p-3 text-[11.5px] shadow-2xl"
            style={{ background: "var(--os-menu)", border: "1px solid var(--os-border)", backdropFilter: "blur(28px)" }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-semibold">Media information</span>
              <button type="button" aria-label="Close media information" onClick={() => setInfo(false)}>
                <X size={13} style={{ color: "var(--os-muted)" }} />
              </button>
            </div>
            <InfoRow k="Name" v={item.name} />
            <InfoRow k="Source" v={item.src || "—"} />
            <InfoRow k="Duration" v={duration ? fmt(duration) : "unknown"} />
            <InfoRow k="Resolution" v={resolution ? `${resolution.w} × ${resolution.h}` : "unknown"} />
            <InfoRow k="Speed" v={`${rate.toFixed(2)}x`} />
            <InfoRow k="Volume" v={muted ? "muted" : `${vol}%`} />
            <InfoRow k="Subtitles" v={subtitleSrc ? (subsOn ? "English" : "off") : "none"} />
          </div>
        )}

        {picker && (
          <div className="absolute inset-0 grid place-items-center p-6" style={{ background: "var(--os-scrim)" }}>
            <div
              className="w-full max-w-[380px] rounded-xl p-3 shadow-2xl"
              style={{ background: "var(--os-menu)", border: "1px solid var(--os-border)", backdropFilter: "blur(28px)" }}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-[12.5px] font-semibold">Open media</span>
                <button type="button" aria-label="Cancel" onClick={() => setPicker(false)}>
                  <X size={14} style={{ color: "var(--os-muted)" }} />
                </button>
              </div>
              <div className="os-scroll max-h-[220px] overflow-y-auto">
                {playlist.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openItem(p.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-[7px] text-left text-[12.5px] transition-colors hover:bg-[var(--os-hover)]"
                    style={{ background: p.id === item.id ? "var(--os-active)" : undefined }}
                  >
                    <FileVideo2 size={14} style={{ color: "var(--os-muted)" }} />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {!p.src && (
                      <span className="text-[10.5px]" style={{ color: "var(--os-muted)" }}>
                        no source
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ seek bar */}
      <div className="shrink-0 px-3 pt-2" style={{ background: "var(--os-chrome)" }}>
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(elapsed)}
          aria-valuetext={`${fmt(elapsed)} of ${fmt(duration)}`}
          onPointerDown={onTrackDown}
          onPointerMove={onTrackMove}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          onKeyDown={onTrackKey}
          className="group relative h-4 w-full cursor-pointer touch-none outline-none"
        >
          <span
            className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 overflow-hidden rounded-full"
            style={{ background: "var(--os-active)" }}
          >
            {/* Buffered range sits behind the played range. */}
            <span
              ref={bufferRef}
              className="absolute inset-0 origin-left rounded-full"
              style={{
                background: "var(--os-player-buffer, color-mix(in srgb, var(--os-fg) 26%, transparent))",
                transform: "scaleX(0)",
              }}
            />
            <span
              ref={playedRef}
              className="absolute inset-0 origin-left rounded-full"
              style={{ background: "var(--os-accent)", transform: "scaleX(0)" }}
            />
          </span>
          <span
            ref={thumbRef}
            aria-hidden
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            style={{ left: "0%", background: "var(--os-fg)" }}
          />
        </div>

        <div className="mt-0.5 flex items-center justify-between text-[11px] tabular-nums" style={{ color: "var(--os-muted)" }}>
          <span aria-label="Elapsed time">{fmt(elapsed)}</span>
          <button
            type="button"
            onClick={() => setShowRemaining((r) => !r)}
            aria-label={showRemaining ? "Showing time remaining. Switch to total duration" : "Showing total duration. Switch to time remaining"}
            className="rounded px-1 tabular-nums transition-colors hover:bg-[var(--os-hover)]"
          >
            {showRemaining ? `-${fmt(remaining)}` : fmt(duration)}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------ transport */}
      <div
        className="flex shrink-0 items-center gap-1 px-3 pb-2 pt-1"
        style={{ background: "var(--os-chrome)" }}
      >
        <TransportButton label={playing ? "Pause" : "Play"} onClick={togglePlay} disabled={!item.src} primary>
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </TransportButton>
        <TransportButton label="Stop" onClick={stop} disabled={!item.src}>
          <Square size={14} fill="currentColor" />
        </TransportButton>
        <TransportButton label="Previous item" onClick={() => go(-1)} disabled={single}>
          <SkipBack size={15} fill="currentColor" />
        </TransportButton>
        <TransportButton label="Next item" onClick={() => go(1)} disabled={single}>
          <SkipForward size={15} fill="currentColor" />
        </TransportButton>

        <span className="mx-1 h-5 w-px" style={{ background: "var(--os-border)" }} />

        <TransportButton label="Play slower" onClick={() => stepRate(-1)} disabled={rate === RATES[0]}>
          <Rewind size={15} />
        </TransportButton>
        <TransportButton label="Play faster" onClick={() => stepRate(1)} disabled={rate === RATES[RATES.length - 1]}>
          <FastForward size={15} />
        </TransportButton>
        <TransportButton label="Loop this item" onClick={() => setLoop((l) => !l)} active={loop}>
          <Repeat size={15} />
        </TransportButton>
        <TransportButton label="Random order (unavailable)" disabled>
          <Shuffle size={15} />
        </TransportButton>

        <div className="ml-auto flex items-center gap-1.5">
          <TransportButton label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((m) => !m)} active={muted}>
            <VolumeIcon size={15} />
          </TransportButton>
          <div className="w-[104px]">
            <Slider
              value={muted ? 0 : vol}
              min={0}
              max={100}
              step={1}
              label="Volume"
              onChange={(v) => {
                setMuted(false)
                setVol(Math.round(v))
              }}
            />
          </div>
          <span className="w-8 text-right text-[11px] tabular-nums" style={{ color: "var(--os-muted)" }}>
            {muted ? "—" : `${vol}%`}
          </span>
        </div>
      </div>

      {/* ----------------------------------------------------------- status bar */}
      <div
        className="flex shrink-0 items-center gap-3 border-t px-3 py-1 text-[11px]"
        style={{ borderColor: "var(--os-border)", background: "var(--os-chrome)", color: "var(--os-muted)" }}
        role="status"
      >
        <span className="min-w-0 flex-1 truncate" style={{ color: "var(--os-fg)" }}>
          {item.name}
        </span>
        <span>{resolution ? `${resolution.w} × ${resolution.h}` : "—"}</span>
        <span>{rate.toFixed(2)}x</span>
        <span>
          {status === "error"
            ? "Error"
            : status === "loading"
              ? "Buffering"
              : playing
                ? "Playing"
                : elapsed > 0
                  ? "Paused"
                  : "Stopped"}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ fragments */

/** Original mark: a light ray split by a prism. No cone, no traffic anything. */
function PrismMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden focusable="false">
      <path d="M8 2.2 14 13H2L8 2.2Z" fill="none" stroke="var(--os-accent)" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M2.6 8.6h5.2" stroke="var(--os-fg)" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9.4 7.2 13.8 6" stroke="var(--os-accent)" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9.6 9.1 14 9.4" stroke="var(--os-fg)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div
        className="flex flex-col items-center gap-2 rounded-xl px-6 py-5"
        style={{ background: "var(--os-window)", border: "1px solid var(--os-border)", color: "var(--os-fg)" }}
      >
        {children}
      </div>
    </div>
  )
}

function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 py-[2px]">
      <span className="w-[74px] shrink-0" style={{ color: "var(--os-muted)" }}>
        {k}
      </span>
      <span className="min-w-0 flex-1 truncate" style={{ color: "var(--os-fg)" }} title={v}>
        {v}
      </span>
    </div>
  )
}

function TransportButton({
  children,
  label,
  onClick,
  disabled,
  active,
  primary,
}: {
  children: ReactNode
  label: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      // Hover stays in CSS: an imperative hover colour sticks when a button is
      // disabled mid-hover (pointer-events-none swallows the pointerleave).
      className={`grid h-8 w-8 place-items-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-35 ${
        primary || active ? "" : "hover:bg-[var(--os-hover)]"
      }`}
      style={{
        background: primary ? "var(--os-accent)" : active ? "var(--os-active)" : undefined,
        color: primary ? "var(--os-on-accent)" : "var(--os-fg)",
      }}
    >
      {children}
    </button>
  )
}

function MenuButton({
  name,
  label,
  menu,
  setMenu,
  children,
}: {
  name: Exclude<MenuName, null>
  label: string
  menu: MenuName
  setMenu: (m: MenuName) => void
  children: ReactNode
}) {
  const open = menu === name
  return (
    <div className="relative">
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onPointerDown={(e) => {
          e.stopPropagation()
          setMenu(open ? null : name)
        }}
        // Once one menu is open, sliding across the bar swaps menus, as it should.
        onPointerEnter={() => {
          if (menu && !open) setMenu(name)
        }}
        className={`rounded px-2.5 py-1 transition-colors ${open ? "bg-[var(--os-active)]" : "hover:bg-[var(--os-hover)]"}`}
      >
        {label}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute left-0 top-full z-50 mt-1 min-w-[208px] rounded-lg p-1.5 shadow-2xl"
          style={{ background: "var(--os-menu)", border: "1px solid var(--os-border)", backdropFilter: "blur(28px)" }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setMenu(null)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function MenuSep() {
  return <div className="my-1 h-px" style={{ background: "var(--os-border)" }} />
}

function MenuRow({
  label,
  shortcut,
  icon,
  checked,
  disabled,
  onSelect,
}: {
  label: string
  shortcut?: string
  icon?: ReactNode
  checked?: boolean
  disabled?: boolean
  onSelect?: () => void
}) {
  return (
    <button
      type="button"
      // A row that reports a state is a checkbox item; a plain command is not.
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-md px-2 py-[6px] text-left text-[12.5px] transition-colors hover:bg-[var(--os-hover)] disabled:pointer-events-none disabled:opacity-40"
    >
      <span className="grid w-4 shrink-0 place-items-center" style={{ color: "var(--os-muted)" }}>
        {checked ? <Check size={13} style={{ color: "var(--os-accent)" }} /> : icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {shortcut && (
        <span className="text-[10.5px]" style={{ color: "var(--os-muted)" }}>
          {shortcut}
        </span>
      )}
    </button>
  )
}

function SubMenu({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="relative"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
    >
      <div
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        tabIndex={0}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
            e.preventDefault()
            setOpen((o) => !o)
          }
        }}
        className="flex w-full cursor-default items-center gap-2 rounded-md px-2 py-[6px] text-left text-[12.5px] transition-colors hover:bg-[var(--os-hover)]"
        style={{ background: open ? "var(--os-hover)" : undefined }}
      >
        <span className="grid w-4 shrink-0 place-items-center" style={{ color: "var(--os-muted)" }}>
          {icon}
        </span>
        <span className="flex-1 truncate">{label}</span>
        <ChevronRight size={13} style={{ color: "var(--os-muted)" }} />
      </div>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute left-full top-0 z-50 ml-1 min-w-[152px] rounded-lg p-1.5 shadow-2xl"
          style={{ background: "var(--os-menu)", border: "1px solid var(--os-border)", backdropFilter: "blur(28px)" }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
