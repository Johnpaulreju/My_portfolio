"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ChevronDown,
  ChevronUp,
  FileArchive,
  FileText,
  FileVideo,
  Folder,
  Info,
  Link2,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react"
import { useFS } from "@/lib/os/fs-store"
import { playSfx } from "@/lib/os/sfx"
import type { FSNode, WindowInstance } from "@/lib/os/types"

/* ------------------------------------------------------------------ helpers */

/**
 * Formatted by hand rather than with toLocaleString: the same timestamp has to
 * render identically on the server and in the browser, and Intl happily
 * disagrees with itself across the two.
 */
function formatWhen(ts: number | undefined): string {
  if (!ts) return "-"
  const d = new Date(ts)
  const h24 = d.getHours()
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${h}:${mm} ${h24 < 12 ? "AM" : "PM"}`
}

/** Byte length of whatever the node actually stores, or null when size is meaningless. */
function byteSize(node: FSNode): number | null {
  if (node.kind === "folder") return null
  let text = node.body ?? ""
  if (node.kind === "zip" && node.zipOf) {
    text = node.zipOf.map((m) => m.body ?? "").join("")
  }
  if (node.kind === "video" && !node.body) return null
  try {
    return new Blob([text]).size
  } catch {
    // No Blob (exotic runtime): UTF-16 code units are a close enough stand-in.
    return text.length
  }
}

/** Explorer rounds everything up to whole kilobytes, and so do we. */
function formatSize(bytes: number | null): string {
  if (bytes === null) return "-"
  const kb = Math.max(1, Math.ceil(bytes / 1024))
  if (kb < 1024) return `${kb.toLocaleString("en-US")} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

const TYPE_LABEL: Record<FSNode["kind"], string> = {
  folder: "File folder",
  text: "Text Document",
  doc: "JPDoc Document",
  video: "MP4 Video",
  zip: "Compressed Folder",
  "app-link": "Shortcut",
}

function KindGlyph({ kind }: { kind: FSNode["kind"] }) {
  const common = { size: 15, strokeWidth: 1.7 } as const
  if (kind === "folder") return <Folder {...common} style={{ color: "var(--os-accent)" }} />
  if (kind === "video") return <FileVideo {...common} style={{ color: "var(--os-muted)" }} />
  if (kind === "zip") return <FileArchive {...common} style={{ color: "var(--os-muted)" }} />
  if (kind === "app-link") return <Link2 {...common} style={{ color: "var(--os-muted)" }} />
  return <FileText {...common} style={{ color: "var(--os-muted)" }} />
}

/** Original trash glyph: a tapered bin with a lid, handle and ribs. */
function BinGlyph({ size = 116 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <ellipse cx="48" cy="86" rx="30" ry="4.5" fill="var(--os-hover)" />
      <path
        d="M25 30h46l-5 48.5a6.5 6.5 0 0 1-6.5 5.9H36.5A6.5 6.5 0 0 1 30 78.5z"
        fill="var(--os-accent-soft)"
        stroke="var(--os-accent)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M39 12.5h18a4 4 0 0 1 3.9 3l1.1 4.5H34l1.1-4.5a4 4 0 0 1 3.9-3z"
        fill="none"
        stroke="var(--os-accent)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <rect
        x="17"
        y="20"
        width="62"
        height="10"
        rx="5"
        fill="var(--os-accent)"
        opacity="0.9"
      />
      <path
        d="M40 41.5 38.5 72M48 41.5V72M56 41.5 57.5 72"
        stroke="var(--os-accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  )
}

/* -------------------------------------------------------------------- sorting */

type SortKey = "name" | "origin" | "deleted" | "size" | "type"
type Sort = { key: SortKey; dir: 1 | -1 }

/* ----------------------------------------------------------------- the window */

export function RecycleBinApp(_props: { win?: WindowInstance }) {
  const { nodes, trash, restore, purge, emptyTrash } = useFS()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)
  const [sort, setSort] = useState<Sort>({ key: "deleted", dir: -1 })
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const [confirm, setConfirm] = useState<null | { mode: "empty" | "purge"; ids: string[] }>(null)

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  // Recomputed only when the tree actually changes, so `rows` keeps its identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const binned = useMemo(() => trash(), [nodes])

  /** Path back to the Desktop, walking parents even when they are binned too. */
  const originOf = useMemo(
    () => (node: FSNode): string => {
      const parts: string[] = []
      let cursor = node.parentId ? byId.get(node.parentId) : undefined
      let guard = 0
      while (cursor && guard++ < 64) {
        parts.unshift(cursor.name)
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
      }
      return ["Desktop", ...parts].join("\\")
    },
    [byId],
  )

  /**
   * Deleting a folder soft-deletes its contents in the same sweep, all sharing
   * one deletedAt. Explorer shows only what the visitor actually deleted, so
   * members of a sweep hide behind their folder - a file binned on its own and
   * a folder binned later still both get their own row, exactly as in Windows.
   */
  const rows = useMemo(() => {
    const top = binned.filter((n) => {
      if (!n.parentId) return true
      const parent = byId.get(n.parentId)
      return !(parent?.deletedAt && parent.deletedAt === n.deletedAt)
    })
    const dir = sort.dir
    return [...top].sort((a, b) => {
      switch (sort.key) {
        case "name":
          return dir * a.name.localeCompare(b.name)
        case "origin":
          return dir * originOf(a).localeCompare(originOf(b))
        case "size":
          return dir * ((byteSize(a) ?? -1) - (byteSize(b) ?? -1))
        case "type":
          return dir * TYPE_LABEL[a.kind].localeCompare(TYPE_LABEL[b.kind])
        default:
          return dir * ((a.deletedAt ?? 0) - (b.deletedAt ?? 0))
      }
    })
  }, [binned, byId, originOf, sort])

  // A row that disappears (restored elsewhere, or purged) must not stay selected.
  useEffect(() => {
    setSelected((prev) => {
      const live = new Set(rows.map((r) => r.id))
      let changed = false
      const next = new Set<string>()
      prev.forEach((id) => {
        if (live.has(id)) next.add(id)
        else changed = true
      })
      return changed ? next : prev
    })
  }, [rows])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener("pointerdown", close)
    window.addEventListener("resize", close)
    return () => {
      window.removeEventListener("pointerdown", close)
      window.removeEventListener("resize", close)
    }
  }, [menu])

  useEffect(() => {
    if (!confirm) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setConfirm(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [confirm])

  /** Everything binned in the same sweep as `id`, so folders travel with their contents. */
  const sweep = (id: string): string[] => {
    const root = byId.get(id)
    if (!root) return []
    const out = new Set<string>([id])
    if (root.kind === "folder" && root.deletedAt) {
      let grew = true
      while (grew) {
        grew = false
        for (const n of nodes) {
          if (n.parentId && out.has(n.parentId) && !out.has(n.id) && n.deletedAt === root.deletedAt) {
            out.add(n.id)
            grew = true
          }
        }
      }
    }
    return [...out]
  }

  /** Restoring a nested file brings its binned ancestors back, or it lands nowhere. */
  const ancestors = (id: string): string[] => {
    const out: string[] = []
    let cursor = byId.get(id)?.parentId
    let guard = 0
    while (cursor && guard++ < 64) {
      const parent = byId.get(cursor)
      if (!parent) break
      if (parent.deletedAt) out.push(parent.id)
      cursor = parent.parentId
    }
    return out
  }

  const doRestore = (ids: string[]) => {
    if (ids.length === 0) return
    const targets = new Set<string>()
    ids.forEach((id) => {
      sweep(id).forEach((x) => targets.add(x))
      ancestors(id).forEach((x) => targets.add(x))
    })
    targets.forEach(restore)
    setSelected(new Set())
    setMenu(null)
  }

  const doPurge = (ids: string[]) => {
    if (ids.length === 0) return
    const targets = new Set<string>()
    ids.forEach((id) => sweep(id).forEach((x) => targets.add(x)))
    targets.forEach(purge)
    playSfx("recycle")
    setSelected(new Set())
    setMenu(null)
  }

  const runConfirm = () => {
    if (!confirm) return
    if (confirm.mode === "empty") {
      emptyTrash()
      playSfx("recycle")
      setSelected(new Set())
    } else {
      doPurge(confirm.ids)
    }
    setConfirm(null)
  }

  const pick = (e: React.PointerEvent | React.MouseEvent, id: string, index: number) => {
    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      setAnchor(index)
      return
    }
    if (e.shiftKey && anchor !== null) {
      const [lo, hi] = anchor < index ? [anchor, index] : [index, anchor]
      setSelected(new Set(rows.slice(lo, hi + 1).map((r) => r.id)))
      return
    }
    setSelected(new Set([id]))
    setAnchor(index)
  }

  const selectedIds = rows.filter((r) => selected.has(r.id)).map((r) => r.id)
  const hasSelection = selectedIds.length > 0
  const GRID = "minmax(190px, 2.1fr) minmax(150px, 1.7fr) 170px 96px 140px"

  return (
    <div className="relative flex h-full min-h-0 flex-col" style={{ color: "var(--os-fg)" }}>
      {/* Command bar */}
      <div
        className="os-scroll flex shrink-0 items-center gap-1 overflow-x-auto border-b px-2 py-1.5"
        style={{ borderColor: "var(--os-border)" }}
      >
        <Command
          icon={<Trash2 size={15} />}
          label="Empty Recycle Bin"
          danger
          disabled={rows.length === 0}
          onClick={() => setConfirm({ mode: "empty", ids: [] })}
        />
        <Command
          icon={<RotateCcw size={15} />}
          label="Restore all items"
          disabled={rows.length === 0}
          onClick={() => doRestore(rows.map((r) => r.id))}
        />
        {hasSelection && (
          <>
            <span className="mx-1 h-5 w-px shrink-0" style={{ background: "var(--os-border)" }} />
            <Command
              icon={<Undo2 size={15} />}
              label="Restore the selected items"
              onClick={() => doRestore(selectedIds)}
            />
            <Command
              icon={<Trash2 size={15} />}
              label="Delete"
              danger
              onClick={() => setConfirm({ mode: "purge", ids: selectedIds })}
            />
          </>
        )}
      </div>

      {/* Address bar */}
      <div className="flex shrink-0 items-center gap-2 px-2 py-1.5">
        <div
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px]"
          style={{ background: "var(--os-input)", border: "1px solid var(--os-border)" }}
        >
          <Trash2 size={13} style={{ color: "var(--os-muted)" }} />
          <span className="truncate">Recycle Bin</span>
        </div>
      </div>

      {/* Details view */}
      <div
        tabIndex={0}
        className="os-scroll min-h-0 flex-1 overflow-auto outline-none"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setSelected(new Set())
        }}
        onKeyDown={(e) => {
          if (e.key === "Delete" && hasSelection) {
            e.preventDefault()
            setConfirm({ mode: "purge", ids: selectedIds })
          } else if (e.key === "Enter" && hasSelection) {
            e.preventDefault()
            doRestore(selectedIds)
          } else if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            setSelected(new Set(rows.map((r) => r.id)))
          } else if (e.key === "Escape") {
            setSelected(new Set())
          }
        }}
      >
        {rows.length === 0 ? (
          <div className="grid h-full min-h-[220px] place-items-center px-6 py-10 text-center">
            <div>
              <BinGlyph />
              <p className="mt-4 text-[14px] font-medium">Recycle Bin is empty</p>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--os-muted)" }}>
                Files you delete from the desktop land here first, so nothing is ever really gone
                by accident.
              </p>
            </div>
          </div>
        ) : (
          <div className="min-w-[760px]">
            {/* Column headers */}
            <div
              className="sticky top-0 z-10 grid items-center border-b text-[11.5px]"
              style={{
                gridTemplateColumns: GRID,
                borderColor: "var(--os-border)",
                background: "var(--os-chrome)",
                backdropFilter: "blur(20px)",
                color: "var(--os-muted)",
              }}
            >
              <Header label="Name" col="name" sort={sort} onSort={setSort} />
              <Header label="Original Location" col="origin" sort={sort} onSort={setSort} />
              <Header label="Date Deleted" col="deleted" sort={sort} onSort={setSort} />
              <Header label="Size" col="size" sort={sort} onSort={setSort} align="right" />
              <Header label="Item type" col="type" sort={sort} onSort={setSort} />
            </div>

            {rows.map((n, i) => {
              const isSelected = selected.has(n.id)
              return (
                <div
                  key={n.id}
                  role="row"
                  aria-selected={isSelected}
                  className={`grid cursor-default items-center text-[12.5px] transition-colors ${
                    isSelected ? "" : "hover:bg-[var(--os-hover)]"
                  }`}
                  style={{
                    gridTemplateColumns: GRID,
                    background: isSelected ? "var(--os-accent-soft)" : undefined,
                    boxShadow: isSelected ? "inset 0 0 0 1px var(--os-accent)" : "none",
                    borderRadius: 4,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    if (e.button === 2) return
                    pick(e, n.id, i)
                  }}
                  onDoubleClick={() => doRestore([n.id])}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!selected.has(n.id)) {
                      setSelected(new Set([n.id]))
                      setAnchor(i)
                    }
                    setMenu({ x: e.clientX, y: e.clientY, id: n.id })
                  }}
                >
                  <Cell>
                    <KindGlyph kind={n.kind} />
                    <span className="truncate">{n.name}</span>
                  </Cell>
                  <Cell muted>
                    <span className="truncate">{originOf(n)}</span>
                  </Cell>
                  <Cell muted>
                    <span className="truncate tabular-nums">{formatWhen(n.deletedAt)}</span>
                  </Cell>
                  <Cell muted align="right">
                    <span className="w-full truncate text-right tabular-nums">
                      {formatSize(byteSize(n))}
                    </span>
                  </Cell>
                  <Cell muted>
                    <span className="truncate">{TYPE_LABEL[n.kind]}</span>
                  </Cell>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div
        className="flex shrink-0 items-center gap-3 border-t px-3 py-1.5 text-[11.5px]"
        style={{ borderColor: "var(--os-border)", color: "var(--os-muted)" }}
      >
        <span>
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </span>
        {hasSelection && <span>{selectedIds.length} selected</span>}
      </div>

      {/* Row context menu */}
      {menu && (
        <div
          className="fixed z-[300] min-w-[198px] rounded-lg p-1.5 text-[13px] shadow-2xl"
          style={{
            left: Math.max(8, Math.min(menu.x, window.innerWidth - 210)),
            top: Math.max(8, Math.min(menu.y, window.innerHeight - 142)),
            background: "var(--os-menu)",
            border: "1px solid var(--os-border)",
            backdropFilter: "blur(28px)",
            color: "var(--os-fg)",
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <MenuRow
            icon={<Undo2 size={13} />}
            label="Restore"
            onSelect={() => doRestore(selected.has(menu.id) ? selectedIds : [menu.id])}
          />
          <MenuRow
            icon={<Trash2 size={13} />}
            label="Delete"
            danger
            onSelect={() => {
              const ids = selected.has(menu.id) ? selectedIds : [menu.id]
              setMenu(null)
              setConfirm({ mode: "purge", ids })
            }}
          />
          <div className="my-1 h-px" style={{ background: "var(--os-border)" }} />
          <MenuRow icon={<Info size={13} />} label="Properties" disabled onSelect={() => {}} />
        </div>
      )}

      {/* In-app confirmation - a real dialog would break the illusion */}
      {confirm && (
        <div
          className="absolute inset-0 z-[320] grid place-items-center p-6"
          style={{ background: "var(--os-scrim)", backdropFilter: "blur(2px)" }}
          onPointerDown={() => setConfirm(null)}
        >
          <div
            className="w-full max-w-[380px] overflow-hidden rounded-xl shadow-2xl"
            style={{ background: "var(--os-window)", border: "1px solid var(--os-border)", backdropFilter: "blur(30px)" }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="px-5 pb-4 pt-5">
              <div className="flex items-start gap-3">
                <span
                  className="mt-[2px] grid h-8 w-8 shrink-0 place-items-center rounded-full"
                  style={{ background: "color-mix(in srgb, var(--os-danger) 16%, transparent)" }}
                >
                  <Trash2 size={16} style={{ color: "color-mix(in srgb, var(--os-danger) 78%, var(--os-fg))" }} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold">
                    {confirm.mode === "empty" ? "Empty Recycle Bin?" : "Delete permanently?"}
                  </h2>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
                    {confirm.mode === "empty"
                      ? `This permanently deletes all ${rows.length} item${rows.length === 1 ? "" : "s"} in the Recycle Bin. You won't be able to undo it.`
                      : `${confirm.ids.length} item${confirm.ids.length === 1 ? "" : "s"} will be removed for good. You won't be able to undo it.`}
                  </p>
                </div>
              </div>
            </div>
            <div
              className="flex justify-end gap-2 px-5 py-4"
              style={{ background: "var(--os-card)", borderTop: "1px solid var(--os-border)" }}
            >
              <DialogButton onClick={() => setConfirm(null)}>Cancel</DialogButton>
              <DialogButton danger onClick={runConfirm}>
                {confirm.mode === "empty" ? "Empty Recycle Bin" : "Delete"}
              </DialogButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- pieces */

function Command({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="flex shrink-0 items-center gap-2 rounded-md px-2.5 py-[6px] text-[12.5px] transition-colors hover:bg-[var(--os-hover)] disabled:pointer-events-none disabled:opacity-35"
      style={{ color: danger ? "color-mix(in srgb, var(--os-danger) 78%, var(--os-fg))" : "var(--os-fg)" }}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}

function Header({
  label,
  col,
  sort,
  onSort,
  align = "left",
}: {
  label: string
  col: SortKey
  sort: Sort
  onSort: (s: Sort) => void
  align?: "left" | "right"
}) {
  const active = sort.key === col
  return (
    <button
      type="button"
      onClick={() => onSort({ key: col, dir: active && sort.dir === 1 ? -1 : 1 })}
      className={`flex items-center gap-1 px-3 py-[7px] transition-colors hover:bg-[var(--os-hover)] ${
        align === "right" ? "justify-end" : ""
      }`}
      style={{ color: active ? "var(--os-fg)" : "var(--os-muted)" }}
    >
      <span className="truncate">{label}</span>
      {active && (sort.dir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  )
}

function Cell({
  children,
  muted,
  align = "left",
}: {
  children: React.ReactNode
  muted?: boolean
  align?: "left" | "right"
}) {
  return (
    <span
      className={`flex min-w-0 items-center gap-2 px-3 py-[7px] ${align === "right" ? "justify-end" : ""}`}
      style={{ color: muted ? "var(--os-muted)" : "var(--os-fg)" }}
    >
      {children}
    </span>
  )
}

function MenuRow({
  label,
  icon,
  onSelect,
  danger,
  disabled,
}: {
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-md px-2.5 py-[7px] text-left transition-colors hover:bg-[var(--os-hover)] disabled:pointer-events-none disabled:opacity-40"
      style={{ color: danger ? "color-mix(in srgb, var(--os-danger) 78%, var(--os-fg))" : "var(--os-fg)" }}
    >
      <span className="grid w-4 place-items-center opacity-80">{icon}</span>
      {label}
    </button>
  )
}

function DialogButton({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-4 py-[7px] text-[13px] font-medium transition-all active:scale-[.98]"
      style={
        danger
          ? {
              background: "color-mix(in srgb, var(--os-danger) 16%, transparent)",
              color: "color-mix(in srgb, var(--os-danger) 78%, var(--os-fg))",
              border: "1px solid color-mix(in srgb, var(--os-danger) 42%, transparent)",
            }
          : {
              background: "var(--os-card)",
              color: "var(--os-fg)",
              border: "1px solid var(--os-border)",
            }
      }
    >
      {children}
    </button>
  )
}
