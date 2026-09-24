"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useFS } from "@/lib/os/fs-store"
import { playSfx } from "@/lib/os/sfx"
import { SaveGuard } from "@/components/os/dialogs/save-guard"
import { useWM } from "@/lib/os/wm-store"
import type { WindowInstance } from "@/lib/os/types"

export function NotepadApp({ win }: { win: WindowInstance }) {
  const { get, setBody, create, rename, saveCopy } = useFS()
  const { setTitle, setPayload } = useWM()
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const fileId = win.payload?.fileId as string | undefined
  const file = fileId ? get(fileId) : undefined

  const [draft, setDraft] = useState(file?.body ?? "")
  const [dirty, setDirty] = useState(false)
  const [wrap, setWrap] = useState(true)
  const [caret, setCaret] = useState({ ln: 1, col: 1 })
  const [menu, setMenu] = useState<"file" | "format" | null>(null)
  const [guard, setGuard] = useState(false)

  // Adopt the file's text whenever this window is pointed at a different file.
  useEffect(() => {
    setDraft(file?.body ?? "")
    setDirty(false)
  }, [fileId, file?.body])

  const save = () => {
    if (fileId) {
      const res = setBody(fileId, draft)
      // Johnpaul's own files refuse the write - say so warmly instead of failing silently.
      if (!res.ok) {
        if (res.reason === "locked") {
          playSfx("error")
          setGuard(true)
        }
        return
      }
    } else {
      // Untitled buffer: materialise a real file on first save.
      const id = create("text", null, "Untitled.txt")
      setBody(id, draft)
      setPayload(win.id, { fileId: id })
      setTitle(win.id, "Untitled.txt — Notepad")
    }
    setDirty(false)
  }

  const saveAs = () => {
    const name = window.prompt("Save as", file?.name ?? "Untitled.txt")
    if (!name) return
    const id = create("text", null, name.endsWith(".txt") ? name : `${name}.txt`)
    setBody(id, draft)
    setPayload(win.id, { fileId: id })
    setTitle(win.id, `${name} — Notepad`)
    setDirty(false)
  }

  // Ctrl/Cmd+S saves, as it should.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        save()
      }
    }
    const el = areaRef.current
    el?.addEventListener("keydown", onKey)
    return () => el?.removeEventListener("keydown", onKey)
  })

  const updateCaret = () => {
    const el = areaRef.current
    if (!el) return
    const upto = el.value.slice(0, el.selectionStart)
    const lines = upto.split("\n")
    setCaret({ ln: lines.length, col: lines[lines.length - 1].length + 1 })
  }

  const stats = useMemo(() => {
    const words = draft.trim() ? draft.trim().split(/\s+/).length : 0
    return { chars: draft.length, words }
  }, [draft])

  return (
    <div className="relative flex h-full min-h-0 flex-col" onPointerDown={() => setMenu(null)}>
      <SaveGuard
        open={guard}
        fileName={file?.name ?? "this file"}
        onKeepEditing={() => setGuard(false)}
        onSaveCopy={() => {
          const res = saveCopy(fileId!, draft)
          setGuard(false)
          if (res.ok && res.id) {
            setPayload(win.id, { fileId: res.id })
            const copy = useFS.getState().get(res.id)
            if (copy) setTitle(win.id, `${copy.name} — Notepad`)
            setDirty(false)
          }
        }}
      />
      {/* Menu bar */}
      <div
        className="relative flex shrink-0 items-center gap-0.5 border-b px-1.5 py-1 text-[12px]"
        style={{ borderColor: "var(--os-border)", color: "var(--os-fg)" }}
      >
        <MenuButton label="File" open={menu === "file"} onOpen={() => setMenu(menu === "file" ? null : "file")}>
          <MenuRow label="New" onSelect={() => { setDraft(""); setPayload(win.id, { fileId: undefined }); setTitle(win.id, "Untitled — Notepad"); setDirty(false) }} />
          <MenuRow label="Save" shortcut="Ctrl+S" onSelect={save} />
          <MenuRow label="Save As…" onSelect={saveAs} />
          {file && !file.locked && (
            <MenuRow
              label="Rename…"
              onSelect={() => {
                const n = window.prompt("Rename file", file.name)
                if (n) {
                  rename(file.id, n)
                  setTitle(win.id, `${n} — Notepad`)
                }
              }}
            />
          )}
        </MenuButton>

        <MenuButton label="Format" open={menu === "format"} onOpen={() => setMenu(menu === "format" ? null : "format")}>
          <MenuRow label={`Word wrap${wrap ? "  ✓" : ""}`} onSelect={() => setWrap(!wrap)} />
        </MenuButton>

        <span className="ml-auto pr-2 text-[11px]" style={{ color: "var(--os-muted)" }}>
          {dirty ? "Unsaved changes" : file ? "Saved" : "Untitled"}
        </span>
      </div>

      <textarea
        ref={areaRef}
        value={draft}
        wrap={wrap ? "soft" : "off"}
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value)
          setDirty(true)
          updateCaret()
        }}
        onKeyUp={updateCaret}
        onClick={updateCaret}
        className={`os-scroll min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-[13px] leading-relaxed outline-none ${
          wrap ? "" : "whitespace-pre overflow-x-auto"
        }`}
        style={{ color: "var(--os-fg)" }}
        placeholder="Start typing…"
      />

      <div
        className="flex shrink-0 items-center justify-end gap-5 border-t px-3 py-1 text-[11px]"
        style={{ borderColor: "var(--os-border)", color: "var(--os-muted)" }}
      >
        <span>Ln {caret.ln}, Col {caret.col}</span>
        <span>{stats.words} words</span>
        <span>{stats.chars} chars</span>
      </div>
    </div>
  )
}

function MenuButton({
  label,
  open,
  onOpen,
  children,
}: {
  label: string
  open: boolean
  onOpen: () => void
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation()
          onOpen()
        }}
        className={`rounded px-2.5 py-1 transition-colors ${open ? "bg-[var(--os-active)]" : "hover:bg-[var(--os-hover)]"}`}
      >
        {label}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[190px] rounded-lg p-1.5 shadow-2xl"
          style={{ background: "var(--os-menu)", border: "1px solid var(--os-border)", backdropFilter: "blur(28px)" }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function MenuRow({ label, shortcut, onSelect }: { label: string; shortcut?: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-4 rounded-md px-2.5 py-[7px] text-left transition-colors hover:bg-[var(--os-hover)]"
    >
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[11px]" style={{ color: "var(--os-muted)" }}>{shortcut}</span>}
    </button>
  )
}
