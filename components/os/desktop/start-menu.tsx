"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Power, Search } from "lucide-react"
import { ALL_APPS } from "@/lib/os/app-meta"
import { useWM } from "@/lib/os/wm-store"
import { useFS } from "@/lib/os/fs-store"
import { PROFILE } from "@/lib/os/content"
import { AppIcon } from "@/components/os/app-icon"
import { TASKBAR_H } from "./taskbar"

export function StartMenu({ onReboot }: { onReboot: () => void }) {
  const { startOpen, setStartOpen, open } = useWM()
  const { nodes } = useFS()
  const [query, setQuery] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (startOpen) {
      setQuery("")
      // Let the open transition start before stealing focus.
      const t = setTimeout(() => inputRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
  }, [startOpen])

  useEffect(() => {
    if (!startOpen) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      // The Start button toggles on its own click; ignore it here.
      if (ref.current?.contains(t) || t.closest('[aria-label="Start"]')) return
      setStartOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setStartOpen(false)
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [startOpen, setStartOpen])

  const q = query.trim().toLowerCase()
  const apps = useMemo(
    () => (q ? ALL_APPS.filter((a) => a.title.toLowerCase().includes(q) || a.short.toLowerCase().includes(q)) : ALL_APPS),
    [q],
  )
  const files = useMemo(
    () => (q ? nodes.filter((n) => n.name.toLowerCase().includes(q)).slice(0, 5) : []),
    [q, nodes],
  )
  const recent = useMemo(
    () => [...nodes].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4),
    [nodes],
  )

  if (!startOpen) return null

  return (
    <div
      ref={ref}
      className="absolute left-1/2 z-[150] w-[640px] max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-xl p-6 shadow-2xl"
      style={{
        bottom: TASKBAR_H + 8,
        background: "var(--os-menu)",
        border: "1px solid var(--os-border)",
        backdropFilter: "blur(40px) saturate(170%)",
        color: "var(--os-fg)",
        animation: "start-rise .16s ease-out",
      }}
      role="dialog"
      aria-label="Start menu"
    >
      <div
        className="mb-5 flex items-center gap-2 rounded-md px-3 py-2"
        style={{ background: "var(--os-input)", border: "1px solid var(--os-border)" }}
      >
        <Search size={15} style={{ color: "var(--os-muted)" }} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for apps and files"
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--os-muted)]"
        />
      </div>

      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold">{q ? "Apps" : "Pinned"}</span>
        {!q && <span className="text-[12px]" style={{ color: "var(--os-muted)" }}>All apps</span>}
      </div>

      {apps.length === 0 && files.length === 0 ? (
        <p className="py-10 text-center text-[13px]" style={{ color: "var(--os-muted)" }}>
          No results for &ldquo;{query}&rdquo;
        </p>
      ) : (
        <div className="grid grid-cols-6 gap-1">
          {apps.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => open(a.id)}
              className="flex flex-col items-center gap-2 rounded-md px-1 py-3 transition-colors hover:bg-[var(--os-hover)]"
            >
              <AppIcon appId={a.id} size={32} />
              <span className="w-full truncate text-center text-[11.5px]">{a.short}</span>
            </button>
          ))}
        </div>
      )}

      {q && files.length > 0 && (
        <>
          <p className="mb-2 mt-5 text-[13px] font-semibold">Files</p>
          <div className="flex flex-col">
            {files.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() =>
                  f.kind === "folder"
                    ? open("explorer", { folderId: f.id }, f.name)
                    : open("notepad", { fileId: f.id }, `${f.name} — Notepad`)
                }
                className="flex items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--os-hover)]"
              >
                <span className="text-[13px]">{f.kind === "folder" ? "📁" : "📄"}</span>
                <span className="flex-1 truncate text-[13px]">{f.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {!q && recent.length > 0 && (
        <>
          <p className="mb-2 mt-6 text-[13px] font-semibold">Recommended</p>
          <div className="grid grid-cols-2 gap-1">
            {recent.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() =>
                  f.kind === "folder"
                    ? open("explorer", { folderId: f.id }, f.name)
                    : open("notepad", { fileId: f.id }, `${f.name} — Notepad`)
                }
                className="flex items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--os-hover)]"
              >
                <span>{f.kind === "folder" ? "📁" : "📄"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px]">{f.name}</span>
                  <span className="block text-[11px]" style={{ color: "var(--os-muted)" }}>
                    {f.kind === "folder" ? "Folder" : "Text document"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div
        className="mt-6 flex items-center justify-between border-t pt-4"
        style={{ borderColor: "var(--os-border)" }}
      >
        <button
          type="button"
          onClick={() => open("about")}
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--os-hover)]"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-blue-700 text-[12px] font-semibold text-white">
            {PROFILE.initials}
          </span>
          <span className="text-[13px]">{PROFILE.name}</span>
        </button>

        <button
          type="button"
          aria-label="Restart"
          title="Restart"
          onClick={() => {
            setStartOpen(false)
            onReboot()
          }}
          className="grid h-9 w-9 place-items-center rounded-md transition-colors hover:bg-[var(--os-hover)]"
        >
          <Power size={17} />
        </button>
      </div>
    </div>
  )
}
