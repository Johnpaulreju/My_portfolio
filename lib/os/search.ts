"use client"

/**
 * The one search index.
 *
 * Search used to exist three times over, and unequally: Nimbus had a real
 * term-frequency ranker over lib/os/content.ts, the Start menu had a naive
 * `.includes()` over ALL_APPS plus filesystem nodes, and the Terminal had
 * find/grep over files alone. Three answers to "where is that thing" is two
 * answers too many, so this module is the only one.
 *
 * Shape of the thing:
 *   - Static documents (apps, content.ts, a curated set of actions) are built
 *     once at module load, because none of them can change at run time.
 *   - Files and folders are read LIVE from `useFS.getState()` on every call, so
 *     a folder the visitor made a second ago is searchable immediately. The
 *     derived documents are memoised on the identity of the store's `nodes`
 *     array, which zustand replaces on every mutation - a cache that cannot go
 *     stale rather than one we remember to invalidate.
 *
 * Purity: apart from that one `getState()` read, nothing here touches the OS.
 * Ranking is deterministic down to the final `localeCompare` tiebreak, because
 * a result list that reshuffles between identical keystrokes is worse than a
 * slightly dumber one that holds still.
 *
 * Import direction stays one-way: search -> app-meta / content / fs-store.
 * `CapabilityName` is imported as a type only, so capabilities.ts (which pulls
 * in actions.ts and every store) is erased at compile time and never runs here.
 */

import { ALL_APPS } from "./app-meta"
import { ACHIEVEMENTS, LAB, PROFILE, PROJECTS, SKILL_GROUPS, TIMELINE } from "./content"
import { useFS } from "./fs-store"
import type { CapabilityName } from "./capabilities"
import type { AppId, FSNode, FSNodeKind } from "./types"

/* ------------------------------------------------------------------ types */

export type ResultKind =
  | "app"
  | "file"
  | "folder"
  | "project"
  | "skill"
  | "experience"
  | "achievement"
  | "lab"
  | "profile"
  | "action"

export type SearchScope = "all" | "apps" | "files" | "jp"

export type SearchResult = {
  id: string
  kind: ResultKind
  title: string
  subtitle: string
  detail?: string
  /** Relevance within the tier. Ordering is (tier, score, title) - see `search`. */
  score: number
  /** 4 = title prefix · 3 = word prefix · 2 = all terms in title · 1 = all terms · 0 = partial. */
  tier: number
  appId?: AppId
  nodeId?: string
  /** A name from lib/os/capabilities.ts - safe to hand to `assistantInvoke`. */
  capability?: string
  capabilityArg?: string
}

export type SearchOutcome = {
  results: SearchResult[]
  /** Non-null only when one result is a clear winner; see the promotion rule. */
  best: SearchResult | null
  /** Always counted on the UNSCOPED match set, so scope pills show real numbers. */
  counts: Record<SearchScope, number>
}

export const SEARCH_SCOPES: SearchScope[] = ["all", "apps", "files", "jp"]

export const SCOPE_LABELS: Record<SearchScope, string> = {
  all: "All",
  apps: "Apps",
  files: "Files",
  jp: "Johnpaul",
}

/* ------------------------------------------------------- text normalising */

/** Lowercase and strip diacritics, so "résumé" is reachable by typing "resume". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

/**
 * Small on purpose. A stopword list that swallows "on", "off" or "no" would
 * break "turn wifi on" in an OS search box, so those stay.
 */
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "did", "do", "does", "for",
  "from", "has", "have", "he", "her", "him", "his", "how", "i", "in", "is", "it", "its", "me",
  "my", "of", "or", "s", "she", "so", "tell", "that", "the", "their", "them", "there", "these",
  "they", "this", "was", "were", "what", "when", "which", "who", "whom", "with", "you", "your",
])

/** Query terms: folded, split on punctuation, stop-words dropped, de-duplicated. */
export function tokenize(q: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of fold(q).split(/[^a-z0-9+#.%]+/)) {
    const term = raw.replace(/^\.+|\.+$/g, "")
    if (!term || STOPWORDS.has(term) || seen.has(term)) continue
    seen.add(term)
    out.push(term)
  }
  return out
}

/** Title words, split two ways so both "next.js" and "mp4" are prefix-reachable. */
function wordsOf(foldedTitle: string): string[] {
  const seen = new Set<string>()
  for (const part of foldedTitle.split(/[^a-z0-9+#.]+/)) if (part) seen.add(part)
  for (const part of foldedTitle.split(/[^a-z0-9+#]+/)) if (part) seen.add(part)
  return [...seen]
}

const isWordChar = (c: string) => /[a-z0-9]/.test(c)

/**
 * Term frequency.
 *
 * One- and two-letter terms only count where a word starts, or "on" matches
 * "disc(on)nect" and every count in the UI turns to noise. The END of a short
 * term is deliberately not checked, because typing "te" must still find
 * Terminal while the visitor is mid-word.
 */
function occurrences(hay: string, needle: string): number {
  if (!needle) return 0
  const atWordStart = needle.length <= 2
  let n = 0
  let i = hay.indexOf(needle)
  while (i !== -1) {
    if (!atWordStart || i === 0 || !isWordChar(hay[i - 1])) n += 1
    i = hay.indexOf(needle, i + needle.length)
  }
  return n
}

/* ------------------------------------------------------------- documents */

type Bucket = Exclude<SearchScope, "all">

type Doc = {
  id: string
  kind: ResultKind
  /** Which scope pill this belongs to; null = only ever shown under "all". */
  bucket: Bucket | null
  title: string
  subtitle: string
  detail?: string
  appId?: AppId
  nodeId?: string
  capability?: CapabilityName
  capabilityArg?: string
  /** Nudges genuinely important documents up when scores are close. */
  boost: number
  /** Folded title. */
  t: string
  /** Folded title words. */
  w: string[]
  /** Folded searchable text that is NOT the title (weighs a quarter as much). */
  b: string
}

type DocInput = Omit<Doc, "t" | "w" | "b"> & { body?: string }

function makeDoc(d: DocInput): Doc {
  const t = fold(d.title)
  return {
    ...d,
    t,
    w: wordsOf(t),
    b: fold([d.subtitle, d.detail ?? "", d.body ?? ""].join(" ")),
  }
}

/* ------------------------------------------------------------------ apps */

/**
 * What each app is, plus the words people actually type when they want it.
 * All of it describes this machine's software - none of it is a claim about
 * Johnpaul, which stays the exclusive business of lib/os/content.ts.
 */
const APP_HINTS: Record<AppId, { blurb: string; alias: string }> = {
  about: { blurb: "Profile, background and the short version.", alias: "profile bio who summary intro" },
  projects: { blurb: "The project archive.", alias: "work portfolio builds repos apps made" },
  experience: { blurb: "Roles and study, year by year.", alias: "career history job work education timeline" },
  skills: { blurb: "Stacks, tools and proficiency.", alias: "tech technology stack tools languages frameworks" },
  achievements: { blurb: "Awards and certifications.", alias: "awards certs certificates trophy recognition" },
  lab: { blurb: "Experiments still in progress.", alias: "experiments wip research prototype next" },
  contact: { blurb: "Write a message.", alias: "mail email hire reach inbox compose message" },
  browser: { blurb: "Nimbus — search this portfolio on the web.", alias: "browser web internet tabs omnibox nimbus surf" },
  notepad: { blurb: "Plain-text editor.", alias: "text editor txt write note scratch" },
  docs: { blurb: "Rich documents, pages and printing.", alias: "document writer word processing jpdoc letter page" },
  player: { blurb: "Play the video files on this machine.", alias: "media video movie mp4 watch playback" },
  explorer: { blurb: "Browse files and folders.", alias: "files folders directory disk browse manager" },
  settings: { blurb: "Theme, sound, network and system.", alias: "preferences options control panel configure wallpaper" },
  terminal: { blurb: "A real shell over this machine.", alias: "console command line cmd shell prompt cli" },
  resume: { blurb: "The one-page résumé.", alias: "cv curriculum vitae pdf hire download" },
  welcome: { blurb: "Start here.", alias: "intro tour getting started first run guide" },
  recyclebin: { blurb: "Deleted files, still restorable.", alias: "trash bin deleted restore undelete empty" },
  computer: { blurb: "Drives, specs and system information.", alias: "this pc my computer storage hardware properties" },
  minesweeper: { blurb: "The classic grid of hidden mines.", alias: "game puzzle mines flags board" },
  solitaire: { blurb: "Klondike, draw one or draw three.", alias: "game cards patience klondike deck" },
  tube: { blurb: "A video site that hosts one channel.", alias: "video watch channel reel streaming" },
  ridgeline: { blurb: "An original pseudo-3D combat racer.", alias: "game racing bike arcade drive race" },
  vantage: { blurb: "The second browser, the one with split view.", alias: "browser web split view tabs reading compare" },
}

function appDocs(): Doc[] {
  return ALL_APPS.map((a) =>
    makeDoc({
      id: `app:${a.id}`,
      kind: "app",
      bucket: "apps",
      title: a.title,
      subtitle: "App",
      detail: APP_HINTS[a.id].blurb,
      appId: a.id,
      boost: a.pinned ? 3 : a.onDesktop ? 2 : 1,
      body: `${a.short} ${a.id} ${APP_HINTS[a.id].alias} app program open launch`,
    }),
  )
}

/* --------------------------------------------------------------- content */

const slug = (s: string) =>
  fold(s).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 42)

function contentDocs(): Doc[] {
  const out: Doc[] = []

  out.push(
    makeDoc({
      id: "profile:about",
      kind: "profile",
      bucket: "jp",
      title: `${PROFILE.name} — ${PROFILE.title}`,
      subtitle: "Profile",
      detail: PROFILE.tagline,
      appId: "about",
      boost: 6,
      body: `${PROFILE.location} ${PROFILE.uvp.join(" ")} ${PROFILE.initials} about bio who profile developer engineer johnpaul jp`,
    }),
    makeDoc({
      id: "profile:contact",
      kind: "profile",
      bucket: "jp",
      title: `Contact ${PROFILE.name}`,
      subtitle: "Profile",
      detail: `${PROFILE.email} · ${PROFILE.phone} · ${PROFILE.location}`,
      appId: "contact",
      boost: 4,
      body: `${PROFILE.github} ${PROFILE.linkedin} contact hire email reach available availability message write`,
    }),
    makeDoc({
      id: "profile:resume",
      kind: "profile",
      bucket: "jp",
      title: `Résumé — ${PROFILE.name}`,
      subtitle: "Profile",
      detail: `One page: ${PROFILE.title}. ${PROFILE.uvp[2]}`,
      appId: "resume",
      boost: 3,
      body: "resume cv curriculum vitae download hire pdf print",
    }),
  )

  for (const p of PROJECTS) {
    out.push(
      makeDoc({
        id: `project:${p.id}`,
        kind: "project",
        bucket: "jp",
        title: p.title,
        subtitle: `${p.category} · ${p.stack} · ${p.year}`,
        detail: p.desc,
        appId: "projects",
        boost: p.year === "2025" ? 2 : 1,
        body: `${slug(p.title)} project build built repo case study`,
      }),
    )
  }

  for (const g of SKILL_GROUPS) {
    const names = g.items.map((i) => i.name)
    out.push(
      makeDoc({
        id: `skill:${slug(g.label)}`,
        kind: "skill",
        bucket: "jp",
        title: `${g.label} skills`,
        subtitle: "Skill group",
        detail: `${g.hint}: ${names.join(", ")}.`,
        appId: "skills",
        boost: 2,
        body: "skills stack technology tools proficiency",
      }),
    )
    for (const item of g.items) {
      out.push(
        makeDoc({
          id: `skill:${slug(g.label)}:${slug(item.name)}`,
          kind: "skill",
          bucket: "jp",
          title: item.name,
          subtitle: `Skill · ${g.label}`,
          detail: `Level ${item.level}% · ${g.hint}`,
          appId: "skills",
          boost: item.level >= 85 ? 1 : 0,
          body: "skill technology tool language framework proficiency",
        }),
      )
    }
  }

  for (const t of TIMELINE) {
    out.push(
      makeDoc({
        id: `experience:${t.year}-${slug(t.label)}`,
        kind: "experience",
        bucket: "jp",
        title: `${t.label} — ${t.org}`,
        subtitle: `${t.year} · ${t.kind === "work" ? "Role" : "Education"}`,
        detail: t.facts.join(" · "),
        appId: "experience",
        boost: 2,
        body:
          t.kind === "work"
            ? "job role career employer company position worked"
            : "education degree study college university studied",
      }),
    )
  }

  for (const a of ACHIEVEMENTS) {
    out.push(
      makeDoc({
        id: `achievement:${slug(a.title)}`,
        kind: "achievement",
        bucket: "jp",
        title: a.title,
        subtitle: "Achievement",
        detail: a.detail,
        appId: "achievements",
        boost: 1,
        body: "achievement award certification certified recognition won",
      }),
    )
  }

  for (const l of LAB) {
    out.push(
      makeDoc({
        id: `lab:${slug(l.title)}`,
        kind: "lab",
        bucket: "jp",
        title: l.title,
        subtitle: `Lab · ${l.progress}% complete`,
        detail: l.note,
        appId: "lab",
        boost: 1,
        body: "lab experiment work in progress research prototype building next",
      }),
    )
  }

  return out
}

/* --------------------------------------------------------------- actions */

/**
 * A deliberately short list. Every entry maps to a name in capabilities.ts, so
 * a caller can hand `capability` / `capabilityArg` straight to `assistantInvoke`
 * or `capabilityButton` without a translation table of its own.
 */
const ACTION_SEEDS: Array<{
  id: string
  title: string
  detail: string
  capability: CapabilityName
  arg: string
  body: string
}> = [
  {
    id: "theme-dark", title: "Turn on dark mode", capability: "set-theme", arg: "dark",
    detail: "Switches the whole desktop to the dark theme.",
    body: "dark mode night theme appearance darken lights",
  },
  {
    id: "theme-light", title: "Turn on light mode", capability: "set-theme", arg: "light",
    detail: "Switches the whole desktop to the light theme.",
    body: "light mode day theme appearance brighten lights",
  },
  {
    id: "wifi-on", title: "Turn Wi-Fi on", capability: "set-wifi", arg: "on",
    detail: "Switches the Wi-Fi radio back on.",
    body: "wifi wireless network internet radio connect online",
  },
  {
    id: "wifi-off", title: "Turn Wi-Fi off", capability: "set-wifi", arg: "off",
    detail: "Switches the Wi-Fi radio off.",
    body: "wifi wireless network internet radio offline unplug",
  },
  {
    id: "show-desktop", title: "Show the desktop", capability: "show-desktop", arg: "",
    detail: "Minimises every open window.",
    body: "desktop minimise minimize all windows hide clear peek",
  },
  {
    id: "lock", title: "Lock JP OS", capability: "lock", arg: "",
    detail: "Goes to the lock screen.",
    body: "lock screen sign out session away secure",
  },
  {
    id: "open-files", title: "Open File Explorer", capability: "open-folder", arg: "",
    detail: "Opens the Desktop in File Explorer.",
    body: "files folders explorer browse desktop directory",
  },
]

function actionDocs(): Doc[] {
  return ACTION_SEEDS.map((a) =>
    makeDoc({
      id: `action:${a.id}`,
      kind: "action",
      bucket: null,
      title: a.title,
      subtitle: "Action",
      detail: a.detail,
      capability: a.capability,
      capabilityArg: a.arg,
      boost: 2,
      body: `${a.body} do run switch set toggle`,
    }),
  )
}

/* ----------------------------------------------------------------- files */

const KIND_LABEL: Record<FSNodeKind, string> = {
  folder: "Folder",
  text: "Text document",
  doc: "Document",
  video: "Video",
  zip: "Compressed folder",
  "app-link": "Shortcut",
}

/** Long bodies are cheap to skim but not free; a few KB is plenty to match on. */
const BODY_LIMIT = 4000

function plainBody(node: FSNode): string {
  if (!node.body) return ""
  const text = node.kind === "doc" ? node.body.replace(/<[^>]*>/g, " ") : node.body
  return text.slice(0, BODY_LIMIT)
}

function fileDocs(nodes: FSNode[]): Doc[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const pathOf = (node: FSNode): string => {
    const parts: string[] = []
    let cur: FSNode | undefined = node.parentId ? byId.get(node.parentId) : undefined
    let hops = 0
    while (cur && hops++ < 64) {
      parts.unshift(cur.name)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    return ["Desktop", ...parts].join("\\")
  }

  const out: Doc[] = []
  for (const n of nodes) {
    if (n.deletedAt) continue
    const label = KIND_LABEL[n.kind]
    out.push(
      makeDoc({
        id: `node:${n.id}`,
        kind: n.kind === "folder" || n.kind === "zip" ? "folder" : "file",
        bucket: "files",
        title: n.name,
        subtitle: `${label} · ${pathOf(n)}`,
        detail: n.kind === "text" || n.kind === "doc" ? plainBody(n).slice(0, 160).trim() || undefined : undefined,
        nodeId: n.id,
        appId: n.kind === "app-link" ? n.appId : undefined,
        boost: n.parentId === null ? 1 : 0,
        body: `${label} ${n.src ?? ""} ${plainBody(n)}`,
      }),
    )
  }
  return out
}

/* Memoised on the identity of the store's array - zustand hands us a new one on
 * every mutation, so this cache cannot outlive the tree it was built from. */
let fileCache: { src: FSNode[]; docs: Doc[] } | null = null

function liveFileDocs(): Doc[] {
  const nodes = useFS.getState().nodes
  if (fileCache && fileCache.src === nodes) return fileCache.docs
  const docs = fileDocs(nodes)
  fileCache = { src: nodes, docs }
  return docs
}

const STATIC_DOCS: Doc[] = [...appDocs(), ...contentDocs(), ...actionDocs()]

/* ----------------------------------------------------------------- rank */

type Scored = { doc: Doc; tier: number; score: number }

/**
 * Tiers, highest first:
 *   4  the title starts with the whole query
 *   3  every term matched somewhere AND a title word starts with one of them
 *   2  every term appears in the title
 *   1  every term appears in the title or the body
 *   0  a partial match
 * The tier is the primary sort key, never an addend, so no amount of term
 * frequency lets a body-only match outrank a title-prefix one.
 */
function scoreDoc(doc: Doc, query: string, terms: string[]): Scored | null {
  let score = 0
  let matched = 0
  let allInTitle = true
  let wordPrefix = false

  for (const term of terms) {
    const inTitle = occurrences(doc.t, term)
    const inBody = occurrences(doc.b, term)
    if (inTitle === 0) allInTitle = false
    if (inTitle + inBody === 0) continue
    matched += 1
    score += inTitle * 8 + inBody * 2
    if (doc.w.some((w) => w.startsWith(term))) {
      score += 6
      wordPrefix = true
    } else if (doc.t.startsWith(term)) {
      score += 4
    }
  }
  if (matched === 0) return null

  const all = matched === terms.length
  score += (matched / terms.length) * 10 + doc.boost

  if (doc.t === query) score += 30
  else if (doc.t.startsWith(query)) score += 12
  else if (terms.length > 1 && doc.t.includes(query)) score += 6

  const tier = doc.t.startsWith(query)
    ? 4
    : all && wordPrefix
      ? 3
      : all && allInTitle
        ? 2
        : all
          ? 1
          : 0

  return { doc, tier, score: Math.round(score * 100) / 100 }
}

function toResult(s: Scored): SearchResult {
  const d = s.doc
  return {
    id: d.id,
    kind: d.kind,
    title: d.title,
    subtitle: d.subtitle,
    ...(d.detail ? { detail: d.detail } : null),
    score: s.score,
    tier: s.tier,
    ...(d.appId ? { appId: d.appId } : null),
    ...(d.nodeId ? { nodeId: d.nodeId } : null),
    ...(d.capability ? { capability: d.capability } : null),
    ...(d.capability ? { capabilityArg: d.capabilityArg ?? "" } : null),
  }
}

const emptyCounts = (): Record<SearchScope, number> => ({ all: 0, apps: 0, files: 0, jp: 0 })

/**
 * The whole OS, searched once.
 *
 * `counts` is always taken over the unscoped match set, so a UI can render
 * "Apps 3 · Files 1 · Johnpaul 7" beside the pills while showing one scope.
 */
export function search(query: string, scope: SearchScope = "all", limit = 20): SearchOutcome {
  const counts = emptyCounts()
  const q = fold(query).trim().replace(/\s+/g, " ")
  if (!q) return { results: [], best: null, counts }

  const terms = tokenize(query)
  const docs = [...STATIC_DOCS, ...liveFileDocs()]
  const scored: Scored[] = []

  for (const doc of docs) {
    // A query of nothing but stop-words ("who is he") still deserves an answer:
    // fall back to the headline pages about Johnpaul rather than an empty list.
    // Tier 0, so nothing is auto-selected off the back of a vague question.
    const hit =
      terms.length === 0
        ? doc.bucket === "jp" && doc.boost >= 3
          ? { doc, tier: 0, score: doc.boost }
          : null
        : scoreDoc(doc, q, terms)
    if (!hit) continue

    counts.all += 1
    if (doc.bucket) counts[doc.bucket] += 1
    if (scope !== "all" && doc.bucket !== scope) continue
    scored.push(hit)
  }

  scored.sort(
    (a, b) => b.tier - a.tier || b.score - a.score || a.doc.title.localeCompare(b.doc.title),
  )

  const results = scored.slice(0, Math.max(0, limit)).map(toResult)
  return { results, best: promote(results), counts }
}

/**
 * A result is only "best" when acting on it without asking would be right:
 * tier 2 or better, and either a strictly higher tier than the runner-up or a
 * comfortable score margin. Anything else returns null and the caller shows a
 * list instead of guessing.
 */
function promote(results: SearchResult[]): SearchResult | null {
  const best = results[0]
  if (!best || best.tier < 2) return null
  const runner = results[1]
  if (!runner) return best
  if (best.tier > runner.tier) return best
  if (best.score > runner.score && best.score >= runner.score * 1.15) return best
  return null
}

/* ------------------------------------------------------------- highlight */

/** Folded text plus a map from each folded index back to the original one. */
function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = ""
  const map: number[] = []
  for (let i = 0; i < text.length; i += 1) {
    const f = fold(text[i])
    for (let k = 0; k < f.length; k += 1) {
      folded += f[k]
      map.push(i)
    }
  }
  map.push(text.length)
  return { folded, map }
}

/**
 * Split `text` into runs, marking the ones the query matched. Diacritic- and
 * case-insensitive, and index-mapped back to the original string, so the
 * caller renders the visitor's own spelling with the matches emphasised.
 * Returns plain data - every surface renders it its own way.
 */
export function highlight(text: string, query: string): Array<{ t: string; hit: boolean }> {
  if (!text) return []
  let terms = tokenize(query)
  if (terms.length === 0) {
    const whole = fold(query).trim()
    terms = whole ? [whole] : []
  }
  if (terms.length === 0) return [{ t: text, hit: false }]

  const { folded, map } = foldWithMap(text)
  const spans: Array<[number, number]> = []
  for (const term of terms) {
    let i = folded.indexOf(term)
    while (i !== -1) {
      spans.push([i, i + term.length])
      i = folded.indexOf(term, i + term.length)
    }
  }
  if (spans.length === 0) return [{ t: text, hit: false }]

  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: Array<[number, number]> = []
  for (const span of spans) {
    const last = merged[merged.length - 1]
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1])
    else merged.push([span[0], span[1]])
  }

  const out: Array<{ t: string; hit: boolean }> = []
  let cursor = 0
  for (const [s, e] of merged) {
    const start = Math.max(cursor, map[s])
    const end = Math.max(start, map[e])
    if (start > cursor) out.push({ t: text.slice(cursor, start), hit: false })
    if (end > start) out.push({ t: text.slice(start, end), hit: true })
    cursor = Math.max(cursor, end)
  }
  if (cursor < text.length) out.push({ t: text.slice(cursor), hit: false })
  return out.filter((seg) => seg.t.length > 0)
}
