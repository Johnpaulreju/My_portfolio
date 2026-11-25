"use client"

import { ArrowUpRight, Award, Trophy } from "lucide-react"
import { ACHIEVEMENTS } from "@/lib/os/content"
import { useWM } from "@/lib/os/wm-store"
import styles from "./achievements.module.css"

export function AchievementsApp() {
  const open = useWM((s) => s.open)
  const awards = ACHIEVEMENTS.filter((a) => a.icon === "trophy")
  const credentials = ACHIEVEMENTS.filter((a) => a.icon !== "trophy")

  return (
    <div className={`os-scroll ${styles.page}`}>
      <div className={styles.sheet}>
        <h1>Achievements</h1>
        {awards.map((award) => <article key={award.title} className={styles.feature}>
          <Trophy size={30} strokeWidth={1.5} aria-hidden="true" />
          <h2>{award.title}</h2>
          <p>{award.detail}</p>
        </article>)}
        <section className={styles.credentials}>
          <h2>Certifications</h2>
          <ul>{credentials.map((credential) => (
            <li key={credential.title}>
              <Award size={20} aria-hidden="true" />
              <strong>{credential.title}</strong>
              <span>{credential.detail}</span>
            </li>
          ))}</ul>
        </section>
        <button className={styles.resume} type="button" onClick={() => open("resume")}>View resume <ArrowUpRight size={15} aria-hidden="true" /></button>
      </div>
    </div>
  )
}
