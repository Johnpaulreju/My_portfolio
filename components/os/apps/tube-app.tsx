"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Bell,
  BellRing,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  ChevronUp,
  ListVideo,
  Play,
  Search,
  Send,
  Share2,
  ThumbsDown,
  ThumbsUp,
  WifiOff,
} from "lucide-react"
import { PROFILE, PROJECTS } from "@/lib/os/content"
import { useNotify } from "@/lib/os/notify-store"
import { useSystem } from "@/lib/os/system-store"
import { useWM } from "@/lib/os/wm-store"
import type { WindowInstance } from "@/lib/os/types"

/* ------------------------------------------------------------------ *
 * JP Tube — a video-sharing site that only ever hosts one channel.
 *
 * Every entry plays the same 20-second intro reel; the metadata around
 * it changes. That is stated on screen rather than hidden, because a
 * portfolio that fakes its own footage is a worse portfolio.
 * ------------------------------------------------------------------ */

const VIDEO_SRC = "/media/intro.mp4"
const POSTER_SRC = "/media/intro-poster.jpg"
const CAPTIONS_SRC = "/media/intro.en.vtt"

/** Deterministic so the server and the client agree on every playful number. */
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function clock(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

/** Counts are theatre. The quips make sure nobody mistakes them for analytics. */
const QUIPS = [
  "and counting",
  "three of them were me",
  "peak retention at the demo",
  "one viewer stayed for the credits",
  "mostly recruiters at 1.75× speed",
]

type Clip = {
  id: string
  title: string
  /** The line under the title in the rail — the "channel" line. */
  line: string
  stack: string
  desc: string
  year: string
  seconds: number
  views: number
  likes: number
  quip: string
  variant: number
  trailer?: boolean
}

function buildClips(): Clip[] {
  const trailer: Clip = {
    id: "trailer",
    title: `${PROFILE.name} — the whole portfolio in 20 seconds`,
    line: "Channel trailer",
    stack: PROFILE.title,
    desc: PROFILE.tagline,
    year: "2025",
    seconds: 20,
    views: 128_402,
    likes: 9_114,
    quip: QUIPS[0],
    variant: 0,
    trailer: true,
  }

  const rest = PROJECTS.map((p) => {
    const h = hash(p.id)
    return {
      id: p.id,
      title: `${p.title} — build walkthrough`,
      line: p.category,
      stack: p.stack,
      desc: p.desc,
      year: p.year,
      seconds: 72 + (h % 780),
      views: 1_200 + (h % 486_000),
      likes: 40 + (h % 12_400),
      quip: QUIPS[h % QUIPS.length],
      variant: h % 4,
    } satisfies Clip
  })

  return [trailer, ...rest]
}

type Comment = {
  id: string
  author: string
  handle: string
  when: string
  body: string
  likes: number
  hearted?: boolean
  mine?: boolean
}

/** Fictional, and labelled as such under the thread. */
const SEED_COMMENTS: Comment[] = [
  {
    id: "c1",
    author: "Maya R.",
    handle: "@maya.builds",
    when: "3 days ago",
    body: "Watched this three times. The bit where the model just works on the first run — unreal. Subscribed before the reel even finished.",
    likes: 214,
    hearted: true,
  },
  {
    id: "c2",
    author: "fern.exe",
    handle: "@fern.exe",
    when: "1 week ago",
    body: "Came for the AI agent stuff, stayed for the car being driven by a head tilt. Please never stop building strange things.",
    likes: 96,
  },
  {
    id: "c3",
    author: "Anika",
    handle: "@anika.codes",
    when: "2 weeks ago",
    body: "Genuinely the calmest portfolio I have ever scrolled. Whoever got a whole desktop running this smoothly deserves a sit-down and a coffee.",
    likes: 141,
  },
  {
    id: "c4",
    author: "bug_whisperer",
    handle: "@bug.whisperer",
    when: "3 weeks ago",
    body: "0:42 is the exact moment I decided to learn FastAPI. Thanks a lot. There go my weekends.",
    likes: 58,
  },
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
  const online = useSystem((s) => s.conn === "connected")
  const setTitle = useWM((s) => s.setTitle)
  const push = useNotify((s) => s.push)

  const clips = useMemo(buildClips, [])
  const [activeId, setActiveId] = useState(clips[0].id)
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [liked, setLiked] = useState<Record<string, boolean>>({})
  const [disliked, setDisliked] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [autoplay, setAutoplay] = useState(false)
  const [comments, setComments] = useState<Comment[]>(SEED_COMMENTS)
  const [draft, setDraft] = useState("")

  const clip = clips.find((c) => c.id === activeId) ?? clips[0]
  const { ref: paneRef, width } = usePaneWidth<HTMLDivElement>()
  const wide = width >= 880

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const mounted = useRef(false)

  // Switching entries restarts the same reel. The click is the user gesture, so
  // play() is usually allowed; when it is not, the poster simply stays put.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    setExpanded(false)
    const v = videoRef.current
    if (!v) return
    try {
      v.currentTime = 0
    } catch {
      /* the reel may not be seekable yet */
    }
    void v.play().catch(() => {})
  }, [clip.id])

  // The window chrome tracks whatever is on screen, like a real browser tab.
  // Deps are the window *id*, never the window object: setTitle re-creates that
  // object on every call, so depending on it would loop forever.
  const winId = win?.id
  useEffect(() => {
    if (!winId) return
    setTitle(winId, `${clip.title} — JP Tube`)
  }, [winId, clip.title, setTitle])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clips.filter((c) => c.id !== clip.id)
    return clips.filter(
      (c) =>
        c.id !== clip.id &&
        (c.title.toLowerCase().includes(q) || c.stack.toLowerCase().includes(q) || c.line.toLowerCase().includes(q)),
    )
  }, [clips, clip.id, query])

  const isLiked = !!liked[clip.id]
  const isDisliked = !!disliked[clip.id]
  const isSaved = !!saved[clip.id]

  const toggleLike = () => {
    setLiked((m) => ({ ...m, [clip.id]: !m[clip.id] }))
    setDisliked((m) => ({ ...m, [clip.id]: false }))
  }

  const toggleDislike = () => {
    setDisliked((m) => ({ ...m, [clip.id]: !m[clip.id] }))
    setLiked((m) => ({ ...m, [clip.id]: false }))
  }

  const toggleSubscribe = () => {
    const next = !subscribed
    setSubscribed(next)
    if (next) {
      push({
        appId: "tube",
        source: "JP Tube",
        title: `Subscribed to ${PROFILE.name}`,
        body: "All notifications on. There is exactly one channel here.",
        sound: "notify",
      })
    }
  }

  const share = () => {
    push({
      appId: "tube",
      source: "JP Tube",
      title: "The share sheet is a prop",
      body: `The real links live in Contact — ${PROFILE.github}`,
      sound: null,
    })
  }

  const postComment = () => {
    const body = draft.trim()
    if (!body) return
    setComments((cs) => [
      { id: `mine-${Date.now()}`, author: "You", handle: "@visitor", when: "just now", body, likes: 0, mine: true },
      ...cs,
    ])
    setDraft("")
  }

  const playNext = () => {
    if (!autoplay) return
    const i = clips.findIndex((c) => c.id === clip.id)
    setActiveId(clips[(i + 1) % clips.length].id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: "var(--os-surface)" }}>
      {/* Masthead */}
      <header
        className="flex shrink-0 items-center gap-3 border-b px-3 py-2"
        style={{ borderColor: "var(--os-border)", background: "var(--os-chrome)" }}
      >
        <Wordmark />
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (results[0]) setActiveId(results[0].id)
          }}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-1.5"
          style={{ background: "var(--os-input)", border: "1px solid var(--os-border)" }}
        >
          <Search size={14} style={{ color: "var(--os-muted)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the channel"
            className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-[var(--os-muted)]"
            style={{ color: "var(--os-fg)" }}
          />
        </form>
        <Avatar size={28} />
      </header>

      {/* One scroll region for the whole page, the way a real watch page works. */}
      <div ref={paneRef} className="os-scroll min-h-0 flex-1 overflow-y-auto">
        <div className={`flex gap-5 ${wide ? "flex-row p-5" : "flex-col p-3.5"}`}>
          <main className="min-w-0 flex-1">
            {online ? (
              <>
                <div
                  className="relative overflow-hidden rounded-xl"
                  style={{ background: "#000", border: "1px solid var(--os-border)" }}
                >
                  <video
                    ref={videoRef}
                    className="block aspect-video w-full"
                    src={VIDEO_SRC}
                    poster={POSTER_SRC}
                    controls
                    playsInline
                    preload="metadata"
                    onEnded={playNext}
                    style={{ background: "#000" }}
                  >
                    <track kind="captions" src={CAPTIONS_SRC} srcLang="en" label="English" default />
                  </video>
                  <span
                    className="pointer-events-none absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10.5px] font-medium"
                    style={{ background: "var(--os-scrim)", color: "var(--os-on-accent)", backdropFilter: "blur(6px)" }}
                  >
                    Placeholder reel
                  </span>
                </div>

                <h1 className="mt-3 text-[17px] font-semibold leading-snug" style={{ color: "var(--os-fg)" }}>
                  {clip.title}
                </h1>

                {/* Channel row + actions */}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Avatar size={40} />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold" style={{ color: "var(--os-fg)" }}>
                      {PROFILE.name}
                    </p>
                    <p className="truncate text-[11.5px]" style={{ color: "var(--os-muted)" }}>
                      1,024 subscribers · counts are for show
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={toggleSubscribe}
                    className="ml-1 flex items-center gap-1.5 rounded-full px-4 py-[7px] text-[12.5px] font-semibold transition-transform active:scale-[.97]"
                    style={
                      subscribed
                        ? { background: "var(--os-hover)", color: "var(--os-fg)", border: "1px solid var(--os-border)" }
                        : { background: "var(--os-accent)", color: "var(--os-on-accent)", border: "1px solid transparent" }
                    }
                  >
                    {subscribed ? <BellRing size={14} /> : <Bell size={14} />}
                    {subscribed ? "Subscribed" : "Subscribe"}
                  </button>

                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <div
                      className="flex items-center overflow-hidden rounded-full"
                      style={{ background: "var(--os-hover)" }}
                    >
                      <button
                        type="button"
                        onClick={toggleLike}
                        aria-pressed={isLiked}
                        className="flex items-center gap-1.5 px-3.5 py-[7px] text-[12.5px] hover:bg-[var(--os-active)]"
                        style={{ color: isLiked ? "var(--os-accent)" : "var(--os-fg)" }}
                      >
                        <ThumbsUp size={14} />
                        {compact(clip.likes + (isLiked ? 1 : 0))}
                      </button>
                      <span className="h-5 w-px" style={{ background: "var(--os-border)" }} />
                      <button
                        type="button"
                        onClick={toggleDislike}
                        aria-pressed={isDisliked}
                        aria-label="Dislike"
                        className="px-3.5 py-[7px] hover:bg-[var(--os-active)]"
                        style={{ color: isDisliked ? "var(--os-accent)" : "var(--os-fg)" }}
                      >
                        <ThumbsDown size={14} />
                      </button>
                    </div>

                    <PillButton onClick={share} icon={<Share2 size={14} />} label="Share" />
                    <PillButton
                      onClick={() => setSaved((m) => ({ ...m, [clip.id]: !m[clip.id] }))}
                      icon={isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                      label={isSaved ? "Saved" : "Save"}
                      active={isSaved}
                    />
                  </div>
                </div>

                {/* Description */}
                <div
                  className="mt-4 rounded-xl p-3.5 text-[12.5px] leading-relaxed"
                  style={{ background: "var(--os-card)", border: "1px solid var(--os-border)", color: "var(--os-fg)" }}
                >
                  <p className="font-semibold">
                    {compact(clip.views)} views · {clip.year} · {clip.quip}
                  </p>

                  {expanded ? (
                    <div className="mt-2 space-y-3">
                      <p style={{ color: "var(--os-muted)" }}>{clip.desc}</p>

                      {!clip.trailer && (
                        <div className="flex flex-wrap gap-1.5">
                          <Tag>{clip.line}</Tag>
                          <Tag>{clip.stack}</Tag>
                          <Tag>{clip.year}</Tag>
                        </div>
                      )}

                      <div>
                        <p className="font-semibold">About the channel</p>
                        <p style={{ color: "var(--os-muted)" }}>
                          {PROFILE.title} · {PROFILE.location}
                        </p>
                        <p className="mt-1" style={{ color: "var(--os-muted)" }}>
                          {PROFILE.tagline}
                        </p>
                      </div>

                      <ul className="space-y-1">
                        {PROFILE.uvp.map((u) => (
                          <li key={u} className="flex gap-2" style={{ color: "var(--os-muted)" }}>
                            <Check size={13} className="mt-[3px] shrink-0" style={{ color: "var(--os-accent)" }} />
                            <span>{u}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="space-y-0.5" style={{ color: "var(--os-muted)" }}>
                        <p>{PROFILE.github}</p>
                        <p>{PROFILE.linkedin}</p>
                        <p>{PROFILE.email}</p>
                      </div>

                      <p
                        className="rounded-lg p-2.5 text-[11.5px]"
                        style={{ background: "var(--os-accent-soft)", color: "var(--os-fg)" }}
                      >
                        Straight up: the same 20-second intro plays for every entry on this channel. The real capture
                        for each build is still being edited — the metadata around it is honest, the footage is a
                        stand-in.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 line-clamp-2" style={{ color: "var(--os-muted)" }}>
                      {clip.desc} — {PROFILE.tagline}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-2 flex items-center gap-1 text-[12px] font-semibold"
                    style={{ color: "var(--os-fg)" }}
                  >
                    {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {expanded ? "Show less" : "...more"}
                  </button>
                </div>

                {/* Comments */}
                <section className="mt-5">
                  <h2 className="text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>
                    {comments.length} Comments
                  </h2>

                  <div className="mt-3 flex items-start gap-3">
                    <Avatar size={32} label="Y" />
                    <div className="min-w-0 flex-1">
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") postComment()
                        }}
                        placeholder="Add a comment..."
                        className="w-full border-b bg-transparent pb-1.5 text-[12.5px] outline-none placeholder:text-[var(--os-muted)]"
                        style={{ color: "var(--os-fg)", borderColor: "var(--os-border)" }}
                      />
                      {draft.trim() && (
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setDraft("")}
                            className="rounded-full px-3 py-1.5 text-[12px]"
                            style={{ color: "var(--os-muted)" }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={postComment}
                            className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold"
                            style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
                          >
                            <Send size={12} />
                            Comment
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <ul className="mt-4 space-y-4">
                    {comments.map((c, i) => (
                      <li key={c.id} className="flex items-start gap-3">
                        <Avatar size={32} label={c.author[0]} tint={(i % 3) + 1} />
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-baseline gap-2">
                            <span className="text-[12.5px] font-semibold" style={{ color: "var(--os-fg)" }}>
                              {c.handle}
                            </span>
                            <span className="text-[11px]" style={{ color: "var(--os-muted)" }}>
                              {c.when}
                            </span>
                            {c.hearted && (
                              <span
                                className="rounded-full px-1.5 py-[1px] text-[10px] font-medium"
                                style={{ background: "var(--os-accent-soft)", color: "var(--os-fg)" }}
                              >
                                hearted by {PROFILE.initials}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-[12.5px] leading-relaxed" style={{ color: "var(--os-fg)" }}>
                            {c.body}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--os-muted)" }}>
                            <ThumbsUp size={12} />
                            {c.likes}
                            <span className="ml-2">Reply</span>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <p className="mt-5 text-[11px]" style={{ color: "var(--os-muted)" }}>
                    Every comment above is fictional and written for this set piece. Yours is only kept until the
                    window closes.
                  </p>
                </section>
              </>
            ) : (
              <OfflineState title={clip.title} />
            )}
          </main>

          {/* Up next */}
          <aside className={wide ? "w-[326px] shrink-0" : "w-full"}>
            <div className="mb-2.5 flex items-center gap-2">
              <ListVideo size={15} style={{ color: "var(--os-muted)" }} />
              <span className="text-[12.5px] font-semibold" style={{ color: "var(--os-fg)" }}>
                Up next
              </span>
              <button
                type="button"
                onClick={() => setAutoplay((v) => !v)}
                role="switch"
                aria-checked={autoplay}
                aria-label="Autoplay"
                className="ml-auto flex items-center gap-2 text-[11.5px]"
                style={{ color: "var(--os-muted)" }}
              >
                Autoplay
                <span
                  className="relative h-[18px] w-[34px] rounded-full transition-colors"
                  style={{
                    background: autoplay ? "var(--os-accent)" : "var(--os-hover)",
                    border: "1px solid var(--os-border)",
                  }}
                >
                  <span
                    className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full transition-all"
                    style={{
                      left: autoplay ? 17 : 3,
                      background: autoplay ? "var(--os-on-accent)" : "var(--os-fg)",
                    }}
                  />
                </span>
              </button>
            </div>

            {results.length === 0 ? (
              <p className="py-8 text-center text-[12.5px]" style={{ color: "var(--os-muted)" }}>
                Nothing matches &ldquo;{query}&rdquo;.
              </p>
            ) : (
              <ul className="space-y-2">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(c.id)}
                      className="flex w-full gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-[var(--os-hover)]"
                    >
                      <div className="w-[150px] shrink-0">
                        <Thumb clip={c} />
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="line-clamp-2 text-[12.5px] font-medium leading-snug" style={{ color: "var(--os-fg)" }}>
                          {c.title}
                        </p>
                        <p className="mt-1 truncate text-[11px]" style={{ color: "var(--os-muted)" }}>
                          {c.line}
                        </p>
                        <p className="truncate text-[11px]" style={{ color: "var(--os-muted)" }}>
                          {compact(c.views)} views · {c.year}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------- parts --------------------------------- */

/** Original mark: a stacked-chevron "stream" glyph, nothing borrowed. */
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

function Avatar({ size = 32, label, tint = 0 }: { size?: number; label?: string; tint?: number }) {
  const mix = 100 - tint * 22
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: `linear-gradient(135deg, color-mix(in srgb, var(--os-accent) ${mix}%, var(--os-fg)), color-mix(in srgb, var(--os-accent) ${Math.max(
          25,
          mix - 45,
        )}%, var(--os-fg)))`,
        color: "var(--os-on-accent)",
      }}
    >
      {label ?? PROFILE.initials}
    </span>
  )
}

function PillButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full px-3.5 py-[7px] text-[12.5px] transition-colors hover:bg-[var(--os-active)]"
      style={{ background: "var(--os-hover)", color: active ? "var(--os-accent)" : "var(--os-fg)" }}
    >
      {icon}
      {label}
    </button>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-2.5 py-[3px] text-[11px] font-medium"
      style={{ background: "var(--os-hover)", color: "var(--os-muted)" }}
    >
      {children}
    </span>
  )
}

/** Thumbnails are drawn, not loaded — nothing here fetches an image that does not exist. */
function Thumb({ clip }: { clip: Clip }) {
  const v = clip.variant
  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-lg"
      style={{
        background: `linear-gradient(${120 + v * 40}deg, color-mix(in srgb, var(--os-accent) ${
          16 + v * 7
        }%, var(--os-surface)), var(--os-surface))`,
        border: "1px solid var(--os-border)",
      }}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 160 90"
        preserveAspectRatio="none"
        aria-hidden
        style={{ color: "var(--os-fg)", opacity: 0.14 }}
      >
        {v === 0 &&
          [0, 1, 2, 3, 4, 5].map((i) => (
            <line key={i} x1={-20 + i * 34} y1={95} x2={20 + i * 34} y2={-5} stroke="currentColor" strokeWidth="6" />
          ))}
        {v === 1 &&
          [14, 26, 38, 50].map((r) => (
            <circle key={r} cx={128} cy={64} r={r} fill="none" stroke="currentColor" strokeWidth="3" />
          ))}
        {v === 2 &&
          [18, 40, 28, 58, 34, 46].map((h, i) => (
            <rect key={i} x={12 + i * 24} y={86 - h} width="14" height={h} rx="3" fill="currentColor" />
          ))}
        {v === 3 &&
          Array.from({ length: 24 }, (_, i) => (
            <circle key={i} cx={14 + (i % 8) * 20} cy={16 + Math.floor(i / 8) * 28} r="3.2" fill="currentColor" />
          ))}
      </svg>

      <div className="absolute inset-0 flex flex-col p-2">
        <p className="line-clamp-2 text-[10.5px] font-semibold leading-tight" style={{ color: "var(--os-fg)" }}>
          {clip.trailer ? "Channel trailer" : clip.title.replace(" — build walkthrough", "")}
        </p>
        <p className="mt-auto truncate text-[9.5px]" style={{ color: "var(--os-muted)" }}>
          {clip.stack}
        </p>
      </div>

      <span
        className="absolute bottom-1.5 right-1.5 rounded px-1.5 py-[1px] text-[9.5px] font-medium tabular-nums"
        style={{
          background: "color-mix(in srgb, var(--os-surface) 86%, transparent)",
          color: "var(--os-fg)",
          border: "1px solid var(--os-border)",
        }}
      >
        {clock(clip.seconds)}
      </span>

      <span
        className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition-opacity hover:opacity-100"
        style={{ background: "var(--os-scrim)" }}
      >
        <Play size={18} style={{ color: "var(--os-on-accent)" }} />
      </span>
    </div>
  )
}

function OfflineState({ title }: { title: string }) {
  const setWifi = useSystem((s) => s.setWifi)
  const airplane = useSystem((s) => s.airplane)
  const connecting = useSystem((s) => s.conn === "connecting")

  return (
    <div
      className="grid place-items-center rounded-xl px-6 py-14 text-center"
      style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
    >
      <div className="max-w-[380px]">
        <span
          className="mx-auto grid h-14 w-14 place-items-center rounded-full"
          style={{ background: "var(--os-hover)", color: "var(--os-muted)" }}
        >
          <WifiOff size={24} />
        </span>
        <h2 className="mt-4 text-[16px] font-semibold" style={{ color: "var(--os-fg)" }}>
          You&rsquo;re offline
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
          JP Tube streams every reel, so there is nothing cached to play. The page below is still here — reconnect and
          &ldquo;{title}&rdquo; picks up from the start.
        </p>
        <button
          type="button"
          onClick={() => setWifi(true)}
          disabled={connecting}
          className="mt-5 rounded-md px-4 py-2 text-[12.5px] font-medium disabled:opacity-60"
          style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
        >
          {connecting ? "Reconnecting..." : airplane ? "Turn off Airplane mode" : "Reconnect"}
        </button>
        <p className="mt-4 text-[11px]" style={{ color: "var(--os-muted)" }}>
          ERR_NETWORK_CHANGED · playback paused
        </p>
      </div>
    </div>
  )
}
