"use client"

import Image from "next/image"
import { useState } from "react"
import { ArrowUpRight, BookOpen, ChevronDown, FolderOpen, Grid2X2, List, Search } from "lucide-react"
import { PORTFOLIO_STATUS, PROJECTS, SHOW_PROJECTS, type Project } from "@/lib/os/content"
import { projectPreviews, seoCaseStudy } from "@/components/site/work-media"
import { ComingSoon } from "./kit"
import styles from "./portfolio-collection.module.css"

const categories = ["All", ...new Set(PROJECTS.map((project) => project.category))]

function ProjectLinks({ project }: { project: Project }) {
  return (
    <div className={styles.links}>
      {project.url && <a href={project.url} target="_blank" rel="noreferrer">Visit website <ArrowUpRight size={15} aria-hidden /></a>}
      {project.id === "from-the-trunk" && seoCaseStudy && (
        <a href={seoCaseStudy.url} target="_blank" rel="noreferrer"><BookOpen size={15} aria-hidden /> Read the SEO case study</a>
      )}
    </div>
  )
}

export function ProjectsApp() {
  const [category, setCategory] = useState("All")
  const [query, setQuery] = useState("")
  const [list, setList] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  if (!SHOW_PROJECTS || !PROJECTS.length) return <ComingSoon icon={<FolderOpen size={26} />} {...PORTFOLIO_STATUS.projects} />

  const search = query.trim().toLowerCase()
  const matches = PROJECTS.filter((project) =>
    (category === "All" || project.category === category)
    && [project.title, project.stack, project.desc, project.category].some((field) => field.toLowerCase().includes(search)),
  )
  const feature = !list && !search && category === "All" ? matches.find((project) => project.id === "from-the-trunk") : undefined
  const projects = matches.filter((project) => project !== feature)

  return (
    <main className={`os-scroll ${styles.viewport}`} aria-label="Projects">
      <div className={styles.sheet}>
        <header className={styles.titleRow}>
          <div><h1 className={styles.title}>Projects</h1><p className={styles.intro}>{PORTFOLIO_STATUS.projects.body}</p></div>
        </header>

        <div className={styles.tools}>
          <label className={styles.search}>
            <Search size={17} aria-hidden />
            <input aria-label="Search projects" placeholder="Search projects" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <select aria-label="Project category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((name) => <option key={name} value={name}>{name === "All" ? "All categories" : name}</option>)}
          </select>
          <button type="button" aria-label={list ? "Grid view" : "List view"} onClick={() => setList(!list)}>
            {list ? <Grid2X2 size={17} aria-hidden /> : <List size={18} aria-hidden />}
          </button>
        </div>

        {feature && (
          <article className={styles.feature}>
            <div className={styles.featureBody}>
              <p className={styles.kicker}>{feature.stack}</p>
              <h2>{feature.title}</h2>
              <p className={styles.body}>{feature.desc}</p>
              <ProjectLinks project={feature} />
            </div>
            <Image src={projectPreviews[feature.id]!} width={900} height={580} sizes="(max-width: 600px) 100vw, 450px" alt="From The Trunk saree storefront" className={styles.featureImage} />
          </article>
        )}

        <div className={list ? styles.workList : styles.workGrid}>
          {projects.map((project) => {
            const expanded = selected === project.id
            const preview = projectPreviews[project.id]
            return (
              <article key={project.id} className={styles.workCard}>
                <button type="button" className={styles.workToggle} onClick={() => setSelected(expanded ? null : project.id)}
                  aria-expanded={expanded} aria-controls={`project-detail-${project.id}`}>
                  {preview && !list && <Image src={preview} alt="" width={900} height={580} sizes="(max-width: 600px) 90vw, 360px" className={styles.projectImage} />}
                  <span className={styles.cardTop}>
                    <span><span className={styles.kicker}>{project.category}{project.year !== "—" && ` · ${project.year}`}</span>
                      <span className={styles.workName}>{project.title}</span>
                      <span className={styles.stack}>{project.stack}</span>
                    </span>
                    <ChevronDown size={18} aria-hidden className={expanded ? styles.rotated : undefined} />
                  </span>
                </button>
                <div id={`project-detail-${project.id}`} hidden={!expanded} className={styles.workDetail}>
                  <p className={styles.body}>{project.desc}</p>
                  <ProjectLinks project={project} />
                </div>
              </article>
            )
          })}
        </div>
        {!matches.length && <p role="status" className={styles.empty}>No projects match your search.</p>}
      </div>
    </main>
  )
}
