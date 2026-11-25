"use client"

import { ArrowUpRight, AtSign, MapPin, Phone } from "lucide-react"
import { Github, Linkedin } from "../social-icons"
import { PROFILE, SHOW_PROJECTS } from "@/lib/os/content"
import { useWM } from "@/lib/os/wm-store"
import { Button, Page } from "./kit"
import styles from "./about.module.css"

const contacts = [
  { label: "Email", value: PROFILE.email, href: `mailto:${PROFILE.email}`, Icon: AtSign },
  { label: "Phone", value: PROFILE.phone, href: `tel:${PROFILE.phone.replace(/\s/g, "")}`, Icon: Phone },
  { label: "GitHub", value: PROFILE.github, href: `https://${PROFILE.github}`, Icon: Github },
  { label: "LinkedIn", value: PROFILE.linkedin, href: `https://${PROFILE.linkedin}`, Icon: Linkedin },
]

export function AboutApp() {
  const open = useWM((s) => s.open)
  return (
    <Page>
      <header className={styles.identity}>
        <span className={styles.location}><MapPin size={14} aria-hidden />{PROFILE.location}</span>
        <h1 className={styles.name}>{PROFILE.name}</h1>
        <p className={styles.role}>{PROFILE.title}</p>
      </header>
      <p className={styles.tagline}>{PROFILE.tagline}</p>
      <div className={styles.actions}>
        {SHOW_PROJECTS && <Button variant="accent" onClick={() => open("projects")}>Browse projects</Button>}
        <Button onClick={() => open("resume")}>View resume</Button>
        <Button onClick={() => open("contact")}>Get in touch</Button>
      </div>
      <section className={styles.section}>
        <h2>Current work</h2>
        <div><h3>{PROFILE.role}</h3><p>{PROFILE.availability}</p><p>{PROFILE.learning}</p></div>
      </section>
      <section className={styles.section}>
        <h2>What I bring</h2>
        <ul>{PROFILE.uvp.map((point) => <li key={point}>{point}</li>)}</ul>
      </section>
      <section className={styles.section}>
        <h2>Find me</h2>
        <div className={styles.links}>
          {contacts.map(({ label, value, href, Icon }) => (
            <a key={label} href={href} target={href.startsWith("https:") ? "_blank" : undefined} rel="noreferrer">
              <Icon size={16} aria-hidden /><span><small>{label}</small>{value}</span><ArrowUpRight size={15} aria-hidden />
            </a>
          ))}
        </div>
      </section>
    </Page>
  )
}
