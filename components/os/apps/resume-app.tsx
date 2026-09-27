"use client"

import { Printer } from "lucide-react"
import { ACHIEVEMENTS, PORTFOLIO_STATUS, PROFILE, PROJECTS, SHOW_PROJECTS, SKILL_GROUPS, TIMELINE } from "@/lib/os/content"

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
        <a
          href="/resume"
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] hover:bg-[var(--os-hover)]"
          style={{ color: "var(--os-fg)" }}
        >
          <Printer size={14} aria-hidden="true" />
          <span>Print / Save as PDF<small className="block text-[10px]">Opens printable resume in a new tab</small></span>
        </a>
      </div>

      <div className="os-scroll min-h-0 flex-1 overflow-y-auto bg-[#525252] p-5">
        <article data-resume-document className="mx-auto max-w-[660px] bg-white p-5 text-[#1a1a1a] shadow-xl sm:p-10">
          <header className="mb-5 border-b border-neutral-300 pb-4">
            <h1 className="text-[26px] font-bold tracking-tight">{PROFILE.name}</h1>
            <p className="text-[14px] text-neutral-700">{PROFILE.headline}</p>
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

          <Section title="Current work">
            <p className="text-[13px] font-semibold">{PROFILE.role}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-700">{PROFILE.availability}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-700">{PROFILE.learning}</p>
          </Section>

          <Section title="Employer history">
            <TimelineEntries kind="work" />
          </Section>

          <Section title="Education">
            <TimelineEntries kind="education" />
          </Section>

          <Section title="Skills">
            {SKILL_GROUPS.map((group) => (
              <div key={group.label} className="mb-2 text-[12.5px] leading-relaxed">
                <p className="font-semibold">{group.label}</p>
                {(["Building", "Studying"] as const).map((status) => {
                  const items = group.items.filter((skill) => skill.status === status)
                  return items.length > 0 ? (
                    <p key={status} className="text-neutral-700">
                      <span className="font-medium">{status}: </span>
                      {items.map((skill) => skill.name).join(", ")}
                    </p>
                  ) : null
                })}
              </div>
            ))}
          </Section>

          {SHOW_PROJECTS && PROJECTS.length > 0 ? (
            <Section title="Selected Projects">
              {PROJECTS.slice(0, 6).map((p) => (
                <p key={p.id} className="mb-1 text-[12.5px] leading-relaxed">
                  <span className="font-semibold">{p.title}</span>
                  <span className="text-neutral-600"> — {p.stack}. </span>
                  <span className="text-neutral-700">{p.desc}</span>
                </p>
              ))}
            </Section>
          ) : (
            <Section title="Personal work">
              {[PORTFOLIO_STATUS.projects, PORTFOLIO_STATUS.lab].map((status) => (
                <p key={status.title} className="mb-2 text-[12.5px] leading-relaxed">
                  <span className="font-semibold">{status.title}. </span>
                  <span className="text-neutral-700">{status.body}</span>
                </p>
              ))}
            </Section>
          )}

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

function TimelineEntries({ kind }: { kind: "work" | "education" }) {
  return TIMELINE.filter((event) => event.kind === kind).map((event) => (
    <div key={`${event.year}-${event.label}`} className="mb-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[13px] font-semibold">
          {event.label} — <span className="font-normal">{event.org}</span>
        </p>
        <span className="text-[11.5px] text-neutral-600">{event.year}</span>
      </div>
      <ul className="mt-1 space-y-0.5">
        {event.facts.map((fact) => (
          <li key={fact} className="text-[12px] leading-relaxed text-neutral-700">
            • {fact}
          </li>
        ))}
      </ul>
    </div>
  ))
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-neutral-500">{title}</h2>
      {children}
    </section>
  )
}
