"use client"

import { AtSign, Github, Linkedin, MapPin, Phone, Sparkles } from "lucide-react"
import { PROFILE } from "@/lib/os/content"
import { useWM } from "@/lib/os/wm-store"
import { Button, Card, Page, PageTitle, Row } from "./kit"

export function AboutApp() {
  const open = useWM((s) => s.open)

  return (
    <Page>
      <div className="mb-7 flex items-center gap-5">
        <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-blue-700 text-[26px] font-semibold text-white shadow-lg">
          {PROFILE.initials}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[24px] font-semibold tracking-tight" style={{ color: "var(--os-fg)" }}>
            {PROFILE.name}
          </h1>
          <p className="text-[14px]" style={{ color: "var(--os-accent-fg)" }}>
            {PROFILE.title}
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--os-muted)" }}>
            {PROFILE.tagline}
          </p>
        </div>
      </div>

      <h2 className="mb-2 text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>
        What I bring
      </h2>
      <Card className="mb-7 p-1">
        {PROFILE.uvp.map((point) => (
          <div
            key={point}
            className="flex items-start gap-3 px-3 py-2.5 [&:not(:last-child)]:border-b"
            style={{ borderColor: "var(--os-border)" }}
          >
            <Sparkles size={15} className="mt-0.5 shrink-0" style={{ color: "var(--os-accent-fg)" }} />
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--os-fg)" }}>
              {point}
            </p>
          </div>
        ))}
      </Card>

      <h2 className="mb-2 text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>
        Details
      </h2>
      <Card className="mb-7">
        <Row icon={<MapPin size={15} />} label="Location" value={PROFILE.location} />
        <Row icon={<AtSign size={15} />} label="Email" value={PROFILE.email} />
        <Row icon={<Phone size={15} />} label="Phone" value={PROFILE.phone} />
        <Row icon={<Github size={15} />} label="GitHub" value={PROFILE.github} />
        <Row icon={<Linkedin size={15} />} label="LinkedIn" value={PROFILE.linkedin} />
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="accent" onClick={() => open("contact")}>
          Get in touch
        </Button>
        <Button onClick={() => open("resume")}>View resume</Button>
        <Button onClick={() => open("projects")}>Browse projects</Button>
      </div>
    </Page>
  )
}
