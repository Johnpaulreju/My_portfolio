"use client"

import { create } from "zustand"
import type { FSNode, FSNodeKind } from "./types"
import { PROFILE } from "./content"

const STORAGE_KEY = "jp-os-fs-v1"

let seq = 0
const nextId = () => `n${Date.now().toString(36)}${(++seq).toString(36)}`

const SEED: FSNode[] = [
  {
    id: "seed-readme",
    name: "Readme.txt",
    kind: "text",
    parentId: null,
    locked: false,
    createdAt: Date.now(),
    body: [
      `${PROFILE.name} — ${PROFILE.title}`,
      "",
      PROFILE.tagline,
      "",
      "This desktop is a real one, not a picture of one:",
      "  • Right-click the wallpaper to make a new folder or text file",
      "  • Double-click any file to open it in Notepad",
      "  • Press F2 (or right-click → Rename) to rename something",
      "  • Drag windows around, resize them from any edge, snap them to a screen half",
      "  • Anything you create is saved in your browser and survives a reload",
      "",
      `Reach me: ${PROFILE.email} · ${PROFILE.phone}`,
    ].join("\n"),
  },
  {
    id: "seed-notes",
    name: "My Notes",
    kind: "folder",
    parentId: null,
    locked: false,
    createdAt: Date.now(),
  },
  {
    id: "seed-ideas",
    name: "ideas.txt",
    kind: "text",
    parentId: "seed-notes",
    locked: false,
    createdAt: Date.now(),
    body: "Things I want to build next:\n\n- Sign-language recognizer (in progress)\n- Voice-modulation agents (in progress)\n- Something with WebGPU\n",
  },
]

type FSState = {
  nodes: FSNode[]
  hydrated: boolean
  /** Node currently being renamed inline, if any. */
  renamingId: string | null

  hydrate: () => void
  children: (parentId: string | null) => FSNode[]
  get: (id: string) => FSNode | undefined
  /** Returns the new node's id so callers can immediately start an inline rename. */
  create: (kind: FSNodeKind, parentId: string | null, name?: string) => string
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  setBody: (id: string, body: string) => void
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

/** "New folder", "New folder (2)", ... so a name is never duplicated in one directory. */
function uniqueName(nodes: FSNode[], parentId: string | null, base: string): string {
  const siblings = nodes.filter((n) => n.parentId === parentId).map((n) => n.name.toLowerCase())
  if (!siblings.includes(base.toLowerCase())) return base

  const dot = base.lastIndexOf(".")
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ""
  for (let i = 2; i < 999; i++) {
    const candidate = `${stem} (${i})${ext}`
    if (!siblings.includes(candidate.toLowerCase())) return candidate
  }
  return `${stem} (${Date.now()})${ext}`
}

export const useFS = create<FSState>((set, get) => ({
  nodes: SEED,
  hydrated: false,
  renamingId: null,

  hydrate: () => {
    if (get().hydrated) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          set({ nodes: parsed as FSNode[], hydrated: true })
          return
        }
      }
    } catch {
      // Corrupt or unreadable storage falls through to the seed tree.
    }
    set({ hydrated: true })
    persist(get().nodes)
  },

  children: (parentId) =>
    get()
      .nodes.filter((n) => n.parentId === parentId)
      .sort((a, b) => {
        // Folders first, then alphabetical - same as Explorer.
        if (a.kind === "folder" && b.kind !== "folder") return -1
        if (b.kind === "folder" && a.kind !== "folder") return 1
        return a.name.localeCompare(b.name)
      }),

  get: (id) => get().nodes.find((n) => n.id === id),

  create: (kind, parentId, name) => {
    const base = name ?? (kind === "folder" ? "New folder" : "New Text Document.txt")
    const finalName = uniqueName(get().nodes, parentId, base)
    const node: FSNode = {
      id: nextId(),
      name: finalName,
      kind,
      parentId,
      body: kind === "text" ? "" : undefined,
      createdAt: Date.now(),
    }
    const nodes = [...get().nodes, node]
    set({ nodes })
    persist(nodes)
    return node.id
  },

  rename: (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const node = get().get(id)
    if (!node || node.locked) return
    const nodes = get().nodes.map((n) =>
      n.id === id ? { ...n, name: uniqueName(get().nodes.filter((x) => x.id !== id), n.parentId, trimmed) } : n,
    )
    set({ nodes })
    persist(nodes)
  },

  remove: (id) => {
    const node = get().get(id)
    if (!node || node.locked) return
    // Recursively collect descendants so deleting a folder removes its contents too.
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
    const nodes = get().nodes.filter((n) => !doomed.has(n.id))
    set({ nodes })
    persist(nodes)
  },

  setBody: (id, body) => {
    const nodes = get().nodes.map((n) => (n.id === id ? { ...n, body } : n))
    set({ nodes })
    persist(nodes)
  },

  setRenaming: (renamingId) => set({ renamingId }),

  reset: () => {
    set({ nodes: SEED })
    persist(SEED)
  },
}))
