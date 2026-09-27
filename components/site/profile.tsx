import Link from "next/link"
import type { ReactNode } from "react"
import { ACHIEVEMENTS, PORTFOLIO_STATUS, PROFILE, PROJECTS, SHOW_PROJECTS, SKILL_GROUPS, TIMELINE } from "@/lib/os/content"
import { PROFILE_AVAILABILITY, PROFILE_LEARNING, PROFILE_SUMMARY, profileLink } from "@/lib/site"
import styles from "./site.module.css"

export function SiteNavigation() {
  return (
    <nav aria-label="Portfolio pages" className={styles.nav}>
      <Link href="/">Portfolio OS</Link>
      <Link href="/about">About</Link>
      <Link href="/resume">Resume</Link>
      <a href={`mailto:${PROFILE.email}`}>Contact</a>
    </nav>
  )
}

export function ReadablePage({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" className={styles.page}>
      <a className={styles.skip} href="#profile-content">Skip to content</a>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link className={styles.identity} href="/" aria-label={`${PROFILE.name}, Portfolio OS home`}>
            <span className={styles.mark} aria-hidden="true"><i /><i /><i /><i /></span>
            <span>{PROFILE.name}<small>Portfolio OS</small></span>
          </Link>
          <SiteNavigation />
        </header>
        <main id="profile-content" className={styles.content}>{children}</main>
        <footer className={styles.footer}>
          <p>Different screens, same love for code.</p>
          <Link href="/about.md">Read the Markdown profile</Link>
        </footer>
      </div>
    </div>
  )
}

export function ProfileIntro() {
  return (
    <>
      <p className={styles.eyebrow}>{PROFILE.location}</p>
      <h1>{PROFILE.name}</h1>
      <p className={styles.role}>{PROFILE.headline}</p>
      <p>{PROFILE_SUMMARY}</p>
    </>
  )
}

export function ContactLinks({ detailed = false }: { detailed?: boolean }) {
  return (
    <ul className={styles.contacts}>
      <li><a href={`mailto:${PROFILE.email}`}>{PROFILE.email}</a></li>
      {detailed && <li><a href={`tel:${PROFILE.phone.replace(/\s/g, "")}`}>{PROFILE.phone}</a></li>}
      <li><a href={profileLink(PROFILE.github)}>{detailed ? PROFILE.github : "GitHub"}</a></li>
      <li><a href={profileLink(PROFILE.linkedin)}>{detailed ? PROFILE.linkedin : "LinkedIn"}</a></li>
    </ul>
  )
}

export function Skills({ showStatus = false }: { showStatus?: boolean }) {
  return (
    <section aria-labelledby="skills-heading" className={styles.section}>
      <h2 id="skills-heading">Skills & tools</h2>
      <div className={styles.grid}>
        {SKILL_GROUPS.map((group) => (
          <section className={styles.card} key={group.label} aria-label={group.label}>
            <h3>{group.label}</h3>
            <p className={styles.muted}>{group.hint}</p>
            {showStatus ? (["Building", "Studying"] as const).map((status) => {
              const items = group.items.filter((item) => item.status === status)
              return items.length > 0 ? <p key={status}><strong>{status}: </strong>{items.map((item) => item.name).join(", ")}</p> : null
            }) : <ul className={styles.tags}>{group.items.map((item) => <li key={item.name}>{item.name}</li>)}</ul>}
          </section>
        ))}
      </div>
    </section>
  )
}

export function Experience() {
  return (["work", "education"] as const).map((kind) => (
    <section key={kind} aria-labelledby={`${kind}-heading`} className={styles.section}>
      <h2 id={`${kind}-heading`}>{kind === "work" ? "Employer history" : "Education"}</h2>
      <ol className={styles.timeline}>
        {TIMELINE.filter((event) => event.kind === kind).map((event) => (
          <li key={`${event.year}-${event.org}-${event.label}`}>
            <p className={styles.eyebrow}>{event.year} · {event.kind === "work" ? "Work" : "Education"}</p>
            <h3>{event.label}</h3>
            <p>{event.org}</p>
            <ul className={styles.facts}>{event.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
          </li>
        ))}
      </ol>
    </section>
  ))
}

export function ResumeProfile() {
  return (
    <>
      <ProfileIntro />
      <ContactLinks detailed />
      <ul className={styles.facts}>{PROFILE.uvp.map((fact) => <li key={fact}>{fact}</li>)}</ul>
      <section className={`${styles.section} ${styles.keepTogether}`}>
        <h2>Current work</h2>
        <h3>{PROFILE.role}</h3>
        <p>{PROFILE.availability}</p>
        <p>{PROFILE.learning}</p>
      </section>
    </>
  )
}

export function PersonalWork() {
  return (
    <section className={`${styles.section} ${styles.keepTogether}`}>
      <h2>{SHOW_PROJECTS && PROJECTS.length > 0 ? "Selected projects" : "Personal work"}</h2>
      {SHOW_PROJECTS && PROJECTS.length > 0 ? PROJECTS.slice(0, 6).map((project) => (
        <div key={project.id}><h3>{project.title}</h3><p>{project.stack}. {project.desc}</p></div>
      )) : [PORTFOLIO_STATUS.projects, PORTFOLIO_STATUS.lab].map((status) => (
        <div key={status.title}><h3>{status.title}</h3><p>{status.body}</p></div>
      ))}
    </section>
  )
}

export function Achievements() {
  return (
    <section className={`${styles.section} ${styles.keepTogether}`}>
      <h2>Achievements</h2>
      <ul className={styles.facts}>{ACHIEVEMENTS.map((achievement) => (
        <li key={achievement.title}><strong>{achievement.title}</strong> - {achievement.detail}</li>
      ))}</ul>
    </section>
  )
}

export function Availability() {
  return (
    <section className={`${styles.section} ${styles.keepTogether}`} aria-labelledby="contact-heading">
      <h2 id="contact-heading">Let’s build something</h2>
      <p>{PROFILE_AVAILABILITY}</p>
      <ContactLinks />
    </section>
  )
}

export function Learning() {
  return <section className={styles.section}><h2>Up next: GenAI engineering</h2><p>{PROFILE_LEARNING}</p></section>
}

/** Visible server content while the interactive shell hydrates, and without JS. */
export function ProfileFallback() {
  return (
    <section data-theme="dark" className={`${styles.page} ${styles.fallback}`} aria-label="Portfolio profile">
      <div className={styles.container}>
        <SiteNavigation />
        <div className={styles.content}>
          <ProfileIntro />
          <p>Power on the desktop to explore, or read the pages above.</p>
          <Skills />
          <Availability />
        </div>
      </div>
    </section>
  )
}
