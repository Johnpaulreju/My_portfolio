"use client"

import { GraduationCap, Briefcase } from "lucide-react"
import { TIMELINE } from "@/lib/os/content"
import { Page, PageTitle, Pill } from "./kit"

export function ExperienceApp() {
  return (
    <Page>
      <PageTitle title="Experience" sub="Where I've worked and what I studied." />

      <ol className="relative ml-4">
        {/* The spine the milestones hang off. */}
        <span
          className="absolute bottom-3 left-0 top-3 w-px"
          style={{ background: "var(--os-border)" }}
          aria-hidden
        />

        {TIMELINE.map((ev) => {
          const work = ev.kind === "work"
          const Icon = work ? Briefcase : GraduationCap
          return (
            <li key={`${ev.year}-${ev.label}`} className="relative mb-6 pl-8 last:mb-0">
              <span
                className="absolute -left-[13px] top-0.5 grid h-[26px] w-[26px] place-items-center rounded-full"
                style={{
                  background: work ? "var(--os-accent)" : "var(--os-card)",
                  border: "1px solid var(--os-border)",
                  color: work ? "#fff" : "var(--os-muted)",
                }}
              >
                <Icon size={13} />
              </span>

              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-semibold" style={{ color: "var(--os-fg)" }}>
                  {ev.label}
                </h3>
                <Pill tone="accent">{ev.year}</Pill>
                <Pill>{work ? "Work" : "Education"}</Pill>
              </div>
              <p className="mb-2 text-[13px]" style={{ color: "var(--os-accent-fg)" }}>
                {ev.org}
              </p>

              <ul className="space-y-1">
                {ev.facts.map((f) => (
                  <li
                    key={f}
                    className="flex gap-2 text-[13px] leading-relaxed"
                    style={{ color: "var(--os-muted)" }}
                  >
                    <span aria-hidden>·</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ol>
    </Page>
  )
}
