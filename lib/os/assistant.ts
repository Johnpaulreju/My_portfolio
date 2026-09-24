"use client"

/**
 * The grounded answer layer.
 *
 * Nimbus's "JP" mode and the Terminal's `ask` command are two front ends onto
 * this one module. Before it existed the browser app carried its own regex
 * cascade; that cascade's best instinct - refusing to invent anything that isn't
 * in lib/os/content.ts - is preserved here and everything else is rebuilt.
 *
 * Three rules hold the whole thing together:
 *
 *   1. Every sentence is assembled from content.ts. There is no other source of
 *      fact about Johnpaul in this file, and no fallback that pads an answer
 *      with plausible-sounding filler. When the profile doesn't say, the answer
 *      says the profile doesn't say.
 *   2. `ask()` is PURE. It reads no store, touches no DOM and runs no action.
 *      Actions are *proposed* as allowlisted capability descriptors; the UI
 *      decides whether to run them, and runs them through assistantInvoke().
 *   3. Guessing confidently is the worst possible outcome, so ambiguity is
 *      surfaced as a question back to the visitor rather than resolved silently.
 *
 * No React import, no side effects, deterministic for a given (question,
 * history) pair - which also makes it trivially testable from a shell.
 */

import { ALL_APPS } from "./app-meta"
import { capabilityButton, type CapabilityName } from "./capabilities"
import {
  ACHIEVEMENTS,
  LAB,
  PROFILE,
  PROJECTS,
  SKILL_GROUPS,
  TIMELINE,
  type Project,
} from "./content"

/* ============================================================ public API == */

export type AssistantAction = { capability: string; arg: string; label: string }

export type AssistantAnswer = {
  /** Plain prose, already grounded. Paragraphs separated by a blank line. */
  text: string
  /** Enumerable data lifted out of the prose so a UI can lay it out. */
  facts?: { label: string; value: string }[]
  /** Proposed, never performed. Always allowlisted by capabilities.ts. */
  actions?: AssistantAction[]
  /** Follow-up questions worth offering as chips. */
  suggestions?: string[]
  confidence: number
  /** True only when it genuinely does not know - not when it declines. */
  unknown?: boolean
}

export type AssistantTurn = { q: string; a: AssistantAnswer }

/* ========================================================= text plumbing == */

function list(items: string[], joiner = "and"): string {
  if (items.length === 0) return ""
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} ${joiner} ${items[1]}`
  return `${items.slice(0, -1).join(", ")} ${joiner} ${items[items.length - 1]}`
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

/** Trailing "." is stripped first so callers can pass content verbatim. */
const sentence = (s: string) => `${s.replace(/\s*\.\s*$/, "")}.`

/**
 * Capability descriptors are built through capabilities.ts so the allowlist stays
 * the single gate. `label` may be overridden where the raw argument is an opaque
 * id (a filesystem node id reads terribly on a button) - the capability and its
 * argument are never overridden, only the wording.
 */
function act(name: CapabilityName, arg = "", label?: string): AssistantAction | null {
  const button = capabilityButton(name, arg)
  if (!button) return null
  return { capability: button.name, arg: button.arg, label: label ?? button.label }
}

function acts(...xs: (AssistantAction | null)[]): AssistantAction[] | undefined {
  const out: AssistantAction[] = []
  for (const x of xs) {
    if (x && !out.some((o) => o.capability === x.capability && o.arg === x.arg)) out.push(x)
  }
  return out.length ? out : undefined
}

/* ==================================================== content, pre-chewed == */

const WORK = TIMELINE.filter((t) => t.kind === "work").sort((a, b) => b.year - a.year)
const STUDY = TIMELINE.filter((t) => t.kind === "education").sort((a, b) => b.year - a.year)
const BY_RECENCY = [...PROJECTS].sort(
  (a, b) => Number(b.year) - Number(a.year) || a.title.localeCompare(b.title),
)
const NEWEST = BY_RECENCY[0]
const CATEGORIES = Array.from(new Set(PROJECTS.map((p) => p.category)))
const PROJECT_YEARS = Array.from(new Set(PROJECTS.map((p) => p.year))).sort()
/** The only project whose own description carries a measured number. */
const MEASURED = PROJECTS.find((p) => /\d+\s*%/.test(p.desc))

const projectsIn = (category: string) => PROJECTS.filter((p) => p.category === category)
const projectsFrom = (year: string) => PROJECTS.filter((p) => p.year === year)

/** A named technology: from the skills grid, from a project stack, or both. */
type TechRef = {
  name: string
  /** Skill group label when it appears in the grid, otherwise null. */
  group: string | null
  level: number | null
  projects: Project[]
}

function splitStack(stack: string): string[] {
  return stack
    .split(/[·+,]|\band\b/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const TECHS: TechRef[] = (() => {
  const byKey = new Map<string, TechRef>()
  const put = (name: string, group: string | null, level: number | null) => {
    const key = name.toLowerCase()
    const existing = byKey.get(key)
    if (existing) {
      if (group && !existing.group) {
        existing.group = group
        existing.level = level
        existing.name = name
      }
      return
    }
    byKey.set(key, { name, group, level, projects: [] })
  }
  for (const g of SKILL_GROUPS) for (const i of g.items) put(i.name, g.label, i.level)
  for (const p of PROJECTS) for (const t of splitStack(p.stack)) put(t, null, null)
  for (const tech of Array.from(byKey.values())) {
    const needle = tech.name.toLowerCase()
    tech.projects = PROJECTS.filter((p) => p.stack.toLowerCase().includes(needle))
  }
  return Array.from(byKey.values())
})()

const TOP_SKILLS = SKILL_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))
  .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))

/**
 * The documents that ship with the desktop. These are facts about the
 * filesystem seed (lib/os/fs-store.ts), not claims about Johnpaul - the node ids
 * are real, so the assistant can offer to open them.
 */
type DocRef = { nodeId: string; name: string; where: string; what: string }

const DOCUMENTS: DocRef[] = [
  {
    nodeId: "seed-readme",
    name: "Readme.txt",
    where: "on the Desktop",
    what: "his own note on how this desktop works",
  },
  {
    nodeId: "seed-ideas",
    name: "ideas.txt",
    where: "in the My Notes folder",
    what: "a short list of what he wants to build next",
  },
  {
    nodeId: "seed-intro",
    name: "Meet Johnpaul.mp4",
    where: "on the Desktop",
    what: "a short intro video",
  },
]

/* ======================================================= the small lexicon == */

/** Normalised to lowercase words; "2D→3D" becomes "2d 3d", "Next.js" "next js". */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim()
}

const STOPWORDS = new Set([
  "a", "about", "all", "am", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by",
  "can", "could", "did", "do", "does", "for", "from", "get", "give", "got", "had", "has", "have",
  "he", "her", "here", "him", "his", "how", "i", "if", "in", "into", "is", "it", "its", "just",
  "like", "me", "much", "my", "of", "on", "or", "please", "s", "she", "should", "so", "some",
  "tell", "than", "that", "the", "their", "them", "then", "there", "these", "they", "this",
  "those", "to", "up", "us", "was", "we", "were", "what", "whats", "when", "which", "who", "whom",
  "why", "will", "with", "would", "you", "your",
])

/**
 * Cue synonyms. This table is about ENGLISH, never about Johnpaul - it maps the
 * many ways a visitor can phrase a question onto one canonical cue stem. It is
 * deliberately hand-written and small; an unmapped word simply falls through to
 * the stemmer and then to bounded edit distance.
 */
const SYNONYMS: Record<string, string> = {
  // identity
  // NB: the bare preposition "about" is deliberately absent. "Tell me more
  // about his work" is a work question, and treating "about" as an identity cue
  // made it tie with - and beat - every intent that question actually wanted.
  who: "who", name: "name", named: "name", initial: "name", call: "name", bio: "bio",
  biography: "bio", intro: "bio", introduction: "bio", profile: "bio", summary: "bio",
  overview: "bio", background: "bio", himself: "bio", yourself: "bio", person: "bio",
  describe: "bio",
  // making things
  build: "build", made: "build", make: "build", create: "build", develop: "build", ship: "build",
  write: "build", wrote: "build", code: "build", coded: "build", worked: "build",
  // projects
  project: "project", portfolio: "project", repo: "project", repository: "project",
  product: "project", side: "project",
  // skills
  skill: "skill", skillset: "skill", expertise: "skill", proficient: "skill", strength: "skill",
  competent: "skill", know: "know", knows: "know", familiar: "know", comfortable: "know",
  // stack
  stack: "stack", tech: "stack", technology: "stack", technologie: "stack", framework: "stack",
  language: "stack", tool: "stack", toolkit: "stack", library: "stack", librarie: "stack",
  // work
  work: "work", job: "work", career: "work", role: "work", position: "work", employ: "work",
  employer: "work", employment: "work", company: "work", companie: "work", intern: "work",
  internship: "work", experience: "work", history: "work", cv: "resume", resume: "resume",
  curriculum: "resume", vitae: "resume",
  // education
  education: "education", educated: "education", study: "education", studie: "education",
  studied: "education", college: "education", university: "education", uni: "education",
  degree: "education", school: "education", academic: "education", graduate: "education",
  graduated: "education", mca: "education", bca: "education",
  // achievements
  achievement: "achievement", award: "achievement", certificate: "achievement",
  certification: "achievement", certified: "achievement", cert: "achievement",
  prize: "achievement", honour: "achievement", honor: "achievement", accolade: "achievement",
  hackathon: "achievement", trophy: "achievement",
  // numbers
  metric: "metric", number: "metric", stat: "metric", statistic: "metric", result: "metric",
  impact: "metric", percentage: "metric", percent: "metric", roi: "metric", kpi: "metric",
  benchmark: "metric", accuracy: "metric", accurate: "metric", measurable: "metric",
  measured: "metric", proof: "metric", evidence: "metric",
  // lab
  lab: "lab", experiment: "lab", research: "lab", prototype: "lab", exploring: "lab",
  tinkering: "lab", wip: "lab", upcoming: "lab", next: "lab",
  // contact
  contact: "contact", hire: "contact", hiring: "contact", recruit: "contact",
  recruiter: "contact", email: "contact", mail: "contact", reach: "contact", phone: "contact",
  connect: "contact", message: "contact", linkedin: "contact", github: "contact",
  available: "available", availability: "available", freelance: "available",
  // place
  where: "location", location: "location", located: "location", based: "location",
  city: "location", country: "location", live: "location", living: "location",
  address: "location", region: "location", timezone: "location", remote: "location",
  relocate: "location", bangalore: "location", bengaluru: "location", india: "location",
  // documents
  document: "document", doc: "document", file: "document", pdf: "document", paper: "document",
  readme: "document", download: "document",
  // ranking / recency
  best: "best", favourite: "best", favorite: "best", top: "best", greatest: "best",
  proudest: "best", proud: "best", standout: "best", strongest: "best", flagship: "best",
  showcase: "best", impressive: "best", highlight: "best",
  newest: "latest", latest: "latest", recent: "latest", newer: "latest",
  current: "current", currently: "current", now: "current", nowadays: "current",
  today: "current", present: "current",
  // desktop verbs
  open: "open", launch: "open", start: "open", run: "open", boot: "open", fire: "open",
  show: "show", display: "show", find: "find", locate: "find", search: "find", look: "find",
  // machine
  dark: "dark", light: "light", theme: "theme", mode: "theme", appearance: "theme",
  wifi: "wifi", wi: "wifi", fi: "wifi", internet: "wifi", network: "wifi", online: "wifi",
  desktop: "desktop", lock: "lock",
  // meta
  help: "help", ask: "ask",
}

/** A deliberately small stemmer. Wrong in the classic ways, cheap and stable. */
function stem(word: string): string {
  const w = word
  if (w.length > 4 && /ies$/.test(w)) return `${w.slice(0, -3)}y`
  if (w.length > 4 && /ied$/.test(w)) return `${w.slice(0, -3)}y`
  if (w.length > 5 && /ying$/.test(w)) return `${w.slice(0, -4)}y`
  if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3)
  if (w.length > 4 && /(ch|sh|ss|x|z)es$/.test(w)) return w.slice(0, -2)
  if (w.length > 4 && /ed$/.test(w) && !/eed$/.test(w)) return w.slice(0, -2)
  if (w.length > 3 && /s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1)
  return w
}

/** Bounded Levenshtein. Returns true as soon as the budget can't be beaten. */
function withinEdits(a: string, b: string, max: number): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > max) return false
  let prev = new Array<number>(b.length + 1)
  let curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j += 1) prev[j] = j
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i
    let rowBest = curr[0]
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      if (curr[j] < rowBest) rowBest = curr[j]
    }
    if (rowBest > max) return false
    const swap = prev
    prev = curr
    curr = swap
  }
  return prev[b.length] <= max
}

/** Typo budget: none below 4 characters, one up to six, two beyond. */
const editBudget = (len: number) => (len < 4 ? 0 : len < 7 ? 1 : 2)

/* ======================================================== entity indexing == */

type EntityKind = "project" | "tech" | "app" | "category" | "org" | "lab" | "doc"

type Entity = {
  kind: EntityKind
  id: string
  label: string
  /** Normalised alias strings; the first is always the canonical label. */
  aliases: string[]
}

const APPS = ALL_APPS.map((a) => ({ id: a.id as string, label: a.short, title: a.title }))

/**
 * An alias that is one common English word is not evidence of anything. The
 * About Me app's id is literally "about", and while it stood as an alias every
 * "tell me more about it" resolved to "open the About app" - with enough
 * confidence to skip anaphora entirely. One-word stopword aliases are dropped;
 * the multi-word forms ("about me") survive and still resolve.
 */
const usableAlias = (alias: string): boolean => {
  if (!alias) return false
  const parts = alias.split(" ")
  return !(parts.length === 1 && STOPWORDS.has(parts[0]))
}

function buildEntities(): Entity[] {
  const out: Entity[] = []

  for (const p of PROJECTS) {
    out.push({
      kind: "project",
      id: p.id,
      label: p.title,
      aliases: Array.from(new Set([norm(p.title), norm(p.id)])).filter(usableAlias),
    })
  }

  for (const t of TECHS) {
    const techAliases = [norm(t.name)].filter(usableAlias)
    if (techAliases.length) out.push({ kind: "tech", id: t.name.toLowerCase(), label: t.name, aliases: techAliases })
  }

  for (const a of APPS) {
    out.push({
      kind: "app",
      id: a.id,
      label: a.label,
      aliases: Array.from(new Set([norm(a.label), norm(a.title), norm(a.id)])).filter(usableAlias),
    })
  }

  // Categories carry their slash-separated halves as aliases ("AI / ML" answers
  // to "ai" and to "ml") because that is how people actually type them.
  const catLabels = Array.from(new Set([...CATEGORIES, ...SKILL_GROUPS.map((g) => g.label)]))
  for (const c of catLabels) {
    const parts = c.split("/").map((s) => norm(s)).filter(Boolean)
    out.push({
      kind: "category",
      id: c,
      label: c,
      aliases: Array.from(new Set([norm(c), ...parts])).filter(usableAlias),
    })
  }

  for (const org of Array.from(new Set(TIMELINE.map((t) => t.org)))) {
    out.push({ kind: "org", id: org, label: org, aliases: [norm(org)].filter(usableAlias) })
  }

  for (const l of LAB) {
    out.push({ kind: "lab", id: l.title, label: l.title, aliases: [norm(l.title)].filter(usableAlias) })
  }

  for (const d of DOCUMENTS) {
    out.push({
      kind: "doc",
      id: d.nodeId,
      label: d.name,
      aliases: Array.from(new Set([norm(d.name), norm(d.name.replace(/\.[a-z0-9]+$/i, ""))])).filter(usableAlias),
    })
  }

  return out.filter((e) => e.aliases.length > 0)
}

const ENTITIES = buildEntities()

/**
 * Document frequency over alias tokens. A token that shows up across the index
 * ("ai", "assistant") carries less evidence than one that appears twice
 * ("tesseract", "minesweeper"), and this is measured rather than guessed.
 */
const TOKEN_DF: Record<string, number> = (() => {
  const df: Record<string, number> = {}
  for (const e of ENTITIES) {
    const seen = new Set<string>()
    for (const alias of e.aliases) for (const tok of alias.split(" ")) seen.add(tok)
    for (const tok of seen) df[tok] = (df[tok] ?? 0) + 1
  }
  return df
})()

function tokenWeight(token: string): number {
  const df = TOKEN_DF[token] ?? 1
  if (df >= 5) return 0.3
  if (df === 4) return 0.45
  if (df === 3) return 0.7
  return 1
}

/* ============================================================== the context == */

type SlotName = "project" | "tech" | "app" | "category" | "year" | "doc" | "lab" | "org"

type Slots = {
  project?: Project
  tech?: TechRef
  app?: { id: string; label: string }
  category?: string
  year?: string
  doc?: DocRef
  lab?: (typeof LAB)[number]
  org?: string
}

type FocusItem = { kind: EntityKind; id: string; label: string; turn: number }

type Ctx = {
  raw: string
  /** Normalised question, single-spaced. */
  q: string
  /** Space-padded normalised question, for word-boundary containment. */
  padded: string
  /** Normalised question with spaces removed, for "nextjs" style typing. */
  compact: string
  tokens: string[]
  /** Non-stopword tokens - what the question is actually *about*. */
  content: string[]
  /** Tokens plus their stems plus their synonym canonicals. Cue matching only. */
  canon: Set<string>
  canonList: string[]
  /**
   * Tokens and stems, with NO synonym expansion. Entity matching uses this and
   * never `canon`: the synonym table maps "linkedin" onto the cue "contact", and
   * while entity matching read `canon`, the word "linkedin" scored a perfect
   * match against the Contact app and answered "shall I open Contact?".
   */
  lexical: Set<string>
  slots: Slots
  /** The pronoun a slot was inherited through, e.g. "it". Null when typed. */
  resolvedFrom: string | null
  /** Set when a pronoun could mean several things - never resolved by guessing. */
  ambiguous: { kind: EntityKind; options: string[] } | null
  /** Set when a pronoun has nothing at all to point at. */
  dangling: boolean
}

/**
 * Deliberately narrow. "more", "one" and a bare "that" appear constantly in
 * questions that have a perfectly good subject of their own ("tell me more
 * about his work"), and treating those as referential produced far more false
 * clarifications than real ones.
 */
const PRONOUN = /\b(it|its|they|them)\b|\b(that|this|the same|the other) one\b|\bthe same\b/

function buildLexical(tokens: string[]): Set<string> {
  const out = new Set<string>()
  for (const t of tokens) {
    out.add(t)
    out.add(stem(t))
  }
  return out
}

function buildCanon(tokens: string[]): Set<string> {
  const canon = new Set<string>()
  for (const t of tokens) {
    canon.add(t)
    const s = stem(t)
    canon.add(s)
    const syn = SYNONYMS[t] ?? SYNONYMS[s]
    if (syn) canon.add(syn)
  }
  return canon
}

function hasCue(ctx: Ctx, cue: string): boolean {
  if (ctx.canon.has(cue)) return true
  if (cue.length < 4) return false
  const budget = editBudget(cue.length)
  if (budget === 0) return false
  for (const t of ctx.canonList) {
    if (t.length < 4) continue
    if (t.charCodeAt(0) !== cue.charCodeAt(0)) continue
    if (withinEdits(t, cue, budget)) return true
    const syn = SYNONYMS[t]
    if (syn === cue) return true
  }
  return false
}

function tokenPresent(ctx: Ctx, token: string): boolean {
  if (ctx.lexical.has(token) || ctx.lexical.has(stem(token))) return true
  if (token.length < 5) return false
  for (const t of ctx.tokens) {
    if (t.length < 5) continue
    if (t.charCodeAt(0) !== token.charCodeAt(0)) continue
    if (withinEdits(t, token, 1)) return true
  }
  return false
}

const containsPhrase = (padded: string, alias: string) => padded.includes(` ${alias} `)

/**
 * Fuzzy matching, for ENTITY NAMES ONLY. Cue words never come through here -
 * they get exact stems, then synonyms, then a tight edit budget. Names are the
 * one place where a visitor's spelling genuinely can't be predicted.
 */
function scoreAlias(alias: string, ctx: Ctx): number {
  const aliasTokens = alias.split(" ").filter(Boolean)
  if (aliasTokens.length === 0) return 0

  if (alias.length >= 2 && containsPhrase(ctx.padded, alias)) {
    // A literal hit is strong, but an alias that covers one word of a long
    // question is weaker evidence than one that covers the whole question.
    const share = aliasTokens.length / Math.max(1, ctx.content.length)
    return Math.min(1, 0.58 + 0.42 * share)
  }

  const compactAlias = alias.replace(/ /g, "")
  if (compactAlias.length >= 4 && ctx.compact.includes(compactAlias)) return 0.86

  let matchedWeight = 0
  let totalWeight = 0
  let matchedCount = 0
  let matchedContentful = 0
  for (const t of aliasTokens) {
    const w = tokenWeight(t)
    totalWeight += w
    if (tokenPresent(ctx, t)) {
      matchedWeight += w
      matchedCount += 1
      if (!STOPWORDS.has(t)) matchedContentful += 1
    }
  }
  // A bag-of-words hit made entirely of function words is not evidence of
  // anything: "tell me more about it" contains every token of "about me", and
  // scored a perfect match on the About app before this guard existed. The
  // contiguous-phrase branch above still catches the real "open about me".
  if (totalWeight === 0 || matchedCount === 0 || matchedContentful === 0) return 0
  const cover = matchedWeight / totalWeight
  const focus = matchedCount / Math.max(1, ctx.content.length)
  return 0.6 * cover + 0.4 * Math.min(1, focus)
}

const KIND_ORDER: EntityKind[] = ["project", "doc", "lab", "org", "tech", "category", "app"]

function matchEntities(ctx: Ctx, kinds: EntityKind[], min = 0.62, limit = 4) {
  const scored: { entity: Entity; score: number }[] = []
  for (const e of ENTITIES) {
    if (!kinds.includes(e.kind)) continue
    let best = 0
    for (const alias of e.aliases) best = Math.max(best, scoreAlias(alias, ctx))
    if (best >= min) scored.push({ entity: e, score: best })
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      KIND_ORDER.indexOf(a.entity.kind) - KIND_ORDER.indexOf(b.entity.kind) ||
      a.entity.label.localeCompare(b.entity.label),
  )
  return scored.slice(0, limit)
}

/* ================================================================ anaphora == */

const FOCUSABLE: EntityKind[] = ["project", "app", "doc"]

/** Canonical labels of 4+ characters found in a blob. "AI" never pins focus. */
function namesIn(blob: string): Entity[] {
  const padded = ` ${norm(blob)} `
  return ENTITIES.filter(
    (e) => FOCUSABLE.includes(e.kind) && e.aliases[0].length >= 4 && containsPhrase(padded, e.aliases[0]),
  )
}

/**
 * A short, typed focus stack recovered from the transcript.
 *
 * Two sources per turn, and only two: what the visitor asked, and the fact
 * table of the answer. The answer's prose is deliberately never read - an answer
 * about one project routinely names four others ("related work in the same
 * category: ..."), and reading it made every follow-up ambiguous.
 */
function buildFocus(history: AssistantTurn[]): FocusItem[] {
  const recent = history.slice(-3)
  const out: FocusItem[] = []
  recent.forEach((turn, index) => {
    const sources = [turn.q, (turn.a.facts ?? []).map((f) => `${f.label} ~ ${f.value}`).join(" ~ ")]
    const seen = new Set<string>()
    for (const source of sources) {
      for (const e of namesIn(source)) {
        const key = `${e.kind}:${e.id}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ kind: e.kind, id: e.id, label: e.label, turn: index })
      }
    }
  })
  return out
}

/* ============================================================== ctx build == */

function buildCtx(raw: string, history: AssistantTurn[]): Ctx {
  const q = norm(raw)
  const tokens = q.split(" ").filter(Boolean)
  const content = tokens.filter((t) => !STOPWORDS.has(t))
  const canon = buildCanon(tokens)

  const ctx: Ctx = {
    raw,
    q,
    padded: ` ${q} `,
    compact: q.replace(/ /g, ""),
    tokens,
    content,
    canon,
    canonList: Array.from(canon),
    lexical: buildLexical(tokens),
    slots: {},
    resolvedFrom: null,
    ambiguous: null,
    dangling: false,
  }

  // --- explicit slots -------------------------------------------------------
  const projectHit = matchEntities(ctx, ["project"], 0.66, 3)
  if (projectHit.length) {
    const top = projectHit[0]
    const runnerUp = projectHit[1]
    if (runnerUp && top.score - runnerUp.score < 0.06) {
      ctx.ambiguous = { kind: "project", options: projectHit.map((h) => h.entity.label) }
    } else {
      ctx.slots.project = PROJECTS.find((p) => p.id === top.entity.id)
    }
  }

  const docHit = matchEntities(ctx, ["doc"], 0.68, 1)
  if (docHit.length) ctx.slots.doc = DOCUMENTS.find((d) => d.nodeId === docHit[0].entity.id)

  const labHit = matchEntities(ctx, ["lab"], 0.66, 1)
  if (labHit.length) ctx.slots.lab = LAB.find((l) => l.title === labHit[0].entity.id)

  const orgHit = matchEntities(ctx, ["org"], 0.68, 1)
  if (orgHit.length) ctx.slots.org = orgHit[0].entity.id

  const techHit = matchEntities(ctx, ["tech"], 0.7, 1)
  if (techHit.length) ctx.slots.tech = TECHS.find((t) => t.name.toLowerCase() === techHit[0].entity.id)

  const catHit = matchEntities(ctx, ["category"], 0.66, 1)
  if (catHit.length) ctx.slots.category = catHit[0].entity.id

  const appHit = matchEntities(ctx, ["app"], 0.7, 1)
  if (appHit.length) {
    const app = APPS.find((a) => a.id === appHit[0].entity.id)
    if (app) ctx.slots.app = { id: app.id, label: app.label }
  }

  const year = /\b(?:19|20)\d{2}\b/.exec(q)
  if (year) ctx.slots.year = year[0]

  // --- anaphora -------------------------------------------------------------
  const hasExplicitEntity = Boolean(
    ctx.slots.project || ctx.slots.doc || ctx.slots.tech || ctx.slots.app ||
    ctx.slots.category || ctx.slots.lab || ctx.slots.org,
  )
  const pronoun = PRONOUN.exec(q)
  if (!hasExplicitEntity && !ctx.ambiguous && pronoun && !/\blatest\b/.test(q)) {
    const focus = buildFocus(history)
    if (focus.length === 0) {
      ctx.dangling = true
    } else {
      const newest = Math.max(...focus.map((f) => f.turn))
      const front = focus.filter((f) => f.turn === newest)
      // An app name in a question is usually incidental - "what projects does
      // he have" is not about the Projects app - so real subjects outrank it.
      const subjects = front.filter((f) => f.kind === "project" || f.kind === "doc")
      const pool = subjects.length ? subjects : front
      const unique = Array.from(new Map(pool.map((f) => [f.id, f])).values())
      if (unique.length === 1) {
        const only = unique[0]
        ctx.resolvedFrom = pronoun[0]
        if (only.kind === "project") ctx.slots.project = PROJECTS.find((p) => p.id === only.id)
        if (only.kind === "doc") ctx.slots.doc = DOCUMENTS.find((d) => d.nodeId === only.id)
        if (only.kind === "app") {
          const app = APPS.find((a) => a.id === only.id)
          if (app) ctx.slots.app = { id: app.id, label: app.label }
        }
      } else {
        ctx.ambiguous = { kind: unique[0].kind, options: unique.slice(0, 5).map((f) => f.label) }
      }
    }
  }

  return ctx
}

/* ========================================================= intent registry == */

type Intent = {
  id: string
  kind: "answer" | "act"
  /** OR of AND-groups: one group must match in full. */
  cues: string[][]
  /** Anchored forms. A hit here floors confidence at PATTERN_FLOOR. */
  patterns?: RegExp[]
  slots?: { name: SlotName; required?: boolean }[]
  /** Tie-break weight, also a small additive nudge. 0-10. */
  priority: number
  capability?: CapabilityName
  render: (ctx: Ctx) => AssistantAnswer
}

const PATTERN_FLOOR = 0.92
const ACCEPT = 0.52

function slotFilled(ctx: Ctx, name: SlotName): boolean {
  switch (name) {
    case "project": return Boolean(ctx.slots.project)
    case "tech": return Boolean(ctx.slots.tech)
    case "app": return Boolean(ctx.slots.app)
    case "category": return Boolean(ctx.slots.category)
    case "year": return Boolean(ctx.slots.year)
    case "doc": return Boolean(ctx.slots.doc)
    case "lab": return Boolean(ctx.slots.lab)
    case "org": return Boolean(ctx.slots.org)
  }
}

function scoreIntent(intent: Intent, ctx: Ctx): number {
  const slots = intent.slots ?? []
  for (const s of slots) if (s.required && !slotFilled(ctx, s.name)) return 0

  let best = 0
  for (const p of intent.patterns ?? []) {
    if (p.test(ctx.q)) {
      best = PATTERN_FLOOR
      break
    }
  }

  if (best < PATTERN_FLOOR) {
    for (const group of intent.cues) {
      if (group.length === 0) continue
      let hit = 0
      for (const cue of group) if (hasCue(ctx, cue)) hit += 1
      if (hit !== group.length) continue
      const coverage = Math.min(1, group.length / Math.max(1, ctx.content.length))
      best = Math.max(best, 0.45 + Math.min(0.3, group.length * 0.12) + 0.12 * coverage)
    }
  }

  if (best === 0) return 0
  const filled = slots.filter((s) => slotFilled(ctx, s.name)).length
  const slotBonus = slots.length ? 0.08 * (filled / slots.length) : 0
  return Math.min(0.99, best + intent.priority * 0.006 + slotBonus)
}

/* ---------------------------------------------------------------- renders -- */

const ASK_ME = [
  "What does he build?",
  "What's his tech stack?",
  "How do I reach him?",
]

function answer(a: Partial<AssistantAnswer> & { text: string }): AssistantAnswer {
  return { confidence: 0.75, ...a }
}

const projectFact = (p: Project) => ({
  label: p.title,
  value: `${p.stack} · ${p.year} — ${sentence(p.desc)}`,
})

const openProjects = () => act("open-app", "Projects")
const openContact = () => act("open-app", "Contact")

function renderIdentity(): AssistantAnswer {
  return answer({
    text:
      `${PROFILE.name} is an ${PROFILE.title} based in ${PROFILE.location}, and the line he leads ` +
      `with is "${PROFILE.tagline}"\n\n` +
      `On this profile that shows up as ${PROJECTS.length} projects spread across ` +
      `${list(CATEGORIES)}, ${WORK.length} ${plural(WORK.length, "role")} ` +
      `going back to ${WORK[WORK.length - 1].year}, and two degrees. What he actually leads with is ` +
      `speed: ${PROFILE.uvp.join(" ")}`,
    facts: [
      { label: "Name", value: PROFILE.name },
      { label: "Role", value: PROFILE.title },
      { label: "Based in", value: PROFILE.location },
      { label: "Signs off as", value: PROFILE.initials },
    ],
    actions: acts(act("open-app", "About Me"), act("open-app", "Resume")),
    suggestions: ["What does he build?", "Where has he worked?", "What's his tech stack?"],
    confidence: 0.9,
  })
}

function renderBuilds(): AssistantAnswer {
  const newest = BY_RECENCY.slice(0, 3)
  return answer({
    text:
      `He builds two things in parallel: models and the products they sit inside. Of the ` +
      `${PROJECTS.length} projects listed here, ` +
      `${list(CATEGORIES.map((c) => `${projectsIn(c).length} ${plural(projectsIn(c).length, "is", "are")} ${c}`))}` +
      `.\n\nThe three most recent give the clearest picture of where he is now.`,
    facts: newest.map(projectFact),
    actions: acts(openProjects(), act("open-app", "Skills")),
    suggestions: ["Show me his AI projects", "What's his newest project?", "What's his tech stack?"],
    confidence: 0.86,
  })
}

function renderStack(): AssistantAnswer {
  const top = TOP_SKILLS.slice(0, 3)
  return answer({
    text:
      `He groups his stack ${SKILL_GROUPS.length} ways — ${list(SKILL_GROUPS.map((g) => g.label))} — ` +
      `and rates himself highest on ${list(top.map((t) => `${t.name} (${t.level})`))}.\n\n` +
      `Python and the LLM tooling around it carry the AI side; React, Next.js and FastAPI carry the ` +
      `product side. Ask about any one of them and I'll tell you where it actually shows up.`,
    facts: SKILL_GROUPS.map((g) => ({
      label: g.label,
      value: `${[...g.items].sort((a, b) => b.level - a.level).map((i) => i.name).join(", ")} — ${g.hint}`,
    })),
    actions: acts(act("open-app", "Skills"), openProjects()),
    suggestions: ["Does he know React?", "What has he built with Python?", "How strong is his AI/ML?"],
    confidence: 0.88,
  })
}

function renderSkillArea(ctx: Ctx): AssistantAnswer {
  const label = ctx.slots.category
  const group = SKILL_GROUPS.find((g) => g.label === label)
  if (!group) return renderStack()
  const sorted = [...group.items].sort((a, b) => b.level - a.level)
  return answer({
    text:
      `${group.label} is one of his ${SKILL_GROUPS.length} groups; his own gloss on it is ` +
      `"${group.hint}". He lists ` +
      `${sorted.length} ${plural(sorted.length, "entry", "entries")} there, topping out at ` +
      `${sorted[0].name} on ${sorted[0].level} and bottoming out at ` +
      `${sorted[sorted.length - 1].name} on ${sorted[sorted.length - 1].level}. Those are his own ` +
      `self-ratings, not test scores.`,
    facts: sorted.map((i) => ({ label: i.name, value: `${i.level} / 100` })),
    actions: acts(act("open-app", "Skills")),
    suggestions: ["What's his full stack?", "Show me his AI projects", "What are his strongest skills?"],
    confidence: 0.85,
  })
}

function renderTopSkills(): AssistantAnswer {
  const top = TOP_SKILLS.slice(0, 5)
  const byGroup = SKILL_GROUPS.map((g) => ({
    label: g.label,
    best: [...g.items].sort((a, b) => b.level - a.level)[0],
  }))
  return answer({
    text:
      `By his own ratings the top five are ` +
      `${list(top.map((t) => `${t.name} (${t.level})`))}. Those are self-assessments on the profile, ` +
      `not benchmarks, so read them as where he'd put his own confidence.\n\n` +
      `Per group the leader is ` +
      `${list(byGroup.map((g) => `${g.best.name} in ${g.label}`))}.`,
    facts: top.map((t) => ({ label: t.name, value: `${t.level} / 100 — ${t.group}` })),
    actions: acts(act("open-app", "Skills"), openProjects()),
    suggestions: ["What has he built with Python?", "Show me his AI projects", "What's his full stack?"],
    confidence: 0.86,
  })
}

function renderTech(ctx: Ctx): AssistantAnswer {
  const tech = ctx.slots.tech
  if (!tech) return renderStack()
  const used = tech.projects
  const where = used.length === 0
    ? `No project on this profile lists it in its stack, though — so I can tell you he claims it, ` +
      `not where he shipped it.`
    : used.length === 1
      ? `It shows up in exactly one listed project: ${used[0].title}.`
      : `It shows up in ${used.length} of the listed projects — ${list(used.map((p) => p.title))}.`
  // "Yes —" only belongs on an actual yes/no question.
  const lead = /^(does|do|can|has|have|is|did|was)\b/.test(ctx.q) ? "Yes — " : ""

  if (tech.group && tech.level !== null) {
    return answer({
      text:
        `${lead}${tech.name} sits in his ${tech.group} group at ${tech.level} out of 100, self-rated. ` +
        `${where}`,
      facts: [
        { label: "Skill group", value: tech.group },
        { label: "Self-rating", value: `${tech.level} / 100` },
        { label: "Projects using it", value: used.length ? used.map((p) => p.title).join(", ") : "None listed" },
      ],
      actions: acts(act("open-app", "Skills"), openProjects()),
      suggestions: ["What's his full stack?", "What's his newest project?", "How do I reach him?"],
      confidence: 0.88,
    })
  }

  return answer({
    text:
      `${tech.name} isn't on his skills grid, so I won't put a number on it. ` +
      `${where.replace(/^It shows up in/, "It does show up in")} ` +
      `How deep that goes is a question for him.`,
    facts: used.map(projectFact),
    actions: acts(openProjects(), openContact()),
    suggestions: ["What's his full stack?", "Show me his AI projects", "How do I reach him?"],
    confidence: 0.78,
  })
}

function renderProjects(): AssistantAnswer {
  return answer({
    text:
      `There are ${PROJECTS.length} projects on this profile, dated ${PROJECT_YEARS[0]} to ` +
      `${PROJECT_YEARS[PROJECT_YEARS.length - 1]} and sorted into ${CATEGORIES.length} categories: ` +
      `${list(CATEGORIES)}.\n\n` +
      `Here are the ${Math.min(4, BY_RECENCY.length)} most recent. Name any of them and I'll go deeper, ` +
      `or ask for a category and I'll filter.`,
    facts: BY_RECENCY.slice(0, 4).map(projectFact),
    actions: acts(openProjects(), act("search", "projects")),
    suggestions: ["Show me his AI projects", "What's his newest project?", "Which one has real numbers?"],
    confidence: 0.85,
  })
}

function renderProjectDetail(ctx: Ctx): AssistantAnswer {
  const p = ctx.slots.project
  if (!p) return renderProjects()
  const siblings = projectsIn(p.category).filter((x) => x.id !== p.id)
  // Say out loud what the pronoun was taken to mean; a silent guess is the one
  // failure mode worth being noisy about.
  const lead = ctx.resolvedFrom ? `Reading "${ctx.resolvedFrom}" as ${p.title}. ` : ""
  return answer({
    text:
      `${lead}${p.title} is his ${p.year} entry under ${p.category}, built on ${p.stack}. ` +
      `His one-line description of it: "${sentence(p.desc)}"\n\n` +
      (siblings.length
        ? `That's the profile's whole record on it — the listing doesn't go deeper than a line each. ` +
          `Related work in the same category: ${list(siblings.map((s) => s.title))}.`
        : `That's the profile's whole record on it, and it's the only ${p.category} project listed.`),
    facts: [
      // Naming the subject here is not decoration: buildFocus() reads the fact
      // table to work out what a follow-up "it" refers to.
      { label: "Project", value: p.title },
      { label: "Stack", value: p.stack },
      { label: "Category", value: p.category },
      { label: "Year", value: p.year },
    ],
    actions: acts(openProjects(), act("search", p.title)),
    suggestions: [
      `What else did he build in ${p.year}?`,
      `Show me his ${p.category} projects`,
      "How do I reach him?",
    ],
    confidence: ctx.resolvedFrom ? 0.72 : 0.9,
  })
}

function renderCategory(ctx: Ctx): AssistantAnswer {
  const category = ctx.slots.category
  const hits = category ? projectsIn(category) : []
  if (!category || hits.length === 0) {
    // The label matched a skill group with no matching project category.
    if (category && SKILL_GROUPS.some((g) => g.label === category)) return renderSkillArea(ctx)
    return renderProjects()
  }
  const years = hits.map((h) => h.year).sort()
  const span =
    years[0] === years[years.length - 1]
      ? `all of them from ${years[0]}`
      : `running from ${years[0]} to ${years[years.length - 1]}`
  return answer({
    text:
      `${hits.length} of the ${PROJECTS.length} listed projects ${plural(hits.length, "is", "are")} ` +
      `${category}, ${span}.`,
    facts: hits.map(projectFact),
    actions: acts(openProjects(), act("search", category)),
    suggestions: [
      "What's his newest project?",
      "What's his tech stack?",
      `How many projects are there in total?`,
    ],
    confidence: 0.87,
  })
}

function renderYear(ctx: Ctx): AssistantAnswer {
  const year = ctx.slots.year ?? ""
  const hits = projectsFrom(year)
  const timeline = TIMELINE.filter((t) => String(t.year) === year)

  if (hits.length === 0 && timeline.length === 0) {
    return answer({
      text:
        `Nothing on this profile is dated ${year}. The projects run ${PROJECT_YEARS[0]}–` +
        `${PROJECT_YEARS[PROJECT_YEARS.length - 1]} and the timeline runs ` +
        `${TIMELINE[TIMELINE.length - 1].year}–${TIMELINE[0].year}.`,
      actions: acts(openProjects(), act("open-app", "Experience")),
      suggestions: ["What's his newest project?", "Where has he worked?", "What did he study?"],
      confidence: 0.8,
      unknown: true,
    })
  }

  const parts: string[] = []
  if (timeline.length) {
    parts.push(
      `In ${year} he was ${list(
        timeline.map((t) =>
          t.kind === "work" ? `${t.label} at ${t.org}` : `reading for his ${t.label} at ${t.org}`,
        ),
      )}.`,
    )
  }
  if (hits.length) {
    parts.push(
      `${hits.length} ${plural(hits.length, "project")} on the profile ${plural(hits.length, "carries", "carry")} ` +
      `that year.`,
    )
  } else {
    parts.push(`No projects on the profile carry that year.`)
  }

  return answer({
    text: parts.join(" "),
    facts: hits.map(projectFact),
    actions: acts(openProjects(), act("open-app", "Experience")),
    suggestions: ["What's his newest project?", "Where has he worked?", "What are his numbers?"],
    confidence: 0.85,
  })
}

function renderNewest(): AssistantAnswer {
  const alsoThatYear = projectsFrom(NEWEST.year).filter((p) => p.id !== NEWEST.id)
  return answer({
    text:
      `The newest thing listed is ${NEWEST.title}, dated ${NEWEST.year}: ` +
      `${NEWEST.desc.replace(/\.\s*$/, "")}, built on ${NEWEST.stack}.` +
      (alsoThatYear.length
        ? ` ${list(alsoThatYear.map((p) => p.title))} ${plural(alsoThatYear.length, "shares", "share")} ` +
          `the same year, so "newest" is by year, not by month — the profile doesn't record months.`
        : ` Nothing else on the profile carries ${NEWEST.year}.`),
    facts: [projectFact(NEWEST)],
    actions: acts(openProjects(), act("search", NEWEST.title)),
    suggestions: ["What's he working on now?", "What's in his lab?", "Show me his AI projects"],
    confidence: 0.88,
  })
}

function renderBest(): AssistantAnswer {
  const lines: { label: string; value: string }[] = []
  if (MEASURED) {
    lines.push({
      label: `${MEASURED.title} — the measured one`,
      value: `${MEASURED.stack} · ${MEASURED.year} — ${sentence(MEASURED.desc)}`,
    })
  }
  lines.push({
    label: `${NEWEST.title} — the most recent`,
    value: `${NEWEST.stack} · ${NEWEST.year} — ${sentence(NEWEST.desc)}`,
  })
  return answer({
    text:
      `He hasn't ranked them anywhere on this profile, and I'm not going to invent a ranking for him. ` +
      `What the data does support is two kinds of "stands out": the one with a number attached, and ` +
      `the one he did most recently.\n\n` +
      `If you want a judgement rather than a fact, that's a question for him directly.`,
    facts: lines,
    actions: acts(openProjects(), openContact()),
    suggestions: ["What are his numbers?", "What's his newest project?", "How do I reach him?"],
    confidence: 0.82,
  })
}

function renderExperience(): AssistantAnswer {
  const span = `${WORK[WORK.length - 1].year}–${WORK[0].year}`
  return answer({
    text:
      `${WORK.length} roles are on the timeline, ${span}. He's currently ${WORK[0].label} at ` +
      `${WORK[0].org}; before that, ${list(WORK.slice(1).map((w) => `${w.label} at ${w.org} (${w.year})`))}.\n\n` +
      `Each role on the profile comes with its own numbers rather than a job description.`,
    facts: WORK.map((w) => ({
      label: `${w.label} — ${w.org} (${w.year})`,
      value: sentence(w.facts.join("; ")),
    })),
    actions: acts(act("open-app", "Experience"), act("open-app", "Resume")),
    suggestions: ["What did he study?", "What are his numbers?", "Is he available for work?"],
    confidence: 0.88,
  })
}

function renderCurrentRole(): AssistantAnswer {
  const now = WORK[0]
  return answer({
    text:
      `As of the most recent entry on the timeline, ${now.year}, he's ${now.label} at ${now.org}. ` +
      `What that role records: ${sentence(now.facts.join("; "))}\n\n` +
      `The profile doesn't say whether that's still current today, so treat ${now.year} as the last ` +
      `date it can vouch for.`,
    facts: [
      { label: "Role", value: now.label },
      { label: "Organisation", value: now.org },
      { label: "Since", value: String(now.year) },
    ],
    actions: acts(act("open-app", "Experience"), openContact()),
    suggestions: ["What's his full work history?", "What's in his lab?", "How do I reach him?"],
    confidence: 0.85,
  })
}

function renderEducation(): AssistantAnswer {
  return answer({
    text:
      `${STUDY.length === 2 ? "Two degrees are" : `${STUDY.length} degrees are`} on the timeline: ` +
      `${list(STUDY.map((s) => `${s.label} at ${s.org} in ${s.year}`))}.\n\n` +
      `Neither entry stops at the qualification. ` +
      `${STUDY.map((s) => `The ${s.label} carries ${list(s.facts)}`).join(". ")}.`,
    facts: STUDY.map((s) => ({
      label: `${s.label} — ${s.org} (${s.year})`,
      value: sentence(s.facts.join("; ")),
    })),
    actions: acts(act("open-app", "Experience"), act("open-app", "Resume")),
    suggestions: ["Where has he worked?", "What are his certifications?", "What are his numbers?"],
    confidence: 0.9,
  })
}

function renderAchievements(): AssistantAnswer {
  const certs = ACHIEVEMENTS.filter((a) => a.icon === "badge")
  const gains = ACHIEVEMENTS.filter((a) => a.icon === "chart")
  const prizes = ACHIEVEMENTS.filter((a) => a.icon === "trophy")
  return answer({
    text:
      `${ACHIEVEMENTS.length} entries are listed — ` +
      `${list([
        `${prizes.length} ${plural(prizes.length, "competition placing")}`,
        `${certs.length} ${plural(certs.length, "certification")}`,
        `${gains.length} measured efficiency ${plural(gains.length, "gain")}`,
      ])}.\n\n` +
      `The one he puts first is ${prizes.length ? prizes[0].title : ACHIEVEMENTS[0].title}: ` +
      `${sentence(prizes.length ? prizes[0].detail : ACHIEVEMENTS[0].detail)}`,
    facts: ACHIEVEMENTS.map((a) => ({ label: a.title, value: a.detail })),
    actions: acts(act("open-app", "Awards"), act("open-app", "Resume")),
    suggestions: ["What are his numbers?", "What did he study?", "Where has he worked?"],
    confidence: 0.88,
  })
}

function renderMetrics(): AssistantAnswer {
  const numeric = ACHIEVEMENTS.filter((a) => /\d/.test(a.title))
  return answer({
    text:
      `The headline he puts on it is: ${sentence(PROFILE.uvp[2])} Those figures aren't free-floating — ` +
      `each one traces back to a role or an achievement on the profile.\n\n` +
      `The ICU predictor is the one project whose own description carries a number: ` +
      `${MEASURED ? sentence(MEASURED.desc) : "none listed."}`,
    facts: [
      ...WORK.map((w) => ({ label: `${w.org} (${w.year})`, value: sentence(w.facts.join("; ")) })),
      ...numeric.map((a) => ({ label: a.title, value: a.detail })),
    ],
    actions: acts(act("open-app", "Awards"), act("open-app", "Experience")),
    suggestions: ["Where has he worked?", "Which project has the 85% accuracy?", "How do I reach him?"],
    confidence: 0.86,
  })
}

function renderLab(): AssistantAnswer {
  return answer({
    text:
      `Two things are in the lab rather than the portfolio — unfinished, and labelled as such: ` +
      `${list(LAB.map((l) => `${l.title} at ${l.progress}%`))}.\n\n` +
      `They're the honest half of the profile: listed with progress bars instead of results, because ` +
      `there aren't results yet.`,
    facts: LAB.map((l) => ({ label: l.title, value: `${l.progress}% — ${sentence(l.note)}` })),
    actions: acts(act("open-app", "Lab"), openProjects()),
    suggestions: ["What's his newest project?", "What's he working on now?", "How do I reach him?"],
    confidence: 0.88,
  })
}

function renderLabItem(ctx: Ctx): AssistantAnswer {
  const l = ctx.slots.lab
  if (!l) return renderLab()
  const other = LAB.filter((x) => x.title !== l.title)
  return answer({
    text:
      `${l.title} is in the lab rather than the portfolio: ${sentence(l.note)} He puts it at ` +
      `${l.progress}% — which is the profile's way of saying it isn't finished, and there are no ` +
      `results to quote yet.` +
      (other.length ? ` The other one in there is ${list(other.map((x) => x.title))}.` : ``),
    facts: [
      { label: l.title, value: sentence(l.note) },
      { label: "Progress", value: `${l.progress}%` },
    ],
    actions: acts(act("open-app", "Lab"), openContact()),
    suggestions: ["What else is in his lab?", "What's his newest project?", "How do I reach him?"],
    confidence: 0.86,
  })
}

function renderOrg(ctx: Ctx): AssistantAnswer {
  const org = ctx.slots.org
  const entries = TIMELINE.filter((t) => t.org === org).sort((a, b) => b.year - a.year)
  if (!org || entries.length === 0) return renderExperience()
  const e = entries[0]
  const verb = e.kind === "work" ? `worked there as ${e.label}` : `studied there for his ${e.label}`
  return answer({
    text:
      `${org} appears on the timeline at ${e.year} — he ${verb}. ` +
      `What the profile records from it: ${sentence(e.facts.join("; "))}\n\n` +
      `That's the whole entry; the timeline keeps one line per year rather than a full history.`,
    facts: entries.map((t) => ({
      label: `${t.label} (${t.year})`,
      value: sentence(t.facts.join("; ")),
    })),
    actions: acts(act("open-app", "Experience"), act("open-app", "Resume")),
    suggestions: ["What's his full work history?", "What did he study?", "What are his numbers?"],
    confidence: 0.87,
  })
}

function renderContact(): AssistantAnswer {
  return answer({
    text:
      `Email is the direct route — ${PROFILE.email} — and the Contact app in this desktop opens a ` +
      `composer pointed at it. He also lists a phone number, a GitHub and a LinkedIn.\n\n` +
      `Whether he's currently available isn't stated anywhere on this profile, so the honest answer ` +
      `to "is he free?" is: ask him.`,
    facts: [
      { label: "Email", value: PROFILE.email },
      { label: "Phone", value: PROFILE.phone },
      { label: "GitHub", value: PROFILE.github },
      { label: "LinkedIn", value: PROFILE.linkedin },
      { label: "Based in", value: PROFILE.location },
    ],
    actions: acts(openContact(), act("open-app", "Resume")),
    suggestions: ["Where is he based?", "What's his experience?", "What does he build?"],
    confidence: 0.92,
  })
}

function renderLocation(): AssistantAnswer {
  return answer({
    text:
      `${PROFILE.location}. That's the only geography on the profile — nothing here says anything ` +
      `about remote work, relocation or which hours he keeps, so I won't guess at any of it. ` +
      `Ask him directly and you'll get a real answer.`,
    facts: [
      { label: "Based in", value: PROFILE.location },
      { label: "Email", value: PROFILE.email },
    ],
    actions: acts(openContact()),
    suggestions: ["How do I reach him?", "Where has he worked?", "What does he build?"],
    confidence: 0.9,
  })
}

function renderName(): AssistantAnswer {
  return answer({
    text:
      `${PROFILE.name}, ${PROFILE.title}. He signs things "${PROFILE.initials}", and this whole ` +
      `desktop is named after those initials.`,
    facts: [
      { label: "Full name", value: PROFILE.name },
      { label: "Initials", value: PROFILE.initials },
    ],
    actions: acts(act("open-app", "About Me")),
    suggestions: ["Who is he?", "What does he build?", "How do I reach him?"],
    confidence: 0.9,
  })
}

function renderDocuments(ctx: Ctx): AssistantAnswer {
  const doc = ctx.slots.doc
  if (doc) {
    return answer({
      text:
        `${doc.name} is ${doc.where} — ${doc.what}. I can open it for you; it's one of his own files, ` +
        `so you can read and type in it, but it won't let you save over it.`,
      facts: [{ label: doc.name, value: `${doc.where.replace(/^(on|in) /, "")}` }],
      actions: acts(
        act("open-file", doc.nodeId, `Open ${doc.name}`),
        act("open-folder", "", "Open File Explorer"),
      ),
      suggestions: ["What other documents are there?", "Open his resume", "What does he build?"],
      confidence: 0.9,
    })
  }
  return answer({
    text:
      `Four things are worth opening. His resume has its own app on the desktop; the other three are ` +
      `real files you can browse to — ${list(DOCUMENTS.map((d) => d.name))}.\n\n` +
      `Anything else in File Explorer is yours, not his: the desktop lets you make your own files and ` +
      `keeps them in your browser.`,
    facts: [
      { label: "Resume", value: "Its own app on the desktop — a one-page CV" },
      ...DOCUMENTS.map((d) => ({ label: d.name, value: `${d.where} — ${d.what}` })),
    ],
    actions: acts(
      act("open-app", "Resume"),
      act("open-file", "seed-readme", "Open Readme.txt"),
      act("open-folder", "", "Open File Explorer"),
    ),
    suggestions: ["Open his resume", "What does he build?", "How do I reach him?"],
    confidence: 0.85,
  })
}

function renderOpenApp(ctx: Ctx): AssistantAnswer {
  const app = ctx.slots.app
  if (!app) return renderHelp()
  return answer({
    text: `${app.label} is right here — say the word and I'll open it.`,
    actions: acts(act("open-app", app.label)),
    suggestions: ["Show me the desktop", "What does he build?", "How do I reach him?"],
    confidence: 0.93,
  })
}

function renderResume(): AssistantAnswer {
  return answer({
    text:
      `His resume is an app on this desktop rather than a download — one page, ${PROFILE.title}, ` +
      `with the same timeline and numbers you'll find in Experience.`,
    facts: [
      { label: "Resume", value: `${PROFILE.name} — ${PROFILE.title}` },
      { label: "Email", value: PROFILE.email },
    ],
    actions: acts(act("open-app", "Resume"), openContact()),
    suggestions: ["What's his experience?", "What did he study?", "How do I reach him?"],
    confidence: 0.93,
  })
}

function renderTheme(ctx: Ctx): AssistantAnswer {
  const wantsLight = /\blight\b/.test(ctx.q) && !/\bdark\b/.test(ctx.q)
  const target = wantsLight ? "light" : "dark"
  return answer({
    text: `Sure — ${target} mode it is. The whole desktop repaints, including anything already open.`,
    actions: acts(
      act("set-theme", target),
      act("set-theme", target === "dark" ? "light" : "dark"),
    ),
    suggestions: ["Show me the desktop", "Open settings", "What does he build?"],
    confidence: 0.93,
  })
}

function renderWifi(ctx: Ctx): AssistantAnswer {
  const off = /\b(off|disable|disconnect|kill|stop)\b/.test(ctx.q)
  return answer({
    text:
      `The Wi-Fi in here is simulated — it drives the taskbar icon and the network flyout, not your ` +
      `actual connection. Happy to flip it ${off ? "off" : "on"} anyway.`,
    actions: acts(act("set-wifi", off ? "off" : "on"), act("open-app", "Settings")),
    suggestions: ["Show me the desktop", "Turn on dark mode", "What does he build?"],
    confidence: 0.9,
  })
}

function renderShowDesktop(): AssistantAnswer {
  return answer({
    text: `Minimising everything now — the windows go to the taskbar, nothing gets closed.`,
    actions: acts(act("show-desktop"), act("open-folder", "", "Open File Explorer")),
    suggestions: ["Turn on dark mode", "What documents are there?", "Who is he?"],
    confidence: 0.92,
  })
}

function renderLock(): AssistantAnswer {
  return answer({
    text: `Locking the desktop. Nothing is lost — the lock screen lets you straight back in.`,
    actions: acts(act("lock")),
    suggestions: ["Show me the desktop", "Turn on dark mode", "Who is he?"],
    confidence: 0.92,
  })
}

function renderFind(ctx: Ctx): AssistantAnswer {
  if (ctx.slots.doc) return renderDocuments(ctx)
  const term = ctx.content.filter((t) => !["find", "search", "look", "file", "open"].includes(t))
  const query = term.join(" ").trim()
  const near = matchEntities(ctx, ["doc", "project", "app"], 0.5, 3)
  return answer({
    text: query
      ? `Nothing on the desktop is called "${query}" as far as I can tell.` +
        (near.length ? ` The closest real ${plural(near.length, "name")}: ${list(near.map((n) => n.entity.label))}.` : ``) +
        ` File Explorer will show you everything that is there.`
      : `Tell me what to look for and I'll point at it — or open File Explorer and browse.`,
    actions: acts(
      act("open-folder", "", "Open File Explorer"),
      query ? act("search", query) : null,
    ),
    suggestions: ["What documents are there?", "Open his resume", "Who is he?"],
    confidence: query ? 0.6 : 0.7,
  })
}

function renderSearch(ctx: Ctx): AssistantAnswer {
  const stripped = ctx.content.filter((t) => !["search", "find", "look", "google", "web"].includes(t))
  const query = stripped.join(" ").trim() || ctx.q
  return answer({
    text: `I'll put "${query}" through Nimbus, which searches this profile and nothing else.`,
    actions: acts(act("search", query), openProjects()),
    suggestions: ["What does he build?", "What's his tech stack?", "How do I reach him?"],
    confidence: 0.82,
  })
}

function renderHelp(): AssistantAnswer {
  return answer({
    text:
      `I answer from one file — the profile content behind this desktop — and nothing else. That ` +
      `covers who ${PROFILE.name.split(" ")[0]} is, the ${PROJECTS.length} projects listed here, his ` +
      `stack, his timeline, his certifications and how to reach him.\n\n` +
      `I can also drive the desktop: open an app, switch the theme, find a file, show the desktop. ` +
      `When something isn't in the profile I'll tell you it isn't, rather than making it up.`,
    actions: acts(act("open-app", "About Me"), openProjects(), openContact()),
    suggestions: ASK_ME,
    confidence: 0.9,
  })
}

/** Questions that are perfectly reasonable and simply have no answer here. */
function renderOffProfile(topic: string): AssistantAnswer {
  return answer({
    text:
      `The profile says nothing about ${topic}. I only repeat what Johnpaul has actually published ` +
      `here, and inventing a plausible answer would be worse than no answer — so: I don't know.\n\n` +
      `He's reachable at ${PROFILE.email} if it matters.`,
    actions: acts(openContact()),
    suggestions: ASK_ME,
    confidence: 0.7,
    unknown: true,
  })
}

/* ------------------------------------------------------------- the registry -- */

const INTENTS: Intent[] = [
  {
    id: "help",
    kind: "answer",
    cues: [["help"], ["ask"]],
    patterns: [/^(help|what can (you|i) (do|ask)|how does this work|who are you|what are you)\b/],
    priority: 4,
    render: renderHelp,
  },
  {
    id: "identity",
    kind: "answer",
    cues: [["who"], ["bio"]],
    patterns: [
      /^who('?s| is| are)\b/,
      /\btell me about (him|johnpaul|jp|himself|the guy)\b/,
      /\bwho'?s behind\b/,
    ],
    priority: 3,
    render: renderIdentity,
  },
  {
    id: "name",
    kind: "answer",
    cues: [["name"]],
    patterns: [/\b(what'?s his name|his full name|what do the initials)\b/],
    priority: 5,
    render: renderName,
  },
  {
    id: "builds",
    kind: "answer",
    cues: [["build"]],
    patterns: [/\bwhat does he (build|do|make)\b/],
    priority: 3,
    render: renderBuilds,
  },
  {
    id: "stack",
    kind: "answer",
    cues: [["stack"], ["skill"]],
    patterns: [/\b(tech stack|his stack|what stack)\b/],
    priority: 3,
    render: renderStack,
  },
  {
    id: "skill-area",
    kind: "answer",
    cues: [["skill"], ["stack"], ["strong"]],
    slots: [{ name: "category", required: true }],
    priority: 6,
    render: renderSkillArea,
  },
  {
    id: "tech-check",
    kind: "answer",
    cues: [["know"], ["stack"], ["build"], ["work"]],
    patterns: [/^(does|can|has|is) (he|johnpaul|jp)\b/, /\b(know|use|used|worked with|familiar with|good at) /],
    slots: [{ name: "tech", required: true }],
    priority: 8,
    render: renderTech,
  },
  {
    id: "projects",
    kind: "answer",
    cues: [["project"]],
    patterns: [/\b(what|which|how many) (projects|things has he)\b/, /\bhis projects\b/],
    priority: 2,
    render: renderProjects,
  },
  {
    id: "project-detail",
    kind: "answer",
    // "about"/"tell"/"what" are covered by the anchored patterns below; as cues
    // they only ever fired on prepositions.
    cues: [["project"], ["build"], ["stack"], ["bio"]],
    // Safe to anchor: the required slot means none of these can fire without a
    // project actually having been named (or inherited from the last turn).
    patterns: [
      /\b(tell me about|what is|what'?s|describe|more about|details? (on|about))\b/,
      /\b(stack|built (with|on)|made with|tech|written in|use[sd]?)\b/,
      /\b(what year|when did he|how old is)\b/,
    ],
    slots: [{ name: "project", required: true }],
    priority: 9,
    render: renderProjectDetail,
  },
  {
    id: "projects-by-category",
    kind: "answer",
    cues: [["project"], ["build"], ["show"]],
    patterns: [
      /\b(ai|ml|machine learning|computer vision|full stack|fullstack|automation)\b[\w\s]*\bprojects?\b/,
      /\bprojects?\b[\w\s]*\b(ai|ml|machine learning|computer vision|full stack|fullstack|automation)\b/,
    ],
    slots: [{ name: "category", required: true }],
    priority: 7,
    render: renderCategory,
  },
  {
    id: "projects-by-year",
    kind: "answer",
    cues: [["project"], ["build"], ["work"], ["happen"]],
    slots: [{ name: "year", required: true }],
    priority: 7,
    render: renderYear,
  },
  {
    id: "newest",
    kind: "answer",
    cues: [["latest"]],
    patterns: [/\b(newest|latest|most recent)\b/],
    priority: 6,
    render: renderNewest,
  },
  {
    id: "top-skills",
    kind: "answer",
    cues: [["best", "skill"], ["best", "stack"]],
    patterns: [/\b(strongest|best|top)\b[\w\s]*\b(skills?|tech|stack|languages?)\b/],
    priority: 9,
    render: renderTopSkills,
  },
  {
    id: "best",
    kind: "answer",
    cues: [["best"]],
    patterns: [/\b(best|favou?rite|most impressive|proudest|stand ?out)\b/],
    priority: 6,
    render: renderBest,
  },
  {
    id: "current-role",
    kind: "answer",
    cues: [["current", "work"], ["current", "build"], ["current"]],
    patterns: [/\b(what|where) (is|does) he (work|working|doing)\b.*\b(now|currently|today)\b/,
      /\bwhat'?s he (working on|doing) (now|currently|today|these days)\b/],
    priority: 7,
    render: renderCurrentRole,
  },
  {
    id: "experience",
    kind: "answer",
    cues: [["work"]],
    patterns: [/\b(work history|career|where has he worked|his experience|job history)\b/],
    priority: 3,
    render: renderExperience,
  },
  {
    id: "education",
    kind: "answer",
    cues: [["education"]],
    patterns: [/\b(where did he study|what did he study|his degree|his education)\b/],
    priority: 5,
    render: renderEducation,
  },
  {
    id: "achievements",
    kind: "answer",
    cues: [["achievement"]],
    patterns: [/\b(certifications?|awards?|achievements?|hackathons?)\b/],
    priority: 5,
    render: renderAchievements,
  },
  {
    id: "metrics",
    kind: "answer",
    cues: [["metric"]],
    patterns: [/\b(\d+\s*%|hard numbers|real numbers|measurable|what numbers)\b/],
    priority: 5,
    render: renderMetrics,
  },
  {
    id: "lab",
    kind: "answer",
    cues: [["lab"]],
    patterns: [/\b(in his lab|working on next|what'?s next|in progress|experiments?)\b/],
    priority: 5,
    render: renderLab,
  },
  {
    id: "lab-item",
    kind: "answer",
    cues: [["lab"], ["build"], ["bio"], ["project"], ["latest"]],
    patterns: [/\b(tell me about|what is|what'?s|describe|how far|progress|status of)\b/],
    slots: [{ name: "lab", required: true }],
    priority: 9,
    render: renderLabItem,
  },
  {
    id: "org",
    kind: "answer",
    cues: [["work"], ["bio"], ["education"], ["metric"], ["build"]],
    patterns: [/\b(tell me about|what is|what'?s|describe|what did he do|his time at|how long)\b/],
    slots: [{ name: "org", required: true }],
    priority: 9,
    render: renderOrg,
  },
  {
    id: "contact",
    kind: "answer",
    cues: [["contact"], ["available"]],
    patterns: [
      /\b(how (do|can) i (reach|contact|email)|is he available|can i hire|get in touch)\b/,
      // "number" alone stems to the metrics cue; a phone number is not a metric.
      /\b(phone|mobile|whatsapp|email address|his (e-?mail|number)|number to (call|reach))\b/,
    ],
    priority: 4,
    render: renderContact,
  },
  {
    id: "location",
    kind: "answer",
    cues: [["location"]],
    patterns: [/\bwhere (is|does) he (live|based|located)\b/],
    priority: 5,
    render: renderLocation,
  },
  {
    id: "documents",
    kind: "answer",
    cues: [["document"]],
    patterns: [/\b(what (documents|files)|any (documents|files)|what'?s on the desktop)\b/],
    priority: 5,
    render: renderDocuments,
  },
  {
    id: "resume",
    kind: "act",
    capability: "open-app",
    cues: [["resume"], ["resume", "open"]],
    patterns: [/\b(open|show|see|get|download|view)\b[\w\s]*\b(resume|cv)\b/, /\bhis (resume|cv)\b/],
    priority: 8,
    render: renderResume,
  },
  {
    id: "open-app",
    kind: "act",
    capability: "open-app",
    cues: [["open"], ["show"], ["launch"]],
    patterns: [/^(open|launch|start|run|boot)\b/],
    slots: [{ name: "app", required: true }],
    priority: 6,
    render: renderOpenApp,
  },
  {
    id: "theme",
    kind: "act",
    capability: "set-theme",
    cues: [["theme"], ["dark"], ["light"]],
    patterns: [
      /\b(dark|light) (mode|theme)\b/,
      /\b(switch|change|turn on|turn off|toggle)\b[\w\s]*\b(theme|mode)\b/,
      /\b(make|switch|turn|go|set)\b[\w\s]{0,12}\b(dark|light)\b/,
    ],
    priority: 7,
    render: renderTheme,
  },
  {
    id: "wifi",
    kind: "act",
    capability: "set-wifi",
    cues: [["wifi"]],
    patterns: [/\b(wi ?fi|internet|network)\b[\w\s]*\b(on|off)\b/, /\b(turn|switch)\b[\w\s]*\bwi ?fi\b/],
    priority: 7,
    render: renderWifi,
  },
  {
    id: "show-desktop",
    kind: "act",
    capability: "show-desktop",
    cues: [["show", "desktop"], ["desktop", "minimise"], ["desktop", "minimize"]],
    patterns: [/\b(show|go to|back to|clear)\b[\w\s]*\bdesktop\b/, /\bminimi[sz]e (everything|all)\b/],
    priority: 8,
    render: renderShowDesktop,
  },
  {
    id: "lock",
    kind: "act",
    capability: "lock",
    cues: [["lock"]],
    patterns: [/\block (the )?(screen|desktop|machine|it)\b/, /^lock\b/],
    priority: 8,
    render: renderLock,
  },
  {
    id: "find-file",
    kind: "act",
    capability: "open-file",
    cues: [["find", "document"], ["find", "open"]],
    patterns: [/^(find|locate|open) [\w .-]+\.(txt|md|pdf|mp4|doc|docx|zip)\b/, /^(find|locate) /],
    priority: 6,
    render: renderFind,
  },
  {
    id: "search",
    kind: "act",
    capability: "search",
    cues: [["find"]],
    patterns: [/^(search|look up|google)\b/],
    priority: 4,
    render: renderSearch,
  },
]

/** Topics people reasonably ask about that the profile simply doesn't carry. */
const OFF_PROFILE: { pattern: RegExp; topic: string }[] = [
  { pattern: /\b(age|how old is he|birthday|born in|date of birth|dob)\b/, topic: "his age" },
  { pattern: /\b(salary|day rate|pay|cost|charges?|budget|pricing|compensation|ctc)\b/, topic: "money — rates, salary or budget" },
  { pattern: /\b(married|wife|girlfriend|spouse|family|kids|children|religion|caste|politics)\b/, topic: "his private life" },
  { pattern: /\b(hobby|hobbies|music|films?|movies?|sports?|football|cricket|favourite food|travel)\b/, topic: "what he does outside work" },
  { pattern: /\b(notice period|visa|sponsorship|relocat|willing to move)\b/, topic: "notice period, visas or relocation" },
  { pattern: /\b(password|login|credential|api key|secret|token)\b/, topic: "credentials of any kind" },
]

/* ==================================================================== ask == */

function greeting(): AssistantAnswer {
  return answer({
    text:
      `Ask me anything about ${PROFILE.name}. I read from the profile behind this desktop and ` +
      `nowhere else, so everything below is his own wording — and when a question falls outside it, ` +
      `I'll say so instead of guessing.`,
    suggestions: ASK_ME,
    actions: acts(act("open-app", "About Me"), openProjects()),
    confidence: 1,
  })
}

function clarify(ctx: Ctx): AssistantAnswer {
  const options = ctx.ambiguous?.options ?? []
  return answer({
    text:
      `I want to be sure I'm answering about the right one rather than picking for you. ` +
      `Did you mean ${list(options, "or")}?`,
    suggestions: options.map((o) => `Tell me about ${o}`),
    actions: acts(openProjects()),
    confidence: 0.45,
  })
}

function dangling(): AssistantAnswer {
  return answer({
    text:
      `I've lost the thread — there's nothing earlier in this conversation for that to point at. ` +
      `Name the project, the app or the topic and I'll pick it straight up.`,
    suggestions: ASK_ME,
    confidence: 0.35,
  })
}

function unknownAnswer(ctx: Ctx): AssistantAnswer {
  const near = matchEntities(ctx, ["project", "tech", "category", "lab", "doc"], 0.45, 3)
  const closest = near.length
    ? `\n\nThe closest things the profile does cover: ${list(near.map((n) => n.entity.label))}.`
    : ``
  return answer({
    text:
      `That isn't on this profile, and I only answer from what Johnpaul has actually published here — ` +
      `so I'd rather say "I don't know" than assemble something that sounds right.` +
      closest +
      `\n\nFor anything beyond the profile, ${PROFILE.email} reaches him directly.`,
    // ctx.q, not ctx.raw: norm() has already stripped everything but letters,
    // digits, + and #, so nothing markup-shaped can ride out on an action arg.
    actions: acts(openContact(), act("search", ctx.q.slice(0, 120))),
    suggestions: ASK_ME,
    confidence: near.length ? 0.3 : 0.18,
    unknown: true,
  })
}

/** "the icu predictor", "2019", "readme.txt" - a subject with no verb. */
function bareEntityAnswer(ctx: Ctx): AssistantAnswer | null {
  const soften = (a: AssistantAnswer): AssistantAnswer => ({
    ...a,
    confidence: Math.min(a.confidence, 0.7),
  })
  if (ctx.slots.project) return soften(renderProjectDetail(ctx))
  if (ctx.slots.doc) return soften(renderDocuments(ctx))
  if (ctx.slots.lab) return soften(renderLabItem(ctx))
  if (ctx.slots.org) return soften(renderOrg(ctx))
  if (ctx.slots.tech) return soften(renderTech(ctx))
  if (ctx.slots.category) return soften(renderCategory(ctx))
  if (ctx.slots.year) return soften(renderYear(ctx))
  if (ctx.slots.app) return soften(renderOpenApp(ctx))
  return null
}

/**
 * The one entry point. Pure: it returns an answer and a set of *proposed*
 * actions, and never performs any of them.
 */
export function ask(question: string, history: AssistantTurn[] = []): AssistantAnswer {
  if (typeof question !== "string" || question.trim().length === 0) return greeting()
  if (question.length > 400) {
    return answer({
      text:
        `That's a lot to hold at once. Ask it as one question — a project, a skill, a date, a way to ` +
        `reach him — and I'll answer it properly.`,
      suggestions: ASK_ME,
      confidence: 0.3,
    })
  }

  const ctx = buildCtx(question, Array.isArray(history) ? history : [])

  for (const off of OFF_PROFILE) {
    if (off.pattern.test(ctx.q)) return renderOffProfile(off.topic)
  }

  let bestIntent: Intent | null = null
  let bestScore = 0
  for (const intent of INTENTS) {
    const score = scoreIntent(intent, ctx)
    if (score > bestScore || (score === bestScore && bestIntent && intent.priority > bestIntent.priority)) {
      bestScore = score
      bestIntent = intent
    }
  }

  // Ambiguity beats a confident guess. Only a strongly-matched intent - one that
  // clearly doesn't hinge on the unresolved referent - is allowed through.
  if (ctx.ambiguous && bestScore < 0.85) return clarify(ctx)
  if (ctx.dangling && bestScore < 0.8) return dangling()

  // A named entity and no recognisable question still means "tell me about this".
  // Answering it beats a fallback, but it is a weaker read than a real intent, so
  // it only applies once every registered intent has declined.
  if (!bestIntent || bestScore < ACCEPT) {
    const bare = bareEntityAnswer(ctx)
    return bare ?? unknownAnswer(ctx)
  }

  // A named subject outranks a weak keyword hit that ignores it. "Sign-Language
  // Recognizer" contains "language", which stems onto the tech-stack cue and
  // otherwise won the question with a generic answer about his stack.
  if (bestScore < 0.75 && !(bestIntent.slots ?? []).some((slot) => slotFilled(ctx, slot.name))) {
    const bare = bareEntityAnswer(ctx)
    if (bare) return bare
  }

  const result = bestIntent.render(ctx)
  // The registry's score is the calibrated one; a render may lower it (an
  // inherited referent is less certain) but never raise it above its own claim.
  return { ...result, confidence: Math.min(result.confidence, Math.max(bestScore, 0.5)) }
}

/** Exposed for the Terminal's `ask` help text and Nimbus's empty state. */
export const SUGGESTED_QUESTIONS: string[] = [
  "Who is Johnpaul?",
  "What does he build?",
  "What's his tech stack?",
  "Show me his AI projects",
  "What's his newest project?",
  "Where has he worked?",
  "What did he study?",
  "What are his numbers?",
  "How do I reach him?",
]
