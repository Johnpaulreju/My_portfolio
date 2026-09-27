"use client"

import { SKILL_GROUPS } from "@/lib/os/content"
import { Card, Page, PageTitle, Pill } from "./kit"

export function SkillsApp() {
  return (
    <Page>
      <PageTitle title="Skills" sub="Tools I build with and areas I'm studying." />

      <div className="space-y-5">
        {SKILL_GROUPS.map((group) => (
          <section key={group.label}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>
                {group.label}
              </h2>
              <span className="text-[12px]" style={{ color: "var(--os-muted)" }}>
                {group.hint}
              </span>
            </div>
            <Card>
              <ul>
                {group.items.map((skill) => (
                  <li
                    key={skill.name}
                    className="flex items-center justify-between gap-3 px-4 py-3 [&:not(:last-child)]:border-b"
                    style={{ borderColor: "var(--os-border)" }}
                  >
                    <span className="text-[13px]" style={{ color: "var(--os-fg)" }}>
                      {skill.name}
                    </span>
                    <Pill tone={skill.status === "Building" ? "accent" : "default"}>{skill.status}</Pill>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))}
      </div>
    </Page>
  )
}
