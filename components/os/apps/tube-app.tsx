"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Bookmark, BookmarkCheck, Captions, ListVideo, Mail, Pause, Play, Search, Send, SkipForward, ThumbsDown, ThumbsUp, X } from "lucide-react"
import * as A from "@/lib/os/actions"
import { PROFILE } from "@/lib/os/content"
import { useWM } from "@/lib/os/wm-store"
import type { WindowInstance } from "@/lib/os/types"

type Clip = { id: string; title: string; src: string; poster: string; captions: string; description: string }
type Comment = { id: string; clipId: string; body: string }

// Published recordings and generated player demos are deliberately separate.
const PUBLISHED_CLIPS: Clip[] = []
const DEMO_CLIPS: Clip[] = [
  { id: "hello", title: "Portfolio player demo", src: "/media/intro.mp4", poster: "/media/intro-poster.jpg", captions: "/media/intro.en.vtt",
    description: "A generated coding title animation. The semicolon has made it to production. No personal recording or project walkthrough is published here." },
  { id: "test", title: "Portfolio player demo · One more test", src: "/media/queue-demo.mp4", poster: "/media/queue-demo-poster.jpg", captions: "/media/queue-demo.en.vtt",
    description: "A second generated animation for trying the queue. Even the coffee gets a test. No project results or performance claims are implied." },
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

export function TubeApp({ win }: { win?: WindowInstance } = {}) {
  const setTitle = useWM((s) => s.setTitle)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [liked, setLiked] = useState<Record<string, boolean>>({})
  const [disliked, setDisliked] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [savedOnly, setSavedOnly] = useState(false)
  const [autoplay, setAutoplay] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [playing, setPlaying] = useState(false)
  const [captions, setCaptions] = useState(true)
  const [error, setError] = useState(false)
  const [playHint, setPlayHint] = useState(false)
  const { ref: paneRef, width } = usePaneWidth<HTMLDivElement>()
  const videoRef = useRef<HTMLVideoElement>(null)
  const wide = width >= 880
  const clip = DEMO_CLIPS.find((c) => c.id === activeId)
  const winId = win?.id

  useEffect(() => {
    if (winId) setTitle(winId, clip ? `${clip.title} — JP Tube` : "JP Tube")
  }, [winId, clip, setTitle])

  useEffect(() => {
    setError(false)
    setPlaying(false)
    setPlayHint(false)
    const video = videoRef.current
    if (video) void video.play().catch(() => setPlayHint(true))
  }, [activeId])

  function syncCaptions() {
    const video = videoRef.current
    if (video) for (const track of Array.from(video.textTracks)) track.mode = captions ? "showing" : "disabled"
  }
  useEffect(() => {
    const video = videoRef.current
    if (video) for (const track of Array.from(video.textTracks)) track.mode = captions ? "showing" : "disabled"
  }, [captions, activeId])

  const results = useMemo(() => DEMO_CLIPS.filter((c) =>
    (!savedOnly || saved[c.id]) && `${c.title} ${c.description}`.toLowerCase().includes(query.trim().toLowerCase()),
  ), [query, savedOnly, saved])
  const publishedResults = PUBLISHED_CLIPS.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()))
  const next = clip ? DEMO_CLIPS[DEMO_CLIPS.findIndex((c) => c.id === clip.id) + 1] : undefined
  const draft = clip ? drafts[clip.id] ?? "" : ""
  const localComments = comments.filter((c) => c.clipId === clip?.id)

  function playPause() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play().then(() => setPlayHint(false)).catch(() => setPlayHint(true))
    else video.pause()
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
            placeholder={clip ? "Search demos" : "Search the channel"} aria-label={clip ? "Search demos" : "Search the channel"}
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
          <main className="min-w-0 flex-1">
            {clip ? <>
              <div className="overflow-hidden rounded-xl border bg-black" style={{ borderColor: "var(--os-border)" }}>
                <video key={clip.id} ref={videoRef} className="block aspect-video w-full" src={clip.src} poster={clip.poster}
                  aria-label={clip.title} controls playsInline preload="metadata"
                  onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                  onError={() => setError(true)} onLoadedMetadata={syncCaptions}
                  onEnded={() => { if (autoplay && next) setActiveId(next.id) }}>
                  <track kind="captions" src={clip.captions} srcLang="en" label="English" default={captions} onLoad={syncCaptions} />
                </video>
              </div>
              {error && <p role="alert" className="mt-2 text-[12px]" style={{ color: "var(--os-fg)" }}>The demo could not load. Close and reopen the demo to retry.</p>}
              {playHint && !error && <p role="status" className="mt-2 text-[12px]" style={{ color: "var(--os-muted)" }}>Press Play demo to start playback.</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <PillButton label={playing ? "Pause demo" : "Play demo"} icon={playing ? <Pause size={14} /> : <Play size={14} />} onClick={playPause} />
                <PillButton label="Captions" icon={<Captions size={14} />} active={captions} onClick={() => setCaptions((v) => !v)} />
                {next && <PillButton label="Next demo" icon={<SkipForward size={14} />} onClick={() => setActiveId(next.id)} />}
              </div>
              <h1 className="mt-3 text-[17px] font-semibold leading-snug" style={{ color: "var(--os-fg)" }}>{clip.title}</h1>
              <p className="mt-1 text-[12px]" style={{ color: "var(--os-muted)" }}>Generated animation · 12 seconds · silent, with captions</p>
            </> : <div className={`relative grid min-h-[250px] w-full min-w-0 place-items-center overflow-hidden rounded-xl px-6 py-8 text-center ${wide ? "aspect-video" : ""}`}
              style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--os-accent) 12%, var(--os-surface)), var(--os-surface))", border: "1px solid var(--os-border)" }}>
              <div className="relative max-w-[340px]">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full" style={{ background: "var(--os-accent-soft)", color: "var(--os-accent)" }}><Play size={24} className="ml-0.5" aria-hidden /></span>
                <h1 className="mt-4 text-[18px] font-semibold" style={{ color: "var(--os-fg)" }}>No videos published yet</h1>
                <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>There are no personal recordings in this channel. Try the controls with a generated coding animation.</p>
                <button type="button" onClick={() => setActiveId(DEMO_CLIPS[0].id)} className="mt-4 min-h-11 rounded-full px-4 text-[12.5px] font-semibold"
                  style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}>Try the player demo</button>
              </div>
            </div>}

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
              <h2 className="font-semibold" style={{ color: "var(--os-fg)" }}>{clip ? "About this demo" : "About the channel"}</h2>
              <p className="mt-1" style={{ color: "var(--os-muted)" }}>{clip ? clip.description : PROFILE.tagline}</p>
              {clip && <p className="mt-2" style={{ color: "var(--os-muted)" }}>Likes, saves, comments and autoplay stay in this open window only. Nothing is posted or sent to Johnpaul. Closing the window or reloading clears them.</p>}
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
            <div className="mb-2.5 flex items-center gap-2">
              <ListVideo size={15} style={{ color: "var(--os-muted)" }} />
              <h2 className="text-[12.5px] font-semibold" style={{ color: "var(--os-fg)" }}>Published video library</h2>
              <span className="ml-auto text-[11.5px]" style={{ color: "var(--os-muted)" }}>{PUBLISHED_CLIPS.length} videos</span>
            </div>
            <p role="status" className="break-words rounded-xl px-4 py-5 text-[12.5px] leading-relaxed" style={{ background: "var(--os-card)", border: "1px solid var(--os-border)", color: "var(--os-muted)" }}>
              {query.trim() && !publishedResults.length ? `No published videos match “${query.trim()}”.` : "The published library is empty. Player demos are separate."}
            </p>
            {clip && <section aria-label="Demo queue" className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[13px] font-semibold" style={{ color: "var(--os-fg)" }}>Demo queue</h2>
                <button type="button" role="switch" aria-checked={autoplay} aria-label="Autoplay next demo" onClick={() => setAutoplay((v) => !v)}
                  className="min-h-11 rounded-full px-3 text-[11.5px]" style={{ background: autoplay ? "var(--os-accent-soft)" : "var(--os-hover)", color: "var(--os-fg)" }}>Autoplay {autoplay ? "on" : "off"}</button>
              </div>
              <div className="my-2 flex gap-2">
                <PillButton label="All demos" active={!savedOnly} onClick={() => setSavedOnly(false)} />
                <PillButton label="Saved demos" active={savedOnly} onClick={() => setSavedOnly(true)} />
              </div>
              {!results.length && <p role="status" className="py-4 text-[12px]" style={{ color: "var(--os-muted)" }}>{savedOnly ? "No saved demos match. Save a demo to find it here." : "No demos match your search."}</p>}
              <ul className="space-y-2">
                {results.map((entry) => <li key={entry.id}>
                  <button type="button" onClick={() => { setActiveId(entry.id); paneRef.current?.scrollTo({ top: 0, behavior: "auto" }) }}
                    aria-current={entry.id === clip.id ? "true" : undefined}
                    className="flex w-full gap-2.5 rounded-lg p-2 text-left hover:bg-[var(--os-hover)]"
                    style={{ background: entry.id === clip.id ? "var(--os-active)" : undefined }}>
                    <div className="grid aspect-video w-[106px] shrink-0 place-items-center rounded-lg" style={{ background: "var(--os-accent-soft)", color: "var(--os-accent)" }}><Play size={22} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-medium leading-snug" style={{ color: "var(--os-fg)" }}>{entry.title}</p>
                      <p className="mt-1 text-[11px]" style={{ color: "var(--os-muted)" }}>Generated demo · 0:12{entry.id === clip.id ? " · Selected" : ""}</p>
                    </div>
                  </button>
                </li>)}
              </ul>
              <button type="button" onClick={() => setActiveId(null)} className="mt-3 min-h-11 text-[12px]" style={{ color: "var(--os-muted)" }}>Back to channel</button>
            </section>}
          </aside>
        </div>
      </div>
    </div>
  )
}

function PillButton({ icon, label, onClick, active }: { icon?: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return <button type="button" onClick={onClick} aria-pressed={active}
    className="flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[12px] hover:bg-[var(--os-active)]"
    style={{ background: "var(--os-hover)", color: active ? "var(--os-accent-fg)" : "var(--os-fg)" }}>{icon}{label}</button>
}

/** Original mark: a stacked-chevron stream glyph. */
function Wordmark() {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        className="grid h-7 w-7 place-items-center rounded-[9px]"
        style={{
          background: "linear-gradient(135deg, var(--os-accent), color-mix(in srgb, var(--os-accent) 45%, var(--os-fg)))",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden style={{ color: "var(--os-on-accent)" }}>
          <path d="M4 3.2 L9 8 L4 12.8" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="8" r="1.5" fill="currentColor" />
        </svg>
      </span>
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
