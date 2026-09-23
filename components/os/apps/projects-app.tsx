"use client"

import { useMemo, useState } from "react"
import { Folder, Grid2X2, List as ListIcon, Search } from "lucide-react"
import { PROJECTS, type Project } from "@/lib/os/content"
import { Pill } from "./kit"

const CATEGORIES = ["All", "AI / ML", "Full-Stack", "Computer Vision", "Automation"] as const

export function ProjectsApp() {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All")
  const [query, setQuery] = useState("")
  const [view, setView] = useState<"grid" | "list">("grid")
  const [selected, setSelected] = useState<Project | null>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return PROJECTS.filter(
      (p) =>
        (cat === "All" || p.category === cat) &&
        (!q || p.title.toLowerCase().includes(q) || p.stack.toLowerCase().includes(q)),
    )
  }, [cat, query])

  return (
    <div className="flex h-full min-h-0">
      {/* Navigation pane */}
      <aside
        className="os-scroll hidden w-[186px] shrink-0 overflow-y-auto border-r p-2 md:block"
        style={{ borderColor: "var(--os-border)", background: "var(--os-card)" }}
      >
        <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--os-muted)" }}>
          Categories
        </p>
        {CATEGORIES.map((c) => {
          const count = c === "All" ? PROJECTS.length : PROJECTS.filter((p) => p.category === c).length
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-[7px] text-left text-[13px] transition-colors ${
                cat === c ? "bg-[var(--os-active)]" : "hover:bg-[var(--os-hover)]"
              }`}
              style={{ color: "var(--os-fg)" }}
            >
              <Folder size={15} style={{ color: "#e8a33d" }} />
              <span className="flex-1 truncate">{c}</span>
              <span className="text-[11px]" style={{ color: "var(--os-muted)" }}>
                {count}
              </span>
            </button>
          )
        })}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Categories collapse into a scrollable chip row on a phone. */}
        <div
          className="os-scroll flex shrink-0 gap-1.5 overflow-x-auto border-b px-3 py-2 md:hidden"
          style={{ borderColor: "var(--os-border)" }}
        >
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className="shrink-0 rounded-full px-3 py-1.5 text-[12px] transition-colors"
              style={{
                background: cat === c ? "var(--os-accent)" : "var(--os-hover)",
                color: cat === c ? "#fff" : "var(--os-muted)",
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Command bar */}
        <div
          className="flex shrink-0 items-center gap-2 border-b px-3 py-2"
          style={{ borderColor: "var(--os-border)" }}
        >
          <div
            className="flex flex-1 items-center gap-2 rounded-md px-2.5 py-1.5"
            style={{ background: "var(--os-input)", border: "1px solid var(--os-border)" }}
          >
            <Search size={14} style={{ color: "var(--os-muted)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${cat === "All" ? "projects" : cat}`}
              className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-[var(--os-muted)]"
              style={{ color: "var(--os-fg)" }}
            />
          </div>
          <button
            type="button"
            aria-label={view === "grid" ? "List view" : "Grid view"}
            onClick={() => setView(view === "grid" ? "list" : "grid")}
            className="grid h-8 w-8 place-items-center rounded-md hover:bg-[var(--os-hover)]"
            style={{ color: "var(--os-fg)" }}
          >
            {view === "grid" ? <ListIcon size={15} /> : <Grid2X2 size={15} />}
          </button>
        </div>

        {/* Items */}
        <div className="os-scroll min-h-0 flex-1 overflow-y-auto p-3">
          {visible.length === 0 ? (
            <p className="py-16 text-center text-[13px]" style={{ color: "var(--os-muted)" }}>
              No projects match &ldquo;{query}&rdquo;.
            </p>
          ) : view === "grid" ? (
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(146px, 1fr))" }}>
              {visible.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p)}
                  onDoubleClick={() => setSelected(p)}
                  className={`flex flex-col items-start gap-2 rounded-lg p-3 text-left transition-colors ${
                    selected?.id === p.id ? "bg-[var(--os-active)] ring-1 ring-[var(--os-accent)]" : "hover:bg-[var(--os-hover)]"
                  }`}
                >
                  <ProjectGlyph />
                  <span className="line-clamp-2 text-[12.5px] font-medium" style={{ color: "var(--os-fg)" }}>
                    {p.title}
                  </span>
                  <span className="truncate text-[11px]" style={{ color: "var(--os-muted)" }}>
                    {p.stack}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr style={{ color: "var(--os-muted)" }}>
                  <th className="px-2 pb-2 font-medium">Name</th>
                  <th className="px-2 pb-2 font-medium">Stack</th>
                  <th className="px-2 pb-2 font-medium">Year</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className={`cursor-default ${selected?.id === p.id ? "bg-[var(--os-active)]" : "hover:bg-[var(--os-hover)]"}`}
                    style={{ color: "var(--os-fg)" }}
                  >
                    <td className="truncate px-2 py-1.5">{p.title}</td>
                    <td className="truncate px-2 py-1.5" style={{ color: "var(--os-muted)" }}>{p.stack}</td>
                    <td className="px-2 py-1.5" style={{ color: "var(--os-muted)" }}>{p.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Details pane / status bar */}
        <div
          className="shrink-0 border-t px-4 py-2.5"
          style={{ borderColor: "var(--os-border)", background: "var(--os-card)" }}
        >
          {selected ? (
            <div className="flex items-start gap-3">
              <ProjectGlyph small />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold" style={{ color: "var(--os-fg)" }}>
                  {selected.title}
                </p>
                <p className="text-[12px]" style={{ color: "var(--os-muted)" }}>
                  {selected.desc}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Pill tone="accent">{selected.stack}</Pill>
                <Pill>{selected.year}</Pill>
              </div>
            </div>
          ) : (
            <p className="text-[12px]" style={{ color: "var(--os-muted)" }}>
              {visible.length} item{visible.length === 1 ? "" : "s"} · select one to see details
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function ProjectGlyph({ small }: { small?: boolean }) {
  const s = small ? 28 : 34
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden>
      <rect x="3" y="6" width="34" height="28" rx="3" fill="#2b5fa8" />
      <rect x="3" y="6" width="34" height="7" rx="3" fill="#1e4680" />
      <circle cx="8" cy="9.5" r="1.3" fill="#ff5f57" />
      <circle cx="12.5" cy="9.5" r="1.3" fill="#febc2e" />
      <circle cx="17" cy="9.5" r="1.3" fill="#28c840" />
      <rect x="7" y="18" width="14" height="2.4" rx="1.2" fill="#8fc0ff" />
      <rect x="7" y="23" width="21" height="2.4" rx="1.2" fill="#5d8fd0" />
      <rect x="7" y="28" width="10" height="2.4" rx="1.2" fill="#5d8fd0" />
    </svg>
  )
}
