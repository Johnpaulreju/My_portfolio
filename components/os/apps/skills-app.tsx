"use client"

import { SKILL_GROUPS } from "@/lib/os/content"
import { Card, Page, PageTitle } from "./kit"

export function SkillsApp() {
  return (
    <Page>
      <PageTitle title="Skills" sub="Tools I build with and areas I'm studying." />
      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr))]">
        {SKILL_GROUPS.map((group) => (
          <Card key={group.label} className="p-5">
            <h2 className="text-base font-semibold tracking-tight">{group.label}</h2>
            <p className="mb-4 mt-1 text-sm text-[var(--os-muted)]">{group.hint}</p>
            {(["Building", "Studying"] as const).map((status) => {
              const items = group.items.filter((skill) => skill.status === status)
              if (!items.length) return null
              return (
                <section key={status} className="mt-3">
                  <h3 className="mb-2 text-xs font-medium text-[var(--os-accent-fg)]">{status}</h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {items.map((skill) => (
                      <li key={skill.name} className="rounded-md bg-[var(--os-input)] px-2 py-1 text-[13px]">
                        {skill.name}
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </Card>
        ))}
      </div>
    </Page>
  )
}
