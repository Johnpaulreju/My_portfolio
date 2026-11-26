"use client"

import { AppIcon } from "@/components/os/app-icon"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { Bookmark, BookmarkCheck, Captions, ListVideo, Mail, Pause, Play, Search, Send, SkipForward, ThumbsDown, ThumbsUp, X } from "lucide-react"
import * as A from "@/lib/os/actions"
import { PROFILE } from "@/lib/os/content"
import { PUBLISHED_VIDEOS, type TubeVideo } from "@/lib/os/tube-videos"
import { useWM } from "@/lib/os/wm-store"
import type { WindowInstance } from "@/lib/os/types"

type Comment = { id: string; clipId: string; body: string }

const DEMO_CLIPS: TubeVideo[] = [
  { id: "hello", title: "Portfolio player demo", src: "/media/intro.mp4", poster: "/media/intro-poster.jpg", captions: "/media/intro.en.vtt",
    description: "A generated coding animation for trying the player controls.", openCaptions: false },
  { id: "test", title: "Portfolio player demo · One more test", src: "/media/queue-demo.mp4", poster: "/media/queue-demo-poster.jpg", captions: "/media/queue-demo.en.vtt",
    description: "A second coding animation for trying the queue and autoplay.", openCaptions: false },
]

/** Windows resize freely, so the layout listens to the pane, not the viewport. */
function usePaneWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width)
    })
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

export function TubeApp({ win }: { win: WindowInstance }) {
  const setTitle = useWM((s) => s.setTitle)
  const setPayload = useWM((s) => s.setPayload)
  // An incoming project link opens a fresh view of the queue, even if this window
  // still has the same clip selected and a search left over from its last visit.
  const [filter, setFilter] = useState({ payload: win.payload, text: "" })
  const query = filter.payload === win.payload ? filter.text : ""
  const [liked, setLiked] = useState<Record<string, boolean>>({})
  const [disliked, setDisliked] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [savedOnly, setSavedOnly] = useState(false)
  const [autoplay, setAutoplay] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const { ref: paneRef, width } = usePaneWidth<HTMLDivElement>()
  const wide = width >= 880
  const activeId = win.payload?.clipId
  const published = PUBLISHED_VIDEOS.find((video) => video.id === activeId)
  const clip = published ?? DEMO_CLIPS.find((video) => video.id === activeId)
  const queue: readonly TubeVideo[] = published ? PUBLISHED_VIDEOS : DEMO_CLIPS
  const next = clip && queue[queue.findIndex((video) => video.id === clip.id) + 1]
  const winId = win.id
  const featured = PUBLISHED_VIDEOS[0]

  useEffect(() => {
    setTitle(winId, clip ? `${clip.title} — JP Tube` : "JP Tube")
  }, [winId, clip, setTitle])

  useEffect(() => {
    const pane = paneRef.current
    pane?.scrollTo({ top: 0, behavior: "instant" })
    if (clip && useWM.getState().focusedId === winId) pane?.querySelector("video")?.focus({ preventScroll: true })
  }, [win.payload, paneRef, clip, winId])

  const search = query.trim().toLowerCase()
  function matches(video: TubeVideo) {
    return (!savedOnly || saved[video.id]) && `${video.title} ${video.description}`.toLowerCase().includes(search)
  }
  const draft = clip ? drafts[clip.id] ?? "" : ""
  const localComments = comments.filter((c) => c.clipId === clip?.id)

  function selectVideo(clipId: string | null) {
    setPayload(winId, { clipId })
  }
  function setQuery(text: string) {
    setFilter({ payload: win.payload, text })
  }
  function postComment() {
    if (!clip || !draft.trim()) return
    setComments((cs) => [{ id: crypto.randomUUID(), clipId: clip.id, body: draft.trim() }, ...cs])
    setDrafts((ds) => ({ ...ds, [clip.id]: "" }))
  }

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: "var(--os-surface)" }}>
      <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2"
        style={{ borderColor: "var(--os-border)", background: "var(--os-chrome)" }}>
        <Wordmark />
        <form role="search" onSubmit={(e) => e.preventDefault()}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-1.5"
          style={{ background: "var(--os-input)", border: "1px solid var(--os-border)" }}>
          <Search size={14} className="shrink-0" style={{ color: "var(--os-muted)" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search videos" aria-label="Search videos"
            className="min-w-0 w-full bg-transparent text-[12.5px] outline-none placeholder:text-[var(--os-muted)]"
            style={{ color: "var(--os-fg)" }} />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-[var(--os-hover)]"
            style={{ color: "var(--os-muted)" }}><X size={13} /></button>}
        </form>
        <Avatar size={28} />
      </header>
      <div ref={paneRef} className="os-scroll min-h-0 flex-1 overflow-y-auto">
        <div className={`flex gap-5 ${wide ? "flex-row p-5" : "flex-col p-3.5"}`}>
          <main className={`min-w-0 flex-1 ${search && !wide ? "order-2" : ""}`}>
            {clip ? <>
              <ClipPlayer key={clip.id} clip={clip} onEnded={() => { if (autoplay && next) selectVideo(next.id) }} />
              <h1 className="mt-3 text-[18px] font-semibold leading-snug" style={{ color: "var(--os-fg)" }}>{clip.title}</h1>
              <p className="mt-1 text-[12px]" style={{ color: "var(--os-muted)" }}>{published ? "Screen recording" : "Generated animation"} · Silent with English captions</p>
            </> : <button type="button" aria-label={`Watch ${featured.title}`} onClick={() => selectVideo(featured.id)}
              className="group relative block w-full overflow-hidden rounded-xl bg-black text-left text-white">
              <Image width={1280} height={720} src={featured.poster} alt="" sizes="(max-width: 700px) 94vw, 680px"
                className="block aspect-video w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
              <span className="absolute inset-x-0 bottom-0 flex items-end gap-3 bg-gradient-to-t from-black/95 via-black/65 to-transparent p-4 pt-12">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-black"><Play size={18} fill="currentColor" aria-hidden /></span>
                <strong className="text-[clamp(1rem,3cqw,1.5rem)] leading-tight">{featured.title}</strong>
              </span>
            </button>}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Avatar size={40} />
              <div className="min-w-0 flex-1">
                <h2 className="text-[13.5px] font-semibold" style={{ color: "var(--os-fg)" }}>{PROFILE.name}</h2>
                <p className="text-[11.5px]" style={{ color: "var(--os-muted)" }}>{PROFILE.headline}</p>
              </div>
              <PillButton label="Get in touch" icon={<Mail size={14} />} onClick={() => A.openApp("contact")} />
            </div>
            {clip && <div className="mt-3 flex flex-wrap gap-2">
              <PillButton label={liked[clip.id] ? "Liked locally" : "Like locally"} icon={<ThumbsUp size={14} />} active={!!liked[clip.id]}
                onClick={() => { setLiked((m) => ({ ...m, [clip.id]: !m[clip.id] })); setDisliked((m) => ({ ...m, [clip.id]: false })) }} />
              <PillButton label="Dislike locally" icon={<ThumbsDown size={14} />} active={!!disliked[clip.id]}
                onClick={() => { setDisliked((m) => ({ ...m, [clip.id]: !m[clip.id] })); setLiked((m) => ({ ...m, [clip.id]: false })) }} />
              <PillButton label={saved[clip.id] ? "Saved locally" : "Save locally"} icon={saved[clip.id] ? <BookmarkCheck size={14} /> : <Bookmark size={14} />} active={!!saved[clip.id]}
                onClick={() => setSaved((m) => ({ ...m, [clip.id]: !m[clip.id] }))} />
            </div>}
            <div className="mt-4 rounded-xl p-3.5 text-[12.5px] leading-relaxed" style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}>
              <h2 className="font-semibold" style={{ color: "var(--os-fg)" }}>{clip ? "About this video" : "About the channel"}</h2>
              <p className="mt-1" style={{ color: "var(--os-muted)" }}>{clip ? clip.description : PROFILE.tagline}</p>
              {clip && <p className="mt-2" style={{ color: "var(--os-muted)" }}>Likes, saves and comments stay in this window and clear when you close it.</p>}
            </div>
            {clip && <section className="mt-5" aria-label="Local comments">
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>Local comments ({localComments.length})</h2>
              <form onSubmit={(e) => { e.preventDefault(); postComment() }} className="mt-3 flex flex-wrap gap-2">
                <label htmlFor={`tube-comment-${winId ?? "demo"}`} className="sr-only">Add a local comment</label>
                <input id={`tube-comment-${winId ?? "demo"}`} value={draft} onChange={(e) => setDrafts((ds) => ({ ...ds, [clip.id]: e.target.value }))}
                  maxLength={1000} placeholder="Add a local comment…" className="min-h-11 min-w-0 flex-[1_1_180px] rounded-lg border bg-transparent px-3 text-[12.5px]"
                  style={{ color: "var(--os-fg)", borderColor: "var(--os-border)" }} />
                <button type="submit" disabled={!draft.trim()} className="flex min-h-11 items-center gap-2 rounded-full px-4 text-[12px] font-semibold disabled:opacity-50"
                  style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}><Send size={13} />Add comment</button>
              </form>
              <ul className="mt-3 space-y-3" aria-live="polite">
                {localComments.map((c) => <li key={c.id} className="rounded-xl p-3" style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}>
                  <p className="text-[11px] font-semibold" style={{ color: "var(--os-muted)" }}>You · this window only</p>
                  <p className="mt-1 break-words text-[12.5px]" style={{ color: "var(--os-fg)" }}>{c.body}</p>
                  <button type="button" onClick={() => setComments((cs) => cs.filter((entry) => entry.id !== c.id))} className="mt-1 min-h-11 text-[12px]" style={{ color: "var(--os-muted)" }}>Delete comment</button>
                </li>)}
              </ul>
            </section>}
          </main>

          <aside className={wide ? "w-[326px] shrink-0" : "w-full"}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <PillButton label="All videos" active={!savedOnly} onClick={() => setSavedOnly(false)} />
              <PillButton label="Saved" active={savedOnly} onClick={() => setSavedOnly(true)} />
            </div>
            <VideoList title="Published videos" videos={PUBLISHED_VIDEOS.filter(matches)} activeId={clip?.id} onSelect={selectVideo} />
            {clip && <div className="my-3 flex flex-wrap items-center gap-2">
              {next && <PillButton label="Next video" icon={<SkipForward size={14} />} onClick={() => selectVideo(next.id)} />}
              <button type="button" role="switch" aria-checked={autoplay} aria-label="Autoplay next video" onClick={() => setAutoplay((v) => !v)}
                className="min-h-11 rounded-full px-3 text-[12px]" style={{ background: autoplay ? "var(--os-accent-soft)" : "var(--os-hover)", color: "var(--os-fg)" }}>
                Autoplay {autoplay ? "on" : "off"}
              </button>
              <PillButton label="Back to channel" onClick={() => selectVideo(null)} />
            </div>}
            <VideoList title="Player samples" videos={DEMO_CLIPS.filter(matches)} activeId={clip?.id} onSelect={selectVideo} />
          </aside>
        </div>
      </div>
    </div>
  )
}

// TextTrack.mode is the browser control that also backs the native captions menu.
function toggleEnglishTrack(video: HTMLVideoElement | null) {
  const track = video?.textTracks[0]
  if (track) track.mode = track.mode === "showing" ? "disabled" : "showing"
}

function ClipPlayer({ clip, onEnded }: { clip: TubeVideo; onEnded: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [captions, setCaptions] = useState(!clip.openCaptions)
  const [error, setError] = useState(false)

  useEffect(() => {
    const tracks = videoRef.current?.textTracks
    if (!tracks) return
    const sync = () => setCaptions(tracks[0]?.mode === "showing")
    tracks.addEventListener("change", sync)
    return () => tracks.removeEventListener("change", sync)
  }, [])

  function playPause() {
    const video = videoRef.current
    if (!video) return
    if (!video.paused) {
      video.pause()
      return
    }
    if (error) {
      video.load()
      setError(false)
    }
    void video.play().catch(() => setPlaying(false))
  }
  return <>
    <div className="overflow-hidden rounded-xl border bg-black" style={{ borderColor: "var(--os-border)" }}>
      <video ref={videoRef} className="block aspect-video w-full" src={clip.src} poster={clip.poster}
        aria-label={clip.title} controls autoPlay muted playsInline preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={onEnded} onError={() => setError(true)}>
        <track kind="captions" src={clip.captions} srcLang="en" label="English" default={!clip.openCaptions} />
      </video>
    </div>
    {error && <p role="alert" className="mt-2 text-[12px]">The video could not load. Press Play to try again.</p>}
    <div className="mt-2 flex flex-wrap gap-2">
      <PillButton label={playing ? "Pause" : "Play"} icon={playing ? <Pause size={14} /> : <Play size={14} />} onClick={playPause} />
      <PillButton label="English captions" icon={<Captions size={14} />} active={captions} onClick={() => toggleEnglishTrack(videoRef.current)} />
    </div>
  </>
}

function VideoList({ title, videos, activeId, onSelect }: {
  title: string; videos: readonly TubeVideo[]; activeId?: string; onSelect: (id: string) => void
}) {
  return <section aria-label={title} className="mb-5">
    <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--os-fg)" }}>
      <ListVideo size={16} aria-hidden />{title}
    </h2>
    {videos.length ? <ul className="space-y-1">
      {videos.map((entry) => <li key={entry.id}>
        <button type="button" onClick={() => onSelect(entry.id)} aria-current={entry.id === activeId || undefined}
          className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-[var(--os-hover)]"
          style={{ background: entry.id === activeId ? "var(--os-active)" : undefined }}>
          <Image src={entry.poster} alt="" width={160} height={90} sizes="112px" className="aspect-video w-[96px] shrink-0 rounded-md object-cover" />
          <span className="min-w-0 text-[13px] font-medium leading-snug" style={{ color: "var(--os-fg)" }}>{entry.title}</span>
        </button>
      </li>)}
    </ul> : <p role="status" className="py-2 text-[12px]" style={{ color: "var(--os-muted)" }}>No matches in this section.</p>}
  </section>
}

function PillButton({ icon, label, onClick, active }: { icon?: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return <button type="button" onClick={onClick} aria-pressed={active}
    className="flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[12px] hover:bg-[var(--os-active)]"
    style={{ background: "var(--os-hover)", color: active ? "var(--os-accent-fg)" : "var(--os-fg)" }}>{icon}{label}</button>
}

function Wordmark() {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <AppIcon appId="tube" size={28} />
      <span className="hidden text-[14px] font-semibold tracking-tight sm:inline" style={{ color: "var(--os-fg)" }}>
        JP Tube
      </span>
    </div>
  )
}

function Avatar({ size = 32 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: "linear-gradient(135deg, var(--os-accent), color-mix(in srgb, var(--os-accent) 55%, var(--os-fg)))",
        color: "var(--os-on-accent)",
      }}
    >
      {PROFILE.initials}
    </span>
  )
}
