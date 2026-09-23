"use client"

import { Award, BarChart3, Trophy } from "lucide-react"
import { ACHIEVEMENTS } from "@/lib/os/content"
import { Card, Page, PageTitle } from "./kit"

const GLYPH = { trophy: Trophy, badge: Award, chart: BarChart3 }

export function AchievementsApp() {
  return (
    <Page>
      <PageTitle title="Achievements" sub="Certifications, placements and measured wins." />
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(216px, 1fr))" }}>
        {ACHIEVEMENTS.map((a) => {
          const Icon = GLYPH[a.icon]
          return (
            <Card key={a.title} className="flex items-start gap-3 p-4 transition-transform hover:-translate-y-0.5">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
                style={{
                  background: "color-mix(in srgb, var(--os-accent) 20%, transparent)",
                  color: "var(--os-accent-fg)",
                }}
              >
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold" style={{ color: "var(--os-fg)" }}>
                  {a.title}
                </span>
                <span className="block text-[12px]" style={{ color: "var(--os-muted)" }}>
                  {a.detail}
                </span>
              </span>
            </Card>
          )
        })}
      </div>
    </Page>
  )
}
