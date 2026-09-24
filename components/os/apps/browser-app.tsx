"use client"

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import {
  Activity,
  AlertTriangle,
  AppWindow,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Briefcase,
  ChevronRight,
  CornerDownLeft,
  ExternalLink,
  FileText,
  FlaskConical,
  FolderOpen,
  GitBranch,
  Globe,
  HardDrive,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Sparkles,
  SquareTerminal,
  Star,
  Trophy,
  UserRound,
  X,
} from "lucide-react"

import * as A from "@/lib/os/actions"
import { APP_META } from "@/lib/os/app-meta"
import {
  ask,
  SUGGESTED_QUESTIONS,
  type AssistantAnswer,
  type AssistantTurn,
} from "@/lib/os/assistant"
import { assistantInvoke } from "@/lib/os/capabilities"
import { PROFILE } from "@/lib/os/content"
import { useFS } from "@/lib/os/fs-store"
import { highlight, search, type ResultKind, type SearchResult } from "@/lib/os/search"
import { useSystem, type NetStatus } from "@/lib/os/system-store"
import { useWM } from "@/lib/os/wm-store"
import { fail, type ActionResult } from "@/lib/os/result"
import type { AppId, FSNode, WindowInstance } from "@/lib/os/types"

/* ------------------------------------------------------------------ *
 * Nimbus — the browser, and the intelligence layer of JP OS.
 *
 * Three explicit modes, because pretending one box does three different
 * jobs is how search boxes end up lying:
 *
 *   LOCAL  lib/os/search.ts over apps, files and the portfolio. No network,
 *          ever. Works with the cable unplugged.
 *   JP     lib/os/assistant.ts. Grounded in lib/os/content.ts and nothing
 *          else; when the profile doesn't say, the answer says so.
 *   WEB    Real HTTP, client-side, no proxy and no key, to the only two
 *          origins that actually allow it: the Wikipedia REST APIs and the
 *          GitHub REST API. Nothing here is mocked. If a request fails, the
 *          failure is what gets rendered.
 *
 * Nothing in this file touches a store's mutators directly — every state
 * change goes through lib/os/actions.ts, and anything driven by a typed
 * sentence goes through the lib/os/capabilities.ts allowlist.
 *
 * Artwork is original: the Nimbus mark and the unplugged-connector glyph are
 * drawn here from primitives. No vendor logos, no offline dinosaur.
 * ------------------------------------------------------------------ */

/* ================================================================== *
 * Brand
 * ================================================================== */

/** Coral, read from the app's own declared tint rather than re-typed here. */
const TINT = APP_META.browser.tint

/** The GitHub account, derived from content.ts — never hard-coded twice. */
const GITHUB_USER = PROFILE.github.split("/").filter(Boolean).pop() ?? ""

const WIKI_SEARCH = "https://en.wikipedia.org/w/rest.php/v1/search/page"
const WIKI_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary"
const GH_API = "https://api.github.com"

/** One typing pause before a real request leaves the machine. */
const DEBOUNCE_MS = 300

/* ================================================================== *
 * Addresses
 * ================================================================== */

type Mode = "local" | "jp" | "web"

const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: "local", label: "Local", blurb: "Apps, files and portfolio content on this machine. Never needs a network." },
  { id: "jp", label: "JP", blurb: "Ask about Johnpaul. Answered only from what he has published." },
  { id: "web", label: "Web", blurb: "Live results from Wikipedia and the GitHub API. Needs a connection." },
]

type View =
  | { k: "home" }
  | { k: "results"; mode: Mode; q: string }
  | { k: "wiki"; title: string }
  | { k: "gh" }
  | { k: "external"; url: string }

type PageMeta = { url: string; title: string; external?: string }

const wikiUrl = (title: string) =>
  `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function metaFor(v: View): PageMeta {
  switch (v.k) {
    case "home":
      return { url: "nimbus://home", title: "New Tab" }
    case "results": {
      if (v.mode === "web") {
        const u = `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(v.q)}`
        return { url: u, title: `${v.q} — Web`, external: u }
      }
      const scheme = v.mode === "jp" ? "ask" : "search"
      return {
        url: `nimbus://${scheme}?q=${encodeURIComponent(v.q)}`,
        title: `${v.q} — ${v.mode === "jp" ? "Ask JP" : "This PC"}`,
      }
    }
    case "wiki":
      return { url: wikiUrl(v.title), title: `${v.title} — Wikipedia`, external: wikiUrl(v.title) }
    case "gh": {
      const u = `https://github.com/${GITHUB_USER}`
      return { url: u, title: `${GITHUB_USER} — GitHub`, external: u }
    }
    case "external":
      return { url: v.url, title: hostOf(v.url), external: v.url }
  }
}

/** The mode a view belongs to, so the pills always reflect the page. */
function modeOf(v: View, fallback: Mode): Mode {
  if (v.k === "results") return v.mode
  if (v.k === "wiki" || v.k === "gh" || v.k === "external") return "web"
  return fallback
}

/* ================================================================== *
 * Omnibox interpretation
 *
 * One input, five outcomes, decided by rules that can be stated out loud —
 * and the chosen one is always shown as the first row of the dropdown, so
 * the visitor sees the interpretation before committing to it.
 * ================================================================== */

const URL_SHAPED =
  /^(https?:\/\/)?(localhost|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(:\d{2,5})?([/?#]\S*)?$/i

/** Returns a normalised absolute http(s) URL, or null when it isn't one. */
function asUrl(raw: string): string | null {
  const s = raw.trim()
  if (!s || /\s/.test(s) || !URL_SHAPED.test(s)) return null
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}

/** Walks a typed path ("Desktop\Notes\todo.txt", "notes/todo.txt") to a node. */
function resolveNodePath(raw: string): FSNode | null {
  const s = raw.trim()
  if (!s || !/[\\/]/.test(s)) return null
  const parts = s.split(/[\\/]+/).filter(Boolean)
  if (parts.length && /^(desktop|~|home|c:)$/i.test(parts[0])) parts.shift()
  if (parts.length === 0) return null

  const nodes = useFS.getState().nodes
  let parentId: string | null = null
  let found: FSNode | null = null
  for (const part of parts) {
    const want = part.toLowerCase()
    const next: FSNode | undefined = nodes.find(
      (n) => !n.deletedAt && n.parentId === parentId && n.name.toLowerCase() === want,
    )
    if (!next) return null
    found = next
    parentId = next.id
  }
  return found
}

const QUESTION_HEAD =
  /^(who|what|whats|where|when|why|how|which|whose|is|are|was|were|does|do|did|can|could|should|would|has|have|tell|show|list|give|explain|describe)\b/i
const ABOUT_JP = /\b(johnpaul|john\s?paul|reju|jp|his|him|he|resume|cv|portfolio)\b/i

function looksLikeQuestion(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  if (t.endsWith("?")) return true
  if (QUESTION_HEAD.test(t)) return true
  return /\s/.test(t) && ABOUT_JP.test(t)
}

type Interp =
  | { k: "app"; appId: AppId; label: string; detail: string }
  | { k: "node"; node: FSNode; label: string; detail: string }
  | { k: "desktop"; label: string; detail: string }
  | { k: "url"; url: string; label: string; detail: string }
  | { k: "ask"; q: string; label: string; detail: string }
  | { k: "find"; q: string; mode: Mode; label: string; detail: string }

function interpret(raw: string, mode: Mode, webAvailable: boolean): Interp | null {
  const q = raw.trim()
  if (!q) return null

  // 1. An explicit app command.
  const cmd = /^(?:open|launch|start|run|go\s+to)\s+(.{1,60})$/i.exec(q)
  if (cmd) {
    const appId = A.resolveApp(cmd[1])
    if (appId) {
      return { k: "app", appId, label: `Open ${APP_META[appId].title}`, detail: "App on this PC" }
    }
  }

  // 2. The filesystem root, by any of its names.
  if (/^(~|desktop|\/|\\)$/i.test(q)) {
    return { k: "desktop", label: "Open Desktop", detail: "File Explorer" }
  }

  // 3. A path that actually resolves. An unresolvable one falls through to
  //    search rather than claiming a file exists.
  const node = resolveNodePath(q)
  if (node) {
    const folder = node.kind === "folder" || node.kind === "zip"
    return {
      k: "node",
      node,
      label: `Open ${node.name}`,
      detail: folder ? "Folder on this PC" : "File on this PC",
    }
  }

  // 4. A web address.
  const url = asUrl(q)
  if (url) return { k: "url", url, label: `Go to ${hostOf(url)}`, detail: url }

  // 5. The active mode wins over any guess about the sentence.
  if (mode === "web" && webAvailable) {
    return { k: "find", q, mode: "web", label: q, detail: "Search Wikipedia" }
  }
  if (mode === "jp") return { k: "ask", q, label: q, detail: "Ask JP" }

  // 6. In Local mode a question still goes to the assistant — it is the only
  //    surface that can answer one.
  if (looksLikeQuestion(q)) return { k: "ask", q, label: q, detail: "Ask JP" }

  return { k: "find", q, mode: "local", label: q, detail: "Search this PC" }
}

/* ================================================================== *
 * Live web data
 *
 * Two origins, both verified CORS-open and key-free from a browser. Every
 * response is shape-checked before it is rendered; nothing is invented to
 * fill a gap, and a failed request renders as a failure.
 * ================================================================== */

type Remote<T> =
  | { s: "idle" }
  | { s: "loading" }
  | { s: "ready"; data: T }
  | { s: "error"; message: string }

function netMessage(err: unknown, host: string): string {
  const m = err instanceof Error ? err.message : ""
  if (m && !/abort/i.test(m) && !/failed to fetch/i.test(m)) return m
  return `Nimbus couldn't reach ${host}. The request never returned, so there is nothing to show — and nothing invented to fill the gap.`
}

/* ------------------------------------------------------------ wikipedia */

type WikiHit = { key: string; title: string; description: string | null; excerpt: string }

function parseWikiSearch(json: unknown): WikiHit[] {
  const pages = (json as { pages?: unknown } | null)?.pages
  if (!Array.isArray(pages)) return []
  const out: WikiHit[] = []
  for (const raw of pages) {
    if (!raw || typeof raw !== "object") continue
    const p = raw as Record<string, unknown>
    if (typeof p.title !== "string" || typeof p.key !== "string") continue
    out.push({
      key: p.key,
      title: p.title,
      description: typeof p.description === "string" && p.description ? p.description : null,
      excerpt: typeof p.excerpt === "string" ? p.excerpt : "",
    })
  }
  return out
}

type WikiSummary = {
  title: string
  description: string | null
  extract: string
  page: string
  thumb: string | null
}

function parseWikiSummary(json: unknown): WikiSummary | null {
  if (!json || typeof json !== "object") return null
  const j = json as Record<string, unknown>
  if (typeof j.title !== "string") return null
  const urls = j.content_urls as { desktop?: { page?: unknown } } | undefined
  const thumb = j.thumbnail as { source?: unknown } | undefined
  return {
    title: j.title,
    description: typeof j.description === "string" && j.description ? j.description : null,
    extract: typeof j.extract === "string" ? j.extract : "",
    page: typeof urls?.desktop?.page === "string" ? urls.desktop.page : wikiUrl(j.title),
    thumb: typeof thumb?.source === "string" ? thumb.source : null,
  }
}

/** Wikipedia marks matches with <span class="searchmatch">; parsed, never injected. */
function parseExcerpt(html: string): Array<{ t: string; hit: boolean }> {
  const strip = (s: string) => s.replace(/<[^>]*>/g, "")
  const decode = (s: string) =>
    s
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")

  const out: Array<{ t: string; hit: boolean }> = []
  const re = /<span class="searchmatch">([\s\S]*?)<\/span>/g
  let last = 0
  let m: RegExpExecArray | null = re.exec(html)
  while (m) {
    if (m.index > last) out.push({ t: decode(strip(html.slice(last, m.index))), hit: false })
    out.push({ t: decode(strip(m[1])), hit: true })
    last = re.lastIndex
    m = re.exec(html)
  }
  if (last < html.length) out.push({ t: decode(strip(html.slice(last))), hit: false })
  return out.filter((seg) => seg.t.length > 0)
}

/** Debounced, single-flight Wikipedia search. One request per settled query. */
function useWikiSearch(q: string, enabled: boolean) {
  const [state, setState] = useState<Remote<WikiHit[]>>({ s: "idle" })
  const [nonce, setNonce] = useState(0)
  const retry = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    const query = q.trim()
    if (!enabled || !query) {
      setState({ s: "idle" })
      return
    }
    const ac = new AbortController()
    setState({ s: "loading" })
    const timer = window.setTimeout(() => {
      fetch(`${WIKI_SEARCH}?q=${encodeURIComponent(query)}&limit=5`, {
        signal: ac.signal,
        headers: { accept: "application/json" },
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Wikipedia answered ${res.status}.`)
          return res.json() as Promise<unknown>
        })
        .then((json) => {
          if (!ac.signal.aborted) setState({ s: "ready", data: parseWikiSearch(json) })
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted) return
          setState({ s: "error", message: netMessage(err, "en.wikipedia.org") })
        })
    }, DEBOUNCE_MS)

    // Abort beats racing: the previous query can never overwrite the newer one.
    return () => {
      window.clearTimeout(timer)
      ac.abort()
    }
  }, [q, enabled, nonce])

  return [state, retry] as const
}

/** Summary card. Fired only once the title is settled, so no debounce. */
function useWikiSummary(title: string | null, enabled: boolean) {
  const [state, setState] = useState<Remote<WikiSummary>>({ s: "idle" })
  const [nonce, setNonce] = useState(0)
  const retry = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!enabled || !title) {
      setState({ s: "idle" })
      return
    }
    const ac = new AbortController()
    setState({ s: "loading" })
    fetch(`${WIKI_SUMMARY}/${encodeURIComponent(title.replace(/ /g, "_"))}`, {
      signal: ac.signal,
      headers: { accept: "application/json" },
    })
      .then((res) => {
        if (res.status === 404) throw new Error("Wikipedia has no summary for that page.")
        if (!res.ok) throw new Error(`Wikipedia answered ${res.status}.`)
        return res.json() as Promise<unknown>
      })
      .then((json) => {
        if (ac.signal.aborted) return
        const parsed = parseWikiSummary(json)
        if (!parsed) throw new Error("Wikipedia returned a summary Nimbus could not read.")
        setState({ s: "ready", data: parsed })
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return
        setState({ s: "error", message: netMessage(err, "en.wikipedia.org") })
      })
    return () => ac.abort()
  }, [title, enabled, nonce])

  return [state, retry] as const
}

/* --------------------------------------------------------------- github */

type GhUser = {
  login: string
  name: string | null
  bio: string | null
  location: string | null
  company: string | null
  publicRepos: number
  followers: number
  following: number
  createdAt: string
  htmlUrl: string
}

type GhRepo = {
  id: number
  name: string
  description: string | null
  language: string | null
  stars: number
  forks: number
  pushedAt: string
  htmlUrl: string
  fork: boolean
}

type GhData = { user: GhUser; repos: GhRepo[]; remaining: number | null }

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null)
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0)

function parseGhUser(json: unknown): GhUser | null {
  if (!json || typeof json !== "object") return null
  const j = json as Record<string, unknown>
  if (typeof j.login !== "string") return null
  return {
    login: j.login,
    name: str(j.name),
    bio: str(j.bio),
    location: str(j.location),
    company: str(j.company),
    publicRepos: num(j.public_repos),
    followers: num(j.followers),
    following: num(j.following),
    createdAt: str(j.created_at) ?? "",
    htmlUrl: str(j.html_url) ?? `https://github.com/${j.login}`,
  }
}

function parseGhRepos(json: unknown): GhRepo[] {
  if (!Array.isArray(json)) return []
  const out: GhRepo[] = []
  for (const raw of json) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    if (typeof r.name !== "string") continue
    out.push({
      id: num(r.id),
      name: r.name,
      description: str(r.description),
      language: str(r.language),
      stars: num(r.stargazers_count),
      forks: num(r.forks_count),
      pushedAt: str(r.pushed_at) ?? "",
      htmlUrl: str(r.html_url) ?? "",
      fork: r.fork === true,
    })
  }
  return out
}

const readRemaining = (res: Response): number | null => {
  const v = res.headers.get("x-ratelimit-remaining")
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const RATE_LIMITED =
  "GitHub allows 60 unauthenticated API requests an hour per IP address, and this one has used them all. " +
  "Nimbus ships no API key, so the honest move is to show nothing until the window resets — the profile is one click away in your own browser."

function useGithub(enabled: boolean) {
  const [state, setState] = useState<Remote<GhData>>({ s: "idle" })
  const [nonce, setNonce] = useState(0)
  const retry = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!enabled || !GITHUB_USER) {
      setState({ s: "idle" })
      return
    }
    const ac = new AbortController()
    setState({ s: "loading" })
    const init = { signal: ac.signal, headers: { accept: "application/vnd.github+json" } }

    Promise.all([
      fetch(`${GH_API}/users/${GITHUB_USER}`, init),
      fetch(`${GH_API}/users/${GITHUB_USER}/repos?sort=pushed&per_page=8`, init),
    ])
      .then(async ([uRes, rRes]) => {
        const remaining = readRemaining(uRes) ?? readRemaining(rRes)
        if (uRes.status === 403 || uRes.status === 429 || rRes.status === 403 || rRes.status === 429) {
          throw new Error(remaining === 0 ? RATE_LIMITED : `GitHub refused the request (${uRes.status}).`)
        }
        if (uRes.status === 404) throw new Error(`GitHub has no public user called "${GITHUB_USER}".`)
        if (!uRes.ok) throw new Error(`GitHub answered ${uRes.status} for the profile.`)
        if (!rRes.ok) throw new Error(`GitHub answered ${rRes.status} for the repositories.`)
        const [uJson, rJson] = await Promise.all([
          uRes.json() as Promise<unknown>,
          rRes.json() as Promise<unknown>,
        ])
        const user = parseGhUser(uJson)
        if (!user) throw new Error("GitHub returned a profile Nimbus could not read.")
        return { user, repos: parseGhRepos(rJson), remaining }
      })
      .then((data) => {
        if (!ac.signal.aborted) setState({ s: "ready", data })
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return
        setState({ s: "error", message: netMessage(err, "api.github.com") })
      })

    return () => ac.abort()
  }, [enabled, nonce])

  return [state, retry] as const
}

/* ================================================================== *
 * Shell
 * ================================================================== */

type Tab = { id: string; history: View[]; hi: number; mode: Mode }
type Turn = { id: number; q: string; a: AssistantAnswer }
type Flash = { id: number; text: string; bad: boolean }

let tabSeq = 0
let turnSeq = 0

const HOME: View = { k: "home" }

const OFFLINE_WHY: Record<NetStatus, string> = {
  airplane: "Airplane mode is on.",
  "radio-off": "The Wi-Fi radio is switched off.",
  disconnected: "This machine isn't joined to a network.",
  connecting: "Still joining a network.",
  "no-internet": "Joined to a network, but the browser reports no route to the internet.",
  online: "",
}

/**
 * A deep link arrives as `payload.q` on the window this app was just opened
 * into. app-host doesn't pass `win` to Nimbus today, so the payload is read
 * from the focused window instead — which, at the instant a new window mounts
 * its app, is always this one. The `win` prop takes precedence whenever it is
 * supplied, so wiring it through later needs no change here.
 */
function deepLinkQuery(win?: WindowInstance): string {
  const direct = win?.payload?.q
  if (typeof direct === "string" && direct.trim()) return direct.trim()
  if (win) return ""
  const st = useWM.getState()
  const focused = st.windows.find((w) => w.id === st.focusedId)
  if (focused?.appId !== "browser") return ""
  const q = focused.payload?.q
  return typeof q === "string" ? q.trim() : ""
}

function viewForUrl(url: string): View {
  try {
    const u = new URL(url)
    if (/^en\.(m\.)?wikipedia\.org$/i.test(u.host)) {
      const article = /^\/wiki\/(.+)$/.exec(u.pathname)
      if (article) return { k: "wiki", title: decodeURIComponent(article[1]).replace(/_/g, " ") }
      const s = u.searchParams.get("search")
      if (s) return { k: "results", mode: "web", q: s }
    }
    if (/^(www\.)?github\.com$/i.test(u.host)) {
      const seg = u.pathname.split("/").filter(Boolean)
      if (seg.length === 1 && GITHUB_USER && seg[0].toLowerCase() === GITHUB_USER.toLowerCase()) {
        return { k: "gh" }
      }
    }
  } catch {
    /* an unparseable URL is simply an external one */
  }
  return { k: "external", url }
}

export function BrowserApp({ win }: { win?: WindowInstance }) {
  const netStatus = useSystem((s) => s.status())
  const airplane = useSystem((s) => s.airplane)
  const isOnline = netStatus === "online"

  const [tabs, setTabs] = useState<Tab[]>(() => {
    const seed = deepLinkQuery(win)
    const base: Tab = { id: "t0", history: [HOME], hi: 0, mode: "local" }
    if (!seed) return [base]
    const mode: Mode = looksLikeQuestion(seed) ? "jp" : "local"
    return [{ ...base, history: [HOME, { k: "results", mode, q: seed }], hi: 1, mode }]
  })
  const [activeId, setActiveId] = useState("t0")
  const [reloadKey, setReloadKey] = useState(0)
  const [omnibox, setOmnibox] = useState(() => deepLinkQuery(win))
  const [dirty, setDirty] = useState(false)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const omniRef = useRef<HTMLInputElement | null>(null)
  const flashSeq = useRef(0)

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]
  const view = active.history[active.hi]
  const meta = metaFor(view)
  const mode = modeOf(view, active.mode)
  const canBack = active.hi > 0
  const canForward = active.hi < active.history.length - 1

  /* -------------------------------------------------------- feedback -- */

  const report = useCallback((res: ActionResult<unknown>, okText?: string) => {
    if (res.ok && !okText) return
    flashSeq.current += 1
    setFlash({ id: flashSeq.current, text: res.ok ? (okText as string) : res.message, bad: !res.ok })
  }, [])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 6000)
    return () => window.clearTimeout(t)
  }, [flash])

  /* ------------------------------------------------------ navigation -- */

  const navigate = useCallback(
    (next: View) => {
      setTabs((ts) =>
        ts.map((t) => {
          if (t.id !== activeId) return t
          const nextMode = next.k === "results" ? next.mode : t.mode
          const trimmed = t.history.slice(0, t.hi + 1)
          const cur = trimmed[trimmed.length - 1]
          if (metaFor(cur).url === metaFor(next).url) return { ...t, mode: nextMode }
          return { ...t, history: [...trimmed, next], hi: trimmed.length, mode: nextMode }
        }),
      )
      setDirty(false)
    },
    [activeId],
  )

  const step = (delta: number) =>
    setTabs((ts) =>
      ts.map((t) =>
        t.id === activeId
          ? { ...t, hi: Math.min(t.history.length - 1, Math.max(0, t.hi + delta)) }
          : t,
      ),
    )

  const setMode = useCallback(
    (m: Mode) => {
      if (m === "web" && !isOnline) return
      setTabs((ts) => ts.map((t) => (t.id === activeId ? { ...t, mode: m } : t)))
      const q = view.k === "results" ? view.q : ""
      if (q) navigate({ k: "results", mode: m, q })
      else omniRef.current?.focus()
    },
    [activeId, isOnline, navigate, view],
  )

  /* --------------------------------------------------------- actions -- */

  const runInterp = useCallback(
    (i: Interp) => {
      switch (i.k) {
        case "app":
          report(A.openApp(i.appId), `Opened ${APP_META[i.appId].title}.`)
          break
        case "node": {
          const folder = i.node.kind === "folder" || i.node.kind === "zip"
          report(folder ? A.openFolder(i.node.id) : A.openNode(i.node.id), `Opened ${i.node.name}.`)
          break
        }
        case "desktop":
          report(A.openFolder(null), "Opened Desktop in File Explorer.")
          break
        case "url":
          navigate(viewForUrl(i.url))
          break
        case "ask":
          navigate({ k: "results", mode: "jp", q: i.q })
          break
        case "find":
          navigate({ k: "results", mode: i.mode, q: i.q })
          break
      }
      setDirty(false)
    },
    [navigate, report],
  )

  const runResult = useCallback(
    (r: SearchResult) => {
      if (r.capability) {
        report(assistantInvoke(r.capability, r.capabilityArg ?? ""), `${r.title} — done.`)
        return
      }
      if (r.nodeId) {
        report(r.kind === "folder" ? A.openFolder(r.nodeId) : A.openNode(r.nodeId), `Opened ${r.title}.`)
        return
      }
      if (r.appId) {
        report(A.openApp(r.appId), `Opened ${APP_META[r.appId].title}.`)
        return
      }
      report(fail("unsupported", `Nimbus doesn't know how to open “${r.title}”.`))
    },
    [report],
  )

  /** Every assistant action goes through the allowlist, never through actions.ts. */
  const runCapability = useCallback(
    (capability: string, arg: string, label: string) => {
      report(assistantInvoke(capability, arg), `${label} — done.`)
    },
    [report],
  )

  const searchIn = useCallback(
    (q: string, m: Mode) => {
      const text = q.trim()
      if (!text) return
      // Falling back silently would be a small lie. Say why, then fall back.
      if (m === "web" && !isOnline) {
        report(
          fail(
            "offline",
            `Web search needs a connection. ${OFFLINE_WHY[netStatus]} Searched this PC instead.`,
          ),
        )
        navigate({ k: "results", mode: "local", q: text })
        return
      }
      navigate({ k: "results", mode: m, q: text })
    },
    [isOnline, navigate, netStatus, report],
  )

  /* ---------------------------------------------------- JP transcript -- */

  const askMore = useCallback((raw: string) => {
    const q = raw.trim()
    if (!q) return
    setTurns((prev) => {
      const history: AssistantTurn[] = prev.map((t) => ({ q: t.q, a: t.a }))
      return [...prev, { id: (turnSeq += 1), q, a: ask(q, history) }]
    })
  }, [])

  // A JP address IS a turn, seeded exactly once per distinct question. Without
  // the ledger, walking back and forward through history — or opening the same
  // question in a second tab — would stutter the same turn into the transcript.
  const seededJp = useRef<Set<string>>()
  const jpQuery = view.k === "results" && view.mode === "jp" ? view.q : null
  useEffect(() => {
    if (!jpQuery) return
    const seen = (seededJp.current ??= new Set<string>())
    if (seen.has(jpQuery)) return
    seen.add(jpQuery)
    setTurns((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].q === jpQuery) return prev
      const history: AssistantTurn[] = prev.map((t) => ({ q: t.q, a: t.a }))
      return [...prev, { id: (turnSeq += 1), q: jpQuery, a: ask(jpQuery, history) }]
    })
  }, [jpQuery])

  /* ----------------------------------------------------- omnibox sync -- */

  const viewUrl = meta.url
  const viewQuery = view.k === "results" ? view.q : null
  useEffect(() => {
    setOmnibox(viewQuery ?? viewUrl)
    setDirty(false)
  }, [activeId, viewUrl, viewQuery])

  const interp = useMemo(
    () => (dirty ? interpret(omnibox, mode, isOnline) : null),
    [dirty, omnibox, mode, isOnline],
  )
  const suggestions = useMemo(
    () => (dirty && omnibox.trim() ? search(omnibox, "all", 6).results : []),
    [dirty, omnibox],
  )

  const rows = useMemo<OmniRowItem[]>(() => {
    const out: OmniRowItem[] = []
    const typed = omnibox.trim()
    if (interp) {
      out.push({
        key: "interp",
        icon: iconForInterp(interp),
        primary: interp.label,
        secondary: interp.detail,
        run: () => runInterp(interp),
      })
      // The interpretation is a guess with a visible alternative, never a trap:
      // plain search is always one row away.
      if (interp.k !== "find" && typed) {
        out.push({
          key: "escape-hatch",
          icon: <Search size={14} />,
          primary: `Search this PC for “${typed}”`,
          secondary: "Local",
          run: () => searchIn(typed, "local"),
        })
      }
    }
    for (const r of suggestions) {
      out.push({
        key: r.id,
        icon: iconForKind(r.kind),
        primary: <Marked text={r.title} query={omnibox} />,
        secondary: r.subtitle,
        run: () => runResult(r),
      })
    }
    return out
  }, [interp, omnibox, runInterp, runResult, searchIn, suggestions])

  /* ------------------------------------------------------------ tabs -- */

  const addTab = () => {
    tabSeq += 1
    const id = `t${tabSeq}`
    setTabs((ts) => [...ts, { id, history: [HOME], hi: 0, mode: "local" }])
    setActiveId(id)
  }

  const closeTab = (id: string) => {
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    const next = tabs.filter((t) => t.id !== id)
    if (next.length === 0) {
      tabSeq += 1
      const fresh: Tab = { id: `t${tabSeq}`, history: [HOME], hi: 0, mode: "local" }
      setTabs([fresh])
      setActiveId(fresh.id)
      return
    }
    setTabs(next)
    if (id === activeId) setActiveId(next[Math.min(idx, next.length - 1)].id)
  }

  /* ------------------------------------------------------------ view -- */

  const needsWeb =
    view.k === "wiki" || view.k === "gh" || view.k === "external" || (view.k === "results" && view.mode === "web")
  const why = OFFLINE_WHY[netStatus]
  const openExternally = (url: string) => window.open(url, "_blank", "noopener,noreferrer")
  const focusOmnibox = () => omniRef.current?.focus()

  return (
    <div className="relative flex h-full min-h-0 flex-col" style={{ background: "var(--os-surface)" }}>
      {/* Tab strip — attached, trapezoidal, coral mark */}
      <div className="flex shrink-0 items-end gap-1 px-2 pt-1.5" style={{ background: "var(--os-chrome)" }}>
        <div className="os-scroll flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const tm = metaFor(t.history[t.hi])
            const on = t.id === activeId
            return (
              <div
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`group flex h-8 min-w-[112px] max-w-[190px] flex-1 cursor-default items-center gap-2 rounded-t-lg px-3 text-[12px] ${
                  on ? "" : "hover:bg-[var(--os-hover)]"
                }`}
                style={{
                  background: on ? "var(--os-surface)" : "transparent",
                  color: "var(--os-fg)",
                  boxShadow: on ? `inset 0 2px 0 0 ${TINT[1]}` : undefined,
                }}
              >
                <NimbusMark size={13} />
                <span className="flex-1 truncate">{tm.title}</span>
                <button
                  type="button"
                  aria-label={`Close ${tm.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(t.id)
                  }}
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-full opacity-0 hover:bg-[var(--os-hover)] group-hover:opacity-100"
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
          onClick={addTab}
          className="mb-1 grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-[var(--os-hover)]"
          style={{ color: "var(--os-fg)" }}
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Omnibox row */}
      <div
        className="flex shrink-0 items-center gap-1.5 px-2 py-1.5"
        style={{ background: "var(--os-surface)" }}
      >
        <NavButton label="Back" disabled={!canBack} onClick={() => step(-1)}>
          <ArrowLeft size={15} />
        </NavButton>
        <NavButton label="Forward" disabled={!canForward} onClick={() => step(1)}>
          <ArrowRight size={15} />
        </NavButton>
        <NavButton label="Reload" onClick={() => setReloadKey((k) => k + 1)}>
          <RotateCw size={15} />
        </NavButton>

        <OmniBox
          value={omnibox}
          onChange={(v) => {
            setOmnibox(v)
            setDirty(true)
          }}
          onSubmit={(v) => {
            const i = interpret(v, mode, isOnline)
            if (i) runInterp(i)
          }}
          rows={rows}
          placeholder={meta.url}
          secure={meta.url.startsWith("https://")}
          inputRef={omniRef}
        />

        {meta.external && (
          <button
            type="button"
            onClick={() => openExternally(meta.external as string)}
            title={`Open ${hostOf(meta.external)} in your own browser`}
            aria-label="Open externally"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-[var(--os-hover)]"
            style={{ color: "var(--os-fg)" }}
          >
            <ExternalLink size={14} />
          </button>
        )}
      </div>

      <ModePills mode={mode} onPick={setMode} webAvailable={isOnline} why={why} />

      {/* Viewport */}
      <div
        key={`${activeId}:${active.hi}:${reloadKey}`}
        className="os-scroll relative min-h-0 flex-1 overflow-y-auto"
      >
        {!isOnline && (view.k === "home" || needsWeb) ? (
          <OfflineHome
            why={why}
            airplane={airplane}
            connecting={netStatus === "connecting"}
            blockedUrl={needsWeb ? meta.url : null}
            onMode={setMode}
            onFocus={focusOmnibox}
            onAsk={(q) => searchIn(q, "jp")}
            onReport={report}
          />
        ) : view.k === "home" ? (
          <HomePage
            mode={mode}
            onMode={setMode}
            onSearch={searchIn}
            onAsk={(q) => searchIn(q, "jp")}
            onGithub={() => navigate({ k: "gh" })}
            onReport={report}
          />
        ) : view.k === "results" && view.mode === "local" ? (
          <LocalResults query={view.q} onRun={runResult} onSearch={searchIn} />
        ) : view.k === "results" && view.mode === "jp" ? (
          <JPConversation
            turns={turns}
            onAsk={askMore}
            onCapability={runCapability}
            onSearch={searchIn}
          />
        ) : view.k === "results" ? (
          <WebResults
            query={view.q}
            onOpenWiki={(title) => navigate({ k: "wiki", title })}
            onOpenGithub={() => navigate({ k: "gh" })}
            onExternal={openExternally}
            onSearch={searchIn}
          />
        ) : view.k === "wiki" ? (
          <WikiArticle title={view.title} onExternal={openExternally} onSearch={searchIn} />
        ) : view.k === "gh" ? (
          <GithubPage onExternal={openExternally} onSearch={searchIn} />
        ) : (
          <ExternalPage url={view.url} onExternal={openExternally} onSearch={searchIn} />
        )}
      </div>

      {flash && (
        <div
          role="status"
          className="pointer-events-none absolute bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-[12px] shadow-2xl"
          style={{
            background: "var(--os-menu)",
            border: `1px solid ${flash.bad ? "var(--os-danger)" : "var(--os-border)"}`,
            color: flash.bad ? "var(--os-danger)" : "var(--os-fg)",
            backdropFilter: "blur(20px)",
            maxWidth: "min(88%, 520px)",
          }}
        >
          {flash.text}
        </div>
      )}
    </div>
  )
}

/* ================================================================== *
 * Chrome parts
 * ================================================================== */

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
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors enabled:hover:bg-[var(--os-hover)] disabled:opacity-35"
      style={{ color: "var(--os-fg)" }}
    >
      {children}
    </button>
  )
}

/** Original mark: a coral disc behind two stacked bars. Drawn, not licensed. */
function NimbusMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <circle cx="8" cy="8" r="7.2" fill={TINT[1]} opacity="0.2" />
      <rect x="3" y="5" width="10" height="2" rx="1" fill={TINT[1]} />
      <rect x="4.5" y="8.5" width="7" height="2" rx="1" fill={TINT[0]} />
    </svg>
  )
}

function ModePills({
  mode,
  onPick,
  webAvailable,
  why,
}: {
  mode: Mode
  onPick: (m: Mode) => void
  webAvailable: boolean
  why: string
}) {
  const blurb = MODES.find((m) => m.id === mode)?.blurb ?? ""
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2 border-b px-2.5 pb-1.5"
      style={{ borderColor: "var(--os-border)", background: "var(--os-surface)" }}
    >
      <div
        className="flex shrink-0 items-center gap-0.5 rounded-full p-0.5"
        style={{ background: "var(--os-hover)" }}
      >
        {MODES.map((m) => {
          const on = m.id === mode
          const off = m.id === "web" && !webAvailable
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              disabled={off}
              title={off ? `Web search is unavailable. ${why}` : m.blurb}
              onClick={() => onPick(m.id)}
              className="rounded-full px-3 py-[3px] text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: on ? "var(--os-accent)" : "transparent",
                color: on ? "var(--os-on-accent)" : "var(--os-muted)",
              }}
            >
              {m.label}
            </button>
          )
        })}
      </div>
      <p className="min-w-0 flex-1 truncate text-[11px]" style={{ color: "var(--os-muted)" }}>
        {webAvailable ? blurb : `Web is unavailable — ${why} Local and JP still work.`}
      </p>
    </div>
  )
}

/* ================================================================== *
 * Omnibox
 * ================================================================== */

type OmniRowItem = {
  key: string
  icon: ReactNode
  primary: ReactNode
  secondary: string
  run: () => void
}

function iconForInterp(i: Interp): ReactNode {
  switch (i.k) {
    case "app":
      return <AppWindow size={14} />
    case "node":
      return i.node.kind === "folder" || i.node.kind === "zip" ? <FolderOpen size={14} /> : <FileText size={14} />
    case "desktop":
      return <HardDrive size={14} />
    case "url":
      return <Globe size={14} />
    case "ask":
      return <Sparkles size={14} />
    case "find":
      return <Search size={14} />
  }
}

function iconForKind(kind: ResultKind): ReactNode {
  switch (kind) {
    case "app":
      return <AppWindow size={14} />
    case "file":
      return <FileText size={14} />
    case "folder":
      return <FolderOpen size={14} />
    case "project":
      return <FolderOpen size={14} />
    case "skill":
      return <Activity size={14} />
    case "experience":
      return <Briefcase size={14} />
    case "achievement":
      return <Trophy size={14} />
    case "lab":
      return <FlaskConical size={14} />
    case "profile":
      return <UserRound size={14} />
    case "action":
      return <Sparkles size={14} />
  }
}

function OmniBox({
  value,
  onChange,
  onSubmit,
  rows,
  placeholder,
  secure,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
  rows: OmniRowItem[]
  placeholder: string
  secure: boolean
  inputRef: RefObject<HTMLInputElement>
}) {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const wrap = useRef<HTMLDivElement | null>(null)
  const listId = useId()
  const optionId = (i: number) => `${listId}-o${i}`

  const showList = open && rows.length > 0
  const safeCursor = Math.min(cursor, rows.length - 1)

  useEffect(() => {
    setCursor(0)
  }, [value])

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", away)
    return () => document.removeEventListener("mousedown", away)
  }, [])

  const commit = (i: number) => {
    setOpen(false)
    const row = rows[i]
    if (row) row.run()
    else onSubmit(value)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false)
      setCursor(0)
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      commit(showList ? safeCursor : -1)
      return
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (rows.length === 0) return
      e.preventDefault()
      setOpen(true)
      setCursor((c) => {
        const n = rows.length
        const at = Math.min(c, n - 1)
        return e.key === "ArrowDown" ? (at + 1) % n : (at - 1 + n) % n
      })
    }
  }

  return (
    <div ref={wrap} className="relative min-w-0 flex-1">
      <div
        className="flex w-full items-center gap-2 rounded-full px-3 py-1.5"
        style={{
          background: "var(--os-input)",
          border: `1px solid ${showList ? TINT[1] : "var(--os-border)"}`,
        }}
      >
        {secure ? (
          <Lock size={12} style={{ color: "var(--os-muted)" }} />
        ) : (
          <Search size={13} style={{ color: "var(--os-muted)" }} />
        )}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onMouseUp={(e) => {
            // Already-focused click: no focus event fires, so select here as well.
            const el = e.currentTarget
            if (el.selectionStart === el.selectionEnd) el.select()
          }}
          onFocus={(e) => {
            setOpen(true)
            // Every real omnibox selects its whole value on focus, so typing
            // replaces the address instead of appending to it.
            e.currentTarget.select()
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-label="Search or type a web address"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? optionId(safeCursor) : undefined}
          className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-[var(--os-muted)]"
          style={{ color: "var(--os-fg)" }}
        />
        <Star size={13} className="shrink-0" style={{ color: "var(--os-muted)" }} />
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label="Suggestions"
        hidden={!showList}
        className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl py-1 shadow-2xl"
        style={{
          background: "var(--os-menu)",
          border: "1px solid var(--os-border)",
          backdropFilter: "blur(20px)",
        }}
      >
        {rows.map((row, i) => (
          <li
            key={row.key}
            id={optionId(i)}
            role="option"
            aria-selected={i === safeCursor}
            onMouseEnter={() => setCursor(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => commit(i)}
            className="flex cursor-default items-center gap-2.5 px-3 py-2"
            style={{ background: i === safeCursor ? "var(--os-hover)" : "transparent" }}
          >
            <span className="shrink-0" style={{ color: "var(--os-muted)" }}>
              {row.icon}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: "var(--os-fg)" }}>
              {row.primary}
            </span>
            <span className="max-w-[45%] shrink-0 truncate text-[11px]" style={{ color: "var(--os-muted)" }}>
              {row.secondary}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ================================================================== *
 * Small shared pieces
 * ================================================================== */

/** Renders lib/os/search.ts highlight segments. No innerHTML, ever. */
function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((seg, i) =>
        seg.hit ? (
          <b key={i} className="font-semibold" style={{ color: "var(--os-fg)" }}>
            {seg.t}
          </b>
        ) : (
          <span key={i}>{seg.t}</span>
        ),
      )}
    </>
  )
}

/** Wikipedia's own match markers, parsed into data and rendered as elements. */
function Excerpt({ html }: { html: string }) {
  return (
    <>
      {parseExcerpt(html).map((seg, i) =>
        seg.hit ? (
          <b key={i} className="font-semibold" style={{ color: "var(--os-fg)" }}>
            {seg.t}
          </b>
        ) : (
          <span key={i}>{seg.t}</span>
        ),
      )}
    </>
  )
}

function Spinner({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--os-muted)" }}>
      <Loader2 size={14} className="animate-spin" />
      {label}
    </p>
  )
}

function Notice({
  tone = "info",
  title,
  children,
  onRetry,
}: {
  tone?: "info" | "warn"
  title: string
  children?: ReactNode
  onRetry?: () => void
}) {
  const bad = tone === "warn"
  return (
    <div
      className="rounded-xl px-4 py-3.5"
      style={{
        background: "var(--os-card)",
        border: `1px solid ${bad ? "var(--os-danger)" : "var(--os-border)"}`,
      }}
    >
      <p
        className="mb-1 flex items-center gap-2 text-[12.5px] font-semibold"
        style={{ color: bad ? "var(--os-danger)" : "var(--os-fg)" }}
      >
        {bad ? <AlertTriangle size={13} /> : <BookOpen size={13} />}
        {title}
      </p>
      {children && (
        <div className="text-[12.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
          {children}
        </div>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium"
          style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
        >
          <RefreshCw size={12} /> Try again
        </button>
      )}
    </div>
  )
}

function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-[12px] transition-colors hover:bg-[var(--os-active)]"
      style={{ background: "var(--os-hover)", color: "var(--os-fg)" }}
    >
      {label}
    </button>
  )
}

function Solid({ label, icon, onClick }: { label: string; icon?: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-transform active:scale-[.98]"
      style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
    >
      {icon}
      {label}
    </button>
  )
}

const fmtDate = (iso: string) => (iso.length >= 10 ? iso.slice(0, 10) : iso)

/* ================================================================== *
 * Home
 * ================================================================== */

function HomePage({
  mode,
  onMode,
  onSearch,
  onAsk,
  onGithub,
  onReport,
}: {
  mode: Mode
  onMode: (m: Mode) => void
  onSearch: (q: string, m: Mode) => void
  onAsk: (q: string) => void
  onGithub: () => void
  onReport: (res: ActionResult<unknown>, okText?: string) => void
}) {
  const [q, setQ] = useState("")

  const shortcuts: { label: string; icon: ReactNode; go: () => void }[] = [
    { label: "Projects", icon: <FolderOpen size={17} />, go: () => onReport(A.openApp("projects"), "Opened Projects.") },
    { label: "Files", icon: <HardDrive size={17} />, go: () => onReport(A.openFolder(null), "Opened Desktop.") },
    { label: "Terminal", icon: <SquareTerminal size={17} />, go: () => onReport(A.openApp("terminal"), "Opened Terminal.") },
    { label: "GitHub", icon: <GitBranch size={17} />, go: onGithub },
    { label: "Wikipedia", icon: <BookOpen size={17} />, go: () => onMode("web") },
    { label: "Contact", icon: <Mail size={17} />, go: () => onReport(A.openApp("contact"), "Opened Mail.") },
  ]

  const placeholder =
    mode === "jp"
      ? "Ask about Johnpaul…"
      : mode === "web"
        ? "Search Wikipedia…"
        : "Search apps, files and this portfolio"

  return (
    <div className="grid min-h-full place-items-center p-8">
      <div className="w-full max-w-md text-center">
        <span className="mb-4 inline-block">
          <NimbusMark size={38} />
        </span>
        <p className="mb-1 text-[26px] font-semibold tracking-tight" style={{ color: "var(--os-fg)" }}>
          {PROFILE.name}
        </p>
        <p className="mb-6 text-[12.5px]" style={{ color: "var(--os-muted)" }}>
          {PROFILE.title}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSearch(q, mode)
          }}
          className="mb-7"
        >
          <div
            className="flex items-center gap-2.5 rounded-full px-4 py-2.5"
            style={{ background: "var(--os-input)", border: "1px solid var(--os-border)" }}
          >
            <Search size={15} style={{ color: "var(--os-muted)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--os-muted)]"
              style={{ color: "var(--os-fg)" }}
            />
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {SUGGESTED_QUESTIONS.slice(0, 3).map((s) => (
              <Chip key={s} label={s} onClick={() => onAsk(s)} />
            ))}
          </div>
        </form>

        <div className="grid grid-cols-3 gap-4">
          {shortcuts.map((s) => (
            <button key={s.label} type="button" onClick={s.go} className="group flex flex-col items-center gap-2">
              <span
                className="grid place-items-center rounded-full transition-transform group-hover:scale-105"
                style={{ background: "var(--os-hover)", color: "var(--os-accent)", height: 52, width: 52 }}
              >
                {s.icon}
              </span>
              <span className="text-[12px]" style={{ color: "var(--os-muted)" }}>
                {s.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ================================================================== *
 * Offline — an intentional home, not a dead end
 * ================================================================== */

function OfflineHome({
  why,
  airplane,
  connecting,
  blockedUrl,
  onMode,
  onFocus,
  onAsk,
  onReport,
}: {
  why: string
  airplane: boolean
  connecting: boolean
  blockedUrl: string | null
  onMode: (m: Mode) => void
  onFocus: () => void
  onAsk: (q: string) => void
  onReport: (res: ActionResult<unknown>, okText?: string) => void
}) {
  const rows: { label: string; hint: string; icon: ReactNode; go: () => void }[] = [
    {
      label: "Search this PC",
      hint: "Apps, files, folders and portfolio content — the index is local.",
      icon: <Search size={15} />,
      go: () => {
        onMode("local")
        onFocus()
      },
    },
    {
      label: "Search JP",
      hint: "Everything Johnpaul has published, answered from the profile.",
      icon: <Sparkles size={15} />,
      go: () => {
        onMode("jp")
        onFocus()
      },
    },
    {
      label: "Ask the JP assistant",
      hint: SUGGESTED_QUESTIONS[0],
      icon: <CornerDownLeft size={15} />,
      go: () => onAsk(SUGGESTED_QUESTIONS[0]),
    },
    {
      label: "Open an app",
      hint: "The Start menu, with everything installed on this machine.",
      icon: <AppWindow size={15} />,
      go: () => onReport(A.openStart(), "Opened Start."),
    },
    {
      label: "Browse projects",
      hint: "The project archive, offline and complete.",
      icon: <FolderOpen size={15} />,
      go: () => onReport(A.openApp("projects"), "Opened Projects."),
    },
    {
      label: "Browse files",
      hint: "File Explorer, starting at the Desktop.",
      icon: <HardDrive size={15} />,
      go: () => onReport(A.openFolder(null), "Opened Desktop."),
    },
  ]

  return (
    <div className="mx-auto w-full max-w-[620px] px-6 py-8">
      <UnpluggedGlyph />
      <h1 className="mb-2 mt-5 text-[22px] font-normal" style={{ color: "var(--os-fg)" }}>
        You are offline
      </h1>
      <p className="mb-1 text-[13.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
        Web search is unavailable, but your computer is still fully usable.
      </p>
      <p className="mb-5 text-[12px]" style={{ color: "var(--os-muted)" }}>
        {connecting ? "Joining a network…" : why}
        {blockedUrl ? ` Nimbus stopped before requesting ${hostOf(blockedUrl)}.` : ""}
      </p>

      <div
        className="mb-5 overflow-hidden rounded-xl"
        style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
      >
        {rows.map((r, i) => (
          <button
            key={r.label}
            type="button"
            onClick={r.go}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--os-hover)]"
            style={{ borderTop: i === 0 ? undefined : "1px solid var(--os-border)" }}
          >
            <span className="shrink-0" style={{ color: "var(--os-accent)" }}>
              {r.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px]" style={{ color: "var(--os-fg)" }}>
                {r.label}
              </span>
              <span className="block truncate text-[11.5px]" style={{ color: "var(--os-muted)" }}>
                {r.hint}
              </span>
            </span>
            <ChevronRight size={14} style={{ color: "var(--os-muted)" }} />
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Solid
          label={airplane ? "Turn off Airplane mode" : "Reconnect"}
          icon={<RefreshCw size={12} />}
          onClick={() =>
            onReport(
              airplane ? A.toggleAirplane() : A.setWifi(true),
              airplane ? "Airplane mode off." : "Reconnecting…",
            )
          }
        />
        <span className="text-[11.5px]" style={{ color: "var(--os-muted)" }}>
          Local and JP need no network at all.
        </span>
      </div>
    </div>
  )
}

/** Original mark: a plug pulled out of its socket, drawn from plain boxes. */
function UnpluggedGlyph() {
  const c = "var(--os-muted)"
  return (
    <svg width="72" height="46" viewBox="0 0 72 46" aria-hidden>
      <rect x="2" y="15" width="20" height="16" rx="2" fill="none" stroke={c} strokeWidth="2.5" />
      <rect x="22" y="20" width="7" height="6" fill={c} />
      <rect x="50" y="15" width="20" height="16" rx="2" fill="none" stroke={c} strokeWidth="2.5" />
      <rect x="43" y="20" width="7" height="6" fill={c} />
      <path d="M33 10 L39 23 L33 36" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

/* ================================================================== *
 * Local results
 * ================================================================== */

const GROUP_ORDER: { kind: ResultKind; label: string }[] = [
  { kind: "app", label: "Apps" },
  { kind: "action", label: "Actions" },
  { kind: "profile", label: "Profile" },
  { kind: "project", label: "Projects" },
  { kind: "skill", label: "Skills" },
  { kind: "experience", label: "Experience" },
  { kind: "achievement", label: "Achievements" },
  { kind: "lab", label: "Lab" },
  { kind: "folder", label: "Folders" },
  { kind: "file", label: "Files" },
]

function LocalResults({
  query,
  onRun,
  onSearch,
}: {
  query: string
  onRun: (r: SearchResult) => void
  onSearch: (q: string, m: Mode) => void
}) {
  const outcome = useMemo(() => search(query, "all", 60), [query])
  // Grouping must not bury the best answer: groups are ordered by the rank of
  // their strongest hit, so the group holding the top result always leads.
  const groups = useMemo(
    () =>
      GROUP_ORDER.map((g) => ({
        ...g,
        items: outcome.results.filter((r) => r.kind === g.kind),
      }))
        .filter((g) => g.items.length > 0)
        .sort((a, b) => outcome.results.indexOf(a.items[0]) - outcome.results.indexOf(b.items[0])),
    [outcome],
  )

  return (
    <div className="mx-auto w-full max-w-[920px] px-5 py-5 sm:px-8">
      <div className="mb-1.5 flex items-center gap-2.5">
        <NimbusMark size={18} />
        <span className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--os-fg)" }}>
          Nimbus
        </span>
        <span className="text-[11px]" style={{ color: "var(--os-muted)" }}>
          searching this PC
        </span>
      </div>
      <p className="mb-5 text-[12px]" style={{ color: "var(--os-muted)" }}>
        {outcome.counts.all} {outcome.counts.all === 1 ? "match" : "matches"} for{" "}
        <b style={{ color: "var(--os-fg)" }}>{query}</b> · Apps {outcome.counts.apps} · Files{" "}
        {outcome.counts.files} · Johnpaul {outcome.counts.jp} · no network involved
      </p>

      {groups.length === 0 ? (
        <Notice title={`Nothing on this machine matches “${query}”.`}>
          <p>
            The local index covers every app, every file and folder on the desktop, and everything in
            Johnpaul&rsquo;s profile. If it isn&rsquo;t here, it isn&rsquo;t on this computer.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip label={`Ask JP about “${query}”`} onClick={() => onSearch(query, "jp")} />
            <Chip label="Search the web instead" onClick={() => onSearch(query, "web")} />
          </div>
        </Notice>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.kind}>
              <header className="mb-2 flex items-center gap-2">
                <span style={{ color: "var(--os-muted)" }}>{iconForKind(g.kind)}</span>
                <h2
                  className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--os-muted)" }}
                >
                  {g.label}
                </h2>
                <span
                  className="rounded-full px-1.5 text-[10.5px] font-semibold"
                  style={{ background: "var(--os-hover)", color: "var(--os-muted)" }}
                >
                  {g.items.length}
                </span>
                <span className="h-px flex-1" style={{ background: "var(--os-border)" }} />
              </header>
              <ul className="flex flex-col">
                {g.items.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onRun(r)}
                      className="group flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--os-hover)]"
                    >
                      <span className="mt-0.5 shrink-0" style={{ color: "var(--os-muted)" }}>
                        {iconForKind(r.kind)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate text-[13.5px] group-hover:underline"
                          style={{ color: "var(--os-accent)" }}
                        >
                          <Marked text={r.title} query={query} />
                        </span>
                        <span
                          className="block truncate text-[11.5px]"
                          style={{ color: "var(--os-muted)" }}
                        >
                          {r.subtitle}
                        </span>
                        {r.detail && (
                          <span
                            className="mt-0.5 block line-clamp-2 text-[12.5px] leading-relaxed"
                            style={{ color: "var(--os-muted)" }}
                          >
                            <Marked text={r.detail} query={query} />
                          </span>
                        )}
                      </span>
                      <ChevronRight
                        size={14}
                        className="mt-1 shrink-0 opacity-0 group-hover:opacity-100"
                        style={{ color: "var(--os-muted)" }}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11.5px]" style={{ color: "var(--os-muted)" }}>
              Not what you meant?
            </span>
            <Chip label="Ask JP instead" onClick={() => onSearch(query, "jp")} />
            <Chip label="Search the web" onClick={() => onSearch(query, "web")} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ================================================================== *
 * JP — the portfolio intelligence layer
 * ================================================================== */

function JPConversation({
  turns,
  onAsk,
  onCapability,
  onSearch,
}: {
  turns: Turn[]
  onAsk: (q: string) => void
  onCapability: (capability: string, arg: string, label: string) => void
  onSearch: (q: string, m: Mode) => void
}) {
  const [draft, setDraft] = useState("")
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" })
  }, [turns.length])

  const last = turns[turns.length - 1]

  return (
    <div className="mx-auto w-full max-w-[1020px] px-5 py-5 sm:px-8">
      <div className="mb-4 flex items-center gap-2.5">
        <NimbusMark size={18} />
        <span className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--os-fg)" }}>
          Nimbus
        </span>
        <span className="text-[11px]" style={{ color: "var(--os-muted)" }}>
          asking about {PROFILE.name}
        </span>
      </div>

      <div className="flex flex-col gap-7 lg:flex-row lg:items-start">
        <section
          className="min-w-0 flex-1 overflow-hidden rounded-xl"
          style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
        >
          <header
            className="flex items-center gap-2 border-b px-4 py-2.5"
            style={{ borderColor: "var(--os-border)", background: "var(--os-accent-soft)" }}
          >
            <Sparkles size={14} style={{ color: "var(--os-accent)" }} />
            <span className="text-[13px] font-semibold" style={{ color: "var(--os-fg)" }}>
              Ask about Johnpaul
            </span>
            <span className="ml-auto text-[10.5px]" style={{ color: "var(--os-muted)" }}>
              grounded in his profile only
            </span>
          </header>

          <div className="flex flex-col gap-5 px-4 py-4">
            {turns.length === 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--os-fg)" }}>
                  Ask me anything about {PROFILE.name}. I answer only from what he has published on
                  this profile — when it doesn&rsquo;t say, I say so rather than inventing something
                  that sounds right.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_QUESTIONS.slice(0, 5).map((s) => (
                    <Chip key={s} label={s} onClick={() => onAsk(s)} />
                  ))}
                </div>
              </div>
            )}

            {turns.map((t) => (
              <article key={t.id} className="flex flex-col gap-2.5">
                <p
                  className="self-end rounded-2xl rounded-br-sm px-3 py-1.5 text-[12.5px]"
                  style={{
                    background: "var(--os-accent)",
                    color: "var(--os-on-accent)",
                    maxWidth: "80%",
                  }}
                >
                  {t.q}
                </p>

                <div className="flex gap-2.5">
                  <span
                    className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold"
                    style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
                  >
                    {PROFILE.initials}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-relaxed" style={{ color: "var(--os-fg)" }}>
                      <TypedText text={t.a.text} animate={t.id === last?.id} />
                    </p>

                    {t.a.facts && t.a.facts.length > 0 && (
                      <dl
                        className="mt-3 overflow-hidden rounded-lg"
                        style={{ border: "1px solid var(--os-border)" }}
                      >
                        {t.a.facts.map((f, i) => (
                          <div
                            key={`${f.label}-${i}`}
                            className="flex gap-3 px-3 py-1.5 text-[12px]"
                            style={{ borderTop: i === 0 ? undefined : "1px solid var(--os-border)" }}
                          >
                            <dt className="w-[110px] shrink-0" style={{ color: "var(--os-muted)" }}>
                              {f.label}
                            </dt>
                            <dd className="min-w-0 flex-1" style={{ color: "var(--os-fg)" }}>
                              {f.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    {t.a.actions && t.a.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {t.a.actions.map((a) => (
                          <button
                            key={`${a.capability}:${a.arg}`}
                            type="button"
                            onClick={() => onCapability(a.capability, a.arg, a.label)}
                            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-transform active:scale-[.98]"
                            style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
                          >
                            <ChevronRight size={12} />
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {t.a.suggestions && t.a.suggestions.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {t.a.suggestions.map((s) => (
                          <Chip key={s} label={s} onClick={() => onAsk(s)} />
                        ))}
                      </div>
                    )}

                    {t.a.unknown && (
                      <p className="mt-2.5 text-[11px]" style={{ color: "var(--os-muted)" }}>
                        Not covered by the profile — so nothing was assembled to fill the gap.
                      </p>
                    )}
                  </div>
                </div>
              </article>
            ))}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              onAsk(draft)
              setDraft("")
            }}
            className="flex items-center gap-2 border-t px-3 py-2.5"
            style={{ borderColor: "var(--os-border)" }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={turns.length ? "Ask a follow-up…" : "Ask a question…"}
              aria-label="Ask a follow-up question"
              className="min-w-0 flex-1 rounded-full px-3 py-1.5 text-[12.5px] outline-none placeholder:text-[var(--os-muted)]"
              style={{
                background: "var(--os-input)",
                border: "1px solid var(--os-border)",
                color: "var(--os-fg)",
              }}
            />
            <button
              type="submit"
              aria-label="Ask"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition-transform active:scale-95"
              style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
            >
              <CornerDownLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => onSearch(draft.trim() || last?.q || "", "local")}
              className="shrink-0 rounded-full px-3 py-1.5 text-[12px] transition-colors hover:bg-[var(--os-hover)]"
              style={{ color: "var(--os-muted)" }}
            >
              Search instead
            </button>
          </form>
        </section>

        <ProfileRail onCapability={onCapability} />
      </div>
    </div>
  )
}

/** Reveals the answer a few characters at a time, with a blinking caret. */
function TypedText({ text, animate }: { text: string; animate: boolean }) {
  const [shown, setShown] = useState(animate ? "" : text)

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (!animate || reduce) {
      setShown(text)
      return
    }

    setShown("")
    const stride = Math.max(2, Math.ceil(text.length / 90))
    let i = 0
    const timer = window.setInterval(() => {
      i += stride
      if (i >= text.length) {
        setShown(text)
        window.clearInterval(timer)
        return
      }
      setShown(text.slice(0, i))
    }, 16)

    return () => window.clearInterval(timer)
  }, [text, animate])

  const typing = shown.length < text.length
  return (
    <span className="whitespace-pre-wrap">
      {shown}
      {typing && (
        <span
          className="ml-[1px] inline-block h-[0.95em] w-[2px] translate-y-[2px] animate-pulse rounded-sm"
          style={{ background: "var(--os-accent)" }}
        />
      )}
    </span>
  )
}

/** Facts, straight from content.ts. Nothing here is derived or guessed. */
function ProfileRail({
  onCapability,
}: {
  onCapability: (capability: string, arg: string, label: string) => void
}) {
  const facts: { icon: ReactNode; label: string; value: string; href: string }[] = [
    { icon: <Mail size={13} />, label: "Email", value: PROFILE.email, href: `mailto:${PROFILE.email}` },
    { icon: <GitBranch size={13} />, label: "GitHub", value: PROFILE.github, href: `https://${PROFILE.github}` },
    { icon: <Briefcase size={13} />, label: "LinkedIn", value: PROFILE.linkedin, href: `https://${PROFILE.linkedin}` },
  ]

  return (
    <aside
      className="w-full shrink-0 self-start overflow-hidden rounded-xl lg:sticky lg:top-0 lg:w-[286px]"
      style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
    >
      <div className="px-4 pb-4 pt-5">
        <div className="mb-3 flex items-center gap-3">
          <span
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-[18px] font-semibold"
            style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
          >
            {PROFILE.initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold" style={{ color: "var(--os-fg)" }}>
              {PROFILE.name}
            </p>
            <p className="text-[12px]" style={{ color: "var(--os-muted)" }}>
              {PROFILE.title}
            </p>
          </div>
        </div>

        <p className="mb-3 flex items-center gap-1.5 text-[12px]" style={{ color: "var(--os-muted)" }}>
          <MapPin size={12} /> {PROFILE.location}
        </p>
        <p className="mb-4 text-[12.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
          {PROFILE.tagline}
        </p>

        <div className="mb-4 flex flex-col">
          {facts.map((f) => (
            <div
              key={f.label}
              className="flex items-center gap-2 border-t py-2 text-[12px]"
              style={{ borderColor: "var(--os-border)" }}
            >
              <span className="shrink-0" style={{ color: "var(--os-muted)" }}>
                {f.icon}
              </span>
              <span className="w-[58px] shrink-0" style={{ color: "var(--os-muted)" }}>
                {f.label}
              </span>
              <a
                href={f.href}
                target={f.href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer noopener"
                className="min-w-0 flex-1 truncate hover:underline"
                style={{ color: "var(--os-accent)" }}
                title={f.value}
              >
                {f.value}
              </a>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Solid label="Contact" onClick={() => onCapability("open-app", "contact", "Contact")} />
          <Chip label="Résumé" onClick={() => onCapability("open-app", "resume", "Résumé")} />
        </div>
      </div>

      <div className="border-t px-4 py-3" style={{ borderColor: "var(--os-border)" }}>
        <p
          className="mb-2 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--os-muted)" }}
        >
          At a glance
        </p>
        {PROFILE.uvp.map((u) => (
          <p key={u} className="mb-1.5 text-[12px] leading-snug" style={{ color: "var(--os-muted)" }}>
            — {u}
          </p>
        ))}
      </div>
    </aside>
  )
}

/* ================================================================== *
 * Web — real requests, or an honest failure. Never a mock.
 * ================================================================== */

function SourceNote({ children }: { children: ReactNode }) {
  return (
    <p
      className="mb-4 rounded-lg px-3 py-2 text-[11.5px] leading-relaxed"
      style={{ background: "var(--os-accent-soft)", color: "var(--os-fg)" }}
    >
      {children}
    </p>
  )
}

function WebResults({
  query,
  onOpenWiki,
  onOpenGithub,
  onExternal,
  onSearch,
}: {
  query: string
  onOpenWiki: (title: string) => void
  onOpenGithub: () => void
  onExternal: (url: string) => void
  onSearch: (q: string, m: Mode) => void
}) {
  const [hits, retryHits] = useWikiSearch(query, true)
  const top = hits.s === "ready" && hits.data.length > 0 ? hits.data[0].title : null
  const [summary, retrySummary] = useWikiSummary(top, true)

  const mentionsGithub =
    /\b(github|repo|repos|repository|repositories|source|commits)\b/i.test(query) ||
    (GITHUB_USER !== "" && query.toLowerCase().includes(GITHUB_USER.toLowerCase()))

  return (
    <div className="mx-auto w-full max-w-[1020px] px-5 py-5 sm:px-8">
      <div className="mb-3 flex items-center gap-2.5">
        <NimbusMark size={18} />
        <span className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--os-fg)" }}>
          Nimbus
        </span>
        <span className="text-[11px]" style={{ color: "var(--os-muted)" }}>
          live from en.wikipedia.org
        </span>
      </div>

      <SourceNote>
        These requests leave your browser for real, with no proxy and no API key. Almost nothing on
        the web permits that: Wikipedia&rsquo;s REST API and GitHub&rsquo;s REST API do, so those are
        the two sources Nimbus can honestly offer. Anything else is a link out to your own browser.
      </SourceNote>

      <div className="flex flex-col gap-7 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {hits.s === "loading" && <Spinner label={`Searching Wikipedia for “${query}”…`} />}

          {hits.s === "error" && (
            <Notice tone="warn" title="The request failed" onRetry={retryHits}>
              <p>{hits.message}</p>
            </Notice>
          )}

          {hits.s === "ready" && hits.data.length === 0 && (
            <Notice title={`Wikipedia returned no pages for “${query}”.`}>
              <p>That is the API&rsquo;s own answer, not a Nimbus guess.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip label="Search this PC instead" onClick={() => onSearch(query, "local")} />
                <Chip label="Ask JP instead" onClick={() => onSearch(query, "jp")} />
              </div>
            </Notice>
          )}

          {hits.s === "ready" && hits.data.length > 0 && (
            <>
              <p className="mb-4 text-[12px]" style={{ color: "var(--os-muted)" }}>
                {hits.data.length} {hits.data.length === 1 ? "page" : "pages"} · ranked by Wikipedia
              </p>
              <ol className="flex flex-col gap-5">
                {hits.data.map((h) => (
                  <li key={h.key}>
                    <button
                      type="button"
                      onClick={() => onOpenWiki(h.title)}
                      className="group block w-full text-left"
                    >
                      <span
                        className="mb-0.5 flex items-center gap-1.5 text-[11.5px]"
                        style={{ color: "var(--os-muted)" }}
                      >
                        <BookOpen size={11} /> en.wikipedia.org › wiki › {h.key}
                      </span>
                      <span
                        className="block text-[16px] leading-snug group-hover:underline"
                        style={{ color: "var(--os-accent)" }}
                      >
                        {h.title}
                      </span>
                    </button>
                    {h.description && (
                      <p className="text-[11.5px] italic" style={{ color: "var(--os-muted)" }}>
                        {h.description}
                      </p>
                    )}
                    {h.excerpt && (
                      <p
                        className="mt-1 text-[13px] leading-relaxed"
                        style={{ color: "var(--os-muted)" }}
                      >
                        <Excerpt html={h.excerpt} />
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onOpenWiki(h.title)}
                        className="text-[11.5px] hover:underline"
                        style={{ color: "var(--os-accent)" }}
                      >
                        Read the summary →
                      </button>
                      <button
                        type="button"
                        onClick={() => onExternal(wikiUrl(h.title))}
                        className="inline-flex items-center gap-1 text-[11.5px] hover:underline"
                        style={{ color: "var(--os-muted)" }}
                      >
                        <ExternalLink size={11} /> Open externally
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}

          {mentionsGithub && (
            <div
              className="mt-7 rounded-xl px-4 py-3.5"
              style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
            >
              <p className="mb-1 flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--os-fg)" }}>
                <GitBranch size={13} /> {GITHUB_USER} on GitHub
              </p>
              <p className="mb-3 text-[12.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
                github.com cannot be embedded — it sends <code>X-Frame-Options: deny</code>. Nimbus
                renders the public REST API instead, which is real data rather than a mock-up.
              </p>
              <Solid label="Open the GitHub page" icon={<GitBranch size={12} />} onClick={onOpenGithub} />
            </div>
          )}
        </div>

        <aside
          className="w-full shrink-0 self-start lg:sticky lg:top-0 lg:w-[300px]"
          hidden={summary.s === "idle"}
        >
          {summary.s === "loading" && <Spinner label="Loading the summary card…" />}
          {summary.s === "error" && (
            <Notice tone="warn" title="Summary unavailable" onRetry={retrySummary}>
              <p>{summary.message}</p>
            </Notice>
          )}
          {summary.s === "ready" && (
            <SummaryCard data={summary.data} onExternal={onExternal} />
          )}
        </aside>
      </div>
    </div>
  )
}

function SummaryCard({ data, onExternal }: { data: WikiSummary; onExternal: (url: string) => void }) {
  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
    >
      {data.thumb && (
        // A remote Wikimedia thumbnail of unknown dimensions; next/image would
        // buy nothing here and images.unoptimized is already on.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.thumb}
          alt=""
          className="h-36 w-full object-cover"
          style={{ background: "var(--os-hover)" }}
          onError={(e) => {
            e.currentTarget.hidden = true
          }}
        />
      )}
      <div className="px-4 py-4">
        <p className="text-[15px] font-semibold" style={{ color: "var(--os-fg)" }}>
          {data.title}
        </p>
        {data.description && (
          <p className="mb-2 text-[11.5px] italic" style={{ color: "var(--os-muted)" }}>
            {data.description}
          </p>
        )}
        <p className="mb-3 text-[12.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
          {data.extract}
        </p>
        <button
          type="button"
          onClick={() => onExternal(data.page)}
          className="inline-flex items-center gap-1.5 text-[12px] hover:underline"
          style={{ color: "var(--os-accent)" }}
        >
          <ExternalLink size={12} /> Read it on Wikipedia
        </button>
        <p className="mt-3 text-[10.5px]" style={{ color: "var(--os-muted)" }}>
          Source: en.wikipedia.org REST summary API. Text is CC BY-SA.
        </p>
      </div>
    </div>
  )
}

function WikiArticle({
  title,
  onExternal,
  onSearch,
}: {
  title: string
  onExternal: (url: string) => void
  onSearch: (q: string, m: Mode) => void
}) {
  const [summary, retry] = useWikiSummary(title, true)

  return (
    <div className="mx-auto w-full max-w-[780px] px-5 py-6 sm:px-8">
      <p className="mb-3 flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--os-muted)" }}>
        <BookOpen size={12} /> en.wikipedia.org › wiki › {title.replace(/ /g, "_")}
      </p>

      {summary.s === "loading" && <Spinner label={`Loading “${title}”…`} />}

      {summary.s === "error" && (
        <Notice tone="warn" title="Nimbus could not load that page" onRetry={retry}>
          <p>{summary.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip label="Open externally" onClick={() => onExternal(wikiUrl(title))} />
            <Chip label={`Search the web for “${title}”`} onClick={() => onSearch(title, "web")} />
          </div>
        </Notice>
      )}

      {summary.s === "ready" && (
        <article>
          <h1 className="text-[26px] font-semibold tracking-tight" style={{ color: "var(--os-fg)" }}>
            {summary.data.title}
          </h1>
          {summary.data.description && (
            <p className="mb-4 text-[13px] italic" style={{ color: "var(--os-muted)" }}>
              {summary.data.description}
            </p>
          )}
          {summary.data.thumb && (
            // eslint-disable-next-line @next/next/no-img-element -- see SummaryCard
            <img
              src={summary.data.thumb}
              alt=""
              className="mb-4 max-h-64 rounded-xl object-contain"
              style={{ background: "var(--os-hover)" }}
              onError={(e) => {
                e.currentTarget.hidden = true
              }}
            />
          )}
          <p className="mb-5 text-[14px] leading-relaxed" style={{ color: "var(--os-fg)" }}>
            {summary.data.extract}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Solid
              label="Open externally"
              icon={<ExternalLink size={12} />}
              onClick={() => onExternal(summary.data.page)}
            />
            <Chip label="Search this PC instead" onClick={() => onSearch(title, "local")} />
          </div>
          <p className="mt-6 text-[11px]" style={{ color: "var(--os-muted)" }}>
            This is the REST summary only — the full article lives on Wikipedia and is not embeddable
            here. Text is CC BY-SA.
          </p>
        </article>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- github */

function GithubPage({
  onExternal,
  onSearch,
}: {
  onExternal: (url: string) => void
  onSearch: (q: string, m: Mode) => void
}) {
  const [gh, retry] = useGithub(true)
  const profileUrl = `https://github.com/${GITHUB_USER}`

  return (
    <div className="mx-auto w-full max-w-[860px] px-5 py-6 sm:px-8">
      <SourceNote>
        github.com sends <code>X-Frame-Options: deny</code>, so no browser can embed it — inside JP OS
        or anywhere else. What follows is fetched live from api.github.com instead: real profile and
        real repositories, not a mock-up of a page.
      </SourceNote>

      {gh.s === "loading" && <Spinner label="Fetching the GitHub profile…" />}

      {gh.s === "error" && (
        <Notice tone="warn" title="GitHub did not answer" onRetry={retry}>
          <p>{gh.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip label="Open GitHub externally" onClick={() => onExternal(profileUrl)} />
            <Chip label="Browse the projects app instead" onClick={() => onSearch("projects", "local")} />
          </div>
        </Notice>
      )}

      {gh.s === "ready" && (
        <>
          <header className="mb-6 flex flex-wrap items-center gap-4">
            <span
              className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-[20px] font-semibold"
              style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
            >
              {PROFILE.initials}
            </span>
            <div className="min-w-0">
              <h1 className="text-[20px] font-semibold" style={{ color: "var(--os-fg)" }}>
                {gh.data.user.name ?? gh.data.user.login}
              </h1>
              <p className="text-[13px]" style={{ color: "var(--os-muted)" }}>
                github.com/{gh.data.user.login}
              </p>
            </div>
            <div className="ml-auto">
              <Solid
                label="Open externally"
                icon={<ExternalLink size={12} />}
                onClick={() => onExternal(gh.data.user.htmlUrl)}
              />
            </div>
          </header>

          {gh.data.user.bio && (
            <p className="mb-4 text-[13px] leading-relaxed" style={{ color: "var(--os-fg)" }}>
              {gh.data.user.bio}
            </p>
          )}

          <dl className="mb-6 flex flex-wrap gap-x-6 gap-y-1.5 text-[12px]">
            {[
              { k: "Public repos", v: String(gh.data.user.publicRepos) },
              { k: "Followers", v: String(gh.data.user.followers) },
              { k: "Following", v: String(gh.data.user.following) },
              { k: "Member since", v: fmtDate(gh.data.user.createdAt) },
              ...(gh.data.user.location ? [{ k: "Location", v: gh.data.user.location }] : []),
              ...(gh.data.user.company ? [{ k: "Company", v: gh.data.user.company }] : []),
            ].map((row) => (
              <div key={row.k} className="flex items-center gap-1.5">
                <dt style={{ color: "var(--os-muted)" }}>{row.k}</dt>
                <dd className="font-semibold" style={{ color: "var(--os-fg)" }}>
                  {row.v}
                </dd>
              </div>
            ))}
          </dl>

          <h2 className="mb-3 text-[13px] font-semibold" style={{ color: "var(--os-fg)" }}>
            Most recently pushed{" "}
            <span style={{ color: "var(--os-muted)" }}>· {gh.data.repos.length} shown</span>
          </h2>

          {gh.data.repos.length === 0 ? (
            <Notice title="GitHub returned no public repositories.">
              <p>That is the API&rsquo;s answer for this account, reported as-is.</p>
            </Notice>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {gh.data.repos.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col rounded-lg p-3.5"
                  style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
                >
                  <button
                    type="button"
                    onClick={() => onExternal(r.htmlUrl)}
                    className="mb-1 self-start text-left text-[13px] font-semibold hover:underline"
                    style={{ color: "var(--os-accent)" }}
                  >
                    {r.name}
                    {r.fork && (
                      <span className="ml-1.5 text-[10.5px] font-normal" style={{ color: "var(--os-muted)" }}>
                        fork
                      </span>
                    )}
                  </button>
                  <p className="mb-3 flex-1 text-[12px]" style={{ color: "var(--os-muted)" }}>
                    {r.description ?? "No description on GitHub."}
                  </p>
                  <p
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]"
                    style={{ color: "var(--os-muted)" }}
                  >
                    {r.language && <span>● {r.language}</span>}
                    <span className="inline-flex items-center gap-1">
                      <Star size={11} /> {r.stars}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <GitBranch size={11} /> {r.forks}
                    </span>
                    <span>pushed {fmtDate(r.pushedAt)}</span>
                  </p>
                </div>
              ))}
            </div>
          )}

          <p className="mt-6 text-[11px]" style={{ color: "var(--os-muted)" }}>
            Live from api.github.com, unauthenticated.
            {gh.data.remaining === null
              ? " GitHub did not report a rate-limit budget on this response."
              : ` ${gh.data.remaining} of 60 requests left in this hour's budget.`}
          </p>
        </>
      )}
    </div>
  )
}

/* ----------------------------------------------------------- external */

function ExternalPage({
  url,
  onExternal,
  onSearch,
}: {
  url: string
  onExternal: (url: string) => void
  onSearch: (q: string, m: Mode) => void
}) {
  const host = hostOf(url)
  return (
    <div className="mx-auto w-full max-w-[620px] px-6 py-10">
      <p className="mb-4 text-[11.5px]" style={{ color: "var(--os-muted)" }}>
        {url}
      </p>
      <h1 className="mb-3 text-[22px] font-normal" style={{ color: "var(--os-fg)" }}>
        {host} can&rsquo;t be shown inside Nimbus
      </h1>
      <p className="mb-4 text-[13.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
        JP OS runs inside one web page, so a site can only appear here if it allows framing and
        cross-origin reads. Most don&rsquo;t — github.com, for one, sends{" "}
        <code>X-Frame-Options: deny</code>. Rather than fake a rendering of a page it never received,
        Nimbus hands it to the browser that can show it: yours.
      </p>
      <div className="mb-6 flex flex-wrap gap-2">
        <Solid label={`Open ${host} externally`} icon={<ExternalLink size={12} />} onClick={() => onExternal(url)} />
        <Chip label={`Search the web for “${host}”`} onClick={() => onSearch(host, "web")} />
        <Chip label="Search this PC instead" onClick={() => onSearch(host, "local")} />
      </div>
      <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
        The two origins Nimbus can genuinely read from a browser are en.wikipedia.org and
        api.github.com. Everything else is a link out, and it says so rather than pretending.
      </p>
    </div>
  )
}
