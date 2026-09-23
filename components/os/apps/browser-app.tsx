"use client"

import { useState } from "react"
import { ArrowLeft, ArrowRight, ExternalLink, Lock, Plus, RotateCw, Star, X } from "lucide-react"
import { PROFILE, PROJECTS, SKILL_GROUPS } from "@/lib/os/content"
import { useWM } from "@/lib/os/wm-store"

type SiteId = "newtab" | "github" | "linkedin" | "portfolio"

const SITES: Record<SiteId, { url: string; title: string; external?: string }> = {
  newtab: { url: "chrome://new-tab", title: "New Tab" },
  portfolio: { url: "https://johnpaul.dev", title: `${PROFILE.name} — Portfolio` },
  github: { url: `https://${PROFILE.github}`, title: `${PROFILE.github}`, external: `https://${PROFILE.github}` },
  linkedin: { url: `https://${PROFILE.linkedin}`, title: "LinkedIn", external: `https://${PROFILE.linkedin}` },
}

type Tab = { id: string; site: SiteId }

let tabSeq = 0

export function BrowserApp() {
  const [tabs, setTabs] = useState<Tab[]>([{ id: "t0", site: "newtab" }])
  const [activeId, setActiveId] = useState("t0")
  const [omnibox, setOmnibox] = useState("")

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]
  const site = SITES[active.site]

  const goto = (s: SiteId) => {
    setTabs((ts) => ts.map((t) => (t.id === activeId ? { ...t, site: s } : t)))
    setOmnibox("")
  }

  const addTab = () => {
    const id = `t${++tabSeq}`
    setTabs((ts) => [...ts, { id, site: "newtab" }])
    setActiveId(id)
  }

  const closeTab = (id: string) => {
    setTabs((ts) => {
      const next = ts.filter((t) => t.id !== id)
      if (next.length === 0) return [{ id: `t${++tabSeq}`, site: "newtab" }]
      if (id === activeId) setActiveId(next[next.length - 1].id)
      return next
    })
  }

  // Typing a known name in the omnibox jumps to that mock site.
  const submitOmnibox = (e: React.FormEvent) => {
    e.preventDefault()
    const q = omnibox.toLowerCase()
    if (q.includes("github")) goto("github")
    else if (q.includes("linked")) goto("linkedin")
    else if (q) goto("portfolio")
  }

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: "var(--os-surface)" }}>
      {/* Tab strip */}
      <div className="flex shrink-0 items-end gap-1 px-2 pt-1.5" style={{ background: "var(--os-chrome)" }}>
        {tabs.map((t) => (
          <div
            key={t.id}
            onClick={() => setActiveId(t.id)}
            className={`group flex h-8 max-w-[190px] flex-1 cursor-default items-center gap-2 rounded-t-lg px-3 text-[12px] ${
              t.id === activeId ? "" : "hover:bg-[var(--os-hover)]"
            }`}
            style={{
              background: t.id === activeId ? "var(--os-surface)" : "transparent",
              color: "var(--os-fg)",
            }}
          >
            <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-gradient-to-br from-sky-400 to-blue-700" />
            <span className="flex-1 truncate">{SITES[t.site].title}</span>
            <button
              type="button"
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.id)
              }}
              className="grid h-4 w-4 shrink-0 place-items-center rounded-full opacity-0 hover:bg-[var(--os-hover)] group-hover:opacity-100"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <button
          type="button"
          aria-label="New tab"
          onClick={addTab}
          className="mb-1 grid h-7 w-7 place-items-center rounded-full hover:bg-[var(--os-hover)]"
          style={{ color: "var(--os-fg)" }}
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Omnibox row */}
      <div
        className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5"
        style={{ borderColor: "var(--os-border)", background: "var(--os-surface)" }}
      >
        {[ArrowLeft, ArrowRight, RotateCw].map((Icon, i) => (
          <button
            key={i}
            type="button"
            aria-label={["Back", "Forward", "Reload"][i]}
            onClick={() => i === 2 && goto(active.site)}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--os-hover)]"
            style={{ color: "var(--os-fg)" }}
          >
            <Icon size={15} />
          </button>
        ))}

        <form onSubmit={submitOmnibox} className="flex flex-1 items-center">
          <div
            className="flex w-full items-center gap-2 rounded-full px-3 py-1.5"
            style={{ background: "var(--os-input)", border: "1px solid var(--os-border)" }}
          >
            <Lock size={12} style={{ color: "#4ade80" }} />
            <input
              value={omnibox}
              onChange={(e) => setOmnibox(e.target.value)}
              placeholder={site.url}
              className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-[var(--os-muted)]"
              style={{ color: "var(--os-fg)" }}
            />
            <Star size={13} style={{ color: "var(--os-muted)" }} />
          </div>
        </form>

        {site.external && (
          <a
            href={site.external}
            target="_blank"
            rel="noreferrer"
            title="Open the real site in a new tab"
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--os-hover)]"
            style={{ color: "var(--os-fg)" }}
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      {/* Viewport */}
      <div className="os-scroll min-h-0 flex-1 overflow-y-auto">
        {active.site === "newtab" && <NewTab onGo={goto} />}
        {active.site === "github" && <GithubPage />}
        {active.site === "linkedin" && <LinkedInPage />}
        {active.site === "portfolio" && <PortfolioPage />}
      </div>
    </div>
  )
}

function NewTab({ onGo }: { onGo: (s: SiteId) => void }) {
  const open = useWM((s) => s.open)
  const shortcuts: { label: string; go: () => void; hue: string }[] = [
    { label: "GitHub", go: () => onGo("github"), hue: "from-zinc-600 to-zinc-900" },
    { label: "LinkedIn", go: () => onGo("linkedin"), hue: "from-sky-500 to-blue-800" },
    { label: "Portfolio", go: () => onGo("portfolio"), hue: "from-violet-500 to-indigo-800" },
    { label: "Projects", go: () => open("projects"), hue: "from-amber-400 to-orange-700" },
    { label: "Contact", go: () => open("contact"), hue: "from-emerald-400 to-teal-800" },
    { label: "Resume", go: () => open("resume"), hue: "from-rose-400 to-pink-800" },
  ]
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="w-full max-w-md text-center">
        <p className="mb-8 text-[28px] font-semibold tracking-tight" style={{ color: "var(--os-fg)" }}>
          {PROFILE.name}
        </p>
        <div className="grid grid-cols-3 gap-4">
          {shortcuts.map((s) => (
            <button key={s.label} type="button" onClick={s.go} className="group flex flex-col items-center gap-2">
              <span
                className={`grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br ${s.hue} text-[15px] font-semibold text-white transition-transform group-hover:scale-105`}
              >
                {s.label[0]}
              </span>
              <span className="text-[12px]" style={{ color: "var(--os-muted)" }}>
                {s.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function GithubPage() {
  return (
    <div className="mx-auto max-w-3xl p-7" style={{ color: "var(--os-fg)" }}>
      <div className="mb-6 flex items-center gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-zinc-800 text-[20px] font-semibold text-white">
          {PROFILE.initials}
        </span>
        <div>
          <h1 className="text-[20px] font-semibold">{PROFILE.name}</h1>
          <p className="text-[13px]" style={{ color: "var(--os-muted)" }}>
            {PROFILE.github}
          </p>
        </div>
      </div>
      <p className="mb-3 text-[13px] font-semibold">
        Pinned repositories <span style={{ color: "var(--os-muted)" }}>· {PROJECTS.length}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {PROJECTS.slice(0, 8).map((p) => (
          <div
            key={p.id}
            className="rounded-lg p-3.5"
            style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
          >
            <p className="mb-1 text-[13px] font-semibold" style={{ color: "var(--os-accent-fg)" }}>
              {p.title}
            </p>
            <p className="mb-3 text-[12px]" style={{ color: "var(--os-muted)" }}>
              {p.desc}
            </p>
            <p className="text-[11.5px]" style={{ color: "var(--os-muted)" }}>
              ● {p.stack.split(" · ")[0].split(" + ")[0]} · {p.year}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function LinkedInPage() {
  return (
    <div className="mx-auto max-w-3xl" style={{ color: "var(--os-fg)" }}>
      <div className="h-28 bg-gradient-to-r from-sky-600 to-blue-900" />
      <div className="px-7 pb-7">
        <span className="-mt-10 mb-3 grid h-20 w-20 place-items-center rounded-full border-4 border-[var(--os-surface)] bg-gradient-to-br from-sky-400 to-blue-700 text-[22px] font-semibold text-white">
          {PROFILE.initials}
        </span>
        <h1 className="text-[21px] font-semibold">{PROFILE.name}</h1>
        <p className="text-[14px]">{PROFILE.title}</p>
        <p className="mb-6 text-[12.5px]" style={{ color: "var(--os-muted)" }}>
          {PROFILE.location}
        </p>

        <h2 className="mb-2 text-[15px] font-semibold">Skills</h2>
        <div className="flex flex-wrap gap-2">
          {SKILL_GROUPS.flatMap((g) => g.items.slice(0, 3)).map((s) => (
            <span
              key={s.name}
              className="rounded-full px-3 py-1 text-[12px]"
              style={{ background: "var(--os-hover)", color: "var(--os-muted)" }}
            >
              {s.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function PortfolioPage() {
  const open = useWM((s) => s.open)
  return (
    <div className="grid min-h-full place-items-center p-10 text-center" style={{ color: "var(--os-fg)" }}>
      <div className="max-w-lg">
        <h1 className="mb-3 text-[32px] font-semibold tracking-tight">{PROFILE.name}</h1>
        <p className="mb-2 text-[15px]" style={{ color: "var(--os-accent-fg)" }}>
          {PROFILE.title}
        </p>
        <p className="mb-7 text-[13.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
          {PROFILE.tagline}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {(["about", "projects", "experience", "contact"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => open(id)}
              className="rounded-md px-4 py-2 text-[13px] capitalize"
              style={{ background: "var(--os-accent)", color: "#fff" }}
            >
              {id}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
