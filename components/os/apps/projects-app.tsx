"use client"

import Image from "next/image"
import { useState } from "react"
import { ArrowUpRight, FolderOpen, Search } from "lucide-react"
import { PORTFOLIO_STATUS, PROFILE, PROJECTS, SHOW_PROJECTS, type Project } from "@/lib/os/content"
import { projectPreviews, seoCaseStudy } from "@/components/site/work-media"
import { ComingSoon } from "./kit"
import styles from "./portfolio-collection.module.css"

const contexts = {
  Professional: ["clinical-emr", "from-the-trunk", "smart-admission-manager", "conversational-avatars", "crm", "hrms", "candidate-interface"],
  Freelance: ["zion-safety-systems", "spaaronn-technologies"],
  Personal: ["plan0", "portfolio-os", "mafia"],
  Research: ["icu-research"],
}

function contextOf(project: Project) {
  return Object.entries(contexts).find(([, ids]) => ids.includes(project.id))?.[0] ?? "Other work"
}

const sections = [...new Set(PROJECTS.map(contextOf))]
const categories = [...new Set(PROJECTS.map((project) => project.category))]
const showcase = ["from-the-trunk", "plan0"].flatMap((id) => {
  const project = PROJECTS.find((item) => item.id === id)
  const image = projectPreviews[id]
  return project?.url && image ? [{ title: project.title, url: project.url, image }] : []
})

export function ProjectsApp() {
  const [context, setContext] = useState("All work")
  const [category, setCategory] = useState("All categories")
  const [query, setQuery] = useState("")

  if (!SHOW_PROJECTS || !PROJECTS.length) return <ComingSoon icon={<FolderOpen size={26} />} {...PORTFOLIO_STATUS.projects} />

  const search = query.trim().toLowerCase()
  const matches = PROJECTS.filter((project) =>
    (context === "All work" || contextOf(project) === context)
    && (category === "All categories" || project.category === category)
    && [project.title, project.desc, project.stack, project.category, contextOf(project)].some((field) => field.toLowerCase().includes(search)),
  )

  return (
    <main className={`os-scroll ${styles.exhibition}`} aria-label="Projects">
      <header className={styles.workMast}>
        <div className={styles.mastCopy}>
          <span className={styles.signature}>{PROFILE.name}</span>
          <h1>Projects</h1>
          <p>{PROFILE.tagline}</p>
        </div>
        <div className={styles.showcase}>
          {showcase.map((project) => (
            <a key={project.url} href={project.url} target="_blank" rel="noreferrer" aria-label={`Visit ${project.title}`}>
              <Image src={project.image} width={900} height={580} alt="" sizes="(max-width: 600px) 44vw, 280px" />
              <span>{project.title} <ArrowUpRight size={14} aria-hidden /></span>
            </a>
          ))}
        </div>
      </header>

      <div className={styles.index}>
        <nav className={styles.contexts} aria-label="Filter projects by work context">
          {["All work", ...sections].map((item) => (
            <button type="button" key={item} aria-pressed={context === item} onClick={() => setContext(item)}>{item}</button>
          ))}
        </nav>
        <div className={styles.filters}>
          <label className={styles.search}><Search size={17} aria-hidden />
            <input aria-label="Search projects" type="search" placeholder="Search projects" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <select aria-label="Project category" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option>All categories</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <span className={styles.results} role="status">{matches.length} {matches.length === 1 ? "project" : "projects"}</span>
        </div>
        {sections.map((section) => {
          const projects = matches.filter((project) => contextOf(project) === section)
          if (!projects.length) return null
          return (
            <section className={styles.workSection} key={section} aria-label={section + " projects"}>
              <h2>{section}</h2>
              {projects.map((project) => (
                <article key={project.id} className={styles.entry}>
                  <div className={styles.entryTitle}>
                    <p className={styles.meta}>{project.category}{project.year !== "—" && ` · ${project.year}`}</p>
                    <h3>{project.title}</h3>
                    <p className={styles.stack}>{project.stack}</p>
                  </div>
                  <div className={styles.contribution}>
                    <p>{project.desc}</p>
                    {(project.url || (project.id === "from-the-trunk" && seoCaseStudy)) && (
                      <div className={styles.entryLinks}>
                        {project.url && <a href={project.url} target="_blank" rel="noreferrer" aria-label={`Visit the ${project.title} website`}>Visit website <ArrowUpRight size={14} aria-hidden /></a>}
                        {project.id === "from-the-trunk" && seoCaseStudy && <a href={seoCaseStudy.url} target="_blank" rel="noreferrer">Read the SEO case study <ArrowUpRight size={14} aria-hidden /></a>}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </section>
          )
        })}
        {!matches.length && <button className={styles.reset} type="button" onClick={() => { setCategory("All categories"); setContext("All work"); setQuery("") }}>Clear filters</button>}
      </div>
    </main>
  )
}
