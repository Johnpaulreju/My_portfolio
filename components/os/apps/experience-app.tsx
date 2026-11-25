"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowDown, BriefcaseBusiness, GraduationCap, MapPin } from "lucide-react"
import { PROFILE, TIMELINE } from "@/lib/os/content"
import styles from "./experience.module.css"

const milestones = [
  {
    date: "Now",
    kind: "Current work",
    title: PROFILE.role,
    org: PROFILE.location,
    facts: [PROFILE.summary, PROFILE.availability],
  },
  ...TIMELINE.map((event) => ({
    date: String(event.year),
    kind: event.kind === "work" ? "Work" : "Education",
    title: event.label,
    org: event.org,
    facts: event.facts,
  })),
]

export function ExperienceApp() {
  const reader = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const [position, setPosition] = useState({ active: 0, progress: 0 })

  useEffect(() => {
    const pane = reader.current
    const chapters = list.current
    if (!pane || !chapters) return
    let frame = 0
    const measure = () => {
      frame = 0
      if (!pane.clientHeight) return
      const range = pane.scrollHeight - pane.clientHeight
      const progress = range > 0 ? Math.round((pane.scrollTop / range) * 100) : 0
      const readingLine = pane.getBoundingClientRect().top + Math.min(72, pane.clientHeight * .22)
      let active = 0
      for (let i = 1; i < chapters.children.length; i++) {
        if (chapters.children[i].getBoundingClientRect().top > readingLine) break
        active = i
      }
      if (range > 0 && pane.scrollTop >= range - 1) active = chapters.children.length - 1
      setPosition((previous) => previous.active === active && previous.progress === progress ? previous : { active, progress })
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(pane)
    observer.observe(chapters)
    pane.addEventListener("scroll", schedule, { passive: true })
    schedule()
    return () => {
      observer.disconnect()
      pane.removeEventListener("scroll", schedule)
      cancelAnimationFrame(frame)
    }
  }, [])

  function jumpTo(index: number, focusHeading = false) {
    const pane = reader.current
    const chapter = list.current?.children[index]
    if (!pane || !chapter) return
    if (focusHeading) chapter.querySelector("h2")?.focus({ preventScroll: true })
    const offset = pane.scrollTop + chapter.getBoundingClientRect().top - pane.getBoundingClientRect().top
    pane.scrollTo({
      top: Math.max(0, Math.round(offset)),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    })
  }

  return (
    <div className={styles.app}>
      <div className={styles.layout}>
        <header className={styles.rail}>
          <h1>Experience</h1>
          <nav aria-label="Career milestones" className={styles.index}>
            <ol>
              {milestones.map((m, i) => (
                <li key={m.title}>
                  <button type="button" aria-current={position.active === i ? "step" : undefined} onClick={() => jumpTo(i)}>
                    <span className={styles.indexDate}>{m.date}</span>
                    <span className={styles.indexName}>{i === 0 ? m.kind : m.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <label className={styles.picker}>
            <span className="sr-only">Jump to a career milestone</span>
            <select value={position.active} onChange={(event) => jumpTo(Number(event.target.value))}>
              {milestones.map((m, i) => <option key={m.title} value={i}>{i === 0 ? m.kind : `${m.date} · ${m.title}`}</option>)}
            </select>
          </label>
          <div className={styles.progress}>
            <span aria-hidden="true">Career timeline <span>{position.progress}%</span></span>
            <progress aria-label="Career timeline reading progress" max={100} value={position.progress} />
          </div>
        </header>

        <div ref={reader} className={`os-scroll ${styles.reader}`} role="region" aria-label="Career timeline" tabIndex={0}>
          <ol ref={list}>
            {milestones.map((m, i) => {
              const Icon = m.kind === "Education" ? GraduationCap : i === 0 ? MapPin : BriefcaseBusiness
              return (
                <li key={m.title} className={styles.milestone}>
                  <article>
                    <p className={styles.stamp}><span>{m.date}</span><span>{m.kind}</span></p>
                    <h2 tabIndex={-1}>{m.title}</h2>
                    <p className={styles.org}><Icon size={16} aria-hidden="true" />{m.org}</p>
                    <div className={styles.facts}>{m.facts.map((fact) => <p key={fact}>{fact}</p>)}</div>
                    {i < milestones.length - 1 && <button className={styles.next} type="button" onClick={() => jumpTo(i + 1, true)}>
                      <ArrowDown size={14} aria-hidden="true" /><span>Next<span className="sr-only"> milestone</span> · {milestones[i + 1].title}</span>
                    </button>}
                  </article>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}
