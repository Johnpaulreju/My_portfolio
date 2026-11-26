import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { MEDIUM_PROFILE_URL, PUBLISHED_ARTICLES } from "@/lib/os/blog"
import { ACHIEVEMENTS, PORTFOLIO_STATUS, PROFILE, PROJECTS, SHOW_PROJECTS, SKILL_GROUPS, TIMELINE } from "@/lib/os/content"
import { PROFILE_AVAILABILITY, PROFILE_LEARNING, PROFILE_SUMMARY, profileLink } from "@/lib/site"
import { projectPreviews, seoCaseStudy } from "./work-media"
import styles from "./site.module.css"

export function SiteNavigation() {
  return (
    <nav aria-label="Portfolio pages" className={styles.nav}>
      <Link href="/">Portfolio OS</Link>
      <Link href="/about">About</Link>
      <Link href="/about#selected-work">Projects</Link>
      <Link href="/about#blog-heading">Blog</Link>
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

export function BlogCard() {
  const latest = PUBLISHED_ARTICLES[0]
  return (
    <section id="blog-heading" tabIndex={-1} className={styles.writingCard} aria-labelledby="writing-title">
      {latest?.cover && <Image src={latest.cover.src} width={960} height={540} alt={latest.cover.alt} className={styles.writingCover} sizes="(max-width: 700px) 85vw, 360px" />}
      <div>
        <h2 id="writing-title">Blog</h2>
        {latest && <p><a className={styles.textAction} href={latest.url}>{latest.title}</a></p>}
        {latest?.description && <p>{latest.description}</p>}
        <a className={styles.textAction} href={MEDIUM_PROFILE_URL}>Read my blog on Medium <span aria-hidden="true">↗</span></a>
      </div>
    </section>
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

export function SelectedWork({ limit }: { limit?: number }) {
  const projects = SHOW_PROJECTS ? PROJECTS.slice(0, limit) : []
  return (
    <section id="selected-work" tabIndex={-1} className={styles.section} aria-labelledby="selected-work-title">
      <h2 id="selected-work-title">{projects.length ? "Selected projects" : "Personal work"}</h2>
      {projects.length ? <div className={limit ? styles.resumeProjects : styles.projectGrid}>
        {projects.map((project) => {
          const image = projectPreviews[project.id]
          return (
            <article className={`${styles.project} ${styles.keepTogether}`} key={project.id}>
              {!limit && image && <Image className={styles.workPreview} src={image} alt="" width={900} height={580} sizes="(max-width: 700px) 92vw, 450px" />}
              <div className={styles.projectBody}>
                {!limit && <p className={styles.eyebrow}>{project.category}{project.year !== "—" && ` · ${project.year}`}</p>}
                <h3>{project.url ? <a href={project.url}>{project.title}</a> : project.title}</h3>
                <p>{project.desc}</p>
                {project.stack && <p className={styles.muted}>{project.stack}</p>}
                {project.id === "from-the-trunk" && seoCaseStudy && <a className={styles.textAction} href={seoCaseStudy.url}>Read the SEO case study <span aria-hidden="true">↗</span></a>}
              </div>
            </article>
          )
        })}
      </div> : [PORTFOLIO_STATUS.projects, PORTFOLIO_STATUS.lab].map((status) => (
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
  return <section className={styles.section}><h2>What I’m learning</h2><p>{PROFILE_LEARNING}</p></section>
}

/** Readable homepage for visitors using a browser without JavaScript. */
export function ProfileFallback() {
  return (
    <section data-theme="dark" className={`${styles.page} ${styles.fallback}`} aria-label="Portfolio profile">
      <div className={styles.container}>
        <SiteNavigation />
        <div className={styles.content}>
          <ProfileIntro />
          <BlogCard />
          <Skills />
          <Availability />
        </div>
      </div>
    </section>
  )
}
