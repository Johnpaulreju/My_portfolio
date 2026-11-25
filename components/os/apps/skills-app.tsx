"use client"

import { useState } from "react"
import { Search, X } from "lucide-react"
import { SKILL_GROUPS, type SkillStatus } from "@/lib/os/content"
import styles from "./skills.module.css"

const statuses = ["All", "Building", "Studying"] as const

export function SkillsApp() {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<SkillStatus | "All">("All")
  const term = query.trim().toLowerCase()
  const groups = SKILL_GROUPS.map((group) => {
    const groupMatch = [group.label, group.hint].some((value) => value.toLowerCase().includes(term))
    const items = group.items.filter((item) =>
      (status === "All" || item.status === status) && (groupMatch || item.name.toLowerCase().includes(term)),
    )
    return { ...group, items }
  }).filter((group) => group.items.length)
  const total = groups.reduce((count, group) => count + group.items.length, 0)

  return (
    <div className={`os-scroll ${styles.page}`}>
      <div className={styles.sheet}>
        <header className={styles.heading}>
          <h1>Skills</h1>
          <p>Tools I build with and areas I’m studying.</p>
        </header>

        <div className={styles.tools}>
          <div className={styles.filters} role="group" aria-label="Skill status">
            {statuses.map((option) => <button key={option} type="button" aria-pressed={option === status} onClick={() => setStatus(option)}>{option}</button>)}
          </div>
          <div className={styles.search}>
            <Search size={16} aria-hidden="true" />
            <input aria-label="Search skills" placeholder="Find a skill" type="text" value={query} onChange={(event) => setQuery(event.target.value)} />
            {query && <button type="button" aria-label="Clear skill search" onClick={() => setQuery("")}><X size={15} aria-hidden="true" /></button>}
          </div>
        </div>

        <p role="status" className={styles.count}>{total} {total === 1 ? "skill" : "skills"}</p>
        <div className={styles.index}>
          {groups.map((group) => (
            <section key={group.label} className={styles.group}>
              <header>
                <h2>{group.label}</h2>
                <p>{group.hint}</p>
              </header>
              <ul>{group.items.map((skill) => <li key={skill.name}>{skill.name}</li>)}</ul>
            </section>
          ))}
          {total === 0 && <div className={styles.empty}>
            <p>No matching skills.</p>
            <button type="button" onClick={() => { setQuery(""); setStatus("All") }}>Reset filters</button>
          </div>}
        </div>
      </div>
    </div>
  )
}
