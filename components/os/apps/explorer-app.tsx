"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowUp, FilePlus2, FolderPlus, Monitor, Pencil, Trash2 } from "lucide-react"
import { useFS } from "@/lib/os/fs-store"
import { useWM } from "@/lib/os/wm-store"
import type { FSNode, WindowInstance } from "@/lib/os/types"
import { FolderGlyph, TextGlyph } from "@/components/os/desktop/desktop-icons"

export function ExplorerApp({ win }: { win: WindowInstance }) {
  const { get, children, create, rename, remove } = useFS()
  const { open, setTitle } = useWM()

  const [cwd, setCwd] = useState<string | null>((win.payload?.folderId as string) ?? null)
  const [history, setHistory] = useState<(string | null)[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; node: FSNode | null } | null>(null)

  const items = children(cwd)
  const current = cwd ? get(cwd) : null

  useEffect(() => {
    setTitle(win.id, current ? `${current.name} — File Explorer` : "Desktop — File Explorer")
  }, [cwd, current, setTitle, win.id])

  useEffect(() => {
    const close = () => setMenu(null)
    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [])

  const navigate = (id: string | null) => {
    setHistory((h) => [...h, cwd])
    setCwd(id)
    setSelected(null)
  }

  const goBack = () => {
    setHistory((h) => {
      if (h.length === 0) return h
      setCwd(h[h.length - 1])
      return h.slice(0, -1)
    })
    setSelected(null)
  }

  const openNode = (n: FSNode) => {
    if (n.kind === "folder") navigate(n.id)
    else open("notepad", { fileId: n.id }, `${n.name} — Notepad`)
  }

  const newItem = (kind: "folder" | "text") => {
    const id = create(kind, cwd)
    setSelected(id)
    setRenaming(id)
  }

  // Breadcrumb trail back up to Desktop.
  const trail: FSNode[] = []
  let cursor = current
  while (cursor) {
    trail.unshift(cursor)
    cursor = cursor.parentId ? get(cursor.parentId) ?? null : null
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div
        className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5"
        style={{ borderColor: "var(--os-border)" }}
      >
        <ToolButton label="Back" onClick={goBack} disabled={history.length === 0}>
          <ArrowLeft size={15} />
        </ToolButton>
        <ToolButton label="Up" onClick={() => navigate(current?.parentId ?? null)} disabled={!cwd}>
          <ArrowUp size={15} />
        </ToolButton>
        <span className="mx-1 h-5 w-px" style={{ background: "var(--os-border)" }} />
        <ToolButton label="New folder" onClick={() => newItem("folder")}>
          <FolderPlus size={15} />
        </ToolButton>
        <ToolButton label="New text document" onClick={() => newItem("text")}>
          <FilePlus2 size={15} />
        </ToolButton>

        {/* Address bar */}
        <div
          className="ml-2 flex min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-md px-2.5 py-1.5 text-[12.5px]"
          style={{ background: "var(--os-input)", border: "1px solid var(--os-border)", color: "var(--os-fg)" }}
        >
          <Monitor size={13} style={{ color: "var(--os-muted)" }} />
          <button type="button" className="shrink-0 hover:underline" onClick={() => navigate(null)}>
            Desktop
          </button>
          {trail.map((t) => (
            <span key={t.id} className="flex min-w-0 items-center gap-1">
              <span style={{ color: "var(--os-muted)" }}>›</span>
              <button type="button" className="truncate hover:underline" onClick={() => navigate(t.id)}>
                {t.name}
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Contents */}
      <div
        className="os-scroll min-h-0 flex-1 overflow-y-auto p-3"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setSelected(null)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, node: null })
        }}
      >
        {items.length === 0 ? (
          <p className="py-16 text-center text-[13px]" style={{ color: "var(--os-muted)" }}>
            This folder is empty. Right-click to create something.
          </p>
        ) : (
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(102px, 1fr))" }}>
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setSelected(n.id)
                }}
                onDoubleClick={() => openNode(n)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setSelected(n.id)
                  setMenu({ x: e.clientX, y: e.clientY, node: n })
                }}
                className={`flex flex-col items-center gap-1.5 rounded-md p-2 transition-colors ${
                  selected === n.id ? "bg-[var(--os-active)] ring-1 ring-[var(--os-accent)]" : "hover:bg-[var(--os-hover)]"
                }`}
              >
                {n.kind === "folder" ? <FolderGlyph /> : <TextGlyph />}
                {renaming === n.id ? (
                  <InlineRename
                    initial={n.name}
                    onDone={(v) => {
                      if (v) rename(n.id, v)
                      setRenaming(null)
                    }}
                  />
                ) : (
                  <span
                    className="line-clamp-2 w-full break-words text-center text-[11.5px] leading-tight"
                    style={{ color: "var(--os-fg)" }}
                  >
                    {n.name}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        className="shrink-0 border-t px-3 py-1.5 text-[11.5px]"
        style={{ borderColor: "var(--os-border)", color: "var(--os-muted)" }}
      >
        {items.length} item{items.length === 1 ? "" : "s"}
        {selected && ` · 1 selected`}
      </div>

      {menu && (
        <div
          className="fixed z-[300] min-w-[196px] rounded-lg p-1.5 text-[13px] shadow-2xl"
          style={{
            left: Math.min(menu.x, window.innerWidth - 210),
            top: Math.min(menu.y, window.innerHeight - 190),
            background: "var(--os-menu)",
            border: "1px solid var(--os-border)",
            backdropFilter: "blur(28px)",
            color: "var(--os-fg)",
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {menu.node ? (
            <>
              <MenuRow label="Open" onSelect={() => { openNode(menu.node!); setMenu(null) }} />
              <MenuRow icon={<Pencil size={13} />} label="Rename" onSelect={() => { setRenaming(menu.node!.id); setMenu(null) }} />
              <MenuRow icon={<Trash2 size={13} />} danger label="Delete" onSelect={() => { remove(menu.node!.id); setMenu(null) }} />
            </>
          ) : (
            <>
              <MenuRow icon={<FolderPlus size={13} />} label="New folder" onSelect={() => { newItem("folder"); setMenu(null) }} />
              <MenuRow icon={<FilePlus2 size={13} />} label="New text document" onSelect={() => { newItem("text"); setMenu(null) }} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ToolButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-[var(--os-hover)] disabled:opacity-35"
      style={{ color: "var(--os-fg)" }}
    >
      {children}
    </button>
  )
}

function MenuRow({
  label,
  icon,
  onSelect,
  danger,
}: {
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-md px-2.5 py-[7px] text-left transition-colors ${
        danger ? "hover:bg-[#c42b1c] hover:text-white" : "hover:bg-[var(--os-hover)]"
      }`}
    >
      <span className="grid w-4 place-items-center opacity-80">{icon}</span>
      {label}
    </button>
  )
}

function InlineRename({ initial, onDone }: { initial: string; onDone: (v: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [v, setV] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    const dot = initial.lastIndexOf(".")
    el.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [initial])
  return (
    <input
      ref={ref}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => onDone(v)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Enter") onDone(v)
        if (e.key === "Escape") onDone(null)
      }}
      className="w-full rounded-sm border border-sky-400 bg-white px-1 text-center text-[11.5px] text-black outline-none"
    />
  )
}
