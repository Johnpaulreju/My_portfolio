"use client"

/**
 * jpsh - the Portfolio OS shell.
 *
 * This is not a canned script: every filesystem command operates on the real
 * zustand VFS (lib/os/fs-store), with a real current working directory, real
 * relative/absolute path resolution and real refusals when a write lands on one
 * of Johnpaul's own (locked) files. `open` launches real windows, `ps`/`kill`
 * list and close them, `net` reads the real network state.
 *
 * The one deliberate hardcoded palette in the app: a terminal is a terminal, so
 * the surface stays #0c0c0c with an ANSI-ish colour scheme in both themes.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import * as A from "@/lib/os/actions"
import { ask, SUGGESTED_QUESTIONS, type AssistantAction } from "@/lib/os/assistant"
import { assistantInvoke } from "@/lib/os/capabilities"
import { ACHIEVEMENTS, LAB, PROFILE, PROJECTS, SKILL_GROUPS, TIMELINE } from "@/lib/os/content"
import { useFS } from "@/lib/os/fs-store"
import { useWM } from "@/lib/os/wm-store"
import { HOME_SSID, useSystem, type NetStatus } from "@/lib/os/system-store"
import { useNotify } from "@/lib/os/notify-store"
import { ALL_APPS, APP_META } from "@/lib/os/app-meta"
import type { FSNode, Theme } from "@/lib/os/types"

/* ------------------------------------------------------------------ output */

type Tone = "out" | "dim" | "err" | "accent" | "info" | "warn" | "magenta"

type Line =
  | { t: "text"; s: string; tone: Tone }
  | { t: "prompt"; path: string; cmd: string }
  | { t: "split"; left: string; right: string; rightTone: Tone }
  | { t: "swatch" }
  /** Runnable examples. Clicking one types it at the prompt and executes it. */
  | { t: "chips"; items: string[] }

const TONE: Record<Tone, string> = {
  out: "#d4d4d4",
  dim: "#7c7c7c",
  err: "#f87171",
  accent: "#4ade80",
  info: "#7dd3fc",
  warn: "#fbbf24",
  magenta: "#d8b4fe",
}

const SWATCH = ["#4ade80", "#7dd3fc", "#fbbf24", "#f87171", "#d8b4fe", "#67e8f9", "#fda4af", "#d4d4d4"]

type Out = {
  say: (s?: string, tone?: Tone) => void
  err: (s: string) => void
  ok: (s: string) => void
  dim: (s: string) => void
  info: (s: string) => void
  warn: (s: string) => void
  split: (left: string, right: string, rightTone?: Tone) => void
  swatch: () => void
  chips: (items: string[]) => void
}

/** One writer for both the executor and the first-run tutorial. */
function makeOut(buf: Line[]): Out {
  return {
    say: (s = "", tone: Tone = "out") => buf.push({ t: "text", s, tone }),
    err: (s) => buf.push({ t: "text", s, tone: "err" }),
    ok: (s) => buf.push({ t: "text", s, tone: "accent" }),
    dim: (s) => buf.push({ t: "text", s, tone: "dim" }),
    info: (s) => buf.push({ t: "text", s, tone: "info" }),
    warn: (s) => buf.push({ t: "text", s, tone: "warn" }),
    split: (left, right, rightTone: Tone = "out") => buf.push({ t: "split", left, right, rightTone }),
    swatch: () => buf.push({ t: "swatch" }),
    chips: (items) => buf.push({ t: "chips", items }),
  }
}

/** Soft-wrap prose (the assistant writes paragraphs, not terminal columns). */
function wrap(text: string, width = 74): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return [""]
  const lines: string[] = []
  let cur = ""
  for (const w of words) {
    if (!cur) cur = w
    else if (cur.length + 1 + w.length <= width) cur += ` ${w}`
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

/* ------------------------------------------------------------- vfs helpers */

/** A directory handle: `null` is the Desktop root (`~`). */
type Dir = string | null

const alive = (n: FSNode) => !n.deletedAt

function kidsOf(nodes: FSNode[], parentId: Dir): FSNode[] {
  return nodes
    .filter((n) => n.parentId === parentId && alive(n))
    .sort((a, b) => {
      if (a.kind === "folder" && b.kind !== "folder") return -1
      if (b.kind === "folder" && a.kind !== "folder") return 1
      return a.name.localeCompare(b.name)
    })
}

function byId(nodes: FSNode[], id: Dir): FSNode | undefined {
  return id ? nodes.find((n) => n.id === id) : undefined
}

function pathOf(nodes: FSNode[], id: Dir): string {
  if (!id) return "~"
  const parts: string[] = []
  let cur: FSNode | undefined = nodes.find((n) => n.id === id)
  let guard = 0
  while (cur && guard++ < 64) {
    parts.unshift(cur.name)
    const parentId: Dir = cur.parentId
    cur = parentId ? nodes.find((n) => n.id === parentId) : undefined
  }
  return parts.length ? `~/${parts.join("/")}` : "~"
}

type Resolved = { ok: true; id: Dir } | { ok: false }

/** Real path resolution: absolute (`/`, `~`), relative, `.` and `..`. */
function resolvePath(nodes: FSNode[], cwd: Dir, raw: string): Resolved {
  let path = raw.trim()
  if (!path) return { ok: true, id: cwd }
  let cur: Dir = cwd
  if (path === "~" || path === "/") return { ok: true, id: null }
  if (path.startsWith("~/")) {
    cur = null
    path = path.slice(2)
  } else if (path.startsWith("/")) {
    cur = null
    path = path.slice(1)
  }
  for (const seg of path.split("/").filter(Boolean)) {
    if (seg === ".") continue
    if (seg === "..") {
      const here = byId(nodes, cur)
      cur = here ? here.parentId : null
      continue
    }
    const hit = kidsOf(nodes, cur).find((n) => n.name.toLowerCase() === seg.toLowerCase())
    if (!hit) return { ok: false }
    cur = hit.id
  }
  return { ok: true, id: cur }
}

/** Split "a/b/c.txt" into the parent directory and the final name. */
function splitLeaf(nodes: FSNode[], cwd: Dir, raw: string): { parent: Dir; name: string } | null {
  const path = raw.trim()
  const slash = path.lastIndexOf("/")
  if (slash < 0) return { parent: cwd, name: path }
  const head = path.slice(0, slash) || "/"
  const name = path.slice(slash + 1)
  const r = resolvePath(nodes, cwd, head)
  if (!r.ok) return null
  return { parent: r.id, name }
}

function sizeOf(n: FSNode): number {
  if (n.kind === "folder") return 4096
  if (n.kind === "video") return 5_242_880
  if (n.kind === "zip") return (n.zipOf ?? []).reduce((a, m) => a + (m.body?.length ?? 0), 0) + 512
  return (n.body ?? "").length
}

const human = (b: number) =>
  b < 1024 ? `${b}` : b < 1_048_576 ? `${(b / 1024).toFixed(1)}K` : `${(b / 1_048_576).toFixed(1)}M`

function stamp(ms: number): string {
  const d = new Date(ms)
  const mon = d.toLocaleString("en-US", { month: "short" })
  const day = String(d.getDate()).padStart(2, " ")
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${mon} ${day} ${hh}:${mm}`
}

/** Text a node yields to `cat` - `doc` bodies are HTML, so they get flattened. */
function textOf(n: FSNode): string {
  if (n.kind === "doc") {
    return (n.body ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim()
  }
  return n.body ?? ""
}

const toneFor = (n: FSNode): Tone =>
  n.kind === "folder" ? "info" : n.kind === "video" ? "magenta" : n.kind === "zip" ? "warn" : "out"

/* ------------------------------------------------------------- tokenizing */

type Tok = { text: string; start: number; end: number; quoted: boolean }

/** Quote-aware tokenizer that keeps source offsets, so TAB can rewrite in place. */
function tokenize(src: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i])) i++
    if (i >= src.length) break
    const start = i
    let quote: string | null = null
    let text = ""
    if (src[i] === '"' || src[i] === "'") {
      quote = src[i]
      i++
    }
    while (i < src.length) {
      const c = src[i]
      if (quote) {
        if (c === quote) {
          i++
          break
        }
        text += c
        i++
      } else {
        if (/\s/.test(c)) break
        text += c
        i++
      }
    }
    toks.push({ text, start, end: i, quoted: quote !== null })
  }
  return toks
}

/** `echo hi >out.txt` should behave like `echo hi > out.txt`. */
function normalizeRedirects(toks: Tok[]): string[] {
  const out: string[] = []
  for (const t of toks) {
    if (!t.quoted && /^>>?./.test(t.text)) {
      const op = t.text.startsWith(">>") ? ">>" : ">"
      out.push(op, t.text.slice(op.length))
    } else out.push(t.text)
  }
  return out
}

const quoteIfNeeded = (s: string) => (/\s/.test(s) ? `"${s}"` : s)

/* --------------------------------------------------------------- commands */

/**
 * The one command table.
 *
 * `help`, `help <category>`, `help <command>`, `man` and TAB completion are all
 * projections of this array - a command that is not in here is not completable,
 * not documented and not suggested, which keeps the four of them honest.
 */
type Category =
  | "filesystem"
  | "network"
  | "windows"
  | "applications"
  | "system"
  | "portfolio"
  | "ai"
  | "fun"

type Cmd = {
  name: string
  usage: string
  desc: string
  category: Category
  /** Other words that reach the same implementation and share this entry. */
  also?: string[]
}

const CATEGORY_ORDER: Category[] = [
  "filesystem",
  "network",
  "windows",
  "applications",
  "system",
  "portfolio",
  "ai",
  "fun",
]

const CATEGORY_LABEL: Record<Category, string> = {
  filesystem: "FILESYSTEM",
  network: "NETWORK",
  windows: "WINDOWS",
  applications: "APPLICATIONS",
  system: "SYSTEM",
  portfolio: "PORTFOLIO",
  ai: "AI",
  fun: "FUN",
}

const CATEGORY_HINT: Record<Category, string> = {
  filesystem: "the real VFS — every write lands on the desktop you can see",
  network: "the simulated radio, and the browser's honest veto over it",
  windows: "the real window manager",
  applications: "launching things",
  system: "state, identity and housekeeping",
  portfolio: "everything this machine knows about Johnpaul",
  ai: "the same grounded answers Nimbus gives",
  fun: "the drawer",
}

const CMDS: Cmd[] = [
  /* ------------------------------------------------------- filesystem -- */
  { name: "pwd", usage: "pwd", desc: "print the working directory", category: "filesystem" },
  { name: "ls", usage: "ls [-l] [path]", desc: "list a directory (-l for the long form)", category: "filesystem" },
  { name: "cd", usage: "cd <path>", desc: "change directory — .. and / and ~ all work", category: "filesystem" },
  { name: "tree", usage: "tree [path]", desc: "recursive view of everything below here", category: "filesystem" },
  { name: "mkdir", usage: "mkdir <name>", desc: "make a folder", category: "filesystem" },
  { name: "touch", usage: "touch <name>", desc: "make an empty text file", category: "filesystem" },
  { name: "cat", usage: "cat <file…>", desc: "print a file", category: "filesystem" },
  { name: "head", usage: "head [-n N] <file>", desc: "first lines of a file", category: "filesystem" },
  { name: "tail", usage: "tail [-n N] <file>", desc: "last lines of a file", category: "filesystem" },
  { name: "wc", usage: "wc <file>", desc: "count lines, words and characters", category: "filesystem" },
  { name: "stat", usage: "stat <path>", desc: "everything the VFS knows about a node", category: "filesystem" },
  { name: "du", usage: "du [path]", desc: "how much space the tree below here uses", category: "filesystem" },
  { name: "df", usage: "df", desc: "disk usage of the whole VFS", category: "filesystem" },
  { name: "find", usage: "find <pattern>", desc: "search names below the working directory", category: "filesystem" },
  { name: "grep", usage: "grep [-r] <pat> [file]", desc: "search inside text files", category: "filesystem" },
  { name: "rm", usage: "rm [-r] <name>", desc: "move to the Recycle Bin (soft delete)", category: "filesystem" },
  { name: "mv", usage: "mv <a> <b>", desc: "rename a node", category: "filesystem" },
  { name: "cp", usage: "cp <a> <b>", desc: "duplicate a node", category: "filesystem" },
  { name: "echo", usage: "echo <text> [> file]", desc: "print, or write / append (>>) to a file", category: "filesystem" },

  /* ---------------------------------------------------------- network -- */
  {
    name: "net",
    usage: "net [on|off|connect <ssid>|disconnect]",
    desc: "network status, and the radio itself — it is the real one",
    category: "network",
    also: ["ifconfig"],
  },
  { name: "ping", usage: "ping <host>", desc: "pretend packets, honest connectivity", category: "network" },

  /* ---------------------------------------------------------- windows -- */
  { name: "ps", usage: "ps", desc: "list running windows", category: "windows" },
  { name: "kill", usage: "kill <pid>", desc: "close a window", category: "windows" },
  {
    name: "window",
    usage: "window list|focus|minimize|maximize|close",
    desc: "drive the real window manager, by pid or app name",
    category: "windows",
  },

  /* ----------------------------------------------------- applications -- */
  { name: "open", usage: "open <file|folder|app>", desc: "launch a window", category: "applications" },
  { name: "edit", usage: "edit <file>", desc: "open a file in the right editor", category: "applications", also: ["vi"] },
  {
    name: "browser",
    usage: 'browser [open | search "<query>"]',
    desc: "open Nimbus, optionally on a search",
    category: "applications",
  },

  /* ----------------------------------------------------------- system -- */
  { name: "system", usage: "system", desc: "a live snapshot of the whole machine", category: "system" },
  { name: "theme", usage: "theme [dark|light]", desc: "switch the desktop theme", category: "system" },
  { name: "notify", usage: "notify <text>", desc: "raise a real system toast", category: "system" },
  { name: "neofetch", usage: "neofetch", desc: "the system card", category: "system" },
  { name: "jpfetch", usage: "jpfetch", desc: "the same card, but about the person who built it", category: "system" },
  { name: "uname", usage: "uname", desc: "boring but authentic", category: "system" },
  { name: "hostname", usage: "hostname", desc: "the name of this machine", category: "system" },
  { name: "env", usage: "env", desc: "the shell environment", category: "system" },
  { name: "whoami", usage: "whoami", desc: "who you are here", category: "system" },
  { name: "id", usage: "id", desc: "uid, gid and the groups you landed in", category: "system" },
  { name: "date", usage: "date", desc: "the time, from your own clock", category: "system" },
  { name: "uptime", usage: "uptime", desc: "how long this session has run", category: "system" },
  { name: "history", usage: "history", desc: "everything you have typed", category: "system" },
  { name: "alias", usage: "alias", desc: "the shortcuts this shell ships with", category: "system" },
  { name: "man", usage: "man <command>", desc: "one-line manual for a command", category: "system" },
  { name: "help", usage: "help [category|command]", desc: "the command table, by group", category: "system" },
  { name: "tutorial", usage: "tutorial", desc: "the first-run walkthrough, again", category: "system" },
  { name: "clear", usage: "clear", desc: "wipe the screen (Ctrl+L)", category: "system" },
  { name: "exit", usage: "exit", desc: "close this terminal", category: "system" },

  /* -------------------------------------------------------- portfolio -- */
  { name: "about", usage: "about", desc: "who Johnpaul is", category: "portfolio" },
  { name: "projects", usage: "projects [--all] [category]", desc: "shipped work", category: "portfolio" },
  { name: "skills", usage: "skills [area]", desc: "proficiency bars by area", category: "portfolio" },
  { name: "experience", usage: "experience", desc: "work and education timeline", category: "portfolio" },
  { name: "awards", usage: "awards", desc: "certifications and wins", category: "portfolio" },
  { name: "lab", usage: "lab", desc: "what is in progress right now", category: "portfolio" },
  { name: "contact", usage: "contact", desc: "email, phone, the usual", category: "portfolio" },
  { name: "social", usage: "social", desc: "github and linkedin", category: "portfolio" },
  { name: "resume", usage: "resume", desc: "open the resume window", category: "portfolio" },

  /* --------------------------------------------------------------- ai -- */
  {
    name: "ask",
    usage: 'ask "<question>"  ·  ask --do <n>',
    desc: "ask the grounded assistant, then run one of its offers",
    category: "ai",
  },

  /* -------------------------------------------------------------- fun -- */
  { name: "sudo", usage: "sudo <anything>", desc: "do not", category: "fun" },
  { name: "cowsay", usage: "cowsay <text>", desc: "a small animal repeats you", category: "fun" },
  { name: "fortune", usage: "fortune", desc: "unsolicited engineering wisdom", category: "fun" },
  { name: "coffee", usage: "coffee", desc: "brews something", category: "fun" },
  { name: "vim", usage: "vim / nano / emacs", desc: "an editor war, briefly", category: "fun", also: ["nano", "emacs"] },
  { name: "matrix", usage: "matrix", desc: "wake up", category: "fun" },
]

const ALIASES: Record<string, string> = {
  ll: "ls -l",
  la: "ls -l",
  dir: "ls",
  cls: "clear",
  "..": "cd ..",
  "...": "cd ../..",
  "~": "cd ~",
  bye: "exit",
  quit: "exit",
  who: "whoami",
  ff: "neofetch",
}

const COMMANDS = [
  ...CMDS.flatMap((c) => [c.name, ...(c.also ?? [])]),
  ...Object.keys(ALIASES),
]
  .filter((c, i, a) => c && a.indexOf(c) === i)
  .sort()

const CMD_BY_NAME = new Map<string, Cmd>()
for (const c of CMDS) {
  CMD_BY_NAME.set(c.name, c)
  for (const alt of c.also ?? []) CMD_BY_NAME.set(alt, c)
}

const isCategory = (v: string): v is Category =>
  (CATEGORY_ORDER as string[]).includes(v)

/**
 * Bounded Damerau-Levenshtein. It bails the moment a whole row is over the cap,
 * and it counts a swap as one edit - `cta` for `cat` is the typo people actually
 * make, and plain Levenshtein prices it at two.
 */
function distance(a: string, b: string, cap: number): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  let prev2: number[] = []
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1)
      }
      row.push(v)
      if (v < best) best = v
    }
    if (best > cap) return cap + 1
    prev2 = prev
    prev = row
  }
  return prev[b.length]
}

/**
 * "mkdr" -> "mkdir". Prefix hits first (the same rule TAB completion uses), then
 * near-misses within a typo's distance. Short words get a tighter cap so that
 * `ls` doesn't propose half the table.
 */
function suggest(input: string): string[] {
  const q = input.toLowerCase()
  if (!q) return []
  const cap = q.length <= 3 ? 1 : 2
  const prefix = COMMANDS.filter(
    (c) => c !== q && (c.startsWith(q) || (c.length > 2 && q.startsWith(c))),
  )
  const near = COMMANDS.filter((c) => c !== q && !prefix.includes(c))
    .map((c) => [c, distance(q, c, cap)] as const)
    .filter(([, d]) => d <= cap)
    .sort((x, y) => x[1] - y[1] || x[0].localeCompare(y[0]))
    .map(([c]) => c)
  return [...prefix, ...near].slice(0, 3)
}

/**
 * The honest refusal for every network command, one per state of
 * useSystem().status(). `online` is the only state that returns null.
 */
function netExcuse(status: NetStatus, ssid: string | null): { err: string; hint: string } | null {
  switch (status) {
    case "airplane":
      return {
        err: "Network is unreachable",
        hint: "airplane mode is on — switch it off in Quick Settings (the taskbar)",
      }
    case "radio-off":
      return { err: "Network is down", hint: "the Wi-Fi radio is off — run: net on" }
    case "disconnected":
      return {
        err: "Temporary failure in name resolution",
        hint: `the radio is on but not joined to anything — run: net connect "${HOME_SSID}"`,
      }
    case "connecting":
      return {
        err: "Network is unreachable",
        hint: `still associating with ${ssid ?? "the network"} — give it a second`,
      }
    case "no-internet":
      return {
        err: "Destination host unreachable",
        hint: "this machine is associated, but your browser reports no internet connection",
      }
    case "online":
      return null
  }
}

/** One manual page, from the one table. Returns false when there is no entry. */
function printMan(out: Out, query: string): boolean {
  // `man ll` should document ls, not shrug at a shortcut this shell ships with.
  const expansion = ALIASES[query]
  const cmd = CMD_BY_NAME.get(expansion ? expansion.split(/\s+/)[0] : query)
  if (!cmd) return false
  if (expansion) out.dim(`${query} is a shortcut for: ${expansion}`)
  out.info(`${cmd.name.toUpperCase()}(1)  ·  ${CATEGORY_LABEL[cmd.category]}`)
  out.say(`  ${cmd.usage}`)
  out.dim(`  ${cmd.desc}`)
  if (cmd.also?.length) out.dim(`  same command: ${cmd.also.join(", ")}`)
  const shortcuts = Object.entries(ALIASES)
    .filter(([, v]) => v.split(/\s+/)[0] === cmd.name)
    .map(([k]) => k)
  if (shortcuts.length) out.dim(`  aliases: ${shortcuts.join(", ")}`)
  return true
}

function printCategory(out: Out, cat: Category) {
  out.info(`  ${CATEGORY_LABEL[cat]}`)
  out.dim(`  ${CATEGORY_HINT[cat]}`)
  for (const c of CMDS.filter((x) => x.category === cat)) {
    out.split(`    ${c.usage.padEnd(44)}`, c.desc, "dim")
  }
  // `system` is both a group and a command; the group wins, so say where the
  // command's own page went rather than letting it look missing.
  if (CMD_BY_NAME.has(cat)) out.dim(`  (there is also a '${cat}' command — see: man ${cat})`)
  out.say("")
}

const FORTUNES = [
  "A cache with no invalidation strategy is just a bug with good latency.",
  "The model was fine. The data was the problem. It is always the data.",
  "Ship the ugly version. The pretty version never gets feedback.",
  "Every 'temporary' script outlives the system it was written for.",
  "If the demo works on the first try, you are looking at the wrong branch.",
  "Prompt engineering is just debugging with more politeness.",
  "The best abstraction is the one you were able to delete.",
  "Two hours of tinkering can save you ten minutes of reading the docs.",
]

const NEOFETCH_ART = [
  "┌────────────────┐",
  "│   ██   █████   │",
  "│   ██   ██  ██  │",
  "│   ██   █████   │",
  "│ █ ██   ██ ██   │",
  "│  ███   ██  ██  │",
  "└────────────────┘",
]

/** jpfetch's own panel - the monogram, drawn a little heavier. */
const JPFETCH_ART = [
  "╭──────────────╮",
  "│   ██  ██████ │",
  "│   ██  ██   ██│",
  "│   ██  ██████ │",
  "│ █ ██  ██     │",
  "│  ███  ██     │",
  "╰──────────────╯",
]

/* ------------------------------------------------------------------ shell */

const BOOT_AT = Date.now()

function uptimeText(): string {
  const s = Math.floor((Date.now() - BOOT_AT) / 1000)
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}, ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h} hour${h === 1 ? "" : "s"}, ${m % 60} minutes`
}

const MAX_LINES = 900

const TUTORIAL_KEY = "jp-os-jpsh-tutorial"

/**
 * Belt and braces for "never twice": the flag survives reloads, this survives a
 * remount (and React 18's double-invoked effect) even when storage is blocked.
 */
let tutorialShown = false

/** The five commands that show what this shell is, in the order they make sense. */
const TUTORIAL_CMDS = ["ls", "tree", "jpfetch", 'ask "what projects use AI?"', "open resume"]

/**
 * Shown once, ever. A terminal is a wall for most visitors, so the way in is a
 * row of buttons rather than a paragraph telling them to learn bash.
 */
function printTutorial(out: Out) {
  out.say("")
  out.ok("  First time here? You do not need to know a shell.")
  out.dim("  Click any of these and it runs, exactly as if you had typed it:")
  out.say("")
  out.chips(TUTORIAL_CMDS)
  out.say("")
  out.split("  help            ", "every command, grouped", "dim")
  out.split('  ask "…"         ', "plain-English questions about Johnpaul", "dim")
  out.split("  tutorial        ", "bring this back any time", "dim")
  out.say("")
}

const BANNER = (): Line[] => [
  { t: "text", s: "", tone: "out" },
  { t: "text", s: `  jpsh 1.0.0  ·  ${PROFILE.name}`, tone: "accent" },
  { t: "text", s: `  ${PROFILE.title} — ${PROFILE.tagline}`, tone: "dim" },
  { t: "text", s: "", tone: "out" },
  { t: "text", s: "  This shell is wired to the real desktop filesystem.", tone: "out" },
  {
    t: "text",
    s: "  Try: help · ls · jpfetch · system · window list · ask \"who is Johnpaul?\"",
    tone: "info",
  },
  { t: "text", s: "  TAB completes commands and filenames. Ctrl+L clears.", tone: "dim" },
  { t: "text", s: "", tone: "out" },
]

export function TerminalApp() {
  const [lines, setLines] = useState<Line[]>(BANNER)
  const [input, setInput] = useState("")
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [cwd, setCwd] = useState<Dir>(null)

  const nodes = useFS((s) => s.nodes)

  const cwdRef = useRef<Dir>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const caretRef = useRef<number | null>(null)
  /** The offers from the last `ask`, so `ask --do <n>` has something to point at. */
  const askRef = useRef<AssistantAction[]>([])
  /** Which window we live in - captured at mount, when we are the focused one. */
  const winIdRef = useRef<string | null>(null)

  useEffect(() => {
    cwdRef.current = cwd
  }, [cwd])

  useEffect(() => {
    const st = useWM.getState()
    const focused = st.windows.find((w) => w.id === st.focusedId)
    winIdRef.current =
      focused?.appId === "terminal"
        ? focused.id
        : st.windows
            .filter((w) => w.appId === "terminal")
            .sort((a, b) => b.z - a.z)[0]?.id ?? null
  }, [])

  // First run only. Blocked storage means "once per session" rather than never -
  // a visitor in a private window still deserves the way in.
  useEffect(() => {
    if (tutorialShown) return
    let seen = false
    try {
      seen = localStorage.getItem(TUTORIAL_KEY) === "1"
    } catch {
      seen = false
    }
    if (seen) return
    tutorialShown = true
    try {
      localStorage.setItem(TUTORIAL_KEY, "1")
    } catch {
      /* private mode - the module-level flag is the only guard we get */
    }
    const buf: Line[] = []
    printTutorial(makeOut(buf))
    setLines((prev) => [...prev, ...buf])
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [lines])

  // TAB rewrites the input, so the caret has to be restored after the re-render.
  useEffect(() => {
    if (caretRef.current === null) return
    const pos = caretRef.current
    caretRef.current = null
    inputRef.current?.setSelectionRange(pos, pos)
  }, [input])

  /** The directory a folder-ish path points at, or the cwd it fails back to. */
  const promptPath = (() => {
    if (cwd && !byId(nodes, cwd)) return "~"
    return pathOf(nodes, cwd)
  })()

  /* --------------------------------------------------------- the executor */

  const execute = useCallback((rawLine: string, hist: string[]) => {
    const buf: Line[] = []
    let clearScreen = false
    let dir: Dir = cwdRef.current

    const out = makeOut(buf)

    const refuse = (verb: string, name: string) => {
      out.err(`${verb}: cannot write '${name}': Permission denied`)
      out.dim(`  this is one of Johnpaul's own files — it is read-only on purpose.`)
      out.dim(`  try: cp ${quoteIfNeeded(name)} mycopy.txt   # then edit the copy freely`)
    }

    /** A single command, already alias-expanded. */
    const runOne = (segment: string) => {
      const toks = tokenize(segment)
      if (!toks.length) return
      const parts = normalizeRedirects(toks)
      let name = (parts[0] ?? "").toLowerCase()
      let args = parts.slice(1)

      const aliased = ALIASES[name]
      if (aliased) {
        const a = tokenize(aliased)
        name = a[0].text.toLowerCase()
        args = [...a.slice(1).map((t) => t.text), ...args]
      }

      const flags = new Set(args.filter((a) => a.startsWith("-") && a.length > 1 && !/^-\d/.test(a)))
      const positional = args.filter((a) => !flags.has(a))
      const joined = positional.join(" ")

      /** Reads are always taken fresh - an earlier command may have written. */
      const fs = () => useFS.getState()
      const tree = () => useFS.getState().nodes

      /**
       * Path arguments are forgiving: `cd My Notes` works even unquoted, because
       * nobody types quotes on a portfolio site.
       */
      const pathArg = (): string => {
        if (!positional.length) return ""
        const first = positional[0]
        if (positional.length === 1) return first
        const all = joined
        if (resolvePath(tree(), dir, all).ok) return all
        return first
      }

      const needNode = (p: string, verb: string): FSNode | null => {
        const r = resolvePath(tree(), dir, p)
        if (!r.ok || !r.id) {
          if (r.ok && !r.id) {
            out.err(`${verb}: ${p}: Is a directory`)
            return null
          }
          out.err(`${verb}: ${p}: No such file or directory`)
          return null
        }
        const n = byId(tree(), r.id)
        if (!n) {
          out.err(`${verb}: ${p}: No such file or directory`)
          return null
        }
        return n
      }

      switch (name) {
        /* ------------------------------------------------ navigation */
        case "pwd":
          out.say(pathOf(tree(), dir))
          break

        case "cd": {
          const target = pathArg() || "~"
          const r = resolvePath(tree(), dir, target)
          if (!r.ok) {
            out.err(`cd: no such file or directory: ${target}`)
            break
          }
          const n = byId(tree(), r.id)
          if (r.id && (!n || n.kind !== "folder")) {
            out.err(`cd: not a directory: ${target}`)
            break
          }
          dir = r.id
          break
        }

        case "ls": {
          const target = pathArg()
          const r = resolvePath(tree(), dir, target)
          if (!r.ok) {
            out.err(`ls: cannot access '${target}': No such file or directory`)
            break
          }
          const here = byId(tree(), r.id)
          if (r.id && here && here.kind !== "folder") {
            out.say(here.name, toneFor(here))
            break
          }
          const items = kidsOf(tree(), r.id)
          if (!items.length) {
            out.dim("  (empty)")
            break
          }
          const long = flags.has("-l") || flags.has("-la") || flags.has("-al")
          if (!long) {
            for (const n of items) {
              out.say(`  ${n.name}${n.kind === "folder" ? "/" : ""}`, toneFor(n))
            }
            out.dim(
              `  ${items.length} item${items.length === 1 ? "" : "s"} · ${
                items.filter((n) => n.kind === "folder").length
              } folder(s)`,
            )
            break
          }
          const widest = Math.max(4, ...items.map((n) => human(sizeOf(n)).length))
          out.dim(`total ${items.length}`)
          for (const n of items) {
            const mode =
              (n.kind === "folder" ? "d" : "-") + (n.locked ? "r--r--r--" : "rw-r--r--")
            const size = human(sizeOf(n)).padStart(widest)
            out.say(
              `${mode}  visitor  ${size}  ${stamp(n.modifiedAt)}  ${n.name}${
                n.kind === "folder" ? "/" : ""
              }`,
              toneFor(n),
            )
          }
          break
        }

        case "tree": {
          const target = pathArg()
          const r = resolvePath(tree(), dir, target)
          if (!r.ok) {
            out.err(`tree: ${target}: No such file or directory`)
            break
          }
          out.info(pathOf(tree(), r.id))
          let dirs = 0
          let files = 0
          const walk = (parent: Dir, prefix: string, depth: number) => {
            if (depth > 8) return
            const items = kidsOf(tree(), parent)
            items.forEach((n, i) => {
              const last = i === items.length - 1
              out.say(
                `${prefix}${last ? "└── " : "├── "}${n.name}${n.kind === "folder" ? "/" : ""}`,
                toneFor(n),
              )
              if (n.kind === "folder") {
                dirs++
                walk(n.id, `${prefix}${last ? "    " : "│   "}`, depth + 1)
              } else files++
            })
          }
          walk(r.id, "", 0)
          out.say("")
          out.dim(`${dirs} directories, ${files} files`)
          break
        }

        /* ------------------------------------------------- creating */
        case "mkdir": {
          if (!positional.length) {
            out.err("mkdir: missing operand")
            break
          }
          // Folder names here look like "My Notes", so the whole argument is one
          // name rather than several operands - quotes optional, Windows-style.
          const leaf = splitLeaf(tree(), dir, joined)
          if (!leaf || !leaf.name) {
            out.err(`mkdir: cannot create directory '${joined}': No such file or directory`)
            break
          }
          const clash = kidsOf(tree(), leaf.parent).find(
            (n) => n.name.toLowerCase() === leaf.name.toLowerCase(),
          )
          if (clash) {
            out.err(`mkdir: cannot create directory '${leaf.name}': File exists`)
            break
          }
          fs().create("folder", leaf.parent, leaf.name)
          out.ok(`created ${leaf.name}/`)
          break
        }

        case "touch": {
          if (!joined) {
            out.err("touch: missing file operand")
            break
          }
          const leaf = splitLeaf(tree(), dir, joined)
          if (!leaf || !leaf.name) {
            out.err(`touch: cannot touch '${joined}': No such file or directory`)
            break
          }
          const existing = kidsOf(tree(), leaf.parent).find(
            (n) => n.name.toLowerCase() === leaf.name.toLowerCase(),
          )
          if (existing) {
            if (existing.locked) {
              refuse("touch", existing.name)
              break
            }
            fs().setBody(existing.id, existing.body ?? "")
            out.dim(`touch: ${existing.name} timestamp updated`)
            break
          }
          const withExt = /\.[a-z0-9]{1,6}$/i.test(leaf.name) ? leaf.name : `${leaf.name}.txt`
          fs().create("text", leaf.parent, withExt, { body: "" })
          out.ok(`created ${withExt}`)
          break
        }

        case "cp": {
          if (positional.length < 2) {
            out.err("cp: missing destination file operand")
            out.dim("usage: cp <source> <destination>")
            break
          }
          const src = needNode(positional[0], "cp")
          if (!src) break
          if (src.kind === "folder") {
            out.err(`cp: -r not specified; omitting directory '${src.name}'`)
            break
          }
          const leaf = splitLeaf(tree(), dir, positional.slice(1).join(" "))
          if (!leaf || !leaf.name) {
            out.err(`cp: cannot create '${positional[1]}': No such file or directory`)
            break
          }
          fs().create(src.kind, leaf.parent, leaf.name, { body: src.body, src: src.src })
          out.ok(`copied ${src.name} → ${leaf.name}`)
          break
        }

        case "mv": {
          if (positional.length < 2) {
            out.err("mv: missing destination file operand")
            out.dim("usage: mv <source> <new name>")
            break
          }
          const src = needNode(positional[0], "mv")
          if (!src) break
          const destRaw = positional.slice(1).join(" ")
          const destDir = resolvePath(tree(), dir, destRaw)
          if (destDir.ok) {
            const asNode = byId(tree(), destDir.id)
            if (!destDir.id || asNode?.kind === "folder") {
              out.err(`mv: moving between folders isn't supported in this shell`)
              out.dim("  drag it in File Explorer instead — that part is real too")
              break
            }
          }
          const res = fs().rename(src.id, destRaw)
          if (!res.ok) {
            if (res.reason === "locked") refuse("mv", src.name)
            else out.err(`mv: cannot move '${src.name}': No such file or directory`)
            break
          }
          out.ok(`renamed ${src.name} → ${destRaw}`)
          break
        }

        case "rm": {
          const target = pathArg()
          if (!target) {
            out.err("rm: missing operand")
            break
          }
          if (target === "/" || target === "~" || target === "-rf" || joined === "-rf /") {
            out.warn("rm: I admire the commitment, but no.")
            out.dim("  (this desktop is somebody's CV)")
            break
          }
          const r = resolvePath(tree(), dir, target)
          if (!r.ok || !r.id) {
            out.err(`rm: cannot remove '${target}': No such file or directory`)
            break
          }
          const node = byId(tree(), r.id)
          if (!node) {
            out.err(`rm: cannot remove '${target}': No such file or directory`)
            break
          }
          if (node.kind === "folder" && !flags.has("-r") && !flags.has("-rf")) {
            out.err(`rm: cannot remove '${node.name}': Is a directory`)
            out.dim("  use: rm -r " + quoteIfNeeded(node.name))
            break
          }
          const res = fs().remove(node.id)
          if (!res.ok) {
            if (res.reason === "locked") {
              out.err(`rm: cannot remove '${node.name}': Permission denied`)
              out.dim("  this is one of Johnpaul's own files — it is read-only on purpose.")
              out.dim(`  try: cp ${quoteIfNeeded(node.name)} mycopy.txt`)
            } else out.err(`rm: cannot remove '${node.name}': No such file or directory`)
            break
          }
          if (dir === node.id) dir = node.parentId
          out.ok(`moved '${node.name}' to the Recycle Bin`)
          break
        }

        case "echo": {
          const gt = args.indexOf(">")
          const gtgt = args.indexOf(">>")
          const opIdx = gt >= 0 ? gt : gtgt
          const append = gt < 0 && gtgt >= 0
          if (opIdx < 0) {
            out.say(args.join(" "))
            break
          }
          const text = args.slice(0, opIdx).join(" ")
          const targetRaw = args.slice(opIdx + 1).join(" ")
          if (!targetRaw) {
            out.err("echo: syntax error near unexpected token `newline'")
            break
          }
          const leaf = splitLeaf(tree(), dir, targetRaw)
          if (!leaf || !leaf.name) {
            out.err(`echo: ${targetRaw}: No such file or directory`)
            break
          }
          const existing = kidsOf(tree(), leaf.parent).find(
            (n) => n.name.toLowerCase() === leaf.name.toLowerCase(),
          )
          if (existing) {
            if (existing.kind === "folder") {
              out.err(`echo: ${existing.name}: Is a directory`)
              break
            }
            const body = append ? `${existing.body ?? ""}${existing.body ? "\n" : ""}${text}` : text
            const res = fs().setBody(existing.id, body)
            if (!res.ok) {
              if (res.reason === "locked") refuse("echo", existing.name)
              else out.err(`echo: ${existing.name}: No such file or directory`)
              break
            }
            out.dim(`${append ? "appended to" : "wrote"} ${existing.name}`)
            break
          }
          const withExt = /\.[a-z0-9]{1,6}$/i.test(leaf.name) ? leaf.name : `${leaf.name}.txt`
          fs().create("text", leaf.parent, withExt, { body: text })
          out.ok(`wrote ${withExt}`)
          break
        }

        /* -------------------------------------------------- reading */
        case "cat": {
          if (!positional.length) {
            out.err("cat: missing file operand")
            break
          }
          const targets =
            positional.length > 1 && resolvePath(tree(), dir, joined).ok ? [joined] : positional
          for (const p of targets) {
            const n = needNode(p, "cat")
            if (!n) continue
            if (n.kind === "folder") {
              out.err(`cat: ${n.name}: Is a directory`)
              continue
            }
            if (n.kind === "video") {
              out.warn(`cat: ${n.name}: binary file (${human(sizeOf(n))}) — try: open ${quoteIfNeeded(n.name)}`)
              continue
            }
            const body = textOf(n)
            if (!body.trim()) out.dim(`(${n.name} is empty)`)
            else body.split("\n").forEach((l) => out.say(l))
          }
          break
        }

        case "head":
        case "tail": {
          const nFlagIdx = args.findIndex((a) => a === "-n")
          let count = 10
          let rest = positional
          if (nFlagIdx >= 0 && args[nFlagIdx + 1]) {
            count = Math.max(1, parseInt(args[nFlagIdx + 1], 10) || 10)
            rest = positional.filter((p) => p !== args[nFlagIdx + 1])
          }
          const n = needNode(rest.join(" ") || "", name)
          if (!n) break
          if (n.kind === "folder") {
            out.err(`${name}: ${n.name}: Is a directory`)
            break
          }
          const ls = textOf(n).split("\n")
          const slice = name === "head" ? ls.slice(0, count) : ls.slice(-count)
          slice.forEach((l) => out.say(l))
          break
        }

        case "wc": {
          const n = needNode(joined, "wc")
          if (!n) break
          const body = textOf(n)
          const words = body.split(/\s+/).filter(Boolean).length
          out.say(
            `${String(body.split("\n").length).padStart(6)} ${String(words).padStart(6)} ${String(
              body.length,
            ).padStart(7)}  ${n.name}`,
          )
          break
        }

        case "stat": {
          const target = pathArg()
          const r = resolvePath(tree(), dir, target)
          if (!r.ok) {
            out.err(`stat: cannot stat '${target}': No such file or directory`)
            break
          }
          if (!r.id) {
            out.info("  Desktop (VFS root)")
            out.split("  Kind", "folder")
            out.split("  Children", String(kidsOf(tree(), null).length))
            break
          }
          const n = byId(tree(), r.id)
          if (!n) {
            out.err(`stat: cannot stat '${target}': No such file or directory`)
            break
          }
          out.info(`  ${n.name}`)
          out.split("  Path", pathOf(tree(), n.id))
          out.split("  Kind", n.kind)
          out.split("  Size", `${human(sizeOf(n))} (${sizeOf(n)} bytes)`)
          out.split("  Access", n.locked ? "read-only (Johnpaul's own file)" : "read / write", n.locked ? "warn" : "accent")
          out.split("  Created", new Date(n.createdAt).toLocaleString())
          out.split("  Modified", new Date(n.modifiedAt).toLocaleString())
          out.split("  Inode", n.id)
          break
        }

        case "du": {
          const r = resolvePath(tree(), dir, pathArg())
          if (!r.ok) {
            out.err(`du: cannot access '${pathArg()}': No such file or directory`)
            break
          }
          let total = 0
          const walk = (parent: Dir, depth: number): number => {
            let sum = 0
            for (const n of kidsOf(tree(), parent)) {
              const own = n.kind === "folder" ? walk(n.id, depth + 1) : sizeOf(n)
              sum += own
              if (depth < 2) out.say(`${human(own).padStart(7)}  ${pathOf(tree(), n.id)}`, toneFor(n))
            }
            return sum
          }
          total = walk(r.id, 0)
          out.say(`${human(total).padStart(7)}  ${pathOf(tree(), r.id)}`, "accent")
          break
        }

        case "df": {
          const all = tree().filter(alive)
          const used = all.reduce((a, n) => a + sizeOf(n), 0)
          const cap = 64 * 1024 * 1024
          const pct = Math.min(99, Math.round((used / cap) * 100))
          out.say("Filesystem      Size   Used  Avail  Use%  Mounted on")
          out.say(
            `jpfs-vfs        64.0M  ${human(used).padStart(5)}  ${human(cap - used).padStart(
              5,
            )}  ${String(pct).padStart(3)}%  /`,
          )
          out.dim(`${all.length} live nodes · ${fs().trash().length} in the Recycle Bin`)
          break
        }

        case "find": {
          const needle = joined.toLowerCase()
          if (!needle) {
            out.err("find: missing search pattern")
            break
          }
          let hits = 0
          const walk = (parent: Dir, depth: number) => {
            if (depth > 8) return
            for (const n of kidsOf(tree(), parent)) {
              if (n.name.toLowerCase().includes(needle)) {
                out.say(`  ${pathOf(tree(), n.id)}`, toneFor(n))
                hits++
              }
              if (n.kind === "folder") walk(n.id, depth + 1)
            }
          }
          walk(dir, 0)
          if (!hits) out.dim(`find: nothing matching '${joined}'`)
          break
        }

        case "grep": {
          const recursive = flags.has("-r") || flags.has("-ri") || flags.has("-ir")
          if (!positional.length) {
            out.err("grep: missing pattern")
            out.dim("usage: grep [-r] <pattern> [file]")
            break
          }
          const needle = positional[0].toLowerCase()
          const fileArg = positional.slice(1).join(" ")
          const scan = (n: FSNode) => {
            if (n.kind === "folder" || n.kind === "video") return
            textOf(n)
              .split("\n")
              .forEach((l, i) => {
                if (l.toLowerCase().includes(needle))
                  out.say(`${n.name}:${i + 1}: ${l.trim()}`, "out")
              })
          }
          if (fileArg) {
            const n = needNode(fileArg, "grep")
            if (n) scan(n)
            break
          }
          const walk = (parent: Dir, depth: number) => {
            for (const n of kidsOf(tree(), parent)) {
              if (n.kind === "folder") {
                if (recursive && depth < 8) walk(n.id, depth + 1)
              } else scan(n)
            }
          }
          walk(dir, 0)
          break
        }

        /* -------------------------------------------------- windows */
        case "open": {
          const target = pathArg()
          if (!target) {
            out.err("open: missing operand")
            out.dim(`apps: ${ALL_APPS.map((a) => a.id).join(", ")}`)
            break
          }
          const r = resolvePath(tree(), dir, target)
          const node = r.ok ? byId(tree(), r.id) : undefined
          if (r.ok && !r.id) {
            const res = A.openFolder(null)
            if (!res.ok) out.err(`open: ${res.message}`)
            else out.ok("opening File Explorer at Desktop…")
            break
          }
          if (node) {
            // actions.openNode owns the routing - which app, which payload, which
            // title. The shell only knows that a node was asked for.
            const res = A.openNode(node.id)
            if (!res.ok) out.err(`open: ${res.message}`)
            else out.ok(`opening ${node.name}…`)
            break
          }
          const appId = A.resolveApp(target)
          if (!appId) {
            out.err(`open: ${target}: No such file, directory or app`)
            out.dim(`apps: ${ALL_APPS.map((a) => a.id).join(", ")}`)
            break
          }
          const res = A.openApp(appId)
          if (!res.ok) out.err(`open: ${res.message}`)
          else out.ok(`launching ${APP_META[appId].title}…`)
          break
        }

        case "edit":
        case "vi": {
          const n = needNode(pathArg(), "edit")
          if (!n) break
          if (n.kind === "folder") {
            out.err(`edit: ${n.name}: Is a directory`)
            break
          }
          const res = A.openNode(n.id)
          if (!res.ok) {
            out.err(`edit: ${res.message}`)
            break
          }
          const editor = A.resolveNodeTarget(n)
          const where = editor.kind === "editor" ? APP_META[editor.appId].short : "its own app"
          out.ok(`opening ${n.name} in ${where}…`)
          if (n.locked) out.dim(`  read-only — ${where} will offer to save your own copy.`)
          break
        }

        case "ps": {
          const ws = A.listWindows()
          out.dim("  PID   APP           STATE      TITLE")
          if (!ws.length) out.dim("  (no windows open — this one doesn't count, it's a tty)")
          for (const w of ws) {
            out.say(
              `  ${w.pid}  ${w.appId.padEnd(13)} ${w.state.padEnd(10)} ${w.title}`,
              w.state === "focused" ? "accent" : w.state === "minimized" ? "dim" : "out",
            )
          }
          break
        }

        case "kill": {
          const pid = parseInt(joined, 10)
          if (!pid) {
            out.err("kill: usage: kill <pid>   (see: ps)")
            break
          }
          const w = A.listWindows().find((x) => x.pid === pid)
          if (!w) {
            out.err(`kill: (${pid}) - No such process`)
            break
          }
          const res = A.closeWindow(w.id)
          if (!res.ok) out.err(`kill: ${res.message}`)
          else out.ok(`terminated ${w.appId} (${pid})`)
          break
        }

        /**
         * The window namespace talks to the same window list `ps` prints, through
         * actions.ts. Nothing here constructs or mirrors window state.
         */
        case "window": {
          const sub = (positional[0] ?? "list").toLowerCase()
          const rest = positional.slice(1).join(" ").trim()
          const ws = A.listWindows()

          if (sub === "list" || sub === "ls") {
            if (!ws.length) {
              out.dim("  no windows are open")
              break
            }
            out.dim("  PID   APP           STATE      TITLE")
            for (const w of ws) {
              out.say(
                `  ${w.pid}  ${w.appId.padEnd(13)} ${w.state.padEnd(10)} ${w.title}`,
                w.state === "focused" ? "accent" : w.state === "minimized" ? "dim" : "out",
              )
            }
            out.dim(`  ${ws.length} window${ws.length === 1 ? "" : "s"}`)
            break
          }

          if (!["focus", "minimize", "maximize", "close"].includes(sub)) {
            out.err(`window: unknown subcommand '${sub}'`)
            out.dim("usage: window <list|focus|minimize|maximize|close> [pid|app]")
            break
          }
          if (!rest) {
            out.err(`window ${sub}: which window? give a pid (see: window list) or an app name`)
            break
          }

          // Resolve by pid first, then by app name, then by a title substring.
          const asPid = parseInt(rest, 10)
          const byPid = Number.isFinite(asPid) ? ws.find((w) => w.pid === asPid) : undefined
          const appId = A.resolveApp(rest)
          const target =
            byPid ??
            (appId ? ws.find((w) => w.appId === appId) : undefined) ??
            ws.find((w) => w.title.toLowerCase().includes(rest.toLowerCase()))
          if (!target) {
            out.err(`window ${sub}: no open window matching '${rest}'`)
            if (ws.length) out.dim("  run: window list")
            break
          }

          const res =
            sub === "focus"
              ? A.focusWindow(target.id)
              : sub === "minimize"
                ? A.minimizeWindow(target.id)
                : sub === "maximize"
                  ? A.maximizeWindow(target.id)
                  : A.closeWindow(target.id)
          if (!res.ok) {
            out.err(`window ${sub}: ${res.message}`)
            break
          }
          const verb =
            sub === "focus"
              ? "focused"
              : sub === "minimize"
                ? "minimized"
                : sub === "maximize"
                  ? "toggled maximize on"
                  : "closed"
          out.ok(`${verb} ${target.appId} (${target.pid})`)
          break
        }

        case "browser": {
          const sub = (positional[0] ?? "").toLowerCase()
          if (sub === "search" || sub === "find") {
            const q = positional.slice(1).join(" ").trim()
            if (!q) {
              out.err("browser: missing query")
              out.dim('usage: browser search "ai projects"')
              break
            }
            const res = A.openApp("browser", { q })
            if (!res.ok) out.err(`browser: ${res.message}`)
            else out.ok(`searching Nimbus for “${q}”…`)
            break
          }
          if (sub && sub !== "open") {
            out.err(`browser: unknown subcommand '${sub}'`)
            out.dim('usage: browser [open | search "<query>"]')
            break
          }
          const res = A.openApp("browser")
          if (!res.ok) out.err(`browser: ${res.message}`)
          else out.ok("opening Nimbus…")
          break
        }

        case "theme": {
          const want = joined.toLowerCase()
          const res = want ? A.setTheme(want as Theme) : A.toggleTheme()
          if (!res.ok) {
            out.err(`theme: ${res.message}`)
            break
          }
          out.ok(`theme → ${res.value}`)
          break
        }

        case "notify": {
          const text = joined || "Hello from the terminal."
          useNotify.getState().push({
            appId: "terminal",
            source: "Terminal",
            title: "jpsh",
            body: text,
            sound: "notify",
          })
          out.dim("notification sent")
          break
        }

        case "net":
        case "ifconfig": {
          const sub = (positional[0] ?? "").toLowerCase()

          if (sub === "on" || sub === "off") {
            const res = A.setWifi(sub === "on")
            if (!res.ok) out.err(`net: ${res.message}`)
            else out.ok(`Wi-Fi radio → ${sub}`)
            break
          }
          if (sub === "connect") {
            const ssid = positional.slice(1).join(" ").trim()
            if (!ssid) {
              out.err("net: which network?")
              out.dim(`  in range: ${useSystem.getState().networks.map((n) => n.ssid).join(", ")}`)
              break
            }
            const res = A.connectToNetwork(ssid)
            if (!res.ok) out.err(`net: ${res.message}`)
            else out.dim(`associating with ${res.value}…`)
            break
          }
          if (sub === "disconnect") {
            A.disconnectNetwork()
            out.ok("disconnected")
            break
          }
          if (sub && sub !== "status") {
            out.err(`net: unknown subcommand '${sub}'`)
            out.dim("usage: net [on|off|connect <ssid>|disconnect]")
            break
          }

          const st = useSystem.getState()
          const status = st.status()
          out.info("  wlan0")
          out.split(
            "  Status",
            status,
            status === "online" ? "accent" : status === "connecting" ? "warn" : "err",
          )
          out.split("  Association", st.conn, st.conn === "connected" ? "accent" : "dim")
          out.split("  SSID", st.ssid ?? "—")
          out.split("  Wi-Fi radio", st.wifiOn ? "on" : "off", st.wifiOn ? "accent" : "err")
          out.split("  Airplane mode", st.airplane ? "on" : "off", st.airplane ? "warn" : "dim")
          out.split("  Browser reports", st.realOnline ? "online" : "offline", st.realOnline ? "dim" : "err")
          out.split("  Bluetooth", st.btOn ? "on" : "off")
          out.split("  Hotspot", st.hotspotOn ? "on" : "off")
          out.split("  Visible networks", String(st.networks.length))
          if (status !== "online") {
            const why = netExcuse(status, st.ssid)
            if (why) out.dim(`  ${why.hint}`)
          }
          break
        }

        case "ping": {
          const host = joined || "johnpaul.dev"
          const st = useSystem.getState()
          // status() is the only network truth in the app: it folds the radio, the
          // association and the browser's offline veto into one answer.
          const why = netExcuse(st.status(), st.ssid)
          if (why) {
            out.err(`ping: ${host}: ${why.err}`)
            out.dim(`  ${why.hint}`)
            break
          }
          out.say(`PING ${host} (203.0.113.7) 56(84) bytes of data.`)
          for (let i = 1; i <= 4; i++) {
            out.say(
              `64 bytes from ${host}: icmp_seq=${i} ttl=56 time=${(11 + Math.random() * 9).toFixed(
                1,
              )} ms`,
            )
          }
          out.dim("4 packets transmitted, 4 received, 0% packet loss")
          break
        }

        /* --------------------------------------------------- system */
        case "whoami":
          out.say("visitor")
          break

        case "id":
          out.say("uid=1000(visitor) gid=1000(guests) groups=1000(guests),27(curious)")
          break

        case "hostname":
          out.say("portfolio")
          break

        case "uname":
          out.say("PortfolioOS portfolio 11.0.0-web #1 SMP react-18 next-14 x86_64 GNU/Browser")
          break

        case "env":
          out.say("USER=visitor")
          out.say("HOME=/home/visitor")
          out.say("SHELL=/bin/jpsh")
          out.say("EDITOR=notepad")
          out.say(`PWD=${pathOf(tree(), dir)}`)
          out.say(`THEME=${useWM.getState().theme}`)
          out.say(`OWNER=${PROFILE.name}`)
          out.say(`CONTACT=${PROFILE.email}`)
          break

        case "date":
          out.say(new Date().toString())
          break

        case "uptime": {
          const s = useSystem.getState()
          out.say(
            ` ${new Date().toLocaleTimeString()}  up ${uptimeText()},  1 user,  load average: 0.${
              10 + Math.floor(Math.random() * 40)
            }, 0.21, 0.17`,
          )
          out.dim(`brightness ${s.brightness}% · volume ${s.muted ? "muted" : `${s.volume}%`}`)
          break
        }

        case "history": {
          if (!hist.length) out.dim("(nothing yet)")
          hist.forEach((h, i) => out.say(`${String(i + 1).padStart(4)}  ${h}`))
          break
        }

        case "alias":
          Object.entries(ALIASES).forEach(([k, v]) => out.split(`  ${k}`, `= ${v}`, "dim"))
          break

        case "clear":
          clearScreen = true
          break

        case "exit": {
          const id =
            winIdRef.current ??
            useWM
              .getState()
              .windows.filter((w) => w.appId === "terminal")
              .sort((a, b) => b.z - a.z)[0]?.id
          out.dim("logout")
          if (id) setTimeout(() => A.closeWindow(id), 120)
          break
        }

        case "help": {
          const q = joined.toLowerCase().trim()

          if (q && isCategory(q)) {
            out.say("")
            printCategory(out, q)
            break
          }
          if (q) {
            out.say("")
            if (!printMan(out, q)) {
              out.err(`help: no command or category called '${q}'`)
              const near = suggest(q)
              if (near.length) out.dim(`  did you mean: ${near.join(", ")}?`)
              out.dim(`  categories: ${CATEGORY_ORDER.map((c) => CATEGORY_LABEL[c]).join(" · ")}`)
            }
            out.say("")
            break
          }

          out.say("")
          out.ok(`  jpsh — ${COMMANDS.length} commands, all of them real`)
          out.dim("  help <category> for a group · help <command> for one · man <command> too")
          out.say("")
          for (const cat of CATEGORY_ORDER) {
            const names = CMDS.filter((c) => c.category === cat).map((c) => c.name)
            if (!names.length) continue
            out.info(`  ${CATEGORY_LABEL[cat]}`)
            for (const row of wrap(names.join("  "), 66)) out.say(`    ${row}`)
            out.say("")
          }
          out.dim("  TAB completes · ↑/↓ history · Ctrl+L clear · Ctrl+C abort · && chains")
          out.say("")
          break
        }

        case "man": {
          const q = joined.toLowerCase()
          if (!q) {
            out.err("What manual page do you want?")
            break
          }
          if (!printMan(out, q)) {
            out.err(`No manual entry for ${q}`)
            const near = suggest(q)
            if (near.length) out.dim(`  did you mean: ${near.join(", ")}?`)
          }
          break
        }

        case "neofetch": {
          const wm = useWM.getState()
          const all = tree().filter(alive)
          const info: [string, string][] = [
            ["", "visitor@portfolio"],
            ["", "─────────────────"],
            ["OS", "Portfolio OS 11 (web build)"],
            ["Host", "Johnpaul's desktop, running in your browser"],
            ["Kernel", "react 18 · next 14 · typescript"],
            ["Shell", "jpsh 1.0.0"],
            ["Uptime", uptimeText()],
            ["Theme", `${wm.theme} · ${wm.bounds.w}×${wm.bounds.h}`],
            ["WM", `${wm.windows.length} window(s) open`],
            ["Files", `${all.length} nodes in the VFS`],
            ["Owner", PROFILE.name],
            ["Role", PROFILE.title],
            ["Where", PROFILE.location],
            ["Projects", `${PROJECTS.length} shipped`],
            ["Contact", PROFILE.email],
          ]
          const rows = Math.max(NEOFETCH_ART.length, info.length)
          out.say("")
          for (let i = 0; i < rows; i++) {
            const art = (NEOFETCH_ART[i] ?? "").padEnd(20)
            const pair = info[i]
            if (!pair) {
              out.say(`  ${art}`, "accent")
              continue
            }
            const [k, v] = pair
            out.split(`  ${art}${k ? `${k}:`.padEnd(11) : ""}`, v, k ? "out" : "accent")
          }
          out.say("")
          out.swatch()
          out.say("")
          break
        }

        /**
         * Everything here comes from actions.systemSnapshot() or useSystem() -
         * there is no second copy of any of these numbers in this file.
         */
        case "system": {
          const snap = A.systemSnapshot()
          const st = useSystem.getState()
          const status = st.status()
          const netTone: Tone =
            status === "online" ? "accent" : status === "connecting" ? "warn" : "err"

          out.say("")
          out.ok("  jp-os · live state")
          out.say("")

          out.info("  shell")
          out.split("    shell          ", "jpsh 1.0.0")
          out.split("    uptime         ", uptimeText())
          out.split("    cwd            ", pathOf(tree(), dir))
          out.say("")

          out.info("  desktop")
          out.split("    theme          ", snap.theme)
          out.split("    windows        ", `${snap.windows} open`)
          out.split("    focused        ", snap.focused ?? "—", snap.focused ? "out" : "dim")
          out.split("    apps installed ", String(snap.apps))
          out.split("    notifications  ", String(snap.notifications))
          out.say("")

          out.info("  network")
          out.split("    status         ", status, netTone)
          out.split("    wi-fi radio    ", snap.wifiEnabled ? "on" : "off", snap.wifiEnabled ? "accent" : "err")
          out.split("    airplane mode  ", snap.airplane ? "on" : "off", snap.airplane ? "warn" : "dim")
          out.split("    association    ", snap.conn)
          out.split("    ssid           ", snap.ssid ?? "—")
          out.split("    browser online ", st.realOnline ? "yes" : "no", st.realOnline ? "dim" : "err")
          out.say("")

          out.info("  filesystem")
          out.split("    live nodes     ", String(snap.nodes))
          out.split("    recycle bin    ", String(snap.trashed))
          out.say("")

          out.info("  hardware")
          out.split("    volume         ", st.muted ? "muted" : `${snap.volume}%`)
          out.split("    brightness     ", `${snap.brightness}%`)
          out.say("")
          break
        }

        case "jpfetch": {
          const snap = A.systemSnapshot()
          const st = useSystem.getState()
          const status = st.status()
          const info: [string, string][] = [
            ["", `${PROFILE.initials.toLowerCase()}@portfolio`],
            ["", "─────────────────"],
            ["Owner", PROFILE.name],
            ["Role", PROFILE.title],
            ["OS", "Portfolio OS 11 (web build)"],
            ["Shell", "jpsh 1.0.0"],
            ["Theme", snap.theme],
            ["Network", status === "online" ? `online · ${snap.ssid ?? "—"}` : status],
            ["Apps", `${snap.apps} installed`],
            ["Projects", `${PROJECTS.length} shipped`],
            ["Skills", `${SKILL_GROUPS.reduce((a, g) => a + g.items.length, 0)} tracked in ${SKILL_GROUPS.length} areas`],
            ["Timeline", `${TIMELINE.length} entries · ${ACHIEVEMENTS.length} awards`],
            ["In the lab", `${LAB.length} in progress`],
            ["Windows", `${snap.windows} open`],
            ["Files", `${snap.nodes} nodes`],
            ["Where", PROFILE.location],
            ["Contact", PROFILE.email],
          ]
          const rows = Math.max(JPFETCH_ART.length, info.length)
          out.say("")
          for (let i = 0; i < rows; i++) {
            const art = (JPFETCH_ART[i] ?? "").padEnd(18)
            const pair = info[i]
            if (!pair) {
              out.say(`  ${art}`, "magenta")
              continue
            }
            const [k, v] = pair
            out.split(`  ${art}${k ? `${k}:`.padEnd(13) : ""}`, v, k ? "out" : "accent")
          }
          out.say("")
          out.dim(`  every number above is read live — nothing here is a constant`)
          out.say("")
          break
        }

        /**
         * One brain, two front ends: this is the same assistant.ask() Nimbus uses,
         * and the actions it proposes run through the same allowlist.
         */
        case "ask": {
          const doIdx = args.indexOf("--do")
          if (doIdx >= 0) {
            const offers = askRef.current
            if (!offers.length) {
              out.err("ask: nothing to run yet — ask a question first")
              out.dim('  e.g. ask "what projects use AI?"')
              break
            }
            const n = parseInt(args[doIdx + 1] ?? "", 10)
            if (!Number.isFinite(n) || n < 1 || n > offers.length) {
              out.err(`ask --do: pick a number between 1 and ${offers.length}`)
              offers.forEach((o, i) => out.dim(`  ${i + 1}. ${o.label}`))
              break
            }
            const chosen = offers[n - 1]
            const res = assistantInvoke(chosen.capability, chosen.arg)
            if (!res.ok) out.err(`ask: ${res.message}`)
            else out.ok(`✓ ${chosen.label}`)
            break
          }

          const question = joined.trim()
          if (!question) {
            out.say("")
            out.ok("  Ask anything about Johnpaul — in plain English.")
            out.dim('  usage: ask "<question>"   ·   then: ask --do <n> to run an offer')
            out.say("")
            out.chips(SUGGESTED_QUESTIONS.slice(0, 4).map((q) => `ask "${q.replace(/"/g, "")}"`))
            out.say("")
            break
          }

          const a = ask(question)
          askRef.current = a.actions ?? []
          out.say("")
          for (const para of a.text.split("\n")) {
            if (!para.trim()) {
              out.say("")
              continue
            }
            for (const row of wrap(para.trim())) out.say(`  ${row}`)
          }
          if (a.facts?.length) {
            out.say("")
            for (const f of a.facts) out.split(`  ${f.label.padEnd(18)}`, f.value, "info")
          }
          if (a.actions?.length) {
            out.say("")
            out.info("  I can do these for you:")
            a.actions.forEach((act, i) => out.split(`    ${i + 1}. `, act.label, "out"))
            out.dim(`    run one with: ask --do <n>`)
            out.chips(a.actions.map((_, i) => `ask --do ${i + 1}`))
          }
          if (a.suggestions?.length) {
            out.say("")
            out.dim("  next:")
            out.chips(a.suggestions.slice(0, 4).map((q) => `ask "${q.replace(/"/g, "")}"`))
          }
          out.say("")
          out.dim(
            a.unknown
              ? "  (not in the profile — so it doesn't get invented)"
              : `  confidence ${Math.round(a.confidence * 100)}% · grounded in lib/os/content.ts`,
          )
          out.say("")
          break
        }

        case "tutorial":
          printTutorial(out)
          break

        /* ------------------------------------------------ portfolio */
        case "about": {
          out.say("")
          out.ok(`  ${PROFILE.name}`)
          out.say(`  ${PROFILE.title}`)
          out.dim(`  ${PROFILE.tagline}`)
          out.say("")
          out.split("  Location", PROFILE.location)
          out.split("  Email", PROFILE.email)
          out.say("")
          out.info("  why me")
          PROFILE.uvp.forEach((u) => out.say(`    • ${u}`))
          out.say("")
          break
        }

        case "projects": {
          const all = flags.has("--all") || flags.has("-a")
          const cat = positional.join(" ").toLowerCase()
          let list = PROJECTS
          if (cat) list = PROJECTS.filter((p) => p.category.toLowerCase().includes(cat))
          const shown = all || cat ? list : list.slice(0, 8)
          out.say("")
          out.ok(`  ${list.length} project${list.length === 1 ? "" : "s"}${cat ? ` in “${cat}”` : ""}`)
          out.say("")
          for (const p of shown) {
            out.split(`  ${p.year}  ${p.title.padEnd(26)}`, p.stack, "info")
            out.dim(`        ${p.desc}  ·  ${p.category}`)
          }
          if (shown.length < list.length) {
            out.say("")
            out.dim(`  … ${list.length - shown.length} more — run: projects --all`)
          }
          out.say("")
          break
        }

        case "skills": {
          const q = joined.toLowerCase()
          const groups = q
            ? SKILL_GROUPS.filter((g) => g.label.toLowerCase().includes(q))
            : SKILL_GROUPS
          if (!groups.length) {
            out.err(`skills: no area matching '${joined}'`)
            out.dim(`areas: ${SKILL_GROUPS.map((g) => g.label).join(", ")}`)
            break
          }
          out.say("")
          for (const g of groups) {
            out.ok(`  ${g.label}`)
            out.dim(`  ${g.hint}`)
            for (const s of g.items) {
              const filled = Math.round(s.level / 5)
              out.split(
                `    ${s.name.padEnd(18)}`,
                `${"█".repeat(filled)}${"░".repeat(20 - filled)} ${s.level}%`,
                "info",
              )
            }
            out.say("")
          }
          break
        }

        case "experience": {
          out.say("")
          for (const e of TIMELINE) {
            out.ok(`  ${e.year}  ${e.label} — ${e.org}`)
            out.dim(`        ${e.kind === "work" ? "work" : "education"}`)
            e.facts.forEach((f) => out.say(`        • ${f}`))
            out.say("")
          }
          break
        }

        case "awards": {
          out.say("")
          ACHIEVEMENTS.forEach((a) => out.split(`  ★ ${a.title.padEnd(28)}`, a.detail, "dim"))
          out.say("")
          break
        }

        case "lab": {
          out.say("")
          out.dim("  in progress, no promises")
          out.say("")
          for (const l of LAB) {
            const filled = Math.round(l.progress / 5)
            out.split(
              `  ${l.title.padEnd(28)}`,
              `${"█".repeat(filled)}${"░".repeat(20 - filled)} ${l.progress}%`,
              "info",
            )
            out.dim(`  ${l.note}`)
          }
          out.say("")
          break
        }

        case "contact": {
          out.say("")
          out.split("  Email   ", PROFILE.email, "accent")
          out.split("  Phone   ", PROFILE.phone)
          out.split("  GitHub  ", PROFILE.github, "info")
          out.split("  LinkedIn", PROFILE.linkedin, "info")
          out.split("  Location", PROFILE.location, "dim")
          out.say("")
          out.dim("  run `open contact` for the compose window")
          break
        }

        case "social":
          out.split("  github  ", PROFILE.github, "info")
          out.split("  linkedin", PROFILE.linkedin, "info")
          break

        case "resume": {
          const res = A.openApp("resume")
          if (!res.ok) {
            out.err(`resume: ${res.message}`)
            break
          }
          out.ok("opening Resume.pdf…")
          out.dim(`${PROFILE.name} · ${PROFILE.title} · ${PROFILE.location}`)
          break
        }

        /* ------------------------------------------------------ fun */
        case "sudo": {
          const what = joined || "something"
          out.err(`visitor is not in the sudoers file. This incident has been reported.`)
          out.dim(`  (reported to ${PROFILE.email}, who will be flattered you tried)`)
          if (what.startsWith("rm")) out.warn("  also: absolutely not.")
          break
        }

        case "cowsay": {
          const msg = joined || "moo"
          const width = Math.min(46, Math.max(6, msg.length))
          const wrapped: string[] = []
          let rest = msg
          while (rest.length > width) {
            let cut = rest.lastIndexOf(" ", width)
            if (cut <= 0) cut = width
            wrapped.push(rest.slice(0, cut))
            rest = rest.slice(cut).trimStart()
          }
          wrapped.push(rest)
          const w = Math.max(...wrapped.map((l) => l.length))
          out.say(` ╭─${"─".repeat(w)}─╮`, "accent")
          wrapped.forEach((l) => out.say(` │ ${l.padEnd(w)} │`, "accent"))
          out.say(` ╰─┬${"─".repeat(w - 1)}─╯`, "accent")
          out.say("   │   /\\_/\\", "warn")
          out.say("   ╰──( o.o )", "warn")
          out.say("       > ^ <", "warn")
          break
        }

        case "fortune":
          out.info(`  “${FORTUNES[Math.floor(Math.random() * FORTUNES.length)]}”`)
          break

        case "coffee":
          out.warn("  brewing…")
          out.say("     ( (")
          out.say("      ) )")
          out.say("   ┌────────┐─╮")
          out.say("   │        │ │")
          out.say("   │        │─╯")
          out.say("   └────────┘")
          out.dim("  418 I'm a teapot. Have a chai instead.")
          break

        case "matrix":
          for (let i = 0; i < 6; i++) {
            let row = ""
            for (let j = 0; j < 54; j++)
              row += Math.random() > 0.72 ? String.fromCharCode(0x30a0 + Math.random() * 60) : " "
            out.say(row, "accent")
          }
          out.dim("  ...you take the blue pill, the story ends. Type `clear`.")
          break

        case "vim":
        case "nano":
        case "emacs":
          out.warn(`${name}: not installed on this machine.`)
          out.dim("  use: edit <file>  — it opens Notepad, and yes, you can quit it.")
          break

        default: {
          if (!name) break
          out.err(`command not found: ${name}`)
          const near = suggest(name)
          if (near.length) {
            out.dim(`Did you mean: ${near.join(", ")}`)
            out.chips(near)
          } else {
            out.dim(`type 'help' for the full list`)
          }
        }
      }
    }

    for (const segment of rawLine.split(/\s+&&\s+/)) runOne(segment)

    // The cwd can be deleted out from under us (here, or by File Explorer).
    const here = byId(useFS.getState().nodes, dir)
    if (dir && (!here || here.deletedAt)) dir = null

    cwdRef.current = dir
    setCwd(dir)
    setLines((prev) => {
      const next = clearScreen ? buf : [...prev, ...buf]
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next
    })
  }, [])

  /** One path in: the prompt, and the clickable examples, run the same way. */
  const runLine = (raw: string) => {
    const trimmed = raw.trim()
    setLines((prev) => [...prev, { t: "prompt", path: promptPath, cmd: raw }])
    setInput("")
    setHistIdx(-1)
    if (!trimmed) return
    const nextHistory = history[history.length - 1] === trimmed ? history : [...history, trimmed]
    setHistory(nextHistory)
    execute(trimmed, nextHistory)
  }

  const submit = () => runLine(input)

  /* ------------------------------------------------------ tab completion */

  const complete = () => {
    const el = inputRef.current
    const caret = el?.selectionStart ?? input.length
    const before = input.slice(0, caret)
    const after = input.slice(caret)

    const toks = tokenize(before)
    const endsWithSpace = /\s$/.test(before) || before === ""
    const active: Tok = endsWithSpace
      ? { text: "", start: caret, end: caret, quoted: false }
      : toks[toks.length - 1]
    if (!active) return
    const isCommandSlot = endsWithSpace ? toks.length === 0 : toks.length <= 1

    const put = (replacement: string, addSpace: boolean) => {
      const head = input.slice(0, active.start)
      const next = `${head}${replacement}${addSpace ? " " : ""}${after}`
      caretRef.current = head.length + replacement.length + (addSpace ? 1 : 0)
      setInput(next)
    }

    const commonPrefix = (list: string[]) => {
      if (!list.length) return ""
      let p = list[0]
      for (const s of list)
        while (p && s.slice(0, p.length).toLowerCase() !== p.toLowerCase()) p = p.slice(0, -1)
      return p
    }

    if (isCommandSlot) {
      const q = active.text.toLowerCase()
      const hits = COMMANDS.filter((c) => c.startsWith(q))
      if (!hits.length) return
      if (hits.length === 1) {
        put(hits[0], true)
        return
      }
      const pre = commonPrefix(hits)
      if (pre.length > active.text.length) put(pre, false)
      else {
        setLines((prev) => [
          ...prev,
          { t: "prompt", path: promptPath, cmd: input },
          { t: "text", s: `  ${hits.join("   ")}`, tone: "dim" },
        ])
      }
      return
    }

    // File / directory completion, honouring any path prefix already typed.
    const raw = active.text
    const slash = raw.lastIndexOf("/")
    const dirPart = slash >= 0 ? raw.slice(0, slash + 1) : ""
    const namePart = slash >= 0 ? raw.slice(slash + 1) : raw
    const base = resolvePath(nodes, cwd, dirPart || ".")
    if (!base.ok) return
    const items = kidsOf(nodes, base.id).filter((n) =>
      n.name.toLowerCase().startsWith(namePart.toLowerCase()),
    )
    if (!items.length) return
    if (items.length === 1) {
      const n = items[0]
      const full = `${dirPart}${n.name}${n.kind === "folder" ? "/" : ""}`
      put(quoteIfNeeded(full), n.kind !== "folder")
      return
    }
    const pre = commonPrefix(items.map((n) => n.name))
    if (pre.length > namePart.length) put(quoteIfNeeded(`${dirPart}${pre}`), false)
    else {
      setLines((prev) => [
        ...prev,
        { t: "prompt", path: promptPath, cmd: input },
        {
          t: "text",
          s: `  ${items.map((n) => `${n.name}${n.kind === "folder" ? "/" : ""}`).join("   ")}`,
          tone: "dim",
        },
      ])
    }
  }

  /* ------------------------------------------------------------- keyboard */

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab") {
      e.preventDefault()
      complete()
      return
    }
    if (e.ctrlKey && (e.key === "l" || e.key === "L")) {
      e.preventDefault()
      setLines([])
      return
    }
    if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
      // Only hijack Ctrl+C when there is nothing selected to copy.
      if (window.getSelection()?.toString()) return
      e.preventDefault()
      setLines((prev) => [...prev, { t: "prompt", path: promptPath, cmd: `${input}^C` }])
      setInput("")
      setHistIdx(-1)
      return
    }
    if (e.ctrlKey && (e.key === "u" || e.key === "U")) {
      e.preventDefault()
      setInput("")
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      submit()
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (!history.length) return
      const idx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1)
      setHistIdx(idx)
      setInput(history[idx] ?? "")
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (histIdx < 0) return
      const idx = histIdx + 1
      if (idx >= history.length) {
        setHistIdx(-1)
        setInput("")
      } else {
        setHistIdx(idx)
        setInput(history[idx])
      }
    }
  }

  /* ---------------------------------------------------------------- render */

  return (
    <div
      className="os-scroll h-full overflow-y-auto p-3 font-mono text-[12.5px] leading-[1.55] selection:bg-[#264f78]"
      style={{ background: "#0c0c0c" }}
      onClick={() => {
        // Click anywhere to type - but never steal a drag-selection of the output.
        if (window.getSelection()?.toString()) return
        inputRef.current?.focus()
      }}
    >
      {lines.map((l, i) => {
        if (l.t === "prompt") {
          return (
            <pre key={i} className="whitespace-pre-wrap break-words">
              <span style={{ color: "#4ade80" }}>visitor@portfolio</span>
              <span style={{ color: "#7c7c7c" }}>:</span>
              <span style={{ color: "#7dd3fc" }}>{l.path}</span>
              <span style={{ color: "#7c7c7c" }}>$ </span>
              <span style={{ color: "#f5f5f5" }}>{l.cmd}</span>
            </pre>
          )
        }
        if (l.t === "split") {
          return (
            <pre key={i} className="whitespace-pre-wrap break-words">
              <span style={{ color: "#4ade80" }}>{l.left}</span>
              <span style={{ color: TONE[l.rightTone] }}>{l.right}</span>
            </pre>
          )
        }
        if (l.t === "chips") {
          return (
            <div key={i} className="flex flex-wrap gap-1.5 py-1 pl-2">
              {l.items.map((c, j) => (
                <button
                  key={`${c}-${j}`}
                  type="button"
                  onClick={() => {
                    runLine(c)
                    inputRef.current?.focus()
                  }}
                  className="rounded-[3px] border border-[#2f6f46] bg-[#10241a] px-2 py-[1px] font-mono text-[12px] text-[#4ade80] transition-colors hover:bg-[#183a26] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#4ade80]"
                >
                  {c}
                </button>
              ))}
            </div>
          )
        }
        if (l.t === "swatch") {
          return (
            <div key={i} className="flex gap-1 py-1 pl-2">
              {SWATCH.map((c) => (
                <span key={c} className="h-3 w-6 rounded-[2px]" style={{ background: c }} />
              ))}
            </div>
          )
        }
        return (
          <pre key={i} className="whitespace-pre-wrap break-words" style={{ color: TONE[l.tone] }}>
            {l.s || " "}
          </pre>
        )
      })}

      <div className="flex items-baseline">
        <span className="shrink-0 whitespace-pre">
          <span style={{ color: "#4ade80" }}>visitor@portfolio</span>
          <span style={{ color: "#7c7c7c" }}>:</span>
          <span style={{ color: "#7dd3fc" }}>{promptPath}</span>
          <span style={{ color: "#7c7c7c" }}>$ </span>
        </span>
        <input
          ref={inputRef}
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Terminal input"
          className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] leading-[1.55] outline-none"
          style={{ color: "#f5f5f5", caretColor: "#4ade80" }}
        />
      </div>
      <div ref={endRef} />
    </div>
  )
}
