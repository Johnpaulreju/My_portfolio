"use client"

import { create } from "zustand"
import type { FSNode, FSNodeKind } from "./types"
import { PROFILE } from "./content"

const STORAGE_KEY = "jp-os-fs-v2"

let seq = 0
const nextId = () => `n${Date.now().toString(36)}${(++seq).toString(36)}`

/** Writes refuse rather than fail silently, so callers can show the save dialog. */
export type WriteResult = { ok: true; id?: string } | { ok: false; reason: "locked" | "missing" }

const README = [
  `${PROFILE.name} — ${PROFILE.title}`,
  "",
  PROFILE.tagline,
  "",
  "This desktop is a real one, not a picture of one:",
  "  • Right-click the wallpaper to make a new folder or text file",
  "  • Drag icons anywhere you like, then right-click → Refresh",
  "  • Double-click any file to open it; press F2 to rename, Delete to bin it",
  "  • Drag windows around, resize them from any edge, snap them to a screen half",
  "  • Anything you create is saved in your browser and survives a reload",
  "",
  "You can type in my files too — I just won't let you save over them.",
  "",
  `Reach me: ${PROFILE.email} · ${PROFILE.phone}`,
].join("\n")

const IDEAS =
  "Things I want to build next:\n\n" +
  "- Sign-language recognizer (in progress)\n" +
  "- Voice-modulation agents (in progress)\n" +
  "- Something with WebGPU\n"

/**
 * Seeded nodes carry Johnpaul's own words, so they are `locked`: readable and
 * freely typed into, but they refuse to be written back, renamed or deleted.
 * `t` is a fixed epoch, never Date.now(), so the seed is stable across reloads.
 */
const SEED_EPOCH = 1_700_000_000_000

const SEED: FSNode[] = [
  { id: "seed-readme", name: "Readme.txt", kind: "text", parentId: null, locked: true, createdAt: SEED_EPOCH, modifiedAt: SEED_EPOCH, body: README },
  { id: "seed-notes", name: "My Notes", kind: "folder", parentId: null, locked: true, createdAt: SEED_EPOCH, modifiedAt: SEED_EPOCH },
  { id: "seed-ideas", name: "ideas.txt", kind: "text", parentId: "seed-notes", locked: true, createdAt: SEED_EPOCH, modifiedAt: SEED_EPOCH, body: IDEAS },
  { id: "seed-intro", name: "Meet Johnpaul.mp4", kind: "video", parentId: null, locked: true, createdAt: SEED_EPOCH, modifiedAt: SEED_EPOCH, src: "/media/intro.mp4" },
]

const SEED_IDS = new Set(SEED.map((n) => n.id))

type FSState = {
  nodes: FSNode[]
  hydrated: boolean
  renamingId: string | null

  hydrate: () => void
  children: (parentId: string | null) => FSNode[]
  get: (id: string) => FSNode | undefined
  trash: () => FSNode[]

  create: (kind: FSNodeKind, parentId: string | null, name?: string, extra?: Partial<FSNode>) => string
  rename: (id: string, name: string) => WriteResult
  remove: (id: string) => WriteResult
  setBody: (id: string, body: string) => WriteResult
  /** The escape hatch offered whenever a write is refused: fork to the visitor's own copy. */
  saveCopy: (id: string, body?: string) => WriteResult

  restore: (id: string) => void
  purge: (id: string) => void
  emptyTrash: () => void

  setRenaming: (id: string | null) => void
  reset: () => void
}

function persist(nodes: FSNode[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes))
  } catch {
    // Private mode or a full quota - the desktop still works, it just won't persist.
  }
}

function uniqueName(nodes: FSNode[], parentId: string | null, base: string): string {
  const siblings = nodes
    .filter((n) => n.parentId === parentId && !n.deletedAt)
    .map((n) => n.name.toLowerCase())
  if (!siblings.includes(base.toLowerCase())) return base

  const dot = base.lastIndexOf(".")
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ""
  for (let i = 2; i < 999; i++) {
    const candidate = `${stem} (${i})${ext}`
    if (!siblings.includes(candidate.toLowerCase())) return candidate
  }
  return `${stem} (${nodes.length})${ext}`
}

/**
 * Never trust localStorage wholesale. Visitor-created nodes are kept as-is, but
 * every seed is forced back to its current definition - otherwise a stale v1 copy
 * would keep an unlocked Readme.txt around and the save guard would look broken.
 */
function reconcile(stored: unknown): FSNode[] {
  if (!Array.isArray(stored)) return SEED
  const visitorNodes = (stored as FSNode[])
    .filter((n) => n && typeof n.id === "string" && !SEED_IDS.has(n.id))
    .map((n) => ({
      ...n,
      modifiedAt: typeof n.modifiedAt === "number" ? n.modifiedAt : n.createdAt ?? SEED_EPOCH,
      locked: false,
    }))
  return [...SEED, ...visitorNodes]
}

export const useFS = create<FSState>((set, get) => ({
  nodes: SEED,
  hydrated: false,
  renamingId: null,

  hydrate: () => {
    if (get().hydrated) return
    let next = SEED
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) next = reconcile(JSON.parse(raw))
    } catch {
      // Corrupt storage falls through to the seed tree.
    }
    set({ nodes: next, hydrated: true })
    persist(next)
  },

  children: (parentId) =>
    get()
      .nodes.filter((n) => n.parentId === parentId && !n.deletedAt)
      .sort((a, b) => {
        if (a.kind === "folder" && b.kind !== "folder") return -1
        if (b.kind === "folder" && a.kind !== "folder") return 1
        return a.name.localeCompare(b.name)
      }),

  get: (id) => get().nodes.find((n) => n.id === id),

  trash: () => get().nodes.filter((n) => n.deletedAt),

  create: (kind, parentId, name, extra) => {
    const fallback =
      kind === "folder" ? "New folder" : kind === "doc" ? "New Document.jpdoc" : "New Text Document.txt"
    const now = Date.now()
    const node: FSNode = {
      id: nextId(),
      name: uniqueName(get().nodes, parentId, name ?? fallback),
      kind,
      parentId,
      body: kind === "text" || kind === "doc" ? "" : undefined,
      createdAt: now,
      modifiedAt: now,
      ...extra,
    }
    const nodes = [...get().nodes, node]
    set({ nodes })
    persist(nodes)
    return node.id
  },

  rename: (id, name) => {
    const trimmed = name.trim()
    const node = get().get(id)
    if (!node) return { ok: false, reason: "missing" }
    if (node.locked) return { ok: false, reason: "locked" }
    if (!trimmed) return { ok: true }
    const others = get().nodes.filter((x) => x.id !== id)
    const nodes = get().nodes.map((n) =>
      n.id === id
        ? { ...n, name: uniqueName(others, n.parentId, trimmed), modifiedAt: Date.now() }
        : n,
    )
    set({ nodes })
    persist(nodes)
    return { ok: true }
  },

  remove: (id) => {
    const node = get().get(id)
    if (!node) return { ok: false, reason: "missing" }
    if (node.locked) return { ok: false, reason: "locked" }

    // Soft delete, so the Recycle Bin gets it for free. Descendants go too.
    const doomed = new Set<string>([id])
    let grew = true
    while (grew) {
      grew = false
      for (const n of get().nodes) {
        if (n.parentId && doomed.has(n.parentId) && !doomed.has(n.id)) {
          doomed.add(n.id)
          grew = true
        }
      }
    }
    const at = Date.now()
    const nodes = get().nodes.map((n) => (doomed.has(n.id) ? { ...n, deletedAt: at } : n))
    set({ nodes })
    persist(nodes)
    return { ok: true }
  },

  setBody: (id, body) => {
    const node = get().get(id)
    if (!node) return { ok: false, reason: "missing" }
    if (node.locked) return { ok: false, reason: "locked" }
    const nodes = get().nodes.map((n) =>
      n.id === id ? { ...n, body, modifiedAt: Date.now() } : n,
    )
    set({ nodes })
    persist(nodes)
    return { ok: true }
  },

  saveCopy: (id, body) => {
    const node = get().get(id)
    if (!node) return { ok: false, reason: "missing" }
    const dot = node.name.lastIndexOf(".")
    const stem = dot > 0 ? node.name.slice(0, dot) : node.name
    const ext = dot > 0 ? node.name.slice(dot) : ""
    const newId = get().create(node.kind, node.parentId, `${stem} (my copy)${ext}`, {
      body: body ?? node.body,
      src: node.src,
    })
    return { ok: true, id: newId }
  },

  restore: (id) => {
    const nodes = get().nodes.map((n) => (n.id === id ? { ...n, deletedAt: undefined } : n))
    set({ nodes })
    persist(nodes)
  },

  purge: (id) => {
    const nodes = get().nodes.filter((n) => n.id !== id)
    set({ nodes })
    persist(nodes)
  },

  emptyTrash: () => {
    const nodes = get().nodes.filter((n) => !n.deletedAt)
    set({ nodes })
    persist(nodes)
  },

  setRenaming: (renamingId) => set({ renamingId }),

  reset: () => {
    set({ nodes: SEED })
    persist(SEED)
  },
}))
