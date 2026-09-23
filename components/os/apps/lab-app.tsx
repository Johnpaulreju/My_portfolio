"use client"

import { FlaskConical } from "lucide-react"
import { LAB } from "@/lib/os/content"
import { Card, Meter, Page, PageTitle, Pill } from "./kit"

export function LabApp() {
  return (
    <Page>
      <PageTitle title="Lab" sub="Experiments currently on the bench." />
      <div className="space-y-3">
        {LAB.map((p) => (
          <Card key={p.title} className="p-4">
            <div className="mb-3 flex items-start gap-3">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                style={{
                  background: "color-mix(in srgb, var(--os-accent) 20%, transparent)",
                  color: "var(--os-accent-fg)",
                }}
              >
                <FlaskConical size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>
                    {p.title}
                  </h3>
                  <Pill tone="accent">In progress</Pill>
                </div>
                <p className="text-[12.5px]" style={{ color: "var(--os-muted)" }}>
                  {p.note}
                </p>
              </div>
            </div>
            <Meter label="Progress" value={p.progress} />
          </Card>
        ))}
      </div>
    </Page>
  )
}
