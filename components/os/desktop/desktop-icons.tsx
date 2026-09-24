"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ExternalLink, Pencil, Trash2 } from "lucide-react"
import { DESKTOP_APPS } from "@/lib/os/app-meta"
import { useFS } from "@/lib/os/fs-store"
import { useWM } from "@/lib/os/wm-store"
import { openApp, openNode } from "@/lib/os/actions"
import { useNotify } from "@/lib/os/notify-store"
import type { WriteResult } from "@/lib/os/fs-store"
import { AppIcon } from "@/components/os/app-icon"
import type { MenuItem } from "./context-menu"
import type { AppId, FSNode } from "@/lib/os/types"

type Entry =
  | { key: string; kind: "app"; appId: AppId; label: string }
  | { key: string; kind: "node"; node: FSNode; label: string }

export function DesktopIcons({
  openMenu,
}: {
  openMenu: (x: number, y: number, items: MenuItem[]) => void
}) {
  const { nodes, children, create, rename, remove, renamingId, setRenaming } = useFS()
  const open = useWM((s) => s.open)
  const push = useNotify((s) => s.push)

  /** A locked node is Johnpaul's own - explain the refusal rather than no-op. */
  const report = useCallback((res: WriteResult, verb: string, name: string) => {
    if (res.ok || res.reason !== "locked") return
    push({
      appId: "notepad",
      source: "File Explorer",
      title: `Can't ${verb} ${name}`,
      body: "This one's Johnpaul's own — open it and choose Save a copy instead.",
      sound: "error",
    })
  }, [push])
  const [selected, setSelected] = useState<string | null>(null)
  const rootNodes = children(null)

  const entries: Entry[] = [
    ...DESKTOP_APPS.map((a) => ({ key: `app:${a.id}`, kind: "app" as const, appId: a.id, label: a.short })),
    ...rootNodes.map((n) => ({ key: `node:${n.id}`, kind: "node" as const, node: n, label: n.name })),
  ]

  // Which app opens a node is decided once, in the action layer - previously this
  // sent every non-folder to Notepad, so videos and documents opened as text.
  const openEntry = (e: Entry) => {
    if (e.kind === "app") openApp(e.appId)
    else openNode(e.node.id)
  }

  // F2 renames and Delete removes the selected desktop item, as in Explorer.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!selected || renamingId) return
      const tag = (ev.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (!selected.startsWith("node:")) return
      const id = selected.slice(5)
      if (ev.key === "F2") {
        ev.preventDefault()
        setRenaming(id)
      } else if (ev.key === "Delete") {
        ev.preventDefault()
        // `id` is already the bare node id here, so look the name up rather than
        // re-slicing a prefix that is no longer present.
        const name = nodes.find((n) => n.id === id)?.name ?? "that item"
        report(remove(id), "delete", name)
        setSelected(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selected, renamingId, remove, setRenaming, report, nodes])

  const nodeMenu = (node: FSNode): MenuItem[] => [
    { label: "Open", icon: <ExternalLink size={14} />, onSelect: () => openEntry({ key: "", kind: "node", node, label: node.name }) },
    { kind: "sep" },
    { label: "Rename", icon: <Pencil size={14} />, shortcut: "F2", onSelect: () => setRenaming(node.id) },
    { label: "Delete", icon: <Trash2 size={14} />, shortcut: "Del", danger: true, onSelect: () => report(remove(node.id), "delete", node.name) },
  ]

  const appMenu = (appId: AppId): MenuItem[] => [
    { label: "Open", icon: <ExternalLink size={14} />, onSelect: () => open(appId) },
  ]

  return (
    <div
      className="absolute inset-0 p-2"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) setSelected(null)
      }}
    >
      <div
        className="grid h-full w-fit gap-x-1"
        style={{ gridTemplateRows: "repeat(auto-fill, 98px)", gridAutoFlow: "column", gridAutoColumns: "102px" }}
      >
        {entries.map((entry) => {
          const isSel = selected === entry.key
          const isRenaming = entry.kind === "node" && renamingId === entry.node.id
          return (
            <button
              key={entry.key}
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation()
                setSelected(entry.key)
              }}
              onDoubleClick={() => openEntry(entry)}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setSelected(entry.key)
                openMenu(
                  e.clientX,
                  e.clientY,
                  entry.kind === "node" ? nodeMenu(entry.node) : appMenu(entry.appId),
                )
              }}
              className={`group flex h-[94px] w-[98px] flex-col items-center gap-1.5 rounded p-1.5 text-center transition-colors ${
                isSel ? "bg-white/25 ring-1 ring-white/40" : "hover:bg-white/10"
              }`}
            >
              {entry.kind === "app" ? (
                <AppIcon appId={entry.appId} size={40} />
              ) : entry.node.kind === "folder" ? (
                <FolderGlyph />
              ) : (
                <TextGlyph />
              )}

              {isRenaming ? (
                <RenameInput
                  initial={entry.kind === "node" ? entry.node.name : ""}
                  onCommit={(v) => {
                    if (entry.kind === "node") report(rename(entry.node.id, v), "rename", entry.node.name)
                    setRenaming(null)
                  }}
                  onCancel={() => setRenaming(null)}
                />
              ) : (
                <span
                  className="line-clamp-2 w-full px-0.5 text-[11.5px] leading-tight text-white [overflow-wrap:anywhere]"
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,.85)" }}
                >
                  {entry.label}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string
  onCommit: (v: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(initial)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    // Preselect just the stem, leaving the extension alone - same as Explorer.
    const dot = initial.lastIndexOf(".")
    el.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [initial])

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Enter") onCommit(value)
        if (e.key === "Escape") onCancel()
      }}
      className="w-full rounded-sm border border-sky-400 bg-white px-1 text-center text-[11.5px] text-black outline-none"
    />
  )
}

function FolderGlyph() {
  return (
    <span className="grid h-10 w-10 place-items-center">
      <svg viewBox="0 0 48 40" className="h-10 w-10 drop-shadow">
        <path d="M2 8a4 4 0 0 1 4-4h12l5 5h19a4 4 0 0 1 4 4v23a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" fill="#e8a33d" />
        <path d="M2 14h44v19a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" fill="#fcc860" />
      </svg>
    </span>
  )
}

function TextGlyph() {
  return (
    <span className="grid h-10 w-10 place-items-center">
      <svg viewBox="0 0 40 48" className="h-10 w-10 drop-shadow">
        <path d="M6 2h20l10 10v34a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#fdfdfd" />
        <path d="M26 2l10 10H28a2 2 0 0 1-2-2z" fill="#c8d4e2" />
        {[16, 22, 28, 34].map((y, i) => (
          <rect key={y} x="10" y={y} width={i === 3 ? 12 : 20} height="2.5" rx="1.2" fill="#8fa3ba" />
        ))}
      </svg>
    </span>
  )
}

export { FolderGlyph, TextGlyph }
