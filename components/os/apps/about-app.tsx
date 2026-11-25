"use client"

import { AtSign, MapPin, Phone, Sparkles } from "lucide-react"
import { Github, Linkedin } from "../social-icons"
import { PROFILE, SHOW_PROJECTS } from "@/lib/os/content"
import { useWM } from "@/lib/os/wm-store"
import { Button, Card, Page, Row } from "./kit"
import styles from "./about.module.css"

export function AboutApp() {
  const open = useWM((s) => s.open)

  return (
    <Page>
      <header className={styles.identity}>
        <span aria-hidden className={styles.monogram}>
          {PROFILE.initials}
        </span>
        <div className="min-w-0">
          <h1 className={styles.name}>
            {PROFILE.name}
          </h1>
          <p className={styles.role}>
            {PROFILE.title}
          </p>
          <p className="text-[13px] font-medium">
            {PROFILE.next}
          </p>
        </div>
      </header>

      <p className={styles.tagline}>{PROFILE.tagline}</p>
      <div className="mb-7 flex flex-wrap gap-2">
        {SHOW_PROJECTS && <Button variant="accent" onClick={() => open("projects")}>Browse projects</Button>}
        <Button onClick={() => open("resume")}>View resume</Button>
        <Button onClick={() => open("contact")}>Get in touch</Button>
      </div>

      <Card className="mb-7 p-4">
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>
          {PROFILE.role}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--os-accent-fg)" }}>
          {PROFILE.availability}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
          {PROFILE.learning}
        </p>
      </Card>

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

    </Page>
  )
}
