"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Columns2,
  ExternalLink,
  Github,
  History,
  Home,
  Info,
  Linkedin,
  MapPin,
  Plus,
  RotateCw,
  Search,
  ShieldCheck,
  Shuffle,
  X,
} from "lucide-react"
import { ACHIEVEMENTS, LAB, PROFILE, PROJECTS, SKILL_GROUPS, TIMELINE, type Project } from "@/lib/os/content"
import type { AppId, WindowInstance } from "@/lib/os/types"
import { useNotify } from "@/lib/os/notify-store"
import { useSystem } from "@/lib/os/system-store"
import { useWM } from "@/lib/os/wm-store"

/* ------------------------------------------------------------------ *
 * Vantage — the second browser on this machine.
 *
 * Nimbus (components/os/apps/browser-app.tsx) is the coral one: attached
 * trapezoidal tabs, a round omnibox, a centred new-tab page. Vantage is
 * the teal one, and it is deliberately a different product: detached
 * pill tabs, a squared omnibox, a persistent right-hand rail, a profile
 * pill, and a two-column project feed where Nimbus puts a search box.
 *
 * The one thing Nimbus cannot do: SPLIT VIEW. Two panes, each with its
 * own history and its own back button, so two projects can be read side
 * by side. The Start page seeds it, so it demonstrates itself.
 *
 * No network calls. Every page renders from lib/os/content.ts; the only
 * real URLs are the marked external links, which open in the visitor's
 * own browser. No vendor marks.
 * ------------------------------------------------------------------ */

const HOST = "johnpaul.dev"
const ENGINE = "vantage.find"

/** Brand gradient for the icon tile — bright, no text sits on it. */
const GRAD = "linear-gradient(135deg, #00a2a8, #006d78)"
/** Deeper cut for filled buttons, so white labels clear contrast. */
const GRAD_BTN = "linear-gradient(135deg, #00838c, #005a63)"

/** Width of the whole app below which split view folds to one pane. */
const SPLIT_MIN = 900
/** Width a single pane needs before the project feed goes two-up. */
const FEED_TWO_UP = 700
const RAIL_W = 44
const PANEL_W = 268

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 42)

const BY_ID = new Map(PROJECTS.map((p) => [p.id, p]))
const projectOf = (id: string): Project | undefined => BY_ID.get(id)

/* ================================================================== *
 * Addresses
 * ================================================================== */

type View =
  | { k: "start" }
  | { k: "index" }
  | { k: "profile" }
  | { k: "project"; id: string }
  | { k: "find"; q: string }

type PageMeta = { url: string; title: string; external?: string }

function metaFor(v: View): PageMeta {
  switch (v.k) {
    case "start":
      return { url: "vantage://start", title: "Start" }
    case "index":
      return { url: `https://${HOST}/projects`, title: "All projects" }
    case "profile":
      return { url: `https://${HOST}`, title: `${PROFILE.name} — Portfolio`, external: `https://${PROFILE.github}` }
    case "project": {
      const p = projectOf(v.id)
      return p
        ? { url: `https://${HOST}/projects/${slug(p.title)}`, title: p.title }
        : { url: `https://${HOST}/projects`, title: "Page not found" }
    }
    case "find":
      return { url: `https://${ENGINE}/find?q=${encodeURIComponent(v.q)}`, title: `${v.q} — Vantage Find` }
  }
}

const sameView = (a: View, b: View) => metaFor(a).url === metaFor(b).url

/* ================================================================== *
 * Vantage Find — a small index over lib/os/content.ts.
 *
 * DUPLICATION NOTE: this is the same *idea* as Nimbus's search (token
 * scoring + term highlighting), written compactly and independently.
 * When browser-app.tsx is refactored, both should move to
 * lib/os/web/search.ts and this block should be deleted.
 * ================================================================== */

type RecKind = "Profile" | "Project" | "Skill" | "Role" | "Study" | "Award" | "Lab"

type Rec = {
  id: string
  kind: RecKind
  title: string
  sub: string
  /** Lowercased haystack, built once. */
  hay: string
  /** Where Vantage can show it, if it has a page for it. */
  view?: View
  /** Which desktop app owns it. */
  appId?: AppId
}

function buildRecords(): Rec[] {
  const out: Rec[] = []

  out.push({
    id: "profile",
    kind: "Profile",
    title: `${PROFILE.name} — ${PROFILE.title}`,
    sub: PROFILE.tagline,
    hay: `${PROFILE.name} ${PROFILE.title} ${PROFILE.tagline} ${PROFILE.location} ${PROFILE.uvp.join(" ")} about who bio profile portfolio`.toLowerCase(),
    view: { k: "profile" },
    appId: "about",
  })
  out.push({
    id: "contact",
    kind: "Profile",
    title: `Contact ${PROFILE.name}`,
    sub: `${PROFILE.email} · ${PROFILE.phone} · ${PROFILE.location}`,
    hay: `contact hire hiring email reach available availability ${PROFILE.email} ${PROFILE.phone} ${PROFILE.github} ${PROFILE.linkedin}`.toLowerCase(),
    appId: "contact",
  })
  out.push({
    id: "resume",
    kind: "Profile",
    title: `Résumé — ${PROFILE.name}`,
    sub: PROFILE.uvp[2],
    hay: `resume cv curriculum vitae download pdf ${PROFILE.title}`.toLowerCase(),
    appId: "resume",
  })

  for (const p of PROJECTS) {
    out.push({
      id: `p-${p.id}`,
      kind: "Project",
      title: p.title,
      sub: `${p.desc} ${p.stack} · ${p.category} · ${p.year}`,
      hay: `${p.title} ${p.stack} ${p.desc} ${p.category} ${p.year} project built repo`.toLowerCase(),
      view: { k: "project", id: p.id },
      appId: "projects",
    })
  }
  for (const g of SKILL_GROUPS) {
    const names = g.items.map((i) => i.name)
    out.push({
      id: `s-${slug(g.label)}`,
      kind: "Skill",
      title: `${g.label} skills`,
      sub: `${g.hint}: ${names.join(", ")}.`,
      hay: `${g.label} ${g.hint} ${names.join(" ")} skills stack tools technology`.toLowerCase(),
      appId: "skills",
    })
  }
  for (const t of TIMELINE) {
    out.push({
      id: `t-${t.year}-${slug(t.org)}`,
      kind: t.kind === "work" ? "Role" : "Study",
      title: `${t.label} — ${t.org}`,
      sub: `${t.year} · ${t.facts.join(" · ")}`,
      hay: `${t.label} ${t.org} ${t.year} ${t.facts.join(" ")} ${t.kind === "work" ? "job role career employer" : "education degree college university"}`.toLowerCase(),
      appId: "experience",
    })
  }
  for (const a of ACHIEVEMENTS) {
    out.push({
      id: `a-${slug(a.title)}`,
      kind: "Award",
      title: a.title,
      sub: a.detail,
      hay: `${a.title} ${a.detail} achievement award certification certified`.toLowerCase(),
      appId: "achievements",
    })
  }
  for (const l of LAB) {
    out.push({
      id: `l-${slug(l.title)}`,
      kind: "Lab",
      title: l.title,
      sub: `${l.note} In progress — ${l.progress}% complete.`,
      hay: `${l.title} ${l.note} lab prototype experiment research work in progress`.toLowerCase(),
      appId: "lab",
    })
  }
  return out
}

const RECORDS = buildRecords()

const STOP = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from", "has", "have",
  "he", "his", "how", "in", "is", "it", "its", "me", "of", "on", "or", "that", "the", "to", "was",
  "what", "when", "which", "who", "with", "you", "your",
])

function terms(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t))
}

function findRecords(q: string, limit = 14): Rec[] {
  const ts = terms(q)
  if (ts.length === 0) return []
  const scored: { r: Rec; s: number }[] = []
  for (const r of RECORDS) {
    const title = r.title.toLowerCase()
    let s = 0
    let hit = 0
    for (const t of ts) {
      const inTitle = title.includes(t)
      const inHay = r.hay.includes(t)
      if (!inTitle && !inHay) continue
      hit += 1
      if (inTitle) s += 8
      if (inHay) s += 3
      if (title.startsWith(t)) s += 4
    }
    if (hit === 0) continue
    // Cover the whole question, not just one common word.
    s += (hit / ts.length) * 10
    scored.push({ r, s })
  }
  scored.sort((a, b) => b.s - a.s || a.r.title.localeCompare(b.r.title))
  return scored.slice(0, limit).map((x) => x.r)
}

/** Bolds matched terms. Case-insensitive, no regex built from user input. */
function markUp(text: string, ts: string[]): ReactNode {
  if (ts.length === 0) return text
  const lower = text.toLowerCase()
  const spans: { a: number; b: number }[] = []
  for (const t of ts) {
    let i = lower.indexOf(t)
    while (i !== -1) {
      spans.push({ a: i, b: i + t.length })
      i = lower.indexOf(t, i + t.length)
    }
  }
  if (spans.length === 0) return text
  spans.sort((x, y) => x.a - y.a)
  const merged: { a: number; b: number }[] = []
  for (const s of spans) {
    const last = merged[merged.length - 1]
    if (last && s.a <= last.b) last.b = Math.max(last.b, s.b)
    else merged.push({ ...s })
  }
  const out: ReactNode[] = []
  let c = 0
  merged.forEach((s, i) => {
    if (s.a > c) out.push(text.slice(c, s.a))
    out.push(
      <b key={`m${i}`} className="font-semibold" style={{ color: "var(--vt-ink)" }}>
        {text.slice(s.a, s.b)}
      </b>,
    )
    c = s.b
  })
  if (c < text.length) out.push(text.slice(c))
  return out
}

/* ================================================================== *
 * Marks — original. A compass rose seen through a viewfinder: two
 * crossed needles, one bright and one dim, because the whole idea of
 * this browser is two panes with one of them in focus.
 * ================================================================== */

function Rose({ size, color = "#fff" }: { size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path d="M12 3.1 15.3 12 12 20.9 8.7 12Z" fill={color} />
      <path d="M3.1 12 12 8.7 20.9 12 12 15.3Z" fill={color} opacity=".42" />
    </svg>
  )
}

function VantageMark({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center"
      style={{ width: size, height: size, borderRadius: Math.max(3, Math.round(size * 0.28)), backgroundImage: GRAD }}
    >
      <Rose size={Math.round(size * 0.76)} />
    </span>
  )
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <VantageMark size={30} />
      <span className="flex flex-col leading-none">
        <span className="text-[17px] font-semibold tracking-tight" style={{ color: "var(--os-fg)" }}>
          Vantage
        </span>
        <span className="mt-1 text-[10.5px] uppercase tracking-[0.13em]" style={{ color: "var(--vt-ink)" }}>
          Two panes, one view
        </span>
      </span>
    </span>
  )
}

/* ================================================================== *
 * Small shared bits
 * ================================================================== */

function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "brand" }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-2 py-[2px] text-[10.5px] font-medium uppercase tracking-wide"
      style={
        tone === "brand"
          ? { background: "var(--vt-soft)", color: "var(--vt-ink)" }
          : { background: "var(--os-hover)", color: "var(--os-muted)" }
      }
    >
      {children}
    </span>
  )
}

function BrandButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-md px-3.5 py-[7px] text-[12.5px] font-medium text-white transition-transform active:scale-[.98]"
      style={{ backgroundImage: GRAD_BTN }}
    >
      {children}
    </button>
  )
}

function GhostButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-md px-3 py-[6px] text-[12.5px] transition-colors hover:bg-[var(--os-hover)]"
      style={{ color: "var(--os-fg)", border: "1px solid var(--os-border)" }}
    >
      {children}
    </button>
  )
}

function Spec({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-3 border-b py-2 last:border-b-0" style={{ borderColor: "var(--os-border)" }}>
      <span className="w-[84px] shrink-0 text-[11px] uppercase tracking-wide" style={{ color: "var(--os-muted)" }}>
        {label}
      </span>
      <span className="min-w-0 flex-1 text-[12.5px]" style={{ color: "var(--os-fg)" }}>
        {value}
      </span>
    </div>
  )
}

/** Everything a rendered page is allowed to do. Bound per pane. */
type PageApi = {
  /** Navigate this pane. */
  nav: (v: View) => void
  /** Put an address in the OTHER pane and turn split view on. */
  other: (v: View) => void
  /** Seed both panes at once. */
  compare: (a: string, b: string) => void
  /** Open a desktop app behind the browser. */
  openApp: (appId: AppId) => void
  /** How many columns this pane can afford. */
  cols: 1 | 2
}

/* ================================================================== *
 * Start — a two-column project feed, not a centred search box.
 * ================================================================== */

const NEWEST = [...PROJECTS].sort((a, b) => Number(b.year) - Number(a.year))[0]
const MEASURED = PROJECTS.find((p) => /\d+\s*%/.test(p.desc)) ?? PROJECTS[1]

function StartPage({ api }: { api: PageApi }) {
  return (
    <div className="mx-auto w-full max-w-[940px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <Wordmark />
        <p className="text-[12px]" style={{ color: "var(--os-muted)" }}>
          {PROFILE.name} · {PROFILE.title}
        </p>
      </div>

      <CompareCard api={api} />

      <div className="mb-3 mt-7 flex items-baseline gap-2">
        <h2 className="text-[13.5px] font-semibold" style={{ color: "var(--os-fg)" }}>
          The work
        </h2>
        <span className="text-[11.5px]" style={{ color: "var(--os-muted)" }}>
          {PROJECTS.length} projects · newest first
        </span>
        <button
          type="button"
          onClick={() => api.nav({ k: "index" })}
          className="ml-auto text-[11.5px] hover:underline"
          style={{ color: "var(--vt-ink)" }}
        >
          Browse by category
        </button>
      </div>

      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: api.cols === 2 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)" }}
      >
        {[...PROJECTS]
          .sort((a, b) => Number(b.year) - Number(a.year))
          .map((p) => (
            <FeedCard key={p.id} project={p} api={api} />
          ))}
      </div>

      <p className="mt-8 text-[11px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
        Nimbus and Vantage are original. No vendor marks ship in this repo.
      </p>
    </div>
  )
}

function CompareCard({ api }: { api: PageApi }) {
  const theme = useWM((s) => s.theme)
  const [a, setA] = useState(NEWEST.id)
  const [b, setB] = useState(MEASURED.id === NEWEST.id ? PROJECTS[0].id : MEASURED.id)

  const shuffle = () => {
    const i = Math.floor(Math.random() * PROJECTS.length)
    let j = Math.floor(Math.random() * PROJECTS.length)
    if (j === i) j = (i + 1) % PROJECTS.length
    setA(PROJECTS[i].id)
    setB(PROJECTS[j].id)
  }

  const selectStyle: CSSProperties = {
    background: "var(--os-input)",
    border: "1px solid var(--os-border)",
    color: "var(--os-fg)",
    colorScheme: theme,
  }

  return (
    <section
      className="rounded-xl p-4"
      style={{ background: "var(--vt-soft)", border: "1px solid var(--vt-line)" }}
    >
      <div className="mb-3 flex items-center gap-2">
        <Columns2 size={15} style={{ color: "var(--vt-ink)" }} />
        <h2 className="text-[13.5px] font-semibold" style={{ color: "var(--os-fg)" }}>
          Compare two projects
        </h2>
        <span className="hidden text-[11.5px] sm:inline" style={{ color: "var(--os-muted)" }}>
          Split view gives each pane its own history
        </span>
        <button
          type="button"
          onClick={shuffle}
          title="Pick a random pair"
          aria-label="Pick a random pair"
          className="ml-auto grid h-7 w-7 place-items-center rounded-md hover:bg-[var(--os-hover)]"
          style={{ color: "var(--os-muted)" }}
        >
          <Shuffle size={14} />
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2.5">
        <label className="min-w-[180px] flex-1">
          <span className="mb-1 block text-[10.5px] uppercase tracking-wide" style={{ color: "var(--os-muted)" }}>
            Left pane
          </span>
          <select
            value={a}
            onChange={(e) => setA(e.target.value)}
            className="w-full rounded-md px-2.5 py-[7px] text-[12.5px] outline-none"
            style={selectStyle}
          >
            {PROJECTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>

        <ArrowLeftRight size={15} className="mb-2 hidden shrink-0 sm:block" style={{ color: "var(--vt-ink)" }} />

        <label className="min-w-[180px] flex-1">
          <span className="mb-1 block text-[10.5px] uppercase tracking-wide" style={{ color: "var(--os-muted)" }}>
            Right pane
          </span>
          <select
            value={b}
            onChange={(e) => setB(e.target.value)}
            className="w-full rounded-md px-2.5 py-[7px] text-[12.5px] outline-none"
            style={selectStyle}
          >
            {PROJECTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>

        <div className="mb-[1px]">
          <BrandButton onClick={() => api.compare(a, b)}>
            <Columns2 size={14} />
            Open side by side
          </BrandButton>
        </div>
      </div>
    </section>
  )
}

function FeedCard({ project, api }: { project: Project; api: PageApi }) {
  return (
    <article
      className="group relative flex flex-col gap-1.5 rounded-lg p-3 transition-colors hover:bg-[var(--os-hover)]"
      style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
    >
      <div className="flex items-center gap-2">
        <Chip tone="brand">{project.category}</Chip>
        <span className="text-[11px] tabular-nums" style={{ color: "var(--os-muted)" }}>
          {project.year}
        </span>
        <button
          type="button"
          title="Open in the other pane"
          aria-label={`Open ${project.title} in the other pane`}
          onClick={() => api.other({ k: "project", id: project.id })}
          className="ml-auto grid h-6 w-6 place-items-center rounded opacity-0 transition-opacity hover:bg-[var(--os-active)] focus-visible:opacity-100 group-hover:opacity-100"
          style={{ color: "var(--vt-ink)" }}
        >
          <Columns2 size={13} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => api.nav({ k: "project", id: project.id })}
        className="text-left text-[13px] font-semibold leading-snug hover:underline"
        style={{ color: "var(--os-fg)" }}
      >
        {project.title}
      </button>
      <p className="text-[12px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
        {project.desc}
      </p>
      <p className="text-[11px]" style={{ color: "var(--vt-ink)" }}>
        {project.stack}
      </p>
    </article>
  )
}

/* ================================================================== *
 * Project page — the thing split view exists for. Every field sits in
 * the same order at the same height, so two of these side by side line
 * up row for row.
 * ================================================================== */

function ProjectPage({ id, api }: { id: string; api: PageApi }) {
  const p = projectOf(id)
  if (!p) {
    return (
      <div className="p-8">
        <h1 className="text-[18px] font-semibold" style={{ color: "var(--os-fg)" }}>
          Page not found
        </h1>
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--os-muted)" }}>
          Vantage only renders projects listed in this portfolio.
        </p>
        <div className="mt-4">
          <GhostButton onClick={() => api.nav({ k: "index" })}>All projects</GhostButton>
        </div>
      </div>
    )
  }

  const siblings = PROJECTS.filter((o) => o.id !== p.id && o.category === p.category)
  const alsoTry = (siblings.length ? siblings : PROJECTS.filter((o) => o.id !== p.id)).slice(0, 4)

  return (
    <div className="mx-auto w-full max-w-[640px] px-5 py-5">
      <p className="mb-3 truncate text-[11px]" style={{ color: "var(--os-muted)" }}>
        {HOST} / projects / {slug(p.title)}
      </p>

      <h1 className="text-[19px] font-semibold leading-tight" style={{ color: "var(--os-fg)" }}>
        {p.title}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Chip tone="brand">{p.category}</Chip>
        <Chip>{p.year}</Chip>
      </div>

      <div className="mt-4 rounded-lg px-3.5 py-1" style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}>
        <Spec label="Summary" value={p.desc} />
        <Spec label="Stack" value={<span style={{ color: "var(--vt-ink)" }}>{p.stack}</span>} />
        <Spec label="Category" value={p.category} />
        <Spec label="Year" value={<span className="tabular-nums">{p.year}</span>} />
        <Spec
          label="Peers"
          value={`${siblings.length} other ${siblings.length === 1 ? "project" : "projects"} in ${p.category}`}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <GhostButton onClick={() => api.openApp("projects")}>Open in Projects</GhostButton>
        <GhostButton onClick={() => api.nav({ k: "index" })}>All projects</GhostButton>
      </div>

      <h2 className="mb-2 mt-6 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--os-muted)" }}>
        Put beside this one
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {alsoTry.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => api.other({ k: "project", id: o.id })}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-[6px] text-[12px] transition-colors hover:bg-[var(--vt-soft)]"
            style={{ border: "1px solid var(--os-border)", color: "var(--os-fg)" }}
          >
            <Columns2 size={12} style={{ color: "var(--vt-ink)" }} />
            <span className="max-w-[190px] truncate">{o.title}</span>
          </button>
        ))}
      </div>

      <p className="mt-6 text-[11px]" style={{ color: "var(--os-muted)" }}>
        Rendered from this portfolio&rsquo;s own content file. Vantage made no network request to show it.
      </p>
    </div>
  )
}

/* ================================================================== *
 * Index, profile, results
 * ================================================================== */

const CATEGORIES = Array.from(new Set(PROJECTS.map((p) => p.category)))

function IndexPage({ api }: { api: PageApi }) {
  return (
    <div className="mx-auto w-full max-w-[860px] px-6 py-6">
      <p className="mb-1 text-[11px]" style={{ color: "var(--os-muted)" }}>
        {HOST} / projects
      </p>
      <h1 className="mb-5 text-[19px] font-semibold" style={{ color: "var(--os-fg)" }}>
        All projects
      </h1>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: api.cols === 2 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)" }}
      >
        {CATEGORIES.map((c) => {
          const items = PROJECTS.filter((p) => p.category === c)
          return (
            <section key={c}>
              <div className="mb-1.5 flex items-center gap-2">
                <h2 className="text-[12.5px] font-semibold" style={{ color: "var(--os-fg)" }}>
                  {c}
                </h2>
                <Chip>{items.length}</Chip>
              </div>
              <ul className="rounded-lg" style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}>
                {items.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0" style={{ borderColor: "var(--os-border)" }}>
                    <button
                      type="button"
                      onClick={() => api.nav({ k: "project", id: p.id })}
                      className="min-w-0 flex-1 truncate text-left text-[12.5px] hover:underline"
                      style={{ color: "var(--os-fg)" }}
                    >
                      {p.title}
                    </button>
                    <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--os-muted)" }}>
                      {p.year}
                    </span>
                    <button
                      type="button"
                      title="Open in the other pane"
                      aria-label={`Open ${p.title} in the other pane`}
                      onClick={() => api.other({ k: "project", id: p.id })}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded hover:bg-[var(--os-hover)]"
                      style={{ color: "var(--vt-ink)" }}
                    >
                      <Columns2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function ProfilePage({ api }: { api: PageApi }) {
  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-7">
      <div className="flex items-start gap-4">
        <span
          className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-[20px] font-semibold text-white"
          style={{ backgroundImage: GRAD }}
        >
          {PROFILE.initials}
        </span>
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-tight" style={{ color: "var(--os-fg)" }}>
            {PROFILE.name}
          </h1>
          <p className="text-[13px]" style={{ color: "var(--vt-ink)" }}>
            {PROFILE.title}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[12px]" style={{ color: "var(--os-muted)" }}>
            <MapPin size={12} />
            {PROFILE.location}
          </p>
        </div>
      </div>

      <p className="mt-5 text-[14px] leading-relaxed" style={{ color: "var(--os-fg)" }}>
        {PROFILE.tagline}
      </p>

      <ul className="mt-4 space-y-2">
        {PROFILE.uvp.map((u) => (
          <li key={u} className="flex gap-2.5 text-[12.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
            <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--vt-ink)" }} />
            {u}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap gap-2">
        <GhostButton onClick={() => api.openApp("about")}>About</GhostButton>
        <GhostButton onClick={() => api.openApp("contact")}>Contact</GhostButton>
        <GhostButton onClick={() => api.openApp("resume")}>Résumé</GhostButton>
        <GhostButton onClick={() => api.nav({ k: "index" })}>Projects</GhostButton>
      </div>

      <div className="mt-6 grid gap-2" style={{ gridTemplateColumns: api.cols === 2 ? "repeat(2, minmax(0,1fr))" : "minmax(0,1fr)" }}>
        <ExternalRow icon={<Github size={14} />} label={PROFILE.github} href={`https://${PROFILE.github}`} />
        <ExternalRow icon={<Linkedin size={14} />} label={PROFILE.linkedin} href={`https://${PROFILE.linkedin}`} />
      </div>

      <p className="mt-6 text-[11px]" style={{ color: "var(--os-muted)" }}>
        Links marked with an arrow leave this desktop and open in your real browser.
      </p>
    </div>
  )
}

function ExternalRow({ icon, label, href }: { icon: ReactNode; label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[12.5px] transition-colors hover:bg-[var(--os-hover)]"
      style={{ background: "var(--os-card)", border: "1px solid var(--os-border)", color: "var(--os-fg)" }}
    >
      <span style={{ color: "var(--vt-ink)" }}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ExternalLink size={13} style={{ color: "var(--os-muted)" }} />
    </a>
  )
}

function FindPage({ q, api }: { q: string; api: PageApi }) {
  const hits = useMemo(() => findRecords(q), [q])
  const ts = useMemo(() => terms(q), [q])
  const [kind, setKind] = useState<RecKind | "All">("All")

  const kinds = useMemo(() => {
    const seen: RecKind[] = []
    for (const h of hits) if (!seen.includes(h.kind)) seen.push(h.kind)
    return seen
  }, [hits])

  const shown = kind === "All" ? hits : hits.filter((h) => h.kind === kind)

  return (
    <div className="mx-auto w-full max-w-[760px] px-6 py-5">
      <div className="mb-4 flex items-center gap-2">
        <VantageMark size={18} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--os-fg)" }}>
          Vantage Find
        </span>
        <span className="truncate text-[11.5px]" style={{ color: "var(--os-muted)" }}>
          {hits.length} result{hits.length === 1 ? "" : "s"} inside {HOST}
        </span>
      </div>

      {kinds.length > 1 && (
        <div className="os-scroll mb-4 flex gap-1.5 overflow-x-auto pb-1">
          {(["All", ...kinds] as (RecKind | "All")[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className="shrink-0 rounded-md px-2.5 py-1 text-[11.5px] transition-colors"
              style={
                kind === k
                  ? { background: "var(--vt-soft)", color: "var(--vt-ink)", border: "1px solid var(--vt-line)" }
                  : { background: "transparent", color: "var(--os-muted)", border: "1px solid var(--os-border)" }
              }
            >
              {k}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="rounded-lg p-5" style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}>
          <p className="text-[13px]" style={{ color: "var(--os-fg)" }}>
            Nothing here matches &ldquo;{q}&rdquo;.
          </p>
          <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
            Vantage Find only reads what Johnpaul has published in this portfolio, so it would rather come back empty
            than make something up.
          </p>
          <div className="mt-4">
            <GhostButton onClick={() => api.openApp("contact")}>Ask him directly</GhostButton>
          </div>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((r) => (
            <li
              key={r.id}
              className="group rounded-lg p-3"
              style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
            >
              <div className="mb-1 flex items-center gap-2">
                <Chip tone="brand">{r.kind}</Chip>
                {r.view && (
                  <button
                    type="button"
                    title="Open in the other pane"
                    aria-label={`Open ${r.title} in the other pane`}
                    onClick={() => r.view && api.other(r.view)}
                    className="ml-auto grid h-6 w-6 place-items-center rounded opacity-0 hover:bg-[var(--os-hover)] focus-visible:opacity-100 group-hover:opacity-100"
                    style={{ color: "var(--vt-ink)" }}
                  >
                    <Columns2 size={12} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => (r.view ? api.nav(r.view) : r.appId ? api.openApp(r.appId) : undefined)}
                className="block w-full text-left text-[13.5px] font-medium leading-snug hover:underline"
                style={{ color: "var(--os-fg)" }}
              >
                {markUp(r.title, ts)}
              </button>
              <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
                {markUp(r.sub, ts)}
              </p>
              {r.appId && (
                <button
                  type="button"
                  onClick={() => r.appId && api.openApp(r.appId)}
                  className="mt-1.5 text-[11.5px] hover:underline"
                  style={{ color: "var(--vt-ink)" }}
                >
                  Open the {r.appId} app on this desktop
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ================================================================== *
 * Offline — Vantage's own voice and its own drawing.
 * ================================================================== */

function LostSightGlyph() {
  const c = "var(--os-muted)"
  return (
    <svg width="104" height="68" viewBox="0 0 104 68" aria-hidden>
      <g fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round">
        <path d="M6 22V11a5 5 0 0 1 5-5h11" />
        <path d="M82 6h11a5 5 0 0 1 5 5v11" />
        <path d="M98 46v11a5 5 0 0 1-5 5H82" />
        <path d="M22 62H11a5 5 0 0 1-5-5V46" />
      </g>
      <path d="M20 34h64" stroke={c} strokeWidth="2" strokeDasharray="4 8" opacity=".4" />
      <path d="M52 20l7.5 14L52 48l-7.5-14Z" fill="none" stroke={c} strokeWidth="2.2" opacity=".7" />
      <path d="M34 52 70 16" stroke={c} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

function OfflineView({ url, connecting }: { url: string; connecting: boolean }) {
  const setWifi = useSystem((s) => s.setWifi)
  const airplane = useSystem((s) => s.airplane)

  if (connecting) {
    return (
      <div className="grid min-h-full place-items-center p-10" style={{ color: "var(--os-fg)" }}>
        <div className="w-full max-w-[380px]">
          <div className="mb-5 h-[3px] w-full overflow-hidden rounded-full" style={{ background: "var(--os-hover)" }}>
            <div className="h-full w-1/3 animate-pulse rounded-full" style={{ background: "var(--vt-ink)" }} />
          </div>
          <p className="text-[15px] font-medium">Re-acquiring the network…</p>
          <p className="mt-2 text-[12px]" style={{ color: "var(--os-muted)" }}>
            Both panes keep their history. Vantage will pick {url} back up the moment the link is up.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid min-h-full place-items-center p-10" style={{ color: "var(--os-fg)" }}>
      <div className="w-full max-w-[480px]">
        <LostSightGlyph />
        <h1 className="mb-2 mt-6 text-[21px] font-semibold tracking-tight">Vantage has lost sight of the network</h1>
        <p className="mb-5 text-[13px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
          Nothing has been thrown away. Both panes are holding their place, and their back buttons still work — there is
          just nothing new to look at until the link comes back.
        </p>
        <ul className="mb-5 space-y-1.5 text-[12.5px]" style={{ color: "var(--os-muted)" }}>
          <li className="flex gap-2.5">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--os-muted)" }} />
            {airplane ? "Airplane mode is on — that is the whole story" : "Reconnect from Quick Settings in the tray"}
          </li>
          <li className="flex gap-2.5">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--os-muted)" }} />
            Check the router, then the cable behind it
          </li>
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <BrandButton onClick={() => setWifi(true)}>
            {airplane ? "Turn off Airplane mode" : "Reconnect"}
          </BrandButton>
          <code className="text-[11px]" style={{ color: "var(--os-muted)" }}>
            ERR_NO_VANTAGE_POINT
          </code>
        </div>
        <p className="mt-6 truncate text-[11px]" style={{ color: "var(--os-muted)" }}>
          {url}
        </p>
      </div>
    </div>
  )
}

/* ================================================================== *
 * Shell
 * ================================================================== */

type Pane = { hist: View[]; hi: number }
type PaneIdx = 0 | 1
type Tab = { id: string; panes: [Pane, Pane]; focus: PaneIdx; split: boolean }

const START: View = { k: "start" }
const freshPane = (v: View = START): Pane => ({ hist: [v], hi: 0 })

let tabSeq = 0
const newTab = (a: View = START, b: View = START, split = false): Tab => ({
  id: `vt${++tabSeq}`,
  panes: [freshPane(a), freshPane(b)],
  focus: 0,
  split,
})

type RailPanel = "collections" | "history" | "about" | null

export function VantageApp({ win }: { win: WindowInstance }) {
  const conn = useSystem((s) => s.conn)
  const online = conn === "connected"
  const theme = useWM((s) => s.theme)
  const openApp = useWM((s) => s.open)
  const setTitle = useWM((s) => s.setTitle)
  const push = useNotify((s) => s.push)

  // A deep link from elsewhere in the OS: { project } or { compare: [a, b] }.
  const [tabs, setTabs] = useState<Tab[]>(() => {
    const p = win.payload
    const compare = p?.compare
    if (Array.isArray(compare) && compare.length === 2) {
      const [a, b] = compare
      if (typeof a === "string" && typeof b === "string" && projectOf(a) && projectOf(b)) {
        return [newTab({ k: "project", id: a }, { k: "project", id: b }, true)]
      }
    }
    const one = p?.project
    if (typeof one === "string" && projectOf(one)) return [newTab({ k: "project", id: one })]
    return [newTab()]
  })
  const [activeId, setActiveId] = useState(() => tabs[0].id)
  const [reloadKey, setReloadKey] = useState(0)
  const [panel, setPanel] = useState<RailPanel>(null)
  const [omni, setOmni] = useState("")

  const tab = tabs.find((t) => t.id === activeId) ?? tabs[0]
  const focused = tab.panes[tab.focus]
  const view = focused.hist[focused.hi]
  const meta = metaFor(view)

  /* -- container width, read from the element, never the viewport ---- */
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(1060)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const wide = width >= SPLIT_MIN
  const splitLive = tab.split && wide
  const compact = width < 620
  // Below 620px the panel would leave the page a sliver, so it floats over the
  // content instead of pushing it — and then it costs the panes nothing.
  const panelOverlay = compact
  const contentW = Math.max(240, width - RAIL_W - (panel && !panelOverlay ? PANEL_W : 0))
  const paneW = splitLive ? contentW / 2 : contentW
  const cols: 1 | 2 = paneW >= FEED_TWO_UP ? 2 : 1
  /* -- window title tracks the focused pane, the way a browser does -- */
  useEffect(() => {
    const t = meta.title.length > 46 ? `${meta.title.slice(0, 45)}…` : meta.title
    setTitle(win.id, `${t} — Vantage`)
  }, [win.id, meta.title, setTitle])

  /* -- the omnibox mirrors the focused pane until you type ----------- */
  useEffect(() => {
    setOmni(view.k === "find" ? view.q : metaFor(view).url)
  }, [activeId, tab.focus, focused.hi, view])

  /* -- mutation helpers ---------------------------------------------- */
  const editTab = (fn: (t: Tab) => Tab) =>
    setTabs((ts) => ts.map((t) => (t.id === activeId ? fn(t) : t)))

  const pushTo = (t: Tab, i: PaneIdx, v: View): Tab => {
    const pane = t.panes[i]
    const trimmed = pane.hist.slice(0, pane.hi + 1)
    if (sameView(trimmed[trimmed.length - 1], v)) return t
    const next: Pane = { hist: [...trimmed, v], hi: trimmed.length }
    const panes: [Pane, Pane] = i === 0 ? [next, t.panes[1]] : [t.panes[0], next]
    return { ...t, panes }
  }

  const navPane = (i: PaneIdx, v: View) => editTab((t) => ({ ...pushTo(t, i, v), focus: i }))
  const nav = (v: View) => navPane(tab.focus, v)

  const splitAnnounced = useRef(false)
  const announceSplit = () => {
    if (splitAnnounced.current) return
    splitAnnounced.current = true
    push({
      appId: "vantage",
      source: "Vantage",
      title: "Split view is on",
      body: "Two panes, two histories. Each one keeps its own back button.",
      sound: "device-connect",
    })
  }

  const compare = (a: string, b: string) => {
    editTab((t) => {
      const withA = pushTo(t, 0, { k: "project", id: a })
      const withB = pushTo(withA, 1, { k: "project", id: b })
      return { ...withB, split: true, focus: 0 }
    })
    if (!tab.split) announceSplit()
  }

  const toggleSplit = () => {
    editTab((t) => ({ ...t, split: !t.split, focus: t.split ? 0 : t.focus }))
    if (!tab.split) announceSplit()
  }

  const closePane = (i: PaneIdx) => {
    // Closing a pane keeps the other one where it was — the surviving pane
    // becomes the single view, exactly like collapsing a split.
    editTab((t) => {
      const keep = i === 0 ? t.panes[1] : t.panes[0]
      return { ...t, panes: [keep, freshPane()], focus: 0, split: false }
    })
  }

  const step = (i: PaneIdx, delta: number) =>
    editTab((t) => {
      const pane = t.panes[i]
      const hi = Math.min(pane.hist.length - 1, Math.max(0, pane.hi + delta))
      if (hi === pane.hi) return { ...t, focus: i }
      const next: Pane = { ...pane, hi }
      const panes: [Pane, Pane] = i === 0 ? [next, t.panes[1]] : [t.panes[0], next]
      return { ...t, panes, focus: i }
    })

  const jump = (i: PaneIdx, hi: number) =>
    editTab((t) => {
      const pane = t.panes[i]
      if (hi < 0 || hi >= pane.hist.length) return t
      const next: Pane = { ...pane, hi }
      const panes: [Pane, Pane] = i === 0 ? [next, t.panes[1]] : [t.panes[0], next]
      return { ...t, panes, focus: i }
    })

  const setFocus = (i: PaneIdx) => {
    if (tab.focus !== i) editTab((t) => ({ ...t, focus: i }))
  }

  const addTab = () => {
    const t = newTab()
    setTabs((ts) => [...ts, t])
    setActiveId(t.id)
  }

  const closeTab = (id: string) => {
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    const rest = tabs.filter((t) => t.id !== id)
    if (rest.length === 0) {
      const t = newTab()
      setTabs([t])
      setActiveId(t.id)
      return
    }
    setTabs(rest)
    if (id === activeId) setActiveId(rest[Math.min(idx, rest.length - 1)].id)
  }

  /** Something that looks like a host navigates; everything else searches. */
  const submitOmni = (raw: string) => {
    const q = raw.trim()
    if (!q) return
    const looksLikeUrl = /^(https?:\/\/|www\.|vantage:)/i.test(q) || (/\.[a-z]{2,}(\/|$)/i.test(q) && !/\s/.test(q))
    if (looksLikeUrl) {
      const l = q.toLowerCase()
      if (l.includes("vantage:") || l.includes("start")) return nav({ k: "start" })
      if (l.includes("/projects") || l.endsWith("projects")) return nav({ k: "index" })
      return nav({ k: "profile" })
    }
    nav({ k: "find", q })
  }

  const apiFor = (i: PaneIdx): PageApi => ({
    nav: (v) => navPane(i, v),
    other: (v) => {
      const target: PaneIdx = i === 0 ? 1 : 0
      editTab((t) => ({ ...pushTo(t, target, v), focus: target, split: true }))
      if (!tab.split) announceSplit()
    },
    compare,
    openApp: (appId) => openApp(appId),
    cols,
  })

  // Teal, resolved per theme so the same markup clears contrast in both.
  // Bright #00a2a8 is fine as a fill under white; as text it needs darkening
  // on the light surface and lifting on the dark one.
  const shellVars = {
    "--vt-ink": theme === "light" ? "#00707a" : "#38cdd3",
    "--vt-soft": theme === "light" ? "rgba(0,162,168,.11)" : "rgba(0,162,168,.16)",
    "--vt-line": theme === "light" ? "rgba(0,109,120,.30)" : "rgba(56,205,211,.30)",
    colorScheme: theme,
  } as CSSProperties

  const visible: PaneIdx[] = splitLive ? [0, 1] : [tab.focus]

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col" style={{ background: "var(--os-surface)", ...shellVars }}>
      {/* Detached pill tabs, with gaps — nothing is attached to anything. */}
      <div className="flex shrink-0 items-center gap-1.5 px-2 py-1.5" style={{ background: "var(--os-chrome)" }}>
        <div className="os-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {tabs.map((t) => {
            const tm = metaFor(t.panes[t.focus].hist[t.panes[t.focus].hi])
            const on = t.id === activeId
            return (
              <div
                key={t.id}
                onMouseDown={() => setActiveId(t.id)}
                className={`group flex h-[30px] min-w-[104px] max-w-[188px] flex-1 cursor-default items-center gap-2 rounded-full pl-2.5 pr-1.5 text-[12px] transition-colors ${
                  on ? "" : "hover:bg-[var(--os-hover)]"
                }`}
                style={{
                  background: on ? "var(--os-surface)" : "transparent",
                  border: `1px solid ${on ? "var(--vt-line)" : "transparent"}`,
                  color: "var(--os-fg)",
                }}
              >
                <VantageMark size={13} />
                <span className="min-w-0 flex-1 truncate">{tm.title}</span>
                {t.split && <Columns2 size={11} className="shrink-0" style={{ color: "var(--vt-ink)" }} />}
                <button
                  type="button"
                  aria-label={`Close ${tm.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(t.id)
                  }}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full opacity-0 hover:bg-[var(--os-active)] focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X size={11} />
                </button>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          aria-label="New tab"
          title="New tab"
          onClick={addTab}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-[var(--os-hover)]"
          style={{ color: "var(--os-fg)" }}
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Toolbar: squared omnibox, profile pill on the right. */}
      <div
        className="flex shrink-0 items-center gap-1 border-b px-2 pb-1.5"
        style={{ borderColor: "var(--os-border)", background: "var(--os-chrome)" }}
      >
        <NavButton label="Back" disabled={focused.hi === 0} onClick={() => step(tab.focus, -1)}>
          <ArrowLeft size={15} />
        </NavButton>
        <NavButton
          label="Forward"
          disabled={focused.hi >= focused.hist.length - 1}
          onClick={() => step(tab.focus, 1)}
        >
          <ArrowRight size={15} />
        </NavButton>
        <NavButton label="Reload" onClick={() => setReloadKey((k) => k + 1)}>
          <RotateCw size={14} />
        </NavButton>
        <NavButton label="Start page" onClick={() => nav(START)}>
          <Home size={15} />
        </NavButton>

        <OmniBox
          value={omni}
          onChange={setOmni}
          onSubmit={submitOmni}
          onPick={(r) => (r.view ? nav(r.view) : nav({ k: "find", q: r.title }))}
          placeholder={meta.url}
          secure={view.k !== "start"}
        />

        {meta.external && (
          <a
            href={meta.external}
            target="_blank"
            rel="noreferrer"
            title="Open the real site in your browser"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-[var(--os-hover)]"
            style={{ color: "var(--os-fg)" }}
          >
            <ExternalLink size={14} />
          </a>
        )}

        {tab.split && !wide && (
          <button
            type="button"
            onClick={() => setFocus(tab.focus === 0 ? 1 : 0)}
            title={`Too narrow for both panes \u2014 showing pane ${tab.focus === 0 ? "A" : "B"}. Click to switch.`}
            className="shrink-0 rounded px-2 py-[3px] text-[10.5px] font-medium"
            style={{ background: "var(--vt-soft)", color: "var(--vt-ink)" }}
          >
            Pane {tab.focus === 0 ? "A" : "B"}
          </button>
        )}

        <ProfilePill compact={compact} onOpenApp={openApp} onGoProfile={() => nav({ k: "profile" })} />
      </div>

      {/* Body: panes, optional panel drawer, persistent rail. */}
      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {!online ? (
            <div className="os-scroll min-h-0 flex-1 overflow-y-auto">
              <OfflineView url={meta.url} connecting={conn === "connecting"} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              {visible.map((i) => {
                const pane = tab.panes[i]
                const pv = pane.hist[pane.hi]
                const on = tab.focus === i
                return (
                  <div
                    key={i}
                    onMouseDownCapture={() => setFocus(i)}
                    className="flex min-w-0 flex-1 flex-col"
                    style={{
                      borderLeft: splitLive && i === 1 ? "1px solid var(--os-border)" : undefined,
                      boxShadow: splitLive && on ? "inset 0 2px 0 0 var(--vt-ink)" : undefined,
                    }}
                  >
                    {splitLive && (
                      <PaneBar
                        side={i}
                        focused={on}
                        url={metaFor(pv).url}
                        canBack={pane.hi > 0}
                        canFwd={pane.hi < pane.hist.length - 1}
                        onBack={() => step(i, -1)}
                        onFwd={() => step(i, 1)}
                        onClose={() => closePane(i)}
                      />
                    )}
                    <div
                      key={`${tab.id}:${i}:${pane.hi}:${reloadKey}`}
                      className="os-scroll min-h-0 flex-1 overflow-y-auto"
                    >
                      <PageBody view={pv} api={apiFor(i)} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {panel && (
          <RailPanelView
            panel={panel}
            pane={focused}
            side={tab.focus}
            overlay={panelOverlay}
            onClose={() => setPanel(null)}
            onNav={nav}
            onJump={(hi) => jump(tab.focus, hi)}
          />
        )}

        <nav
          aria-label="Vantage sidebar"
          className="flex w-[44px] shrink-0 flex-col items-center gap-1 border-l py-2"
          style={{ borderColor: "var(--os-border)", background: "var(--os-chrome)" }}
        >
          <RailButton label="Split view" active={tab.split} onClick={toggleSplit}>
            <Columns2 size={16} />
          </RailButton>
          <span className="my-1 h-px w-5" style={{ background: "var(--os-border)" }} />
          <RailButton
            label="Collections"
            active={panel === "collections"}
            onClick={() => setPanel((p) => (p === "collections" ? null : "collections"))}
          >
            <Bookmark size={16} />
          </RailButton>
          <RailButton
            label="Pane history"
            active={panel === "history"}
            onClick={() => setPanel((p) => (p === "history" ? null : "history"))}
          >
            <History size={16} />
          </RailButton>
          <RailButton
            label="About Vantage"
            active={panel === "about"}
            onClick={() => setPanel((p) => (p === "about" ? null : "about"))}
          >
            <Info size={16} />
          </RailButton>
        </nav>
      </div>
    </div>
  )
}

function PageBody({ view, api }: { view: View; api: PageApi }) {
  switch (view.k) {
    case "start":
      return <StartPage api={api} />
    case "index":
      return <IndexPage api={api} />
    case "profile":
      return <ProfilePage api={api} />
    case "project":
      return <ProjectPage id={view.id} api={api} />
    case "find":
      return <FindPage q={view.q} api={api} />
  }
}

function NavButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors enabled:hover:bg-[var(--os-hover)] disabled:opacity-35"
      style={{ color: "var(--os-fg)" }}
    >
      {children}
    </button>
  )
}

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors hover:bg-[var(--os-hover)]"
      style={{
        color: active ? "var(--vt-ink)" : "var(--os-fg)",
        background: active ? "var(--vt-soft)" : "transparent",
      }}
    >
      {children}
    </button>
  )
}

/** Each pane owns its own back button. That is the whole feature. */
function PaneBar({
  side,
  focused,
  url,
  canBack,
  canFwd,
  onBack,
  onFwd,
  onClose,
}: {
  side: PaneIdx
  focused: boolean
  url: string
  canBack: boolean
  canFwd: boolean
  onBack: () => void
  onFwd: () => void
  onClose: () => void
}) {
  return (
    <div
      className="flex h-[28px] shrink-0 items-center gap-1 border-b px-1.5"
      style={{
        borderColor: "var(--os-border)",
        background: focused ? "var(--os-card)" : "transparent",
      }}
    >
      <span
        className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded text-[10px] font-semibold"
        style={{
          background: focused ? "var(--vt-soft)" : "var(--os-hover)",
          color: focused ? "var(--vt-ink)" : "var(--os-muted)",
        }}
      >
        {side === 0 ? "A" : "B"}
      </span>
      <button
        type="button"
        aria-label={`Pane ${side === 0 ? "A" : "B"} back`}
        title="Back in this pane"
        disabled={!canBack}
        onClick={onBack}
        className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded enabled:hover:bg-[var(--os-hover)] disabled:opacity-30"
        style={{ color: "var(--os-fg)" }}
      >
        <ChevronLeft size={13} />
      </button>
      <button
        type="button"
        aria-label={`Pane ${side === 0 ? "A" : "B"} forward`}
        title="Forward in this pane"
        disabled={!canFwd}
        onClick={onFwd}
        className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded enabled:hover:bg-[var(--os-hover)] disabled:opacity-30"
        style={{ color: "var(--os-fg)" }}
      >
        <ChevronRight size={13} />
      </button>
      <span className="min-w-0 flex-1 truncate text-[10.5px]" style={{ color: "var(--os-muted)" }}>
        {url}
      </span>
      <button
        type="button"
        aria-label="Close this pane"
        title="Close this pane"
        onClick={onClose}
        className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded hover:bg-[var(--os-hover)]"
        style={{ color: "var(--os-muted)" }}
      >
        <X size={12} />
      </button>
    </div>
  )
}

/* ================================================================== *
 * Squared omnibox
 * ================================================================== */

function OmniBox({
  value,
  onChange,
  onSubmit,
  onPick,
  placeholder,
  secure,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
  onPick: (r: Rec) => void
  placeholder: string
  secure: boolean
}) {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const wrap = useRef<HTMLDivElement | null>(null)

  const suggestions = useMemo(() => (value.trim() ? findRecords(value, 5) : []), [value])

  useEffect(() => setCursor(-1), [value])
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", away)
    return () => document.removeEventListener("mousedown", away)
  }, [])

  const commit = (i: number) => {
    setOpen(false)
    if (i >= 0 && suggestions[i]) onPick(suggestions[i])
    else onSubmit(value)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false)
      setCursor(-1)
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      commit(cursor)
      return
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (suggestions.length === 0) return
      e.preventDefault()
      setOpen(true)
      setCursor((c) => {
        const n = suggestions.length
        if (e.key === "ArrowDown") return c + 1 >= n ? -1 : c + 1
        return c - 1 < -1 ? n - 1 : c - 1
      })
    }
  }

  const showList = open && suggestions.length > 0

  return (
    <div ref={wrap} className="relative min-w-0 flex-1">
      <div
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-[6px]"
        style={{
          background: "var(--os-input)",
          border: `1px solid ${showList ? "var(--vt-ink)" : "var(--os-border)"}`,
        }}
      >
        {secure ? (
          <ShieldCheck size={13} className="shrink-0" style={{ color: "var(--vt-ink)" }} />
        ) : (
          <Search size={13} className="shrink-0" style={{ color: "var(--os-muted)" }} />
        )}
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={(e) => {
            setOpen(true)
            e.currentTarget.select()
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Search this portfolio or type an address"
          className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-[var(--os-muted)]"
          style={{ color: "var(--os-fg)" }}
        />
        <span
          className="hidden shrink-0 rounded px-1.5 py-[1px] text-[10px] font-medium uppercase tracking-wide sm:inline"
          style={{ background: "var(--vt-soft)", color: "var(--vt-ink)" }}
        >
          Find
        </span>
      </div>

      {showList && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+5px)] z-30 overflow-hidden rounded-lg py-1 shadow-2xl"
          style={{ background: "var(--os-menu)", border: "1px solid var(--os-border)", backdropFilter: "blur(20px)" }}
        >
          <button
            type="button"
            onMouseEnter={() => setCursor(-1)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => commit(-1)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
            style={{ background: cursor === -1 ? "var(--os-hover)" : "transparent" }}
          >
            <Search size={13} style={{ color: "var(--os-muted)" }} />
            <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: "var(--os-fg)" }}>
              {value}
            </span>
            <span className="shrink-0 text-[11px]" style={{ color: "var(--vt-ink)" }}>
              Vantage Find
            </span>
          </button>
          {suggestions.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onMouseEnter={() => setCursor(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(i)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
              style={{ background: cursor === i ? "var(--os-hover)" : "transparent" }}
            >
              <VantageMark size={13} />
              <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: "var(--os-fg)" }}>
                {r.title}
              </span>
              <span className="shrink-0 text-[11px]" style={{ color: "var(--os-muted)" }}>
                {r.kind}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ================================================================== *
 * Profile pill
 * ================================================================== */

function ProfilePill({
  compact,
  onOpenApp,
  onGoProfile,
}: {
  compact: boolean
  onOpenApp: (appId: AppId) => void
  onGoProfile: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", away)
    return () => document.removeEventListener("mousedown", away)
  }, [])

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1.5 rounded-full pl-1 pr-1.5 transition-colors hover:bg-[var(--os-hover)]"
        style={{ border: "1px solid var(--os-border)", color: "var(--os-fg)" }}
      >
        <span
          className="grid h-6 w-6 place-items-center rounded-full text-[10.5px] font-semibold text-white"
          style={{ backgroundImage: GRAD }}
        >
          {PROFILE.initials}
        </span>
        {!compact && <span className="max-w-[92px] truncate pr-0.5 text-[12px]">Johnpaul</span>}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-30 w-[252px] overflow-hidden rounded-lg p-3 shadow-2xl"
          style={{ background: "var(--os-menu)", border: "1px solid var(--os-border)", backdropFilter: "blur(20px)" }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-white"
              style={{ backgroundImage: GRAD }}
            >
              {PROFILE.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium" style={{ color: "var(--os-fg)" }}>
                {PROFILE.name}
              </p>
              <p className="truncate text-[11px]" style={{ color: "var(--os-muted)" }}>
                {PROFILE.email}
              </p>
            </div>
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
            This is the only profile on this machine. Vantage stores nothing and syncs nowhere.
          </p>
          <div className="mt-3 grid gap-1.5">
            <MenuItem
              onClick={() => {
                setOpen(false)
                onGoProfile()
              }}
            >
              Open his portfolio page
            </MenuItem>
            <MenuItem
              onClick={() => {
                setOpen(false)
                onOpenApp("contact")
              }}
            >
              Contact
            </MenuItem>
            <MenuItem
              onClick={() => {
                setOpen(false)
                onOpenApp("resume")
              }}
            >
              Résumé
            </MenuItem>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="rounded-md px-2.5 py-[6px] text-left text-[12.5px] transition-colors hover:bg-[var(--os-hover)]"
      style={{ color: "var(--os-fg)" }}
    >
      {children}
    </button>
  )
}

/* ================================================================== *
 * Rail panels
 * ================================================================== */

const COLLECTIONS: { label: string; sub: string; view: View }[] = [
  { label: "Portfolio home", sub: `${PROFILE.name} — ${PROFILE.title}`, view: { k: "profile" } },
  { label: "All projects", sub: `${PROJECTS.length} across ${CATEGORIES.length} categories`, view: { k: "index" } },
  ...CATEGORIES.map((c) => ({
    label: c,
    sub: `${PROJECTS.filter((p) => p.category === c).length} projects`,
    view: { k: "find", q: c } as View,
  })),
]

function RailPanelView({
  panel,
  pane,
  side,
  overlay,
  onClose,
  onNav,
  onJump,
}: {
  panel: Exclude<RailPanel, null>
  pane: Pane
  side: PaneIdx
  overlay: boolean
  onClose: () => void
  onNav: (v: View) => void
  onJump: (hi: number) => void
}) {
  const title = panel === "collections" ? "Collections" : panel === "history" ? "Pane history" : "About Vantage"

  return (
    <aside
      className={
        overlay
          ? "absolute inset-y-0 right-[44px] z-20 flex w-[calc(100%-44px)] max-w-[292px] flex-col border-l shadow-2xl"
          : "flex w-[268px] shrink-0 flex-col border-l"
      }
      style={{
        borderColor: "var(--os-border)",
        background: overlay ? "var(--os-menu)" : "var(--os-card)",
        backdropFilter: overlay ? "blur(20px)" : undefined,
      }}
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: "var(--os-border)" }}>
        <span className="text-[12px] font-semibold" style={{ color: "var(--os-fg)" }}>
          {title}
        </span>
        {panel === "history" && <Chip tone="brand">Pane {side === 0 ? "A" : "B"}</Chip>}
        <button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          className="ml-auto grid h-6 w-6 place-items-center rounded hover:bg-[var(--os-hover)]"
          style={{ color: "var(--os-muted)" }}
        >
          <X size={12} />
        </button>
      </header>

      <div className="os-scroll min-h-0 flex-1 overflow-y-auto p-2">
        {panel === "collections" && (
          <div className="grid gap-1">
            {COLLECTIONS.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => onNav(c.view)}
                className="rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[var(--os-hover)]"
              >
                <span className="block truncate text-[12.5px]" style={{ color: "var(--os-fg)" }}>
                  {c.label}
                </span>
                <span className="block truncate text-[11px]" style={{ color: "var(--os-muted)" }}>
                  {c.sub}
                </span>
              </button>
            ))}
            <div className="mt-1 grid gap-1 border-t pt-2" style={{ borderColor: "var(--os-border)" }}>
              <ExternalRow icon={<Github size={13} />} label="GitHub" href={`https://${PROFILE.github}`} />
              <ExternalRow icon={<Linkedin size={13} />} label="LinkedIn" href={`https://${PROFILE.linkedin}`} />
            </div>
          </div>
        )}

        {panel === "history" && (
          <ol className="grid gap-1">
            {pane.hist
              .map((v, i) => ({ v, i }))
              .reverse()
              .map(({ v, i }) => {
                const m = metaFor(v)
                const now = i === pane.hi
                return (
                  <li key={`${i}-${m.url}`}>
                    <button
                      type="button"
                      onClick={() => onJump(i)}
                      className="flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--os-hover)]"
                      style={{ background: now ? "var(--vt-soft)" : "transparent" }}
                    >
                      <span
                        className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: now ? "var(--vt-ink)" : "var(--os-border)" }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px]" style={{ color: "var(--os-fg)" }}>
                          {m.title}
                        </span>
                        <span className="block truncate text-[10.5px]" style={{ color: "var(--os-muted)" }}>
                          {m.url}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
          </ol>
        )}

        {panel === "about" && (
          <div className="px-1.5 py-1">
            <Wordmark />
            <dl className="mt-4 text-[12px]">
              <Spec label="Engine" value="Vantage Find" />
              <Spec label="Source" value="lib/os/content.ts" />
              <Spec label="Network" value="No requests. Nothing leaves this machine." />
              <Spec label="Panes" value="Two, each with its own history stack." />
            </dl>
            <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
              Split view is the one thing the other browser on this desktop cannot do. Widen the window past{" "}
              {SPLIT_MIN}px and both panes appear; below that, Vantage shows whichever pane you last touched and keeps
              the other one waiting.
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
