"use client"

import { useEffect, useState } from "react"
import { SKILL_GROUPS } from "@/lib/os/content"
import { Card, Meter, Page, PageTitle } from "./kit"

export function SkillsApp() {
  // Bars animate up from zero on first paint, like Task Manager filling in.
  const [live, setLive] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setLive(true))
    return () => cancelAnimationFrame(t)
  }, [])

  return (
    <Page>
      <PageTitle title="Skills" sub="Proficiency across the stack, roughly self-assessed." />

      <div className="space-y-5">
        {SKILL_GROUPS.map((group) => (
          <section key={group.label}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>
                {group.label}
              </h2>
              <span className="text-[12px]" style={{ color: "var(--os-muted)" }}>
                {group.hint}
              </span>
            </div>
            <Card className="space-y-3 p-4">
              {group.items.map((s) => (
                <Meter key={s.name} label={s.name} value={live ? s.level : 0} hint={`${s.level}%`} />
              ))}
            </Card>
          </section>
        ))}
      </div>
    </Page>
  )
}
