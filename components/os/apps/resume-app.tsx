"use client"

import { Download, Printer } from "lucide-react"
import { ACHIEVEMENTS, PROFILE, PROJECTS, SKILL_GROUPS, TIMELINE } from "@/lib/os/content"

export function ResumeApp() {
  // Rendered as a document "page" floating on a grey viewer, like a PDF reader.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex shrink-0 items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: "var(--os-border)", background: "var(--os-chrome)" }}
      >
        <span className="flex-1 truncate text-[12.5px]" style={{ color: "var(--os-fg)" }}>
          Resume — {PROFILE.name}
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] hover:bg-[var(--os-hover)]"
          style={{ color: "var(--os-fg)" }}
        >
          <Printer size={14} /> Print
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] hover:bg-[var(--os-hover)]"
          style={{ color: "var(--os-fg)" }}
        >
          <Download size={14} /> Save as PDF
        </button>
      </div>

      <div className="os-scroll min-h-0 flex-1 overflow-y-auto bg-[#525252] p-5">
        <article className="mx-auto max-w-[660px] bg-white p-10 text-[#1a1a1a] shadow-xl">
          <header className="mb-5 border-b border-neutral-300 pb-4">
            <h1 className="text-[26px] font-bold tracking-tight">{PROFILE.name}</h1>
            <p className="text-[14px] text-neutral-700">{PROFILE.title}</p>
            <p className="mt-2 text-[11.5px] text-neutral-600">
              {PROFILE.location} · {PROFILE.email} · {PROFILE.phone}
            </p>
            <p className="text-[11.5px] text-neutral-600">
              {PROFILE.github} · {PROFILE.linkedin}
            </p>
          </header>

          <Section title="Profile">
            <p className="text-[12.5px] leading-relaxed text-neutral-800">{PROFILE.tagline}</p>
            <ul className="mt-2 space-y-1">
              {PROFILE.uvp.map((u) => (
                <li key={u} className="text-[12.5px] leading-relaxed text-neutral-800">
                  • {u}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Experience & Education">
            {TIMELINE.map((e) => (
              <div key={`${e.year}-${e.label}`} className="mb-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-[13px] font-semibold">
                    {e.label} — <span className="font-normal">{e.org}</span>
                  </p>
                  <span className="text-[11.5px] text-neutral-600">{e.year}</span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {e.facts.map((f) => (
                    <li key={f} className="text-[12px] leading-relaxed text-neutral-700">
                      • {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Section>

          <Section title="Skills">
            {SKILL_GROUPS.map((g) => (
              <p key={g.label} className="mb-1 text-[12.5px] leading-relaxed">
                <span className="font-semibold">{g.label}: </span>
                <span className="text-neutral-700">{g.items.map((s) => s.name).join(", ")}</span>
              </p>
            ))}
          </Section>

          <Section title={`Selected Projects (${PROJECTS.length} total)`}>
            {PROJECTS.slice(0, 6).map((p) => (
              <p key={p.id} className="mb-1 text-[12.5px] leading-relaxed">
                <span className="font-semibold">{p.title}</span>
                <span className="text-neutral-600"> — {p.stack}. </span>
                <span className="text-neutral-700">{p.desc}</span>
              </p>
            ))}
          </Section>

          <Section title="Achievements">
            <ul className="space-y-0.5">
              {ACHIEVEMENTS.map((a) => (
                <li key={a.title} className="text-[12.5px] text-neutral-800">
                  • {a.title} — <span className="text-neutral-600">{a.detail}</span>
                </li>
              ))}
            </ul>
          </Section>
        </article>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-neutral-500">{title}</h2>
      {children}
    </section>
  )
}
